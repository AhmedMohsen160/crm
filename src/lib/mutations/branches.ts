import 'server-only';
import { MutationError } from './base';
import { db } from '@/lib/db';
import { can, type SessionUser } from '@/lib/auth';
import { str, num, date } from '@/lib/utils';
import { auditEvent, auditDiff } from '@/lib/audit';
import {
  BRANCH_STATUSES,
  BRANCH_TYPES,
  MATURITY_STAGE_KEYS,
  COST_CENTER_KIND_KEYS,
  ALLOCATION_BASES,
  REJECTED_BASIS,
} from '@/lib/branch-economics';
import { closePeriod, suggestStandardRate } from '@/lib/branch-engine';

/**
 * محاسبة الفروع.
 *
 * القاعدة الحاكمة في هذا الملف: **المعدل المعياري يُثبَّت لسنة كاملة.**
 * تغييره في منتصف السنة يُلغي قابلية المقارنة بين شهورها، فيُطلب سببٌ مكتوب
 * ويُقيَّد في سجلّ التدقيق.
 */

// ── الفرع ──────────────────────────────────────────────────────

export async function saveBranch(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('إدارة الفروع للماليات');

  const code = str(fd, 'code')?.trim().toLowerCase();
  const name = str(fd, 'name');
  if (!code) throw new MutationError('مفتاح الفرع مطلوب');
  if (!/^[a-z0-9_]+$/.test(code)) {
    throw new MutationError('المفتاح بحروف إنجليزية صغيرة وأرقام وشرطة سفلية — وهو ما يربطه بالسجلات القائمة');
  }
  if (!name) throw new MutationError('اسم الفرع مطلوب');

  const type = str(fd, 'type') ?? 'retail';
  if (!(type in BRANCH_TYPES)) throw new MutationError('نوع الفرع غير معروف');

  const status = str(fd, 'status') ?? 'active';
  if (!(status in BRANCH_STATUSES)) throw new MutationError('حال الفرع غير معروفة');

  const maturityStage = str(fd, 'maturityStage') ?? 'mature';
  if (!MATURITY_STAGE_KEYS.includes(maturityStage as never)) {
    throw new MutationError('مرحلة النضج غير معروفة');
  }

  const data = {
    code,
    name,
    country: str(fd, 'country'),
    currency: str(fd, 'currency') ?? 'EGP',
    type,
    status,
    maturityStage,
    openedAt: date(fd, 'openedAt'),
    closedAt: date(fd, 'closedAt'),
    setupCost: num(fd, 'setupCost') ?? 0,
    monthsToBreakEven: Math.round(num(fd, 'monthsToBreakEven') ?? 0),
    gateCriteria: str(fd, 'gateCriteria'),
    gateAt: date(fd, 'gateAt'),
    gateDecision: str(fd, 'gateDecision'),
    gateNote: str(fd, 'gateNote'),
    sortOrder: Math.round(num(fd, 'sortOrder') ?? 0),
    notes: str(fd, 'notes'),
    active: fd.get('active') !== 'off',
  };

  // بوابة القرار: المعيار يُكتب **قبل** الافتتاح لا بعده — وإلا صار القرار
  // عاطفيًا يُبرَّر بعد وقوعه
  if (data.gateDecision && !data.gateCriteria) {
    throw new MutationError('لا يُسجَّل قرار البوابة قبل كتابة معيار نجاحها');
  }

  if (!id) {
    const taken = await db.branch.findUnique({ where: { code } });
    if (taken) throw new MutationError('هذا المفتاح مستخدم لفرع آخر');
    const created = await db.branch.create({ data });
    await auditEvent(user.id, 'create', 'Branch', created.id, `${name} (${code})`);
    return '/finance/branches/settings';
  }

  const existing = await db.branch.findUnique({ where: { id } });
  if (!existing) throw new MutationError('الفرع غير موجود');
  if (existing.code !== code) {
    throw new MutationError('مفتاح الفرع لا يُغيَّر — عليه تقوم كل السجلات المخزَّنة');
  }

  await db.branch.update({ where: { id }, data });
  await auditDiff(user.id, 'Branch', id, existing, data);
  return '/finance/branches/settings';
}

/** يزرع الفروع من قائمة `branch` القائمة — خطوة أولى بضغطة لا إدخال يدوي */
export async function seedBranches(_fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');

  const items = await db.listItem.findMany({ where: { listName: 'branch', active: true } });
  let created = 0;
  for (const item of items) {
    const exists = await db.branch.findUnique({ where: { code: item.value } });
    if (exists) continue;
    await db.branch.create({
      data: { code: item.value, name: item.label, sortOrder: item.sortOrder },
    });
    created += 1;
  }
  await auditEvent(user.id, 'create', 'Branch', 'seed', `زرع ${created} فرعًا من القائمة`);
  return `/finance/branches/settings?seeded=${created}`;
}

// ── فئة مركز التكلفة ───────────────────────────────────────────

/**
 * تصنيف مراكز التكلفة — الخطوة التي بدونها لا يعمل الموديول كلّه.
 *
 * فئة المركز هي ما يحدّد **أين يقع كل جنيه**: في الكتلة المشتركة أم في
 * مصاريف فرع. وبلا تصنيف يبقى المصروف معلَّقًا خارج المعادلة، فتظهر الشركة
 * أربح مما هي.
 */
