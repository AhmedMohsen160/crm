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
import { nextLeadCode, nextClientCode, nextProjectCode } from '@/lib/sequence';
import {
  PROJECT_STATUSES,
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

  const netTotal = num(fd, 'netTotal') ?? lead.estimatedValue ?? 0;
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
      netTotal,
      currency: str(fd, 'currency') ?? 'EGP',
      deposit,
      isRush: fd.get('isRush') === 'on',
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

  const after = { ...data, ownerId: str(fd, 'ownerId') ?? existing.ownerId };
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

  // الخصم فوق الحد يجمّد المشروع حتى الاعتماد (§٦)
  if (project.approvalState === 'pending') {
    throw new MutationError('المشروع بانتظار اعتماد الخصم — لا ينتقل قبل الاعتماد');
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

  for (const requirement of rule.requires ?? []) {
    const incoming = patch[requirement.field];
    const current = (project as Record<string, unknown>)[requirement.field];
    const value = incoming ?? current;
    if (value === null || value === undefined || value === '' || value === 0) {
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

  await db.role.update({ where: { id }, data: { label, ...permissions } });
  await auditDiff(admin.id, 'Role', id, existing, { label, ...permissions });
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
