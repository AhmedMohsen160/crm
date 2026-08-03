import 'server-only';
import { db } from '@/lib/db';
import { can, hashPassword, verifyPassword, type SessionUser } from '@/lib/auth';
import { str, num, date, fullName } from '@/lib/utils';
import { logActivity, readEntityLink, linkPath, type EntityLink } from '@/lib/actions/helpers';
import { auditEvent, auditDiff } from '@/lib/audit';
import { PERMISSION_KEYS } from '@/lib/permissions';
import { SETTING_DEFINITIONS } from '@/lib/settings-defs';
import { findOrCreateClient } from '@/lib/clients';
import { normalizePhone } from '@/lib/phone';
import {
  nextLeadCode,
  nextClientCode,
  nextProjectCode,
  nextFreelancerCode,
  nextJournalCode,
} from '@/lib/sequence';
import { checkBalance, fiscalMonth, monthRange, spreadAnnual } from '@/lib/accounting';
import {
  postEntry,
  voidEntry,
  isPeriodClosed,
  toBase,
  draftRevenueOnDelivery,
  draftCollection,
  draftFreelancerPayment,
  draftCommissionAccrual,
  draftMonthlyDepreciation,
} from '@/lib/ledger';
import {
  cleanName,
  isHeaderRow,
  mergeKey,
  mergeMultiValue,
  parseRateCell,
  parseRatingCell,
} from '@/lib/freelancers';
import { syncStepPayment, recordFreelancerUse, resolveFreelancerRate } from '@/lib/freelancer-engine';
import { importLeadSheet, importSalesSheet } from '@/lib/import-legacy';
import { runAllEvents } from '@/lib/notification-engine';
import { freezeProjectCost, stepWeightedPages } from '@/lib/project-costing';
import { priceForProject, discountLimitOf, discountRatio } from '@/lib/pricing';
import { rebuildPeriod, reverseProjectCommission } from '@/lib/commission-engine';
import { periodOf } from '@/lib/commission';
import { allSettings } from '@/lib/reference';
import {
  PROJECT_STATUSES,
  performerRole,
  allowedTransitions,
  revenueMonthKey,
  endOfToday,
  type ProjectStatus,
} from '@/lib/projects';
import { LEAD_STATUSES, LEAD_CLOSED_STATUSES, type LeadStatus } from '@/lib/constants';

/**
 * كل عمليات الحفظ في النظام.
 *
 * تُستدعى من مسارات /api عبر إرسال نموذج عادي (POST) ثم تحويل إلى صفحة
 * النتيجة. اخترنا هذا الأسلوب بدل Server Actions لأن رحلة الـ Server Action
 * كانت تتعطّل أحيانًا في المتصفح: يُحفظ السجل على الخادم خلال أجزاء من
 * الثانية، لكن الواجهة تبقى معلّقة ولا تنتقل ولا تعرض ما حُفظ. الأسلوب
 * التقليدي يعمل في كل مرة، ويعمل أيضًا لو تعطّل الجافاسكربت.
 *
 * كل دالة تُعيد المسار الذي ننتقل إليه بعد الحفظ.
 */

export class MutationError extends Error {}

function requireOwn(ownerId: string | null, user: SessionUser, message: string) {
  if (!can(user, 'canViewAllLeads') && ownerId !== user.id) throw new MutationError(message);
}

// ═══════════════════════════════════════════════════════════════
//  العملاء المحتملون
// ═══════════════════════════════════════════════════════════════

function readLead(fd: FormData) {
  return {
    firstName: str(fd, 'firstName') ?? '',
    lastName: str(fd, 'lastName'),
    companyName: str(fd, 'companyName'),
    email: str(fd, 'email'),
    phone: str(fd, 'phone'),
    channel: str(fd, 'channel'),
    contactMethod: str(fd, 'contactMethod'),
    status: str(fd, 'status') ?? 'NEW',
    serviceInterest: str(fd, 'serviceInterest'),
    sourceLang: str(fd, 'sourceLang'),
    targetLang: str(fd, 'targetLang'),
    estPages: num(fd, 'estPages'),
    estimatedValue: num(fd, 'estimatedValue'),
    lossReason: str(fd, 'lossReason'),
    notes: str(fd, 'notes'),
  };
}

/**
 * الطوابع الزمنية المشتقة من المرحلة (§4.2):
 *   `firstReplyAt` عند **أول** انتقال عن «جديد» — لا يُعاد ضبطه أبدًا،
 *                   وإلا انهار قياس سرعة الرد.
 *   `closedAt`      عند الفوز أو الخسارة، ويُمسح إن عاد الليد للحياة.
 */
function leadStamps(
  previousStatus: string | null,
  nextStatus: string,
  existing: {
    firstReplyAt: Date | null;
    closedAt: Date | null;
    convertedAt: Date | null;
  } | null
) {
  const now = new Date();
  const movedOffNew = previousStatus === 'NEW' && nextStatus !== 'NEW';
  const closed = LEAD_CLOSED_STATUSES.includes(nextStatus as LeadStatus);

  return {
    firstReplyAt: existing?.firstReplyAt ?? (movedOffNew ? now : null),
    closedAt: closed ? (existing?.closedAt ?? now) : null,
    convertedAt: nextStatus === 'WON' ? (existing?.convertedAt ?? now) : null,
  };
}

export async function saveLead(fd: FormData, user: SessionUser, id?: string) {
  const data = readLead(fd);
  if (!data.firstName) throw new MutationError('اسم العميل مطلوب');
  if (!data.channel) throw new MutationError('القناة مطلوبة — بلا مصدر لا نعرف ما يعمل');

  // القاعدة الملزمة في §4.2: لا حفظ لليد خاسر بلا سبب. بلا السبب لا يتعلّم
  // الفريق شيئًا من الخسارة، وهي أهم بيانة في المنظومة كلها.
  if (data.status === 'LOST' && !data.lossReason) {
    throw new MutationError('سبب الخسارة إلزامي — اختره من القائمة قبل الحفظ');
  }

  if (!id) {
    // العميل أولًا: يُربط بالموجود أو يُنشأ. **لا عميل مكرر أبدًا** (§4.1)
    const phone = data.phone;
    if (!phone) throw new MutationError('رقم الهاتف مطلوب');

    const client = await findOrCreateClient(
      {
        name: data.firstName,
        phone,
        email: data.email,
        type: data.companyName ? 'company' : 'individual',
        companyName: data.companyName,
      },
      user
    ).catch((error) => {
      throw new MutationError(error instanceof Error ? error.message : 'تعذّر حفظ العميل');
    });

    const lead = await db.lead.create({
      data: {
        ...data,
        code: await nextLeadCode(),
        clientId: client.id,
        branch: user.branch,
        ownerId: str(fd, 'ownerId') ?? user.id,
        ...leadStamps(null, data.status, null),
      },
    });
    await logActivity({
      type: 'CREATED',
      title: client.created ? 'ليد جديد لعميل جديد' : 'ليد جديد لعميل عائد',
      detail: `${lead.code} — ${fullName(lead.firstName, lead.lastName)}`,
      userId: user.id,
      link: { leadId: lead.id },
    });
    await auditEvent(user.id, 'create', 'Lead', lead.id, lead.code ?? undefined);
    return `/leads/${lead.id}`;
  }

  const existing = await db.lead.findUnique({ where: { id } });
  if (!existing) throw new MutationError('العميل المحتمل غير موجود');
  requireOwn(existing.ownerId, user, 'ليس لديك صلاحية تعديل هذا السجل');

  const after = {
    ...data,
    ownerId: str(fd, 'ownerId') ?? existing.ownerId,
    ...leadStamps(existing.status, data.status, existing),
  };

  await db.lead.update({ where: { id }, data: after });
  await auditDiff(user.id, 'Lead', id, existing, after);

  if (existing.status !== data.status) {
    await logActivity({
      type: 'STATUS_CHANGED',
      title: 'تغيّرت مرحلة الليد',
      detail: `${LEAD_STATUSES[existing.status as LeadStatus] ?? existing.status} ← ${
        LEAD_STATUSES[data.status as LeadStatus] ?? data.status
      }`,
      userId: user.id,
      link: { leadId: id },
    });
  }
  return `/leads/${id}`;
}

/**
 * تحويل الليد إلى **مشروع** (§7.1).
 *
 * ستة حقول، أغلبها قوائم، ومعيار القبول ≤٢٠ ثانية. عند الحفظ:
 * يتولّد `project_id`، ويصير الليد `فائز`، ويدخل المشروع `قيد الإسناد`
 * فيصل إشعاره لمدير المشاريع.
 */
export async function convertLead(fd: FormData, user: SessionUser, id: string) {
  if (!can(user, 'canConvertProject')) {
    throw new MutationError('ليس لديك صلاحية تحويل الليد إلى مشروع');
  }

  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) throw new MutationError('الليد غير موجود');
  requireOwn(lead.ownerId, user, 'ليس لديك صلاحية تحويل هذا السجل');
  if (lead.status === 'WON') return `/leads/${id}`;

  const ownerId = lead.ownerId ?? user.id;
  const pages = num(fd, 'pages');
  const serviceLine = str(fd, 'serviceLine') ?? lead.serviceInterest;
  const sourceLang = str(fd, 'sourceLang') ?? lead.sourceLang;
  const targetLang = str(fd, 'targetLang') ?? lead.targetLang;

  if (!serviceLine) throw new MutationError('خط الخدمة مطلوب');
  if (!sourceLang || !targetLang) throw new MutationError('زوج اللغات مطلوب');
  if (!pages) throw new MutationError('عدد الصفحات مطلوب');

  // العميل: الليد يحمله منذ إنشائه، ونستخرجه من هاتفه إن كان سجلًا قديمًا
  let clientId = lead.clientId;
  if (!clientId && lead.phone) {
    const client = await findOrCreateClient(
      {
        name: fullName(lead.firstName, lead.lastName),
        phone: lead.phone,
        email: lead.email,
        type: lead.companyName ? 'company' : 'individual',
        companyName: lead.companyName,
      },
      user
    );
    clientId = client.id;
  }

  // الشركة وجهة الاتصال تبقيان للعميل المؤسسي — اختياريتان لا حاجزتان
  let companyId = str(fd, 'existingCompanyId');
  if (!companyId && lead.companyName) {
    const company = await db.company.create({
      data: { name: lead.companyName, email: lead.email, phone: lead.phone, ownerId },
    });
    companyId = company.id;
  }

  const title =
    str(fd, 'title') ?? `${fullName(lead.firstName, lead.lastName)} — ${pages} صفحة`;

  const isRush = fd.get('isRush') === 'on';

  // التسعير التلقائي من قائمة الأسعار (§١٠). السعر المُدخَل يدويًا يعلو
  // عليها لمن يملك رؤية سعر البيع، وإلا فُرض سعر القائمة.
  const manualUnitPrice = can(user, 'canViewSellPrice') ? num(fd, 'unitPrice') : null;
  const priced = await priceForProject({
    serviceLine,
    langFrom: sourceLang,
    langTo: targetLang,
    pages,
    isRush,
    clientId,
    manualUnitPrice,
    manualDiscountType: can(user, 'canDiscount') ? str(fd, 'discountType') : null,
    manualDiscountValue: can(user, 'canDiscount') ? num(fd, 'discountValue') : null,
    user,
  });

  // إجمالي مُدخَل يدويًا يعلو على المحسوب — بعض الطلبات تُسعَّر بالاتفاق
  const overrideTotal = can(user, 'canViewSellPrice') ? num(fd, 'netTotal') : null;
  const netTotal = overrideTotal ?? priced.netTotal;

  const deposit = num(fd, 'deposit') ?? 0;
  if (deposit > netTotal) throw new MutationError('المقدم أكبر من إجمالي المشروع');

  const now = new Date();
  const project = await db.project.create({
    data: {
      code: await nextProjectCode(),
      title,
      status: 'pending_assignment',
      serviceLine,
      sourceLang,
      targetLang,
      pages,
      unitPrice: priced.unitPrice || null,
      gross: priced.gross,
      netTotal,
      discountType: priced.discountType === 'none' ? null : priced.discountType,
      discountValue: priced.discountValue || null,
      // تجاوز الحد يوقف المشروع بانتظار اعتماد (§١٠ بند ٤)
      approvalState: priced.needsApproval ? 'pending' : 'not_required',
      currency: str(fd, 'currency') ?? 'EGP',
      deposit,
      isRush,
      ...readDeadline(fd),
      description: lead.notes,
      branch: lead.branch ?? user.branch,
      leadId: id,
      clientId,
      companyId,
      convertedAt: now,
      ownerId,
    },
  });

  // المهام والملاحظات تتبع المشروع، فلا يضيع سياق ما قيل قبل التحويل
  await db.task.updateMany({ where: { leadId: id }, data: { projectId: project.id } });
  await db.note.updateMany({ where: { leadId: id }, data: { projectId: project.id } });

  await db.lead.update({
    where: { id },
    data: {
      status: 'WON',
      convertedAt: now,
      closedAt: now,
      firstReplyAt: lead.firstReplyAt ?? now,
    },
  });

  await logActivity({
    type: 'CONVERTED',
    title: 'تحوّل الليد إلى مشروع',
    detail: `${project.code} — ${title}`,
    userId: user.id,
    link: { leadId: id, projectId: project.id, companyId },
  });

  if (priced.needsApproval) {
    await logActivity({
      type: 'STATUS_CHANGED',
      title: 'خصم بانتظار الاعتماد',
      detail: `الخصم ${(priced.ratio * 100).toFixed(1)}٪ يتجاوز حدّك ${(
        priced.limit * 100
      ).toFixed(0)}٪`,
      userId: user.id,
      link: { projectId: project.id },
    });
  }
  await auditEvent(user.id, 'create', 'Project', project.id, project.code ?? undefined);

  return `/projects/${project.id}`;
}

