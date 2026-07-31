import 'server-only';
import { db } from '@/lib/db';
import { canSeeAll, hashPassword, verifyPassword, type SessionUser } from '@/lib/auth';
import { str, num, date, fullName } from '@/lib/utils';
import { logActivity, readEntityLink, linkPath, type EntityLink } from '@/lib/actions/helpers';
import { STAGE_DEFAULT_PROBABILITY, DEAL_STAGES, type DealStage } from '@/lib/constants';

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
  if (!canSeeAll(user) && ownerId !== user.id) throw new MutationError(message);
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
    source: str(fd, 'source'),
    status: str(fd, 'status') ?? 'NEW',
    serviceInterest: str(fd, 'serviceInterest'),
    sourceLang: str(fd, 'sourceLang'),
    targetLang: str(fd, 'targetLang'),
    estimatedValue: num(fd, 'estimatedValue'),
    notes: str(fd, 'notes'),
  };
}

export async function saveLead(fd: FormData, user: SessionUser, id?: string) {
  const data = readLead(fd);
  if (!data.firstName) throw new MutationError('اسم العميل مطلوب');

  if (!id) {
    const lead = await db.lead.create({
      data: { ...data, ownerId: str(fd, 'ownerId') ?? user.id },
    });
    await logActivity({
      type: 'CREATED',
      title: 'تم إنشاء عميل محتمل',
      detail: fullName(lead.firstName, lead.lastName),
      userId: user.id,
      link: { leadId: lead.id },
    });
    return `/leads/${lead.id}`;
  }

  const existing = await db.lead.findUnique({ where: { id } });
  if (!existing) throw new MutationError('العميل المحتمل غير موجود');
  requireOwn(existing.ownerId, user, 'ليس لديك صلاحية تعديل هذا السجل');

  await db.lead.update({
    where: { id },
    data: { ...data, ownerId: str(fd, 'ownerId') ?? existing.ownerId },
  });

  if (existing.status !== data.status) {
    await logActivity({
      type: 'STATUS_CHANGED',
      title: 'تغيّرت حالة العميل المحتمل',
      detail: `${existing.status} ← ${data.status}`,
      userId: user.id,
      link: { leadId: id },
    });
  }
  return `/leads/${id}`;
}

/** تحويل العميل المحتمل إلى شركة + جهة اتصال + صفقة */
export async function convertLead(fd: FormData, user: SessionUser, id: string) {
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) throw new MutationError('العميل المحتمل غير موجود');
  requireOwn(lead.ownerId, user, 'ليس لديك صلاحية تحويل هذا السجل');
  if (lead.status === 'CONVERTED') return `/leads/${id}`;

  const ownerId = lead.ownerId ?? user.id;

  // 1) الشركة — قائمة أو جديدة
  let companyId = str(fd, 'existingCompanyId');
  if (!companyId) {
    const companyName = str(fd, 'companyName') ?? lead.companyName;
    if (companyName) {
      const company = await db.company.create({
        data: { name: companyName, email: lead.email, phone: lead.phone, ownerId },
      });
      companyId = company.id;
    }
  }

  // 2) جهة الاتصال
  const contact = await db.contact.create({
    data: {
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      companyId,
      ownerId,
    },
  });

  // 3) الصفقة
  const title =
    str(fd, 'dealTitle') ??
    `${lead.serviceInterest ?? 'مشروع ترجمة'} — ${fullName(lead.firstName, lead.lastName)}`;

  const deal = await db.deal.create({
    data: {
      title,
      amount: num(fd, 'dealAmount') ?? lead.estimatedValue ?? 0,
      currency: str(fd, 'dealCurrency') ?? 'EGP',
      stage: 'NEW',
      probability: 20,
      serviceType: lead.serviceInterest,
      sourceLang: lead.sourceLang,
      targetLang: lead.targetLang,
      description: lead.notes,
      companyId,
      contactId: contact.id,
      ownerId,
    },
  });

  // 4) نقل المهام والملاحظات إلى الصفقة
  await db.task.updateMany({ where: { leadId: id }, data: { dealId: deal.id } });
  await db.note.updateMany({ where: { leadId: id }, data: { dealId: deal.id } });

  await db.lead.update({
    where: { id },
    data: { status: 'CONVERTED', convertedAt: new Date() },
  });

  await logActivity({
    type: 'CONVERTED',
    title: 'تم تحويل العميل المحتمل إلى صفقة',
    detail: title,
    userId: user.id,
    link: { leadId: id, dealId: deal.id, contactId: contact.id, companyId },
  });

  return `/deals/${deal.id}`;
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

