import 'server-only';
import { MutationError, requireOwn, readDeadline, readDiscount } from './base';
import { db } from '@/lib/db';
import { can, hashPassword, verifyPassword, type SessionUser } from '@/lib/auth';
import { str, num, date, fullName } from '@/lib/utils';
import { logActivity, readEntityLink, linkPath, type EntityLink } from '@/lib/actions/helpers';
import { auditEvent, auditDiff } from '@/lib/audit';
import { PERMISSION_KEYS } from '@/lib/permissions';
import { SETTING_DEFINITIONS } from '@/lib/settings-defs';
import { findOrCreateClient } from '@/lib/clients';
import { normalizePhone } from '@/lib/phone';
import { checkUpload } from '@/lib/files';
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



/**
 * المبيعات — الليدز والعملاء والشركات وجهات الاتصال وعروض الأسعار.
 *
 * جزء من وحدة التعديلات المقسَّمة بالمجال — انظر `src/lib/mutations/index.ts`.
 */

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
    // النسبة تُكتب مئويّة في الشاشة وتُخزَّن عشريّة — انظر `readDiscount`
    manualDiscountType: can(user, 'canDiscount') ? readDiscount(fd).type : null,
    manualDiscountValue: can(user, 'canDiscount') ? readDiscount(fd).value : null,
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

  /**
   * **الملكية تُعدَّل — ولم تكن تُعدَّل.**
   *
   * كان `ownerId` يُكتب عند الإنشاء وحده ولا يمسّه التحديث، فبطاقةٌ وقعت
   * على الحساب الخطأ تبقى عليه للأبد. وبيانات المكتب استُوردت كلها بحسابٍ
   * واحد — فبلا هذا لا تُصحَّح بطاقةٌ واحدة.
   *
   * **ولا يعيد الإسناد إلا من يرى أكثر من نفسه**: من لا يرى إلا سجلاته
   * لا يملك أن ينقل بطاقةً من زميلٍ إليه.
   */
  const mayReassign =
    can(user, 'canViewAllLeads') || can(user, 'canViewTeamLeads') || can(user, 'canManageUsers');
  const ownership = mayReassign
    ? {
        ownerId: str(fd, 'ownerId') ?? null,
        /**
         * **والفرعيّ لا يكون هو الرئيسيّ.** شخصٌ واحد في الخانتين يعني
         * مالكًا واحدًا كُتب مرتين — ويُظهر البطاقة مرتين في كل جرد.
         */
        coOwnerId: str(fd, 'coOwnerId') === (str(fd, 'ownerId') ?? null) ? null : (str(fd, 'coOwnerId') ?? null),
      }
    : {};

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
        ownerId: (mayReassign ? str(fd, 'ownerId') : null) ?? user.id,
        coOwnerId: mayReassign ? (ownership.coOwnerId ?? null) : null,
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

  await db.client.update({ where: { id }, data: { ...data, ...ownership } });
  await auditDiff(user.id, 'Client', id, existing, { ...data, ...ownership });
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
    // رقمان مختلفان تطلبهما الفاتورة كلاهما — كانا في خانة واحدة
    commercialRegNo: str(fd, 'commercialRegNo'),
    // ممثّل الشركة: من يُوقّع ويُتابع، غير جهة الاتصال
    repName: str(fd, 'repName'),
    repPhone: str(fd, 'repPhone'),
    paymentTerms: str(fd, 'paymentTerms'),
    notes: str(fd, 'notes'),
  };
  if (!data.name) throw new MutationError('اسم الشركة مطلوب');

  if (!id) {
    const company = await db.company.create({
      data: { ...data, ownerId: str(fd, 'ownerId') ?? user.id },
    });
    await storeCompanyDocs(fd, user, company.id, null, null);
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
  await storeCompanyDocs(
    fd,
    user,
    id,
    existing.commercialRegFileId,
    existing.taxCardFileId
  );
  return `/companies/${id}`;
}