// ═══════════════════════════════════════════════════════════════
//  العملاء — «لا عميل مكرر أبدًا» (§4.1)
// ═══════════════════════════════════════════════════════════════

export async function saveClient(fd: FormData, user: SessionUser, id?: string) {
  const name = str(fd, 'name');
  const phone = str(fd, 'phone');
  if (!name) throw new MutationError('اسم العميل مطلوب');
  if (!phone) throw new MutationError('رقم الهاتف مطلوب');

  const primary = normalizePhone(phone);
  if (!primary.ok) throw new MutationError(`رقم الهاتف غير صالح: ${primary.reason}`);

  const phoneAlt = str(fd, 'phoneAlt');
  const alt = phoneAlt ? normalizePhone(phoneAlt) : null;
  if (phoneAlt && !alt?.ok) throw new MutationError('الهاتف البديل غير صالح');

  const data = {
    name,
    phone,
    phoneNormalized: primary.value,
    phoneAlt,
    phoneAltNormalized: alt?.ok ? alt.value : null,
    email: str(fd, 'email'),
    type: str(fd, 'type') === 'company' ? 'company' : 'individual',
    companyName: str(fd, 'companyName'),
    taxId: str(fd, 'taxId'),
    country: str(fd, 'country'),
    city: str(fd, 'city'),
    notes: str(fd, 'notes'),
  };

  // القيد الفريد في قاعدة البيانات هو الحارس الحقيقي؛ هذا الفحص يوجد
  // ليعطي رسالة مفهومة ورابطًا للعميل الموجود بدل خطأ تقني.
  const clash = await db.client.findUnique({
    where: { phoneNormalized: primary.value },
    select: { id: true, code: true, name: true },
  });
  if (clash && clash.id !== id) {
    throw new MutationError(
      `هذا الرقم مسجَّل بالفعل للعميل «${clash.name}» (${clash.code}) — افتح بطاقته بدل إنشاء عميل جديد`
    );
  }

  if (!id) {
    const client = await db.client.create({
      data: {
        ...data,
        code: await nextClientCode(),
        firstBranch: user.branch,
        createdById: user.id,
        ownerId: str(fd, 'ownerId') ?? user.id,
      },
    });
    await auditEvent(
      user.id,
      'create',
      'Client',
      client.id,
      `${client.code} — ${client.name}`
    );
    return `/clients/${client.id}`;
  }

  const existing = await db.client.findUnique({ where: { id } });
  if (!existing) throw new MutationError('العميل غير موجود');
  requireOwn(existing.ownerId, user, 'ليس لديك صلاحية تعديل هذا العميل');

  await db.client.update({ where: { id }, data });
  await auditDiff(user.id, 'Client', id, existing, data);
  return `/clients/${id}`;
}

// ═══════════════════════════════════════════════════════════════
//  الشركات
// ═══════════════════════════════════════════════════════════════

export async function saveCompany(fd: FormData, user: SessionUser, id?: string) {
  const data = {
    name: str(fd, 'name') ?? '',
    nameAr: str(fd, 'nameAr'),
    industry: str(fd, 'industry'),
    website: str(fd, 'website'),
    phone: str(fd, 'phone'),
    email: str(fd, 'email'),
    country: str(fd, 'country'),
    city: str(fd, 'city'),
    address: str(fd, 'address'),
    taxNumber: str(fd, 'taxNumber'),
    paymentTerms: str(fd, 'paymentTerms'),
    notes: str(fd, 'notes'),
  };
  if (!data.name) throw new MutationError('اسم الشركة مطلوب');

  if (!id) {
    const company = await db.company.create({
      data: { ...data, ownerId: str(fd, 'ownerId') ?? user.id },
    });
    await logActivity({
      type: 'CREATED',
      title: 'تمت إضافة شركة',
      detail: company.name,
      userId: user.id,
      link: { companyId: company.id },
    });
    return `/companies/${company.id}`;
  }

  const existing = await db.company.findUnique({ where: { id } });
  if (!existing) throw new MutationError('الشركة غير موجودة');
  requireOwn(existing.ownerId, user, 'ليس لديك صلاحية تعديل هذه الشركة');

  await db.company.update({
    where: { id },
    data: { ...data, ownerId: str(fd, 'ownerId') ?? existing.ownerId },
  });
  return `/companies/${id}`;
}

// ═══════════════════════════════════════════════════════════════
//  جهات الاتصال
// ═══════════════════════════════════════════════════════════════

export async function saveContact(fd: FormData, user: SessionUser, id?: string) {
  const data = {
    firstName: str(fd, 'firstName') ?? '',
    lastName: str(fd, 'lastName'),
    email: str(fd, 'email'),
    phone: str(fd, 'phone'),
    mobile: str(fd, 'mobile'),
    jobTitle: str(fd, 'jobTitle'),
    language: str(fd, 'language'),
    notes: str(fd, 'notes'),
    companyId: str(fd, 'companyId'),
  };
  if (!data.firstName) throw new MutationError('اسم جهة الاتصال مطلوب');

  if (!id) {
    const contact = await db.contact.create({
      data: { ...data, ownerId: str(fd, 'ownerId') ?? user.id },
    });
    await logActivity({
      type: 'CREATED',
      title: 'تمت إضافة جهة اتصال',
      detail: fullName(contact.firstName, contact.lastName),
      userId: user.id,
      link: { contactId: contact.id, companyId: contact.companyId },
    });
    return `/contacts/${contact.id}`;
  }

  const existing = await db.contact.findUnique({ where: { id } });
  if (!existing) throw new MutationError('جهة الاتصال غير موجودة');
  requireOwn(existing.ownerId, user, 'ليس لديك صلاحية تعديل جهة الاتصال هذه');

  await db.contact.update({
    where: { id },
    data: { ...data, ownerId: str(fd, 'ownerId') ?? existing.ownerId },
  });
  return `/contacts/${id}`;
}

// ═══════════════════════════════════════════════════════════════
//  الصفقات
// ═══════════════════════════════════════════════════════════════

export async function saveProject(fd: FormData, user: SessionUser, id?: string) {
  const pages = num(fd, 'pages');
  const wordCount = num(fd, 'wordCount');

  const data = {
    title: str(fd, 'title') ?? '',
    description: str(fd, 'description'),
    netTotal: num(fd, 'netTotal') ?? 0,
    currency: str(fd, 'currency') ?? 'EGP',
    unitPrice: num(fd, 'unitPrice'),
    serviceLine: str(fd, 'serviceLine'),
    sourceLang: str(fd, 'sourceLang'),
    targetLang: str(fd, 'targetLang'),
    wordCount: wordCount ? Math.round(wordCount) : null,
    pages,
    deposit: num(fd, 'deposit') ?? 0,
    isRush: fd.get('isRush') === 'on',
    ...readDeadline(fd),
    expectedCloseDate: date(fd, 'expectedCloseDate'),
    companyId: str(fd, 'companyId'),
    contactId: str(fd, 'contactId'),
    clientId: str(fd, 'clientId'),
  };
  if (!data.title) throw new MutationError('عنوان المشروع مطلوب');

  // سعر البيع لا يُعدَّل إلا بصلاحيته — والقيمة القادمة من نموذج لا يملكها
  // تُتجاهل بدل أن تُصفّر السعر
  if (!can(user, 'canViewSellPrice')) {
    delete (data as Partial<typeof data>).netTotal;
    delete (data as Partial<typeof data>).unitPrice;
    delete (data as Partial<typeof data>).deposit;
  }

  // الخصم: يُقبل ممّن يملك صلاحيته، ويُوقف المشروع إن تجاوز حدّ دوره
  const discountType = can(user, 'canDiscount') ? str(fd, 'discountType') : null;
  const discountValue = can(user, 'canDiscount') ? num(fd, 'discountValue') : null;
  let approvalPatch: Record<string, unknown> = {};

  if (discountType && discountType !== 'none' && discountValue) {
    const settings = await allSettings();
    const gross = (pages ?? 0) * (num(fd, 'unitPrice') ?? 0);
    const afterRush = data.isRush
      ? gross * (1 + (Number(settings.rush_surcharge) || 0))
      : gross;
    const limit = await discountLimitOf(user);
    const ratio = discountRatio({ type: discountType, value: discountValue }, afterRush);
    if (ratio > limit + 1e-9) {
      approvalPatch = { approvalState: 'pending', approvedById: null, approvedAt: null };
    }
  }

  if (!id) {
    const project = await db.project.create({
      data: {
        ...data,
        code: await nextProjectCode(),
        status: 'pending_assignment',
        branch: user.branch,
        convertedAt: new Date(),
        ownerId: str(fd, 'ownerId') ?? user.id,
      },
    });
    await logActivity({
      type: 'CREATED',
      title: 'مشروع جديد بانتظار الإسناد',
      detail: `${project.code} — ${project.title}`,
      userId: user.id,
      link: { projectId: project.id, companyId: project.companyId },
    });
    await auditEvent(user.id, 'create', 'Project', project.id, project.code ?? undefined);
    return `/projects/${project.id}`;
  }

  const existing = await db.project.findUnique({ where: { id } });
  if (!existing) throw new MutationError('المشروع غير موجود');
  requireOwn(existing.ownerId, user, 'ليس لديك صلاحية تعديل هذا المشروع');

  const after = {
    ...data,
    ...(discountType ? { discountType: discountType === 'none' ? null : discountType } : {}),
    ...(discountValue !== null ? { discountValue } : {}),
    ...approvalPatch,
    ownerId: str(fd, 'ownerId') ?? existing.ownerId,
  };
  await db.project.update({ where: { id }, data: after });
  await auditDiff(user.id, 'Project', id, existing, after);
  return `/projects/${id}`;
}

/** زر «فوري» يضبط الموعد نهاية اليوم بضغطة — بديلًا عن اختيار تاريخ */
function readDeadline(fd: FormData) {
  const express = fd.get('isExpress') === 'on';
  return {
    isExpress: express,
    deadline: express ? endOfToday() : date(fd, 'deadline'),
  };
}

/**
 * تحويل حالة المشروع — البوابة الوحيدة لتغيير الحالة.
 *
 * تفرض قواعد §٦ كاملة: الانتقال المسموح، والصلاحية التي تملكه، والحقول
 * التي لا يصحّ الانتقال بدونها. لا مسار آخر يكتب في `status`.
 */
