import 'server-only';
import { MutationError, requireOwn, readDeadline } from './base';
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



/**
 * الفريلانسرز.
 *
 * جزء من وحدة التعديلات المقسَّمة بالمجال — انظر `src/lib/mutations/index.ts`.
 */

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