/**
 * مستندا الشركة: السجل التجاري والبطاقة الضريبية.
 *
 * **اختياريان دائمًا** — من لا يملكهما اليوم يحفظ الشركة ويرفعهما غدًا.
 * ويُخزَّنان في القاعدة لا على القرص: النشر بلا قرص دائم، فملفٌ يُكتب اليوم
 * يختفي مع أول إعادة نشر.
 *
 * والقديم يُحذف عند الاستبدال — هو نسخة من ورقةٍ عند صاحبها لا سجلٌّ تشغيلي
 * يسري عليه «لا شيء يُمحى».
 */
async function storeCompanyDocs(
  fd: FormData,
  user: SessionUser,
  companyId: string,
  previousRegId: string | null,
  previousTaxId: string | null
) {
  const slots = [
    { field: 'commercialRegFile', column: 'commercialRegFileId', previous: previousRegId, label: 'السجل التجاري' },
    { field: 'taxCardFile', column: 'taxCardFileId', previous: previousTaxId, label: 'البطاقة الضريبية' },
  ] as const;

  for (const slot of slots) {
    if (fd.get(`${slot.field}Remove`) === 'on' && slot.previous) {
      await db.company.update({
        where: { id: companyId },
        data: { [slot.column]: null },
      });
      await db.storedFile.delete({ where: { id: slot.previous } }).catch(() => {});
      await auditEvent(user.id, 'delete', 'StoredFile', slot.previous, `حذف ${slot.label}`);
      continue;
    }

    const upload = fd.get(slot.field);
    if (!(upload instanceof File) || upload.size === 0) continue;

    const check = checkUpload(upload);
    if (!check.ok) throw new MutationError(`${slot.label}: ${check.error}`);

    const stored = await db.storedFile.create({
      data: {
        name: check.name,
        mimeType: check.mimeType,
        size: check.size,
        data: Buffer.from(await upload.arrayBuffer()),
        purpose: 'company_doc',
        uploadedById: user.id,
      },
    });
    await db.company.update({
      where: { id: companyId },
      data: { [slot.column]: stored.id },
    });
    if (slot.previous) {
      await db.storedFile.delete({ where: { id: slot.previous } }).catch(() => {});
    }
    await auditEvent(user.id, 'create', 'StoredFile', stored.id, `${slot.label}: ${check.name}`);
  }
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

/**
 * الإجماليات.
 *
 * الخصم **يُحسب في الخادم** ولو حسبته الشاشة: قيمةٌ تصل من المتصفّح قيمةٌ
 * يمكن تغييرها قبل الإرسال. والنسبة تُطبَّق على المجموع الفرعي وحده لا على
 * ما بعد الضريبة — وإلا تغيّر الخصم بتغيّر نسبة الضريبة وهما قراران
 * مستقلّان.
 */
function computeTotals(
  items: ParsedItem[],
  input: { discountMode: string; discount: number; discountPct: number; taxRate: number }
) {
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const subtotal = round2(items.reduce((s, it) => s + it.lineTotal, 0));

  const pct = Math.min(100, Math.max(0, input.discountPct));
  const discount =
    input.discountMode === 'percent' ? round2(subtotal * (pct / 100)) : Math.max(0, input.discount);

  const afterDiscount = Math.max(0, subtotal - discount);
  const taxAmount = round2(afterDiscount * (input.taxRate / 100));
  return { subtotal, discount, discountPct: pct, taxAmount, total: round2(afterDiscount + taxAmount) };
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

  const discountMode = str(fd, 'discountMode') === 'percent' ? 'percent' : 'amount';
  const taxRate = num(fd, 'taxRate') ?? 0;
  const { subtotal, discount, discountPct, taxAmount, total } = computeTotals(items, {
    discountMode,
    discount: num(fd, 'discount') ?? 0,
    discountPct: num(fd, 'discountPct') ?? 0,
    taxRate,
  });
  const status = str(fd, 'status') ?? 'DRAFT';

  const common = {
    title,
    status,
    currency: str(fd, 'currency') ?? 'EGP',
    subtotal,
    discount,
    discountMode,
    discountPct,
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