export async function moveProject(fd: FormData, user: SessionUser, id: string) {
  const to = str(fd, 'status');
  if (!to) throw new MutationError('الحالة المطلوبة مفقودة');

  const project = await db.project.findUnique({ where: { id } });
  if (!project) throw new MutationError('المشروع غير موجود');
  if (project.status === to) return `/projects/${id}`;

  const rule = allowedTransitions(project.status).find((t) => t.to === to);
  if (!rule) {
    throw new MutationError(
      `لا يجوز الانتقال من «${
        PROJECT_STATUSES[project.status as ProjectStatus] ?? project.status
      }» إلى «${PROJECT_STATUSES[to as ProjectStatus] ?? to}»`
    );
  }
  if (rule.permission && !can(user, rule.permission)) {
    throw new MutationError('ليس لديك صلاحية هذا الانتقال');
  }

  // الخصم فوق الحد يجمّد المشروع حتى الاعتماد (§٦ و§١٠ بند ٤).
  // الإلغاء وحده يبقى متاحًا، وإلا عَلِق المشروع بلا مخرج لو رفض الجميع.
  if (project.approvalState === 'pending' && to !== 'cancelled') {
    throw new MutationError(
      'المشروع موقوف بانتظار اعتماد الخصم — لا ينتقل خطوة واحدة قبل الاعتماد'
    );
  }

  const now = new Date();
  const patch: Record<string, unknown> = { status: to };

  // الحقول القادمة مع الانتقال (المبلغ المحصَّل مثلًا) تُكتب قبل فحص شرطه
  const collectedAmount = num(fd, 'collectedAmount');
  if (collectedAmount !== null && collectedAmount !== undefined) {
    if (!can(user, 'canRecordCollection')) {
      throw new MutationError('ليس لديك صلاحية تسجيل التحصيل');
    }
    patch.collectedAmount = collectedAmount;
    patch.collectedAt = date(fd, 'collectedAt') ?? now;
  }
  const qaIssues = num(fd, 'qaIssues');
  if (qaIssues !== null && qaIssues !== undefined) patch.qaIssues = Math.round(qaIssues);

  const filled = (field: string) => {
    const value = patch[field] ?? (project as Record<string, unknown>)[field];
    return !(value === null || value === undefined || value === '' || value === 0);
  };

  for (const requirement of rule.requires ?? []) {
    // `anyOf`: يكفي واحد — المنفِّذ قد يكون موظفًا أو فريلانسرًا أو اسمًا خارجيًا
    const fields = requirement.anyOf ?? [requirement.field];
    if (!fields.some(filled)) {
      throw new MutationError(`${requirement.label} مطلوب قبل هذا الانتقال`);
    }
  }

  // الطوابع الزمنية تُبصم مرة واحدة ولا تُعاد
  if (to === 'in_progress' && !project.assignedAt) {
    patch.assignedAt = now;
    patch.projectManagerId = project.projectManagerId ?? user.id;
  }
  if (to === 'delivered') {
    patch.deliveredAt = project.deliveredAt ?? now;
    // الاعتراف بالإيراد يقع هنا (§٣ بند ٤)
    patch.revenueMonth = project.revenueMonth ?? revenueMonthKey(now);
  }
  if (to === 'collected') {
    patch.collectedAt = patch.collectedAt ?? project.collectedAt ?? now;
    patch.closedAt = project.closedAt ?? now;
  }
  if (to === 'rework') {
    patch.isRework = true;
  }
  if (to === 'cancelled') {
    patch.closedAt = now;
    patch.cancelReason = str(fd, 'cancelReason') ?? project.cancelReason;
    // الملغى يخرج من كل تقرير مالي — نمسح مفتاح الشهر ولا نمسح السجل
    patch.revenueMonth = null;
    if (!patch.cancelReason) throw new MutationError('سبب الإلغاء مطلوب');
  }

  await db.project.update({ where: { id }, data: patch });
  await auditDiff(user.id, 'Project', id, project, patch as Record<string, string | number | boolean | Date | null>);

  // ── أثر الحالة على الدفاتر ───────────────────────────────────
  // الاعتراف بالإيراد يقع عند التسليم (§٣ بند ٤) — ويصل المحاسبَ
  // **مسوَّدةً** يراجعها ويرحّلها. الدفتر لا يُكتب من ظهره.
  if (to === 'delivered') {
    await draftRevenueOnDelivery(id);
  }

  // ── أثر الحالة على نسب المبيعات ──────────────────────────────
  // النسبة تستحق **عند التحصيل**، وتُخصم إن استُرد المشروع أو أُلغي.
  if (to === 'collected') {
    const collectedAt = (patch.collectedAt as Date) ?? now;
    await rebuildPeriod(periodOf(collectedAt));
    // قيد **مسوَّدة** للمحاسب — الدفتر لا يُكتب إلا بيده
    await draftCollection(id);
  } else if (
    (to === 'cancelled' || to === 'rework') &&
    project.status === 'collected'
  ) {
    // قيد عكسي لا حذف — الأصل يبقى في السجل (§٣ بند ٥)
    await reverseProjectCommission(
      id,
      to === 'cancelled' ? 'إلغاء المشروع بعد التحصيل' : 'إعادة المشروع بعد التحصيل'
    );
  }

  await logActivity({
    type: 'STAGE_CHANGED',
    title: 'تغيّرت حالة المشروع',
    detail: `${PROJECT_STATUSES[project.status as ProjectStatus] ?? project.status} ← ${
      PROJECT_STATUSES[to as ProjectStatus] ?? to
    }`,
    userId: user.id,
    link: { projectId: id },
  });

  return `/projects/${id}`;
}

// ═══════════════════════════════════════════════════════════════
//  المهام
// ═══════════════════════════════════════════════════════════════

export async function saveTask(fd: FormData, user: SessionUser, id?: string) {
  const title = str(fd, 'title');
  if (!title) throw new MutationError('عنوان المهمة مطلوب');

  const link: EntityLink = readEntityLink(fd);
  const status = str(fd, 'status') ?? 'OPEN';
  const requested = str(fd, 'redirectTo');

  const common = {
    title,
    description: str(fd, 'description'),
    status,
    priority: str(fd, 'priority') ?? 'NORMAL',
    type: str(fd, 'type') ?? 'TODO',
    dueDate: date(fd, 'dueDate'),
    ...link,
  };

  if (!id) {
    const task = await db.task.create({
      data: {
        ...common,
        assigneeId: str(fd, 'assigneeId') ?? user.id,
        creatorId: user.id,
      },
    });
    await logActivity({
      type: 'TASK_CREATED',
      title: 'تمت إضافة مهمة',
      detail: task.title,
      userId: user.id,
      link,
    });
    return requested ?? linkPath(link);
  }

  const existing = await db.task.findUnique({ where: { id } });
  if (!existing) throw new MutationError('المهمة غير موجودة');
  const allowed =
    can(user, 'canViewAllLeads') || existing.assigneeId === user.id || existing.creatorId === user.id;
  if (!allowed) throw new MutationError('ليس لديك صلاحية التعديل على هذه المهمة');

  await db.task.update({
    where: { id },
    data: {
      ...common,
      assigneeId: str(fd, 'assigneeId'),
      completedAt: status === 'DONE' ? (existing.completedAt ?? new Date()) : null,
    },
  });

  await logActivity({ type: 'TASK_UPDATED', title: 'تم تعديل مهمة', userId: user.id, link });
  return requested ?? '/tasks';
}

// ═══════════════════════════════════════════════════════════════
//  عروض الأسعار
// ═══════════════════════════════════════════════════════════════

type ParsedItem = {
  description: string;
  serviceType: string | null;
  sourceLang: string | null;
  targetLang: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sortOrder: number;
};

function readItems(fd: FormData): ParsedItem[] {
  const items: ParsedItem[] = [];
  for (let i = 0; i < 60; i++) {
    const description = str(fd, `items[${i}][description]`);
    if (!description) continue;
    const quantity = num(fd, `items[${i}][quantity]`) ?? 0;
    const unitPrice = num(fd, `items[${i}][unitPrice]`) ?? 0;
    items.push({
      description,
      serviceType: str(fd, `items[${i}][serviceType]`),
      sourceLang: str(fd, `items[${i}][sourceLang]`),
      targetLang: str(fd, `items[${i}][targetLang]`),
      unit: str(fd, `items[${i}][unit]`) ?? 'WORD',
      quantity,
      unitPrice,
      lineTotal: Math.round(quantity * unitPrice * 100) / 100,
      sortOrder: items.length,
    });
  }
  return items;
}

function computeTotals(items: ParsedItem[], discount: number, taxRate: number) {
  const subtotal = Math.round(items.reduce((s, it) => s + it.lineTotal, 0) * 100) / 100;
  const afterDiscount = Math.max(0, subtotal - discount);
  const taxAmount = Math.round(afterDiscount * (taxRate / 100) * 100) / 100;
  return { subtotal, taxAmount, total: Math.round((afterDiscount + taxAmount) * 100) / 100 };
}

/** رقم عرض سعر متسلسل — QT-2026-0001 */
async function nextQuoteNumber(): Promise<string> {
  const prefix = `QT-${new Date().getFullYear()}-`;
  const last = await db.quote.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  const lastSeq = last ? Number.parseInt(last.number.slice(prefix.length), 10) : 0;
  return `${prefix}${String((Number.isFinite(lastSeq) ? lastSeq : 0) + 1).padStart(4, '0')}`;
}

export async function saveQuote(fd: FormData, user: SessionUser, id?: string) {
  const title = str(fd, 'title');
  if (!title) throw new MutationError('عنوان عرض السعر مطلوب');

  const items = readItems(fd);
  if (items.length === 0) throw new MutationError('أضف بندًا واحدًا على الأقل');

  const discount = num(fd, 'discount') ?? 0;
  const taxRate = num(fd, 'taxRate') ?? 0;
  const { subtotal, taxAmount, total } = computeTotals(items, discount, taxRate);
  const status = str(fd, 'status') ?? 'DRAFT';

  const common = {
    title,
    status,
    currency: str(fd, 'currency') ?? 'EGP',
    subtotal,
    discount,
    taxRate,
    taxAmount,
    total,
    validUntil: date(fd, 'validUntil'),
    notes: str(fd, 'notes'),
    terms: str(fd, 'terms'),
    projectId: str(fd, 'projectId'),
    companyId: str(fd, 'companyId'),
    contactId: str(fd, 'contactId'),
  };

  if (!id) {
    const quote = await db.quote.create({
      data: {
        ...common,
        number: await nextQuoteNumber(),
        ownerId: user.id,
        items: { create: items },
      },
    });
    await logActivity({
      type: 'QUOTE_CREATED',
      title: `تم إنشاء عرض سعر ${quote.number}`,
      detail: title,
      userId: user.id,
      link: { projectId: quote.projectId, companyId: quote.companyId, contactId: quote.contactId },
    });
    return `/quotes/${quote.id}`;
  }

  const existing = await db.quote.findUnique({ where: { id } });
  if (!existing) throw new MutationError('عرض السعر غير موجود');
  requireOwn(existing.ownerId, user, 'ليس لديك صلاحية تعديل هذا العرض');

  await db.$transaction([
    db.quoteItem.deleteMany({ where: { quoteId: id } }),
    db.quote.update({
      where: { id },
      data: {
        ...common,
        sentAt: status === 'SENT' ? (existing.sentAt ?? new Date()) : existing.sentAt,
        items: { create: items },
      },
    }),
  ]);
  return `/quotes/${id}`;
}

// ═══════════════════════════════════════════════════════════════
//  المستخدمون
// ═══════════════════════════════════════════════════════════════

/**
 * يتحقّق أنه سيبقى في النظام **شخص واحد على الأقل يستطيع إدارة المستخدمين**.
 * بلا هذا الفحص يمكن قفل الجميع خارج شاشة الإدارة بتعديل واحد لا رجعة فيه.
 */
async function assertAdminSurvives(excludeUserId: string) {
  const remaining = await db.user.count({
    where: {
      active: true,
      id: { not: excludeUserId },
      roleRef: { canManageUsers: true },
    },
  });
  if (remaining === 0) {
    throw new MutationError(
      'يجب أن يبقى مستخدم نشط واحد على الأقل يملك صلاحية «إدارة المستخدمين»'
    );
  }
}

export async function saveUser(fd: FormData, admin: SessionUser, id?: string) {
  if (!can(admin, 'canManageUsers')) {
    throw new MutationError('ليس لديك صلاحية إدارة المستخدمين');
  }

  const name = str(fd, 'name');
  const password = str(fd, 'password');
  const roleId = str(fd, 'roleId');
  const branch = str(fd, 'branch');
  const reportsToId = str(fd, 'reportsToId');
  const isProducer = fd.get('isProducer') === 'on';

  if (!roleId) throw new MutationError('الدور مطلوب');
  const role = await db.role.findUnique({ where: { id: roleId } });
  if (!role) throw new MutationError('الدور المختار غير موجود');

  if (!id) {
    const email = str(fd, 'email')?.toLowerCase();
    if (!name || !email || !password) {
      throw new MutationError('الاسم والبريد وكلمة المرور مطلوبة');
    }
    if (password.length < 8) throw new MutationError('كلمة المرور يجب ألا تقل عن 8 أحرف');
    if (await db.user.findUnique({ where: { email } })) {
      throw new MutationError('هذا البريد الإلكتروني مستخدم بالفعل');
    }

    const created = await db.user.create({
      data: {
        name,
        email,
        passwordHash: await hashPassword(password),
        roleId,
        branch,
        reportsToId,
        isProducer,
        phone: str(fd, 'phone'),
        jobTitle: str(fd, 'jobTitle'),
      },
    });
    await auditEvent(admin.id, 'create', 'User', created.id, `${created.name} — ${role.label}`);
    return '/settings/users';
  }

  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) throw new MutationError('المستخدم غير موجود');

  // الحقل معطَّل في الشاشة عند تعديل النفس، فلا يصل في النموذج — نُبقيه كما هو
  const active = admin.id === id ? existing.active : fd.get('active') === 'on';

  if (admin.id === id && roleId !== existing.roleId) {
    throw new MutationError('لا يمكنك تغيير دورك بنفسك');
  }
  if (reportsToId === id) throw new MutationError('لا يمكن أن يتبع المستخدم نفسه');
  if (reportsToId && (await reportsToCreatesCycle(id, reportsToId))) {
    throw new MutationError('هذا الاختيار يُنشئ حلقة في التسلسل الإداري');
  }
  // إن كان هذا الحساب أحد مَن يديرون المستخدمين، فلا نجرّده إلا ويبقى غيره
  if (existing.roleId) {
    const wasAdmin = await db.role.findUnique({
      where: { id: existing.roleId },
      select: { canManageUsers: true },
    });
    if (wasAdmin?.canManageUsers && (!role.canManageUsers || !active)) {
      await assertAdminSurvives(id);
    }
  }
  if (password && password.length < 8) {
    throw new MutationError('كلمة المرور يجب ألا تقل عن 8 أحرف');
  }

  const after = {
    name: name ?? existing.name,
    phone: str(fd, 'phone'),
    jobTitle: str(fd, 'jobTitle'),
    roleId,
    branch,
    reportsToId,
    isProducer,
    active,
  };

  await db.user.update({
    where: { id },
    data: {
      ...after,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    },
  });
  await auditDiff(admin.id, 'User', id, existing, after);
  return '/settings/users';
}