export async function saveDeal(fd: FormData, user: SessionUser, id?: string) {
  const stage = (str(fd, 'stage') ?? 'NEW') as DealStage;
  const wordCount = num(fd, 'wordCount');
  const pageCount = num(fd, 'pageCount');

  const data = {
    title: str(fd, 'title') ?? '',
    description: str(fd, 'description'),
    stage,
    amount: num(fd, 'amount') ?? 0,
    currency: str(fd, 'currency') ?? 'EGP',
    probability: num(fd, 'probability') ?? STAGE_DEFAULT_PROBABILITY[stage] ?? 20,
    serviceType: str(fd, 'serviceType'),
    sourceLang: str(fd, 'sourceLang'),
    targetLang: str(fd, 'targetLang'),
    wordCount: wordCount ? Math.round(wordCount) : null,
    pageCount: pageCount ? Math.round(pageCount) : null,
    deliveryDate: date(fd, 'deliveryDate'),
    expectedCloseDate: date(fd, 'expectedCloseDate'),
    lostReason: str(fd, 'lostReason'),
    companyId: str(fd, 'companyId'),
    contactId: str(fd, 'contactId'),
  };
  if (!data.title) throw new MutationError('عنوان الصفقة مطلوب');

  const closing = stage === 'WON' || stage === 'LOST';

  if (!id) {
    const deal = await db.deal.create({
      data: {
        ...data,
        closedAt: closing ? new Date() : null,
        ownerId: str(fd, 'ownerId') ?? user.id,
      },
    });
    await logActivity({
      type: 'CREATED',
      title: 'تم إنشاء صفقة',
      detail: deal.title,
      userId: user.id,
      link: { dealId: deal.id, companyId: deal.companyId, contactId: deal.contactId },
    });
    return `/deals/${deal.id}`;
  }

  const existing = await db.deal.findUnique({ where: { id } });
  if (!existing) throw new MutationError('الصفقة غير موجودة');
  requireOwn(existing.ownerId, user, 'ليس لديك صلاحية تعديل هذه الصفقة');

  await db.deal.update({
    where: { id },
    data: {
      ...data,
      closedAt: closing ? (existing.closedAt ?? new Date()) : null,
      ownerId: str(fd, 'ownerId') ?? existing.ownerId,
    },
  });

  if (existing.stage !== stage) {
    await logActivity({
      type: 'STAGE_CHANGED',
      title: 'تغيّرت مرحلة الصفقة',
      detail: `${DEAL_STAGES[existing.stage as DealStage] ?? existing.stage} ← ${
        DEAL_STAGES[stage] ?? stage
      }`,
      userId: user.id,
      link: { dealId: id },
    });
  }
  return `/deals/${id}`;
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
    canSeeAll(user) || existing.assigneeId === user.id || existing.creatorId === user.id;
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
    dealId: str(fd, 'dealId'),
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
      link: { dealId: quote.dealId, companyId: quote.companyId, contactId: quote.contactId },
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

export async function saveUser(fd: FormData, admin: SessionUser, id?: string) {
  if (admin.role !== 'ADMIN') throw new MutationError('هذه الصفحة لمدير النظام فقط');

  const name = str(fd, 'name');
  const password = str(fd, 'password');

  if (!id) {
    const email = str(fd, 'email')?.toLowerCase();
    if (!name || !email || !password) {
      throw new MutationError('الاسم والبريد وكلمة المرور مطلوبة');
    }
    if (password.length < 8) throw new MutationError('كلمة المرور يجب ألا تقل عن 8 أحرف');
    if (await db.user.findUnique({ where: { email } })) {
      throw new MutationError('هذا البريد الإلكتروني مستخدم بالفعل');
    }

    await db.user.create({
      data: {
        name,
        email,
        passwordHash: await hashPassword(password),
        role: str(fd, 'role') ?? 'AGENT',
        phone: str(fd, 'phone'),
        jobTitle: str(fd, 'jobTitle'),
      },
    });
    return '/settings/users';
  }

  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) throw new MutationError('المستخدم غير موجود');

  const role = str(fd, 'role') ?? existing.role;
  const active = fd.get('active') === 'on';

  // المدير لا يستطيع تجريد نفسه من صلاحياته أو إيقاف حسابه
  if (admin.id === id && (role !== 'ADMIN' || !active)) {
    throw new MutationError('لا يمكنك تغيير صلاحيتك أو إيقاف حسابك بنفسك');
  }
  // يجب أن يبقى مدير نظام نشط واحد على الأقل
  if (existing.role === 'ADMIN' && (role !== 'ADMIN' || !active)) {
    const others = await db.user.count({
      where: { role: 'ADMIN', active: true, id: { not: id } },
    });
    if (others === 0) throw new MutationError('يجب أن يبقى مدير نظام نشط واحد على الأقل');
  }
  if (password && password.length < 8) {
    throw new MutationError('كلمة المرور يجب ألا تقل عن 8 أحرف');
  }

  await db.user.update({
    where: { id },
    data: {
      name: name ?? existing.name,
      phone: str(fd, 'phone'),
      jobTitle: str(fd, 'jobTitle'),
      role,
      active,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    },
  });
  return '/settings/users';
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