export async function saveCostCenterKinds(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');

  let changed = 0;
  for (const [key, value] of fd.entries()) {
    const match = key.match(/^kind\[(.+)\]$/);
    if (!match) continue;
    const kind = String(value);
    if (!COST_CENTER_KIND_KEYS.includes(kind as never)) continue;
    await db.costCenter.update({ where: { id: match[1] }, data: { kind } });
    changed += 1;
  }

  await auditEvent(user.id, 'update', 'CostCenter', 'kinds', `تصنيف ${changed} مركزًا`);
  return `/finance/branches/settings?classified=${changed}`;
}

/** الحسابات غير النقدية — الإهلاك أساسًا، ويُستبعد من التعادل النقدي */
export async function saveAccountCashFlags(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');

  const ids = fd.getAll('accountId').map(String);
  let changed = 0;
  for (const id of ids) {
    const isCash = fd.get(`cash[${id}]`) === 'on';
    await db.account.update({ where: { id }, data: { isCash } });
    changed += 1;
  }
  await auditEvent(user.id, 'update', 'Account', 'isCash', `${changed} حسابًا`);
  return `/finance/branches/settings?cash=${changed}`;
}

// ── المعدل المعياري ────────────────────────────────────────────

/**
 * تثبيت المعدل المعياري لسنة.
 *
 * **يُثبَّت ولا يُحسب شهريًا** (§٤٫٢): الحساب الشهري صحيح رياضيًا لكنه يُلغي
 * التخطيط، ويعاقب الفرع على أداء غيره، ويُخفي الرفع التشغيلي وتكلفة الطاقة
 * العاطلة. والمثبَّت بعد قفله لا يُعدَّل إلا بفكّ صريح.
 */
export async function saveAllocationRate(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');

  const year = Math.round(num(fd, 'year') ?? new Date().getFullYear());
  const standardRate = num(fd, 'standardRate');
  if (standardRate === null || standardRate < 0 || standardRate >= 1) {
    throw new MutationError('المعدل بين صفر وواحد (٠٫٤٥ تعني ٤٥٪) — ومعدَّل يبلغ الواحد يعني ألّا ربح أبدًا');
  }

  const basis = str(fd, 'basis') ?? 'revenue';
  if (!(basis in ALLOCATION_BASES)) throw new MutationError('أساس التوزيع غير معروف');
  if (basis === REJECTED_BASIS) {
    throw new MutationError(
      'عدد الطلبات أساسٌ مرفوض: قيمة الطلب تتفاوت أضعافًا بين فرع مؤسسي وفرع تجزئة'
    );
  }

  const existing = await db.allocationRate.findUnique({ where: { year } });
  if (existing?.lockedAt && fd.get('unlock') !== 'on') {
    throw new MutationError(
      'المعدل مقفل لهذه السنة — سنةٌ بمعدَّلين لا تُقارَن شهورها. افتحه صراحةً إن لزم'
    );
  }

  const data = {
    standardRate,
    basis,
    derivedFromMonths: Math.round(num(fd, 'derivedFromMonths') ?? 12),
    derivedRate: num(fd, 'derivedRate'),
    derivedRevenue: num(fd, 'derivedRevenue'),
    derivedMass: num(fd, 'derivedMass'),
    derivedAt: existing?.derivedAt ?? new Date(),
    notes: str(fd, 'notes'),
    lockedAt: fd.get('lock') === 'on' ? new Date() : fd.get('unlock') === 'on' ? null : existing?.lockedAt,
  };

  if (existing) {
    await db.allocationRate.update({ where: { year }, data });
    await auditDiff(user.id, 'AllocationRate', String(year), existing, data);
  } else {
    await db.allocationRate.create({ data: { year, ...data } });
    await auditEvent(user.id, 'create', 'AllocationRate', String(year), `${standardRate}`);
  }

  return `/finance/branches/allocation?year=${year}&saved=1`;
}

/** يشتقّ المعدل من فترة تاريخية ويكتبه في الخانة — ولا يُثبّته وحده */
export async function deriveAllocationRate(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');

  const months = Math.min(12, Math.max(3, Math.round(num(fd, 'months') ?? 12)));
  const year = Math.round(num(fd, 'year') ?? new Date().getFullYear());
  const result = await suggestStandardRate(months);

  if (result.rate === null) {
    throw new MutationError('لا إيراد مرحَّل في الفترة المختارة — لا يُشتقّ معدَّل من لا شيء');
  }

  return (
    `/finance/branches/allocation?year=${year}` +
    `&suggest=${result.rate}&mass=${result.sharedMass}&revenue=${result.revenue}&months=${months}`
  );
}

// ── الإقفال ────────────────────────────────────────────────────

export async function closeBranchPeriod(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');

  const period = str(fd, 'period');
  if (!period || !/^\d{4}-\d{2}$/.test(period)) throw new MutationError('الشهر بصيغة YYYY-MM');

  const result = await closePeriod(period, user.id);
  if (!result.ok) throw new MutationError(result.error);

  await auditEvent(user.id, 'update', 'BranchPeriodResult', period, `إقفال ${result.branches} فرعًا`);
  return `/finance/branches?period=${period}&closed=1`;
}