/** هل يجعل هذا الاختيار المستخدمَ تابعًا لأحد مرؤوسيه؟ */
async function reportsToCreatesCycle(userId: string, managerId: string): Promise<boolean> {
  let current: string | null = managerId;
  const seen = new Set<string>();
  while (current) {
    if (current === userId) return true;
    if (seen.has(current)) return false; // حلقة قائمة أصلًا — لا نزيد عليها
    seen.add(current);
    const next: { reportsToId: string | null } | null = await db.user.findUnique({
      where: { id: current },
      select: { reportsToId: true },
    });
    current = next?.reportsToId ?? null;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
//  الأدوار والصلاحيات — §٥: تُنشأ وتُعدَّل من الشاشة بلا نشر جديد
// ═══════════════════════════════════════════════════════════════

export async function saveRole(fd: FormData, admin: SessionUser, id?: string) {
  if (!can(admin, 'canManageUsers')) {
    throw new MutationError('ليس لديك صلاحية إدارة الأدوار');
  }

  const label = str(fd, 'label');
  if (!label) throw new MutationError('اسم الدور مطلوب');

  // خريطة الصلاحيات تُبنى من قائمة المفاتيح نفسها — إضافة صلاحية جديدة
  // مستقبلًا تعمل هنا تلقائيًا بلا تعديل
  const permissions = Object.fromEntries(
    PERMISSION_KEYS.map((key) => [key, fd.get(key) === 'on'])
  ) as Record<(typeof PERMISSION_KEYS)[number], boolean>;

  const discountLimit = num(fd, 'discountLimit') ?? 0;
  if (discountLimit < 0 || discountLimit > 1) {
    throw new MutationError('حد الخصم يجب أن يكون بين ٠ و١ (٠٫١ تعني ١٠٪)');
  }

  if (!id) {
    const name = str(fd, 'name');
    if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) {
      throw new MutationError('المفتاح البرمجي يجب أن يكون إنجليزيًا صغيرًا بلا مسافات');
    }
    if (await db.role.findUnique({ where: { name } })) {
      throw new MutationError('هذا المفتاح مستخدم بالفعل');
    }
    const maxOrder = await db.role.aggregate({ _max: { sortOrder: true } });
    const created = await db.role.create({
      data: {
        name,
        label,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        discountLimit,
        ...permissions,
      },
    });
    await auditEvent(admin.id, 'create', 'Role', created.id, label);
    return '/settings/roles';
  }

  const existing = await db.role.findUnique({ where: { id } });
  if (!existing) throw new MutationError('الدور غير موجود');

  // نزع «إدارة المستخدمين» من دور يشغله آخرون قد يقفل الجميع خارج الشاشة
  if (existing.canManageUsers && !permissions.canManageUsers) {
    const stillAdmins = await db.user.count({
      where: { active: true, roleRef: { canManageUsers: true, id: { not: id } } },
    });
    if (stillAdmins === 0) {
      throw new MutationError(
        'هذا آخر دور يملك «إدارة المستخدمين» — أنشئ دورًا بديلًا قبل نزعها'
      );
    }
  }

  await db.role.update({ where: { id }, data: { label, discountLimit, ...permissions } });
  await auditDiff(admin.id, 'Role', id, existing, { label, discountLimit, ...permissions });
  return '/settings/roles';
}

// ═══════════════════════════════════════════════════════════════
//  القوائم المرجعية — §٩: قابلة للتعديل من الواجهة
// ═══════════════════════════════════════════════════════════════

export async function saveListItem(fd: FormData, admin: SessionUser, id?: string) {
  if (!can(admin, 'canManageSettings')) {
    throw new MutationError('ليس لديك صلاحية إدارة القوائم');
  }

  const listName = str(fd, 'listName');
  const label = str(fd, 'label');
  if (!listName || !label) throw new MutationError('اسم القائمة والعنوان مطلوبان');

  const extra = str(fd, 'extra');
  if (extra && !Number.isFinite(Number(extra))) {
    throw new MutationError('المعامل يجب أن يكون رقمًا');
  }
  const active = fd.get('active') === 'on';
  const sortOrder = num(fd, 'sortOrder') ?? 0;

  if (!id) {
    const value = str(fd, 'value');
    if (!value || !/^[a-z0-9_]+$/.test(value)) {
      throw new MutationError('المفتاح البرمجي يجب أن يكون إنجليزيًا صغيرًا بلا مسافات');
    }
    const clash = await db.listItem.findUnique({
      where: { listName_value: { listName, value } },
    });
    if (clash) throw new MutationError('هذا المفتاح موجود في القائمة بالفعل');

    const created = await db.listItem.create({
      data: { listName, value, label, extra, sortOrder, active: true },
    });
    await auditEvent(admin.id, 'create', 'ListItem', created.id, `${listName}: ${label}`);
    return `/settings/lists?list=${listName}`;
  }

  const existing = await db.listItem.findUnique({ where: { id } });
  if (!existing) throw new MutationError('العنصر غير موجود');

  // القيمة المخزّنة في السجلات القديمة لا تتغيّر أبدًا — نغيّر العرض فقط
  const after = { label, extra, sortOrder, active };
  await db.listItem.update({ where: { id }, data: after });
  await auditDiff(admin.id, 'ListItem', id, existing, after);
  return `/settings/lists?list=${existing.listName}`;
}

// ═══════════════════════════════════════════════════════════════
//  اعتماد الخصم (§١٠ بند ٤)
// ═══════════════════════════════════════════════════════════════

/**
 * اعتماد الخصم أو رفضه.
 *
 * **ضابط رقابي بلا احتكاك:** المشروع الموقوف لا يتحرك خطوة واحدة حتى
 * يعتمده من يملك `canApproveDiscount`، والرفض يعيده لسعره بلا خصم بدل
 * تركه معلّقًا إلى الأبد.
 */
export async function decideApproval(fd: FormData, user: SessionUser, id: string) {
  if (!can(user, 'canApproveDiscount')) {
    throw new MutationError('ليس لديك صلاحية اعتماد الخصومات');
  }

  const project = await db.project.findUnique({ where: { id } });
  if (!project) throw new MutationError('المشروع غير موجود');
  if (project.approvalState !== 'pending') {
    throw new MutationError('هذا المشروع ليس بانتظار اعتماد');
  }

  const decision = str(fd, 'decision');
  const note = str(fd, 'approvalNote');
  const now = new Date();

  if (decision === 'approve') {
    const after = {
      approvalState: 'approved',
      approvedById: user.id,
      approvedAt: now,
      approvalNote: note,
    };
    await db.project.update({ where: { id }, data: after });
    await auditDiff(user.id, 'Project', id, project, after);
    await logActivity({
      type: 'STATUS_CHANGED',
      title: 'اعتُمد الخصم',
      detail: `${project.code} — بواسطة ${user.name}`,
      userId: user.id,
      link: { projectId: id },
    });
    return `/projects/${id}`;
  }

  if (decision === 'reject') {
    if (!note) throw new MutationError('سبب الرفض مطلوب');

    // الرفض يعيد السعر إلى ما قبل الخصم — لا يترك المشروع معلّقًا
    const restored = project.gross ?? project.netTotal;
    const after = {
      approvalState: 'rejected',
      approvedById: user.id,
      approvedAt: now,
      approvalNote: note,
      discountType: null,
      discountValue: null,
      netTotal: restored,
    };
    await db.project.update({ where: { id }, data: after });
    await auditDiff(user.id, 'Project', id, project, after);
    await logActivity({
      type: 'STATUS_CHANGED',
      title: 'رُفض الخصم',
      detail: `${project.code} — ${note}`,
      userId: user.id,
      link: { projectId: id },
    });
    return `/projects/${id}`;
  }

  throw new MutationError('قرار غير معروف');
}

// ═══════════════════════════════════════════════════════════════
//  قائمة الأسعار (§١٠ بند ١)
// ═══════════════════════════════════════════════════════════════

export async function savePriceItem(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageSettings')) {
    throw new MutationError('ليس لديك صلاحية إدارة قائمة الأسعار');
  }

  const serviceLine = str(fd, 'serviceLine');
  const langFrom = str(fd, 'langFrom');
  const langTo = str(fd, 'langTo');
  const unitPrice = num(fd, 'unitPrice');

  if (!serviceLine || !langFrom || !langTo) {
    throw new MutationError('خط الخدمة وزوج اللغات مطلوبة');
  }
  if (!unitPrice || unitPrice <= 0) throw new MutationError('سعر الصفحة مطلوب');

  const effectiveFrom = date(fd, 'effectiveFrom') ?? new Date();

  const data = {
    serviceLine,
    langFrom,
    langTo,
    unitPrice,
    currency: str(fd, 'currency') ?? 'EGP',
    minOrder: num(fd, 'minOrder'),
    effectiveFrom,
    active: fd.get('active') === 'on' || !id,
    notes: str(fd, 'notes'),
  };

  if (!id) {
    // البند الجديد **يُضاف** ولا يستبدل القديم — أسعار الماضي تبقى كما هي
    const item = await db.priceListItem.create({ data });
    await auditEvent(
      user.id,
      'create',
      'PriceListItem',
      item.id,
      `${serviceLine} ${langFrom}→${langTo} = ${unitPrice}`
    );
  } else {
    const existing = await db.priceListItem.findUnique({ where: { id } });
    if (!existing) throw new MutationError('البند غير موجود');
    await db.priceListItem.update({ where: { id }, data });
    await auditDiff(user.id, 'PriceListItem', id, existing, data);
  }

  return '/settings/prices?saved=1';
}

// ═══════════════════════════════════════════════════════════════
//  الإسناد وخطوات التنفيذ (§٧.٢)
// ═══════════════════════════════════════════════════════════════

/**
 * إسناد مشروع: نمط التشغيل والمصدر والمنتِج والمراجع.
 *
 * **معيار القبول ≤١٥ ثانية** — أربعة حقول أغلبها قوائم. عند الحفظ تُحسب
 * التكلفة وتُجمَّد، وينتقل المشروع إلى «قيد التنفيذ» إن اكتملت شروطه.
 */
export async function assignProject(fd: FormData, user: SessionUser, id: string) {
  if (!can(user, 'canAssignProduction')) {
    throw new MutationError('ليس لديك صلاحية إسناد الإنتاج');
  }

  const project = await db.project.findUnique({ where: { id } });
  if (!project) throw new MutationError('المشروع غير موجود');
  if (project.status === 'cancelled') {
    throw new MutationError('المشروع ملغى — لا يُسند');
  }

  const workMode = str(fd, 'workMode');
  const sourcing = str(fd, 'sourcing') ?? 'internal';
  const primaryProducerId = str(fd, 'primaryProducerId');
  const reviewerId = str(fd, 'reviewerId');
  const external = sourcing === 'external' || sourcing === 'mixed';
  const primaryFreelancerId = external ? str(fd, 'primaryFreelancerId') : null;
  const reviewerFreelancerId = str(fd, 'reviewerFreelancerId');
  let reviewerRate = num(fd, 'reviewerRate');
  let externalName = str(fd, 'externalName');
  let externalRate = num(fd, 'externalRate');

  if (!workMode) throw new MutationError('نمط التشغيل مطلوب');

  // «مختلط» يحتاج الاثنين معًا — وإلا فهو ليس مختلطًا
  if (sourcing === 'mixed' && (!primaryProducerId || (!primaryFreelancerId && !externalName))) {
    throw new MutationError('التشغيل المختلط يحتاج منفِّذًا داخليًا ومنفِّذًا خارجيًا معًا');
  }
  if (sourcing === 'external') {
    if (!primaryFreelancerId && !externalName) {
      throw new MutationError('اختر الفريلانسر أو اكتب اسم المنفِّذ الخارجي');
    }
  } else if (sourcing === 'internal' && !primaryProducerId) {
    throw new MutationError(`${performerRole(workMode)} مطلوب`);
  }

  // المراجع الخارجي يجلب سعره كذلك
  if (reviewerFreelancerId && reviewerRate === null) {
    const resolvedReviewer = await resolveFreelancerRate(reviewerFreelancerId, {
      langFrom: project.sourceLang,
      langTo: project.targetLang,
      serviceLine: project.serviceLine,
      stepType: 'heavy_review',
    });
    reviewerRate = resolvedReviewer.rate;
  }

  // اختيار فريلانسر مسجَّل يجلب سعره لهذا الزوج (§١١ بند ٥)
  if (primaryFreelancerId) {
    const resolved = await resolveFreelancerRate(primaryFreelancerId, {
      langFrom: project.sourceLang,
      langTo: project.targetLang,
      serviceLine: project.serviceLine,
    });
    externalName = resolved.name || externalName;
    if (externalRate === null) externalRate = resolved.rate;
  }

  const after = {
    workMode,
    sourcing,
    primaryProducerId: sourcing === 'external' ? null : primaryProducerId,
    primaryFreelancerId,
    reviewerId,
    reviewerFreelancerId,
    reviewerRate: reviewerFreelancerId ? reviewerRate : null,
    externalName: external ? externalName : null,
    externalRate: external ? externalRate : null,
    // مدير المشاريع يُختار صراحةً — ومن لم يُختر يبقى مسؤولية من أسند
    projectManagerId: str(fd, 'projectManagerId') ?? project.projectManagerId ?? user.id,
    assignedAt: project.assignedAt ?? new Date(),
  };

  await db.project.update({ where: { id }, data: after });
  await auditDiff(user.id, 'Project', id, project, after);

  // التكلفة تُحسب فور الإسناد فيرى مدير المشاريع أثر قراره حالًا
  await freezeProjectCost(id);

  if (primaryFreelancerId && primaryFreelancerId !== project.primaryFreelancerId) {
    await recordFreelancerUse(primaryFreelancerId);
  }

  // الانتقال إلى «قيد التنفيذ» يمرّ بالبوابة نفسها فتُفحص قواعد §٦
  if (project.status === 'pending_assignment' || project.status === 'rework') {
    const move = new FormData();
    move.set('status', 'in_progress');
    await moveProject(move, user, id);
  }

  await logActivity({
    type: 'STAGE_CHANGED',
    title: 'أُسند المشروع',
    detail: `${project.code} — ${sourcing === 'external' ? 'تشغيل خارجي' : 'تشغيل داخلي'}`,
    userId: user.id,
    link: { projectId: id },
  });

  return `/projects/${id}`;
}

/**
 * خطوة تنفيذ. الصفحات الموزونة والتكلفة تُحسبان وتُخزَّنان وقت الحفظ، فلا
 * يتغيّر تاريخ التكاليف بتغيّر معامل لاحقًا.
 */
export async function saveStep(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canAssignProduction')) {
    throw new MutationError('ليس لديك صلاحية إضافة خطوات');
  }

  const projectId = str(fd, 'projectId');
  if (!projectId) throw new MutationError('معرّف المشروع مفقود');

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, serviceLine: true },
  });
  if (!project) throw new MutationError('المشروع غير موجود');

  const stepType = str(fd, 'stepType');
  const pages = num(fd, 'pages') ?? 0;
  if (!stepType) throw new MutationError('نوع الخطوة مطلوب');
  if (pages <= 0) throw new MutationError('عدد صفحات الخطوة مطلوب');

  const costSource = str(fd, 'costSource') === 'external' ? 'external' : 'internal';
  const performerId = costSource === 'internal' ? str(fd, 'performerId') : null;
  const freelancerId = costSource === 'external' ? str(fd, 'freelancerId') : null;
  let externalName = costSource === 'external' ? str(fd, 'externalName') : null;
  let externalRate = costSource === 'external' ? num(fd, 'externalRate') : null;
  let rateUnit = str(fd, 'rateUnit') ?? 'page';
  const rateUnits = costSource === 'external' ? num(fd, 'rateUnits') : null;

  if (costSource === 'internal' && !performerId) {
    throw new MutationError('منفِّذ الخطوة مطلوب');
  }
  if (costSource === 'external' && !freelancerId && !externalName) {
    throw new MutationError('اختر الفريلانسر أو اكتب اسم المنفِّذ الخارجي');
  }

  // اختيار فريلانسر مسجَّل يجلب سعره لهذا الزوج تلقائيًا (§١١ بند ٥)،
  // ولا يُلغي رقمًا كتبه المستخدم صراحةً — هو الذي يعرف اتفاق اليوم.
  if (freelancerId) {
    const projectLangs = await db.project.findUnique({
      where: { id: projectId },
      select: { sourceLang: true, targetLang: true },
    });
    const resolved = await resolveFreelancerRate(freelancerId, {
      langFrom: projectLangs?.sourceLang,
      langTo: projectLangs?.targetLang,
      serviceLine: project.serviceLine,
      stepType,
    });
    externalName = resolved.name || externalName;
    if (externalRate === null) {
      externalRate = resolved.rate;
      rateUnit = resolved.rateUnit;
    }
  }

  const weighted = await stepWeightedPages({
    stepType,
    serviceLine: project.serviceLine,
    pages,
  });

  const data = {
    projectId,
    stepType,
    performerId,
    freelancerId,
    externalName,
    externalRate,
    rateUnit,
    rateUnits,
    costSource,
    pages,
    weightedPages: weighted,
    // التكلفة تُحسب في المحرّك بعد الحفظ لتشمل راتب المنفِّذ الحالي
    cost: 0,
    notes: str(fd, 'notes'),
    sortOrder: num(fd, 'sortOrder') ?? 0,
  };

  let stepId = id;
  let previousFreelancerId: string | null = null;

  if (!id) {
    const step = await db.projectStep.create({ data });
    stepId = step.id;
    await auditEvent(user.id, 'create', 'ProjectStep', step.id, `${stepType} — ${pages} صفحة`);
  } else {
    const existing = await db.projectStep.findUnique({ where: { id } });
    if (!existing) throw new MutationError('الخطوة غير موجودة');
    previousFreelancerId = existing.freelancerId;
    await db.projectStep.update({ where: { id }, data });
    await auditDiff(user.id, 'ProjectStep', id, existing, data);
  }

  const breakdown = await freezeProjectCost(projectId);

  // **سطر الاستحقاق يُنشأ عند الإسناد لا عند التسليم** (§١١ بند ٨):
  // الالتزام نشأ لحظة تكليفه، فيجب أن يظهر في حساب الدائنين فورًا.
  if (stepId) {
    const stepCost = breakdown?.stepCosts.find((s) => s.id === stepId)?.cost ?? 0;
    await syncStepPayment({
      stepId,
      freelancerId,
      projectId,
      amount: stepCost,
      currency: str(fd, 'currency') ?? 'EGP',
      dueDate: date(fd, 'dueDate'),
    });
  }

  if (freelancerId && freelancerId !== previousFreelancerId) {
    await recordFreelancerUse(freelancerId);
  }

  return `/projects/${projectId}`;
}

/**
 * تسليم المشروع مع ملاحظات الجودة (§٧.٢).
 * التكلفة تُجمَّد هنا نهائيًا — بعدها لا يغيّرها تعديل راتب أو معامل.
 */
export async function deliverProject(fd: FormData, user: SessionUser, id: string) {
  if (!can(user, 'canAssignProduction')) {
    throw new MutationError('ليس لديك صلاحية التسليم');
  }

  const qaIssues = num(fd, 'qaIssues') ?? 0;
  const folderUrl = str(fd, 'folderUrl');

  await db.project.update({
    where: { id },
    data: { qaIssues: Math.max(0, Math.round(qaIssues)), folderUrl },
  });

  const move = new FormData();
  move.set('status', 'delivered');
  const destination = await moveProject(move, user, id);

  // التجميد بعد الانتقال، فيلتقط الحالة النهائية
  await freezeProjectCost(id);
  return destination;
}

// ═══════════════════════════════════════════════════════════════
//  تكلفة الموظفين — لمن يملك canViewStaffSalary وحده
// ═══════════════════════════════════════════════════════════════

export async function saveStaffCost(fd: FormData, user: SessionUser) {
  if (!can(user, 'canViewStaffSalary')) {
    throw new MutationError('رواتب الموظفين لمدير النظام والإدارة فقط');
  }

  const producers = await db.user.findMany({
    where: { isProducer: true },
    select: { id: true, name: true },
  });

  for (const producer of producers) {
    const salary = num(fd, `salary_${producer.id}`);
    const ratio = num(fd, `ratio_${producer.id}`);
    const capacity = num(fd, `capacity_${producer.id}`);
    if (salary === null && ratio === null && capacity === null) continue;

    if ((ratio ?? 0) < 0 || (ratio ?? 0) > 1) {
      throw new MutationError(`نسبة الإنتاج لـ«${producer.name}» يجب أن تكون بين ٠ و١`);
    }

    const existing = await db.staffCost.findUnique({ where: { userId: producer.id } });
    const after = {
      monthlySalary: salary ?? existing?.monthlySalary ?? 0,
      productiveRatio: ratio ?? existing?.productiveRatio ?? 0.7,
      dailyCapacity: capacity ?? existing?.dailyCapacity ?? 4,
    };

    await db.staffCost.upsert({
      where: { userId: producer.id },
      update: after,
      create: { userId: producer.id, ...after },
    });
    // القيم نفسها لا تُقيَّد في السجل إلا إن تغيّرت فعلًا
    await auditDiff(user.id, 'StaffCost', producer.id, existing ?? {}, after);
  }

  return '/settings/staff-costs?saved=1';
}

// ═══════════════════════════════════════════════════════════════
//  خطط نسب المبيعات — كل رقم فيها بيانات تُعدَّل من الشاشة
// ═══════════════════════════════════════════════════════════════

export async function saveCommissionScheme(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageSettings')) {
    throw new MutationError('ليس لديك صلاحية إدارة خطط النسب');
  }

  const name = str(fd, 'name');
  if (!name) throw new MutationError('اسم الخطة مطلوب');

  const data = {
    name,
    basis: str(fd, 'basis') === 'net' ? 'net' : 'collected',
    tierMode: str(fd, 'tierMode') === 'whole' ? 'whole' : 'progressive',
    effectiveFrom: date(fd, 'effectiveFrom') ?? new Date(),
    isDefault: fd.get('isDefault') === 'on',
    active: id ? fd.get('active') === 'on' : true,
  };

  if (!id) {
    const scheme = await db.commissionScheme.create({ data });
    // أول خطة تصير الافتراضية تلقائيًا، وإلا لم تُطبَّق على أحد
    const count = await db.commissionScheme.count();
    if (count === 1) {
      await db.commissionScheme.update({
        where: { id: scheme.id },
        data: { isDefault: true },
      });
    }
    await auditEvent(user.id, 'create', 'CommissionScheme', scheme.id, name);
    return '/settings/commissions?saved=1';
  }

  const existing = await db.commissionScheme.findUnique({ where: { id } });
  if (!existing) throw new MutationError('الخطة غير موجودة');

  await db.commissionScheme.update({ where: { id }, data });
  // خطة افتراضية واحدة فقط — وإلا صار الاختيار عشوائيًا
  if (data.isDefault) {
    await db.commissionScheme.updateMany({
      where: { id: { not: id } },
      data: { isDefault: false },
    });
  }
  await auditDiff(user.id, 'CommissionScheme', id, existing, data);
  return '/settings/commissions?saved=1';
}

export async function saveCommissionTier(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageSettings')) {
    throw new MutationError('ليس لديك صلاحية إدارة الشرائح');
  }

  const schemeId = str(fd, 'schemeId');
  if (!schemeId) throw new MutationError('الخطة مفقودة');

  const fromAmount = num(fd, 'fromAmount') ?? 0;
  const toAmount = num(fd, 'toAmount');
  const adminRate = num(fd, 'adminRate') ?? 0;
  const managerRate = num(fd, 'managerRate') ?? 0;

  if (fromAmount < 0) throw new MutationError('بداية الشريحة لا تكون سالبة');
  if (toAmount !== null && toAmount <= fromAmount) {
    throw new MutationError('نهاية الشريحة يجب أن تكون أكبر من بدايتها');
  }
  if (adminRate < 0 || adminRate > 1 || managerRate < 0 || managerRate > 1) {
    throw new MutationError('النسب تُكتب عشرية بين ٠ و١ (٠٫٠٣ تعني ٣٪)');
  }

  // شريحتان تبدآن من المبلغ نفسه تجعلان الاختيار غامضًا
  const clash = await db.commissionTier.findFirst({
    where: { schemeId, fromAmount, ...(id ? { id: { not: id } } : {}) },
  });
  if (clash) throw new MutationError('توجد شريحة تبدأ من هذا المبلغ بالفعل');

  const data = { schemeId, fromAmount, toAmount, adminRate, managerRate };

  if (!id) {
    const tier = await db.commissionTier.create({ data });
    await auditEvent(
      user.id,
      'create',
      'CommissionTier',
      tier.id,
      `${fromAmount} → ${toAmount ?? '∞'} = ${adminRate}/${managerRate}`
    );
  } else {
    const existing = await db.commissionTier.findUnique({ where: { id } });
    if (!existing) throw new MutationError('الشريحة غير موجودة');
    await db.commissionTier.update({ where: { id }, data });
    await auditDiff(user.id, 'CommissionTier', id, existing, data);
  }

  return '/settings/commissions?saved=1';
}

export async function saveCommissionAssignment(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageSettings')) {
    throw new MutationError('ليس لديك صلاحية إسناد الخطط');
  }

  const schemeId = str(fd, 'schemeId');
  const userId = str(fd, 'userId');
  if (!schemeId || !userId) throw new MutationError('الخطة والموظف مطلوبان');

  const assignment = await db.commissionAssignment.create({
    data: {
      schemeId,
      userId,
      effectiveFrom: date(fd, 'effectiveFrom') ?? new Date(),
    },
  });
  await auditEvent(user.id, 'create', 'CommissionAssignment', assignment.id, userId);
  return '/settings/commissions?saved=1';
}

/** إغلاق فترة — بعده لا تُعاد استحقاقاتها مهما عُدِّلت الخطط */
export async function closeCommissionPeriod(fd: FormData, user: SessionUser) {
  if (!can(user, 'canViewCompanyAnalytics')) {
    throw new MutationError('إغلاق الفترات للإدارة والماليات');
  }

  const period = str(fd, 'period');
  if (!period || !/^\d{4}-\d{2}$/.test(period)) throw new MutationError('الفترة غير صالحة');

  // نبني قبل الإغلاق حتى يُغلق الشهر على أحدث حساب
  await rebuildPeriod(period);

  await db.commissionPeriod.upsert({
    where: { period },
    update: { closedAt: new Date(), closedById: user.id, note: str(fd, 'note') },
    create: {
      period,
      closedAt: new Date(),
      closedById: user.id,
      note: str(fd, 'note'),
    },
  });
  await auditEvent(user.id, 'update', 'CommissionPeriod', period, 'إغلاق الفترة');
  return `/commissions?period=${period}`;
}

// ═══════════════════════════════════════════════════════════════
//  أهداف الفروع الشهرية — «التارجت يمكن تعديله» (قرار الإدارة)
// ═══════════════════════════════════════════════════════════════

export async function saveTargets(fd: FormData, admin: SessionUser) {
  if (!can(admin, 'canManageSettings')) {
    throw new MutationError('ليس لديك صلاحية تعديل الأهداف');
  }

  const period = str(fd, 'period');
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    throw new MutationError('الشهر غير صالح');
  }

  const branches = await db.listItem.findMany({
    where: { listName: 'branch' },
    select: { value: true, label: true },
  });

  for (const branch of branches) {
    const raw = fd.get(`target_${branch.value}`);
    if (raw === null) continue; // الفرع غير معروض في هذه الشاشة
    const amount = Number(String(raw).trim() || 0);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new MutationError(`هدف «${branch.label}» يجب أن يكون رقمًا موجبًا`);
    }

    const existing = await db.branchTarget.findUnique({
      where: { branch_period: { branch: branch.value, period } },
    });
    if (existing?.amount === amount) continue;

    await db.branchTarget.upsert({
      where: { branch_period: { branch: branch.value, period } },
      update: { amount },
      create: { branch: branch.value, period, amount },
    });
    await auditDiff(
      admin.id,
      'BranchTarget',
      `${branch.value}:${period}`,
      { amount: existing?.amount },
      { amount }
    );
  }

  return `/settings/targets?period=${period}&saved=1`;
}

// ═══════════════════════════════════════════════════════════════
//  إعدادات النظام — §٩
// ═══════════════════════════════════════════════════════════════

export async function saveSettings(fd: FormData, admin: SessionUser) {
  if (!can(admin, 'canManageSettings')) {
    throw new MutationError('ليس لديك صلاحية إدارة الإعدادات');
  }

  const group = str(fd, 'group');
  const definitions = SETTING_DEFINITIONS.filter((d) => !group || d.group === group);

  for (const def of definitions) {
    const raw =
      def.kind === 'boolean'
        ? fd.get(def.key) === 'on'
          ? 'true'
          : 'false'
        : (str(fd, def.key) ?? def.value);

    if (def.kind !== 'boolean' && def.kind !== 'text' && !Number.isFinite(Number(raw))) {
      throw new MutationError(`«${def.label}» يجب أن يكون رقمًا`);
    }

    const existing = await db.setting.findUnique({ where: { key: def.key } });
    if (existing?.value === raw) continue;

    await db.setting.upsert({
      where: { key: def.key },
      update: { value: raw },
      create: { key: def.key, value: raw, label: def.label },
    });
    await auditDiff(
      admin.id,
      'Setting',
      def.key,
      { value: existing?.value },
      { value: raw }
    );
  }

  return `/settings/system?saved=1${group ? `&group=${encodeURIComponent(group)}` : ''}`;
}

/** المستخدم يغيّر كلمة مروره بنفسه */
export async function changeOwnPassword(fd: FormData, user: SessionUser) {
  const current = str(fd, 'currentPassword');
  const next = str(fd, 'newPassword');
  const confirm = str(fd, 'confirmPassword');

  if (!current || !next || !confirm) throw new MutationError('كل الحقول مطلوبة');
  if (next.length < 8) throw new MutationError('كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف');
  if (next !== confirm) throw new MutationError('كلمتا المرور الجديدتان غير متطابقتين');

  const record = await db.user.findUnique({ where: { id: user.id } });
  if (!record || !(await verifyPassword(current, record.passwordHash))) {
    throw new MutationError('كلمة المرور الحالية غير صحيحة');
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next) },
  });
  return '/settings/password?saved=1';
}

// ═══════════════════════════════════════════════════════════════
//  الفريلانسرز (§١١) — الملف والأسعار والمستحقات
// ═══════════════════════════════════════════════════════════════

/** يقرأ قيمًا متعددة من مربعات اختيار ويحفظها نصًا مفصولًا بفواصل */
function multi(fd: FormData, key: string): string | null {
  const values = fd
    .getAll(key)
    .map((v) => String(v).trim())
    .filter(Boolean);
  return values.length ? [...new Set(values)].sort().join(',') : null;
}

export async function saveFreelancer(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageFreelancers')) {
    throw new MutationError('ليس لديك صلاحية إدارة الفريلانسرز');
  }

  const name = cleanName(str(fd, 'name') ?? '');
  if (!name) throw new MutationError('اسم الفريلانسر مطلوب');
  if (isHeaderRow(name)) throw new MutationError('هذا ليس اسم شخص — راجع ما أدخلته');

  // الهاتف يُطبَّع بقاعدة §١٤؛ وما تعذّر تطبيعه يُحفظ كما كُتب لا يُهمَل
  const phone = normalizePhone(str(fd, 'phone') ?? '');
  const phoneAlt = normalizePhone(str(fd, 'phoneAlt') ?? '');

  const rating = num(fd, 'rating');
  if (rating !== null && (rating < 0 || rating > 10)) {
    throw new MutationError('التقييم من صفر إلى عشرة');
  }

  // **فارغ يعني «لم يُتفق» لا «مجاني»** — فلا نحوّل الفراغ إلى صفر (§١٤)
  const defaultRate = num(fd, 'defaultRate');

  const data = {
    name,
    phone: phone.ok ? phone.value : (str(fd, 'phone') ?? null),
    phoneAlt: phoneAlt.ok ? phoneAlt.value : (str(fd, 'phoneAlt') ?? null),
    email: str(fd, 'email')?.toLowerCase() ?? null,
    country: str(fd, 'country'),
    city: str(fd, 'city'),
    langs: multi(fd, 'langs'),
    specialisations: multi(fd, 'specialisations'),
    defaultRate: defaultRate && defaultRate > 0 ? defaultRate : null,
    rateUnit: str(fd, 'rateUnit') ?? 'page',
    currency: str(fd, 'currency') ?? 'EGP',
    tier: str(fd, 'tier') ?? 'bench',
    active: fd.get('active') !== null,
    rating,
    paymentMethod: str(fd, 'paymentMethod'),
    paymentRef: str(fd, 'paymentRef'),
    cvUrl: str(fd, 'cvUrl'),
    notes: str(fd, 'notes'),
    needsReview: fd.get('needsReview') !== null,
  };

  if (!id) {
    const created = await db.freelancer.create({
      data: { ...data, code: await nextFreelancerCode() },
    });
    await auditEvent(user.id, 'create', 'Freelancer', created.id, name);
    return `/freelancers/${created.id}`;
  }

  const existing = await db.freelancer.findUnique({ where: { id } });
  if (!existing) throw new MutationError('الفريلانسر غير موجود');
  await db.freelancer.update({ where: { id }, data });
  await auditDiff(user.id, 'Freelancer', id, existing, data);
  return `/freelancers/${id}`;
}

/** بند سعر استثنائي — أدقّ تطابق يفوز عند الحساب */
export async function saveFreelancerRate(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageFreelancers')) {
    throw new MutationError('ليس لديك صلاحية إدارة الأسعار');
  }

  const freelancerId = str(fd, 'freelancerId');
  if (!freelancerId) throw new MutationError('معرّف الفريلانسر مفقود');

  const rate = num(fd, 'rate');
  if (rate === null || rate <= 0) {
    // الصفر «لم يُتفق» — ولا يُسجَّل بندًا أصلًا
    throw new MutationError('السعر مطلوب وأكبر من صفر (الصفر يعني «لم يُتفق» فلا يُسجَّل)');
  }

  const data = {
    freelancerId,
    langFrom: str(fd, 'langFrom'),
    langTo: str(fd, 'langTo'),
    serviceLine: str(fd, 'serviceLine'),
    stepType: str(fd, 'stepType'),
    rate,
    rateUnit: str(fd, 'rateUnit') ?? 'page',
    currency: str(fd, 'currency') ?? 'EGP',
    notes: str(fd, 'notes'),
    needsReview: false,
  };

  if (!id) {
    const created = await db.freelancerRate.create({ data });
    await auditEvent(user.id, 'create', 'FreelancerRate', created.id, `${rate}`);
  } else {
    const existing = await db.freelancerRate.findUnique({ where: { id } });
    if (!existing) throw new MutationError('البند غير موجود');
    await db.freelancerRate.update({ where: { id }, data });
    await auditDiff(user.id, 'FreelancerRate', id, existing, data);
  }
  return `/freelancers/${freelancerId}`;
}

/**
 * تأكيد صرف مستحق (§٤.٦).
 *
 * صلاحية مستقلة تمامًا عن `canManageFreelancers`: من يضيف فريلانسرًا ليس
 * بالضرورة من يصرف له. والسطر **لا يُحذف** — يتغيّر حاله ويُوقَّع بمن صرف.
 */
export async function payFreelancer(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canPayFreelancers')) {
    throw new MutationError('تأكيد الصرف للماليات ومدير النظام');
  }
  if (!id) throw new MutationError('معرّف المستحق مفقود');

  const payment = await db.freelancerPayment.findUnique({ where: { id } });
  if (!payment) throw new MutationError('المستحق غير موجود');

  const action = str(fd, 'action') ?? 'pay';

  if (action === 'hold') {
    if (payment.status === 'paid') throw new MutationError('المصروف لا يُعلَّق');
    await db.freelancerPayment.update({
      where: { id },
      data: { status: 'held', notes: str(fd, 'notes') ?? payment.notes },
    });
    await auditEvent(user.id, 'update', 'FreelancerPayment', id, 'تعليق المستحق');
    return '/freelancers/payments?saved=1';
  }

  if (action === 'release') {
    if (payment.status === 'paid') throw new MutationError('المصروف لا يُعاد استحقاقًا');
    await db.freelancerPayment.update({ where: { id }, data: { status: 'due' } });
    await auditEvent(user.id, 'update', 'FreelancerPayment', id, 'رفع التعليق');
    return '/freelancers/payments?saved=1';
  }

  if (payment.status === 'paid') throw new MutationError('هذا المستحق مصروف بالفعل');

  await db.freelancerPayment.update({
    where: { id },
    data: {
      status: 'paid',
      paidAt: date(fd, 'paidAt') ?? new Date(),
      paidById: user.id,
      method: str(fd, 'method'),
      reference: str(fd, 'reference'),
      notes: str(fd, 'notes') ?? payment.notes,
    },
  });
  await auditEvent(user.id, 'update', 'FreelancerPayment', id, `صرف ${payment.amount}`);
  // تكلفة الإنتاج في الدفاتر تطابق ما دُفع فعلًا — القيد مسوَّدة للمحاسب
  await draftFreelancerPayment(id);
  return '/freelancers/payments?saved=1';
}

/**
 * الاستيراد الجماعي (§١١ بند ٦ و§١٤).
 *
 * **لا يحذف ولا يخمّن.** كل صف لا يُحسم يُحفظ مع سبب واضح ويُعلَّم
 * `needsReview` ليُراجع من الشاشة. والصفوف المكررة عبر التبويبات تُدمج
 * بالهاتف المطبَّع أو الاسم المطبَّع، وتُجمع لغاتها.
 */
export async function importFreelancers(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageFreelancers')) {
    throw new MutationError('ليس لديك صلاحية الاستيراد');
  }

  const raw = str(fd, 'rows');
  if (!raw) throw new MutationError('ألصق بيانات الملف أولًا');

  const defaultLang = str(fd, 'defaultLang'); // اللغة = اسم التبويب (§١٤)
  const defaultTier = str(fd, 'defaultTier') ?? 'bench';
  const defaultCurrency = str(fd, 'defaultCurrency') ?? 'EGP';
  const defaultRateUnit = str(fd, 'rateUnit') ?? 'page';

  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let created = 0;
  let merged = 0;
  let skipped = 0;
  let flagged = 0;

  for (const line of lines) {
    // الفاصل: تبويب أولًا (لصق من إكسل)، وإلا فاصلة
    const cells = (line.includes('\t') ? line.split('\t') : line.split(',')).map((c) =>
      c.trim()
    );
    const [rawName, rawPhone, rawRate, rawRating, rawEmail] = cells;

    const name = cleanName(rawName ?? '');
    // صف الرؤوس الثاني اسمه حرفيًا «Name» — لا يصير شخصًا (§١٤)
    if (isHeaderRow(name)) {
      skipped += 1;
      continue;
    }

    const normalized = normalizePhone(rawPhone ?? '');
    const phone = normalized.ok ? normalized.value : null;
    // ٨ خلايا هاتف تحتوي بريدًا — نصحّح الوجهة لا نحذف القيمة
    const phoneIsEmail = /@/.test(rawPhone ?? '');

    const parsedRates = parseRateCell(rawRate ?? '', defaultCurrency);
    const ratingCell = parseRatingCell(rawRating ?? '');
    const email =
      (rawEmail && /@/.test(rawEmail) ? rawEmail.toLowerCase() : null) ??
      ratingCell.email ??
      (phoneIsEmail ? (rawPhone ?? '').toLowerCase() : null);

    const key = mergeKey(name, phone);
    const existing = phone
      ? await db.freelancer.findFirst({ where: { phone } })
      : await db.freelancer.findFirst({ where: { name } });

    const primary = parsedRates[0] ?? null;
    const needsReview =
      parsedRates.some((r) => r.needsReview) || (!primary && Boolean(rawRate?.trim()));
    const importNote = [
      needsReview && rawRate?.trim() ? `خلية السعر: ${rawRate.trim()}` : null,
      phoneIsEmail ? `خلية الهاتف كانت بريدًا: ${rawPhone}` : null,
      parsedRates.find((r) => r.note)?.note ?? null,
    ]
      .filter(Boolean)
      .join(' · ');

    if (existing) {
      // نفس الشخص عبر تبويبات متعددة ← لغاته تُجمع ولا يُنشأ مرتين
      await db.freelancer.update({
        where: { id: existing.id },
        data: {
          langs: mergeMultiValue(existing.langs, defaultLang),
          email: existing.email ?? email,
          rating: existing.rating ?? ratingCell.rating,
          defaultRate: existing.defaultRate ?? primary?.rate ?? null,
          needsReview: existing.needsReview || needsReview,
          importNote: importNote || existing.importNote,
        },
      });
      merged += 1;
      if (needsReview) flagged += 1;
      continue;
    }

    const freelancer = await db.freelancer.create({
      data: {
        code: await nextFreelancerCode(),
        name,
        phone,
        email,
        langs: defaultLang,
        defaultRate: primary?.rate ?? null,
        rateUnit: defaultRateUnit,
        currency: primary?.currency ?? defaultCurrency,
        tier: defaultTier,
        rating: ratingCell.rating,
        needsReview,
        importNote: importNote || null,
        notes: `مستورد — المفتاح ${key}`,
      },
    });

    // الأسعار المفكَّكة تصير بنود استثناء بأوسامها
    for (const parsed of parsedRates.slice(primary ? 1 : 0)) {
      await db.freelancerRate.create({
        data: {
          freelancerId: freelancer.id,
          langFrom: parsed.langFrom ?? null,
          langTo: parsed.langTo ?? null,
          serviceLine: parsed.serviceLine ?? null,
          stepType: parsed.stepType ?? null,
          rate: parsed.rate,
          rateUnit: defaultRateUnit,
          currency: parsed.currency,
          notes: parsed.note ?? null,
          needsReview: Boolean(parsed.needsReview),
        },
      });
    }

    created += 1;
    if (needsReview) flagged += 1;
  }

  await auditEvent(
    user.id,
    'create',
    'Freelancer',
    'import',
    `استيراد: ${created} جديد · ${merged} مدموج · ${skipped} مُستبعَد`
  );

  const params = new URLSearchParams({
    created: String(created),
    merged: String(merged),
    skipped: String(skipped),
    flagged: String(flagged),
  });
  return `/freelancers/import?${params.toString()}`;
}

// ═══════════════════════════════════════════════════════════════
//  المحاسبة (docs/FINANCE-SPEC.md)
// ═══════════════════════════════════════════════════════════════

/** حساب في الشجرة — يُضاف ويُعدَّل من الشاشة بلا نشر */
export async function saveAccount(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageAccounting')) {
    throw new MutationError('إدارة شجرة الحسابات للمحاسب ومدير النظام');
  }

  const name = str(fd, 'name');
  if (!name) throw new MutationError('اسم الحساب مطلوب');

  const parentId = str(fd, 'parentId');
  const parent = parentId
    ? await db.account.findUnique({ where: { id: parentId } })
    : null;
  if (parentId && !parent) throw new MutationError('الحساب الأب غير موجود');

  // النوع والبند يُورَثان من الأب — فلا يوجد حساب مصروف تحت شجرة الإيراد
  const type = parent?.type ?? str(fd, 'type');
  if (!type) throw new MutationError('نوع الحساب مطلوب');

  const data = {
    name,
    nameEn: str(fd, 'nameEn'),
    code: str(fd, 'code'),
    type,
    expenseGroup: parent?.expenseGroup ?? str(fd, 'expenseGroup'),
    level: parent ? parent.level + 1 : 1,
    parentId: parentId ?? null,
    isPostable: fd.get('isPostable') !== null,
    active: fd.get('active') !== null,
    notes: str(fd, 'notes'),
  };

  if (!id) {
    const created = await db.account.create({ data });
    // الأب صار تجميعيًا بمجرد أن صار له ابن — وإلا وقعت قيود على فرعين
    if (parent?.isPostable) {
      await db.account.update({ where: { id: parent.id }, data: { isPostable: false } });
    }
    await auditEvent(user.id, 'create', 'Account', created.id, name);
    return `/finance/accounts?saved=1`;
  }

  const existing = await db.account.findUnique({ where: { id } });
  if (!existing) throw new MutationError('الحساب غير موجود');

  // حساب عليه قيود لا يتحوّل إلى تجميعي — ترحيلاته تصير يتيمة في التقارير
  if (existing.isPostable && !data.isPostable) {
    const used = await db.journalLine.count({ where: { accountId: id } });
    if (used > 0) {
      throw new MutationError(`عليه ${used} سطر قيد — لا يصير تجميعيًا. عطّله إن أردت إيقافه.`);
    }
  }

  await db.account.update({ where: { id }, data });
  await auditDiff(user.id, 'Account', id, existing, data);
  return `/finance/accounts?saved=1`;
}

/** مركز تكلفة = حساب + مشروع */
export async function saveCostCenter(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');

  const name = str(fd, 'name');
  if (!name) throw new MutationError('اسم مركز التكلفة مطلوب');

  const data = {
    name,
    project: str(fd, 'project'),
    active: fd.get('active') !== null,
  };

  if (!id) {
    await db.costCenter.create({ data });
  } else {
    await db.costCenter.update({ where: { id }, data });
  }
  await auditEvent(user.id, id ? 'update' : 'create', 'CostCenter', id ?? name, name);
  return '/finance/accounts?saved=1';
}

/**
 * قيد يومية — يُحفظ **مسوَّدةً** دائمًا، ويُرحَّل بفعل منفصل.
 *
 * الفصل مقصود: المحاسب يكتب ويراجع ثم يقرر. والتوازن يُفحص عند الحفظ
 * ليصحّح فورًا، **وعند الترحيل** أيضًا لأنه الباب الذي لا يُتجاوز.
 */
export async function saveJournalEntry(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageAccounting')) {
    throw new MutationError('تحرير القيود للمحاسب ومدير النظام');
  }

  const entryDate = date(fd, 'date') ?? new Date();
  const period = fiscalMonth(entryDate);
  if (await isPeriodClosed(period)) {
    throw new MutationError(`فترة ${period} مغلقة — لا تحرير فيها`);
  }

  const description = str(fd, 'description');
  if (!description) throw new MutationError('بيان القيد مطلوب');

  // السطور تصل مرقّمة: lines[0][accountId] ...
  const lines: {
    accountId: string;
    debit: number;
    credit: number;
    currency: string;
    fxRate: number;
    memo: string | null;
    branch: string | null;
    costCenterId: string | null;
    salesAdminId: string | null;
    trafficSource: string | null;
    translationType: string | null;
  }[] = [];

  for (let i = 0; i < 40; i += 1) {
    const accountId = str(fd, `lines[${i}][accountId]`);
    if (!accountId) continue;
    const debit = num(fd, `lines[${i}][debit]`) ?? 0;
    const credit = num(fd, `lines[${i}][credit]`) ?? 0;
    if (debit === 0 && credit === 0) continue;

    lines.push({
      accountId,
      debit,
      credit,
      currency: str(fd, `lines[${i}][currency]`) ?? 'EGP',
      fxRate: num(fd, `lines[${i}][fxRate]`) ?? 1,
      memo: str(fd, `lines[${i}][memo]`),
      branch: str(fd, `lines[${i}][branch]`),
      costCenterId: str(fd, `lines[${i}][costCenterId]`),
      salesAdminId: str(fd, `lines[${i}][salesAdminId]`),
      trafficSource: str(fd, `lines[${i}][trafficSource]`),
      translationType: str(fd, `lines[${i}][translationType]`),
    });
  }

  const balance = checkBalance(lines);
  if (!balance.balanced || balance.problems.length > 0) {
    throw new MutationError(balance.problems.join(' · '));
  }

  const header = {
    date: entryDate,
    period,
    docType: str(fd, 'docType') ?? 'journal',
    docNumber: str(fd, 'docNumber'),
    description,
    projectId: str(fd, 'projectId'),
  };

  const lineData = lines.map((l, i) => ({
    accountId: l.accountId,
    debit: l.debit,
    credit: l.credit,
    currency: l.currency,
    fxRate: l.fxRate,
    // بالعملة الأساس — **بسعر اليوم مخزَّنًا**، فلا تتغيّر أرباح الماضي
    debitBase: toBase(l.debit, l.fxRate),
    creditBase: toBase(l.credit, l.fxRate),
    memo: l.memo,
    branch: l.branch,
    costCenterId: l.costCenterId,
    salesAdminId: l.salesAdminId,
    trafficSource: l.trafficSource,
    translationType: l.translationType,
    sortOrder: i,
  }));

  if (!id) {
    const created = await db.journalEntry.create({
      data: {
        ...header,
        code: await nextJournalCode(entryDate),
        status: 'draft',
        createdById: user.id,
        lines: { create: lineData },
      },
    });
    await auditEvent(user.id, 'create', 'JournalEntry', created.id, description);
    return `/finance/journal/${created.id}`;
  }

  const existing = await db.journalEntry.findUnique({ where: { id } });
  if (!existing) throw new MutationError('القيد غير موجود');
  // القيد المرحَّل لا يُعدَّل — يُلغى بقيد عكسي أو يُلغى بسبب صريح
  if (existing.status === 'posted') {
    throw new MutationError('القيد مرحَّل — لا يُعدَّل. ألغِه بسبب صريح ثم حرّر بديلًا.');
  }

  await db.journalLine.deleteMany({ where: { entryId: id } });
  await db.journalEntry.update({
    where: { id },
    data: { ...header, lines: { create: lineData } },
  });
  await auditDiff(user.id, 'JournalEntry', id, existing, header);
  return `/finance/journal/${id}`;
}

/** ترحيل قيد أو إلغاؤه — كلاهما فعل موقَّع باسم صاحبه */
export async function decideJournalEntry(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');
  if (!id) throw new MutationError('معرّف القيد مفقود');

  const action = str(fd, 'action') ?? 'post';

  try {
    if (action === 'void') {
      await voidEntry(id, user.id, str(fd, 'reason') ?? '');
      await auditEvent(user.id, 'update', 'JournalEntry', id, 'إلغاء القيد');
    } else {
      await postEntry(id, user.id);
      await auditEvent(user.id, 'update', 'JournalEntry', id, 'ترحيل القيد');
    }
  } catch (error) {
    throw new MutationError(error instanceof Error ? error.message : 'تعذّر تنفيذ الإجراء');
  }

  return `/finance/journal/${id}`;
}

/** إقفال شهر محاسبي — بعده لا تحرير ولا ترحيل ولا إلغاء */
export async function closeFiscalPeriod(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');

  const period = str(fd, 'period');
  if (!period || !/^\d{4}-\d{2}$/.test(period)) throw new MutationError('الفترة غير صالحة');

  const open = str(fd, 'action') === 'open';

  if (!open) {
    // المسوَّدة المعلّقة تعني عملًا لم يُراجَع — الإقفال فوقها يخفيه
    const drafts = await db.journalEntry.count({ where: { period, status: 'draft' } });
    if (drafts > 0) {
      throw new MutationError(
        `${drafts} قيدًا ما زال مسوَّدة في ${period} — رحّلها أو ألغِها قبل الإقفال`
      );
    }
  }

  await db.fiscalPeriod.upsert({
    where: { period },
    update: open
      ? { closedAt: null, closedById: null, note: str(fd, 'note') }
      : { closedAt: new Date(), closedById: user.id, note: str(fd, 'note') },
    create: {
      period,
      closedAt: open ? null : new Date(),
      closedById: open ? null : user.id,
      note: str(fd, 'note'),
    },
  });
  await auditEvent(
    user.id,
    'update',
    'FiscalPeriod',
    period,
    open ? 'إعادة فتح الفترة' : 'إقفال الفترة'
  );
  return `/finance/periods?saved=1`;
}

/** موازنة سنة — رأسها وحدها هنا، وبنودها في `saveBudgetLines` */
export async function saveBudget(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');

  const year = num(fd, 'year');
  if (!year || year < 2020 || year > 2100) throw new MutationError('السنة غير صالحة');

  const data = {
    year: Math.round(year),
    name: str(fd, 'name') ?? `موازنة ${Math.round(year)}`,
    notes: str(fd, 'notes'),
    status: str(fd, 'status') ?? 'draft',
  };

  if (!id) {
    const exists = await db.budget.findUnique({ where: { year: data.year } });
    if (exists) return `/finance/budget?year=${data.year}`;
    const created = await db.budget.create({ data });
    await auditEvent(user.id, 'create', 'Budget', created.id, data.name);
    return `/finance/budget?year=${data.year}`;
  }

  if (data.status === 'approved') {
    await db.budget.update({
      where: { id },
      data: { ...data, approvedById: user.id, approvedAt: new Date() },
    });
  } else {
    await db.budget.update({ where: { id }, data });
  }
  await auditEvent(user.id, 'update', 'Budget', id, data.name);
  return `/finance/budget?year=${data.year}`;
}

/**
 * بنود الموازنة دفعةً واحدة.
 *
 * الشاشة تعرض حسابًا واحدًا بأشهره الاثني عشر، أو مبلغًا سنويًا يُوزَّع.
 * **الصفر يُحذف لا يُخزَّن**: مستهدف صفر ومستهدف غير مضبوط شيء واحد، وتخزينه
 * يملأ الجدول بلا معنى.
 */
export async function saveBudgetLines(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');

  const budgetId = str(fd, 'budgetId');
  const accountId = str(fd, 'accountId');
  if (!budgetId || !accountId) throw new MutationError('الموازنة أو الحساب مفقود');

  const budget = await db.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new MutationError('الموازنة غير موجودة');
  if (budget.status === 'approved') {
    throw new MutationError('الموازنة معتمدة — أعِدها إلى «قيد الإعداد» لتعديلها');
  }

  const branch = str(fd, 'branch');
  const annual = num(fd, 'annual');

  let amounts: number[];
  if (annual !== null && annual !== undefined) {
    amounts = spreadAnnual(annual);
  } else {
    amounts = Array.from({ length: 12 }, (_, i) => num(fd, `month[${i + 1}]`) ?? 0);
  }

  // نمسح ثم نكتب: المفتاح المركّب يحمل حقلًا يقبل الفراغ (الفرع)، وتعامل
  // القواعد مع NULL في المفاتيح الفريدة غير موحّد — والمسح يجعل النتيجة
  // واحدة في SQLite وPostgreSQL معًا.
  await db.budgetLine.deleteMany({ where: { budgetId, accountId, branch: branch ?? null } });

  const rows = amounts
    .map((amount, i) => ({ budgetId, accountId, month: i + 1, branch: branch ?? null, amount }))
    // المستهدف صفر ومستهدف غير مضبوط شيء واحد — فلا يُخزَّن
    .filter((row) => row.amount !== 0);

  if (rows.length > 0) await db.budgetLine.createMany({ data: rows });

  await auditEvent(user.id, 'update', 'Budget', budgetId, `مستهدف حساب ${accountId}`);
  return `/finance/budget?year=${budget.year}&account=${accountId}`;
}

/** أصل ثابت — تكلفته ونسبته وشهر بدء إهلاكه */
export async function saveFixedAsset(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');

  const name = str(fd, 'name');
  const cost = num(fd, 'cost');
  const annualRate = num(fd, 'annualRate');
  if (!name) throw new MutationError('اسم الأصل مطلوب');
  if (!cost || cost <= 0) throw new MutationError('تكلفة الأصل مطلوبة');
  if (annualRate === null || annualRate < 0 || annualRate > 1) {
    throw new MutationError('نسبة الإهلاك بين صفر وواحد (٠٫٢٥ = ٢٥٪)');
  }

  const purchaseDate = date(fd, 'purchaseDate') ?? new Date();

  const data = {
    name,
    category: str(fd, 'category') ?? 'other',
    cost,
    annualRate,
    salvageValue: num(fd, 'salvageValue') ?? 0,
    purchaseDate,
    startPeriod: str(fd, 'startPeriod') ?? fiscalMonth(purchaseDate),
    branch: str(fd, 'branch'),
    notes: str(fd, 'notes'),
    active: fd.get('active') !== null,
  };

  if (!id) {
    const created = await db.fixedAsset.create({
      data: { ...data, accumulated: num(fd, 'accumulated') ?? 0 },
    });
    await auditEvent(user.id, 'create', 'FixedAsset', created.id, name);
  } else {
    const existing = await db.fixedAsset.findUnique({ where: { id } });
    if (!existing) throw new MutationError('الأصل غير موجود');
    // المجمّع لا يُعدَّل من الشاشة — يبنيه الترحيل الشهري وحده
    await db.fixedAsset.update({ where: { id }, data });
    await auditDiff(user.id, 'FixedAsset', id, existing, data);
  }
  return '/finance/assets?saved=1';
}

/**
 * توليد القيود المقترحة عن فترة.
 *
 * يمسح المشغّل ويقترح ما لم يُقترح بعد: إيراد كل مشروع سُلّم · تحصيل كل
 * مشروع حُصّل · صرف كل مستحق فريلانسر · استحقاق العمولات · إهلاك الشهر.
 *
 * **كلها مسوَّدات.** الدفتر لا يُكتب إلا بيد المحاسب.
 */
export async function generateDraftEntries(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');

  const period = str(fd, 'period');
  if (!period || !/^\d{4}-\d{2}$/.test(period)) throw new MutationError('الفترة غير صالحة');
  if (await isPeriodClosed(period)) throw new MutationError(`فترة ${period} مغلقة`);

  const { start, end } = monthRange(period);
  let created = 0;

  const delivered = await db.project.findMany({
    where: { deliveredAt: { gte: start, lt: end }, status: { not: 'cancelled' } },
    select: { id: true },
  });
  for (const project of delivered) {
    if (await draftRevenueOnDelivery(project.id)) created += 1;
  }

  const collected = await db.project.findMany({
    where: { collectedAt: { gte: start, lt: end }, status: 'collected' },
    select: { id: true },
  });
  for (const project of collected) {
    if (await draftCollection(project.id)) created += 1;
  }

  const payments = await db.freelancerPayment.findMany({
    where: { status: 'paid', paidAt: { gte: start, lt: end } },
    select: { id: true },
  });
  for (const payment of payments) {
    if (await draftFreelancerPayment(payment.id)) created += 1;
  }

  if (await draftCommissionAccrual(period)) created += 1;
  if (await draftMonthlyDepreciation(period)) created += 1;

  await auditEvent(user.id, 'create', 'JournalEntry', period, `توليد مقترحات: ${created}`);
  return `/finance/journal?period=${period}&generated=${created}`;
}

// ═══════════════════════════════════════════════════════════════
//  ترحيل الملفات القديمة (§١٤)
// ═══════════════════════════════════════════════════════════════

/**
 * يستورد ملف الليدز أو المبيعات.
 *
 * **آمن التكرار:** الصف المُرحَّل سابقًا يُتخطّى بمفتاحه، فيمكن لصق الملف
 * كاملًا مرة بعد مرة كلما نما، بلا أن يتضاعف شيء.
 */
export async function importLegacySheet(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageSettings')) {
    throw new MutationError('الترحيل لمدير النظام ومن يملك إدارة الإعدادات');
  }

  const source = str(fd, 'source');
  if (source !== 'leads' && source !== 'sales') {
    throw new MutationError('نوع الملف غير معروف');
  }

  const raw = str(fd, 'rows');
  if (!raw) throw new MutationError('ألصق صفوف الملف أولًا');

  const rows = raw.split(/\r?\n/).filter((line) => line.trim());
  if (rows.length > 4000) {
    throw new MutationError('الدفعة أكبر من ٤٠٠٠ صف — قسّمها حتى لا ينقطع الطلب');
  }

  const options = {
    defaultBranch: str(fd, 'defaultBranch'),
    // قاعدة انقلاب مارس ٢٠٢٦ لا تُطبَّق إلا بطلب صريح — تعميمها يقلب
    // كل تاريخ يومه الثالث
    fixMarchFlip: fd.get('fixMarchFlip') !== null,
    actor: user,
  };

  const summary =
    source === 'leads'
      ? await importLeadSheet(rows, options)
      : await importSalesSheet(rows, options);

  await auditEvent(
    user.id,
    'create',
    source === 'leads' ? 'Lead' : 'Project',
    'import',
    `ترحيل ${source}: ${summary.leads} ليد · ${summary.projects} مشروع · ${summary.review} للمراجعة`
  );

  const params = new URLSearchParams({
    source,
    ...Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, String(v)])),
  });
  return `/settings/import?${params.toString()}`;
}

/** يحسم صفًّا في قائمة المراجعة: صُحّح ورُحّل، أو استُبعد بقرار صريح */
export async function resolveMigrationRow(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageSettings')) throw new MutationError('لا صلاحية');
  if (!id) throw new MutationError('معرّف الصف مفقود');

  const action = str(fd, 'action') ?? 'skip';
  const note = str(fd, 'note');

  if (action === 'skip' && !note) {
    // الاستبعاد قرار — والقرار بلا سبب لا يُراجَع بعد شهر
    throw new MutationError('سبب الاستبعاد مطلوب');
  }

  await db.migrationReview.update({
    where: { id },
    data: {
      status: action === 'resolve' ? 'resolved' : 'skipped',
      resolvedAt: new Date(),
      resolvedById: user.id,
      note,
    },
  });
  await auditEvent(user.id, 'update', 'MigrationReview', id, action);
  return '/settings/import/review?saved=1';
}

// ═══════════════════════════════════════════════════════════════
//  التنبيهات (§١٢)
// ═══════════════════════════════════════════════════════════════

/** يعلّم تنبيهًا — أو كل تنبيهات صاحبه — مقروءًا */
export async function markNotificationsRead(fd: FormData, user: SessionUser, id?: string) {
  const scope = str(fd, 'scope');

  if (scope === 'all') {
    await db.notification.updateMany({
      // **المستخدم نفسه وحده**: لا يعلّم أحد تنبيهات غيره
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return '/notifications?saved=1';
  }

  if (!id) throw new MutationError('معرّف التنبيه مفقود');
  await db.notification.updateMany({
    where: { id, userId: user.id },
    data: { readAt: new Date() },
  });
  return '/notifications';
}

/**
 * يفحص أحداث §١٢ الثمانية ويكتب ما استحقّ.
 *
 * يُستدعى عادةً من مؤقّت خارجي، ومن الشاشة عند الحاجة. **آمن التكرار.**
 */
export async function runNotifications(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageSettings')) {
    throw new MutationError('تشغيل الفحص لمن يملك إدارة الإعدادات');
  }

  const results = await runAllEvents();
  const written = results.reduce((s, r) => s + r.written, 0);
  await auditEvent(user.id, 'create', 'Notification', 'run', `فحص التنبيهات: ${written} رسالة`);
  return `/notifications?saved=1&written=${written}`;
}
