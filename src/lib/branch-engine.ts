import 'server-only';
import { db } from './db';
import { monthRange, yearRange } from './accounting';
import {
  appliedRate,
  branchPL,
  breakEven,
  capacityAlert,
  capacitySnapshot,
  closureAdvice,
  commissionAmount,
  commissionRate,
  companyBreakEven,
  companyRollup,
  deriveStandardRate,
  deriveTargets,
  effectiveSpendKind,
  isShared,
  safetyMargin,
  achievement,
  adTrend,
  round2,
  type BranchResult,
  type CompanyResult,
  type TierMode,
} from './branch-economics';

/**
 * محاسبة الفروع — ما يقرأ الدفاتر.
 *
 * كل رقم هنا **من قيود مرحَّلة**: لا تقدير ولا رقم يُكتب في خانة. وما لم
 * يُرحَّل بعدُ لا يظهر — القائمة تُبنى على ما حدث فعلًا.
 */

// ═══════════════════════════════════════════════════════════════
//  المعاملات
// ═══════════════════════════════════════════════════════════════

const SETTING_DEFAULTS: Record<string, number> = {
  maturity_factor_foundation: 0,
  maturity_factor_launch: 0.35,
  maturity_factor_growth: 0.7,
  maturity_factor_mature: 1,
  target_factor: 1.25,
  stretch_factor: 1.6,
  collection_deadline_days: 60,
  capacity_utilization_alert: 0.85,
  capacity_late_alert: 0.15,
  capacity_turnaround_alert: 5,
  capacity_translation_units: 0,
  capacity_review_units: 0,
};

export async function branchSettings(): Promise<Record<string, number>> {
  const rows = await db.setting.findMany({
    where: { key: { in: Object.keys(SETTING_DEFAULTS) } },
  });
  const out = { ...SETTING_DEFAULTS };
  for (const row of rows) {
    const value = Number(row.value);
    if (Number.isFinite(value)) out[row.key] = value;
  }
  return out;
}

export function maturityFactor(stage: string, settings: Record<string, number>): number {
  return settings[`maturity_factor_${stage}`] ?? 1;
}

// ═══════════════════════════════════════════════════════════════
//  قراءة الدفتر
// ═══════════════════════════════════════════════════════════════

type LedgerSlice = {
  /** إيراد كل فرع */
  revenueByBranch: Map<string, number>;
  /** مصاريف ذاتية لكل فرع */
  directByBranch: Map<string, number>;
  /** الإهلاك ضمنها — يُستبعد من التعادل النقدي وحده */
  depreciationByBranch: Map<string, number>;
  /** إعلان الفرع — المؤشر الحاكم */
  adByBranch: Map<string, number>;
  /** الكتلة المشتركة مفصَّلة بفئتها */
  sharedByKind: Map<string, number>;
  sharedMass: number;
  /** بنودٌ خالفت قواعد التصنيف — تُعرض ولا تُخفى */
  misclassified: { entry: string; account: string; reason: string; amount: number }[];
};

/**
 * يقرأ فترة من الدفتر ويقسّمها إلى الفئات الثلاث.
 *
 * والبند المخالف **يُعدّ ويُعرض ولا يُصنَّف بالتخمين**: بندٌ مشترك يحمل فرعًا
 * لا نعرف أهو مصروف مقرٍّ صُنِّف خطأً أم كتلة نُسبت خطأً — والتخمين هنا
 * يُفسد رقمين لا واحدًا.
 */
async function readLedger(from: Date, to: Date): Promise<LedgerSlice> {
  const lines = await db.journalLine.findMany({
    where: { entry: { status: 'posted', date: { gte: from, lte: to } } },
    include: {
      account: {
        select: { type: true, name: true, systemKey: true, isCash: true, spendKind: true },
      },
      costCenter: { select: { name: true } },
      entry: { select: { code: true } },
    },
  });

  const slice: LedgerSlice = {
    revenueByBranch: new Map(),
    directByBranch: new Map(),
    depreciationByBranch: new Map(),
    adByBranch: new Map(),
    sharedByKind: new Map(),
    sharedMass: 0,
    misclassified: [],
  };

  const add = (map: Map<string, number>, key: string, value: number) =>
    map.set(key, round2((map.get(key) ?? 0) + value));

  for (const line of lines) {
    const type = line.account.type;

    if (type === 'revenue') {
      const value = line.creditBase - line.debitBase;
      if (value !== 0) add(slice.revenueByBranch, line.branch ?? '—', value);
      continue;
    }
    if (type !== 'expense') continue;

    const value = line.debitBase - line.creditBase;
    if (value === 0) continue;

    // التصنيف من الحساب، والسطر يتجاوزه في الحالة الشاذّة وحدها
    const kind = effectiveSpendKind(line.spendKind, line.account.spendKind);

    if (!kind) {
      slice.misclassified.push({
        entry: line.entry.code ?? '—',
        account: line.account.name,
        reason: 'حساب بلا تصنيف إنفاق — لا يُعرف أذاتيّ هو أم مشترك',
        amount: value,
      });
      continue;
    }

    if (isShared(kind)) {
      if (line.branch) {
        slice.misclassified.push({
          entry: line.entry.code ?? '—',
          account: line.account.name,
          reason: 'مشترك يحمل فرعًا — إمّا مصروف مقرٍّ صُنِّف خطأً وإمّا كتلة نُسبت خطأً',
          amount: value,
        });
        continue;
      }
      add(slice.sharedByKind, kind, value);
      slice.sharedMass = round2(slice.sharedMass + value);
      continue;
    }

    // branch_direct
    if (!line.branch) {
      slice.misclassified.push({
        entry: line.entry.code ?? '—',
        account: line.account.name,
        reason: 'ذاتيّ بلا فرع — لو دخل الكتلة لتحمّلته الفروع كلها',
        amount: value,
      });
      continue;
    }

    add(slice.directByBranch, line.branch, value);
    if (!line.account.isCash) add(slice.depreciationByBranch, line.branch, value);
    if (/إعلان|تسويق|ads|حملة/i.test(line.account.name)) {
      add(slice.adByBranch, line.branch, value);
    }
  }

  return slice;
}

// ═══════════════════════════════════════════════════════════════
//  المعدل المعياري
// ═══════════════════════════════════════════════════════════════

/** يشتقّ المعدل من فترة تاريخية — ويعرضه للاعتماد لا يثبّته وحده */
export async function suggestStandardRate(months: number, endingBefore = new Date()) {
  const to = new Date(endingBefore);
  const from = new Date(to);
  from.setMonth(from.getMonth() - Math.max(1, months));

  const slice = await readLedger(from, to);
  const revenue = round2([...slice.revenueByBranch.values()].reduce((s, v) => s + v, 0));

  return {
    from,
    to,
    months,
    revenue,
    sharedMass: slice.sharedMass,
    rate: deriveStandardRate(slice.sharedMass, revenue),
    byKind: [...slice.sharedByKind.entries()].map(([kind, amount]) => ({ kind, amount })),
    misclassified: slice.misclassified.length,
  };
}

/** المعدل المثبَّت للسنة — أو صفر إن لم يُثبَّت بعد */
export async function rateFor(year: number) {
  const row = await db.allocationRate.findUnique({ where: { year } });
  return {
    standardRate: row?.standardRate ?? 0,
    basis: row?.basis ?? 'revenue',
    locked: Boolean(row?.lockedAt),
    row,
  };
}

// ═══════════════════════════════════════════════════════════════
//  قائمة الفروع لفترة
// ═══════════════════════════════════════════════════════════════

export type BranchReport = BranchResult & {
  status: string;
  type: string;
  advice: ReturnType<typeof closureAdvice>;
  breakEven: ReturnType<typeof breakEven>;
  targets: ReturnType<typeof deriveTargets>;
  commissionRate: number;
  achievement: number | null;
};

export type PeriodReport = {
  period: string;
  standardRate: number;
  rateLocked: boolean;
  branches: BranchReport[];
  company: CompanyResult;
  sharedByKind: { kind: string; amount: number }[];
  misclassified: LedgerSlice['misclassified'];
  companyBreakEven: number | null;
  safetyMargin: number | null;
  settings: Record<string, number>;
};

/**
 * التقرير الشهري الكامل.
 *
 * يُخرج **المؤشرين معًا لكل فرع** — القاعدة ٥ من §١٣: لا يجوز عرض الصافي
 * المحمَّل منفردًا، لأن قارئه سيبني عليه قرار إغلاق.
 */
export async function periodReport(period: string): Promise<PeriodReport> {
  const { start, end } = monthRange(period);
  const year = Number(period.slice(0, 4));

  const [slice, branches, rate, settings, schemes] = await Promise.all([
    readLedger(start, end),
    db.branch.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    rateFor(year),
    branchSettings(),
    db.commissionScheme.findMany({
      where: { scope: 'branch', active: true },
      include: { tiers: { orderBy: { fromAmount: 'asc' } } },
      orderBy: { isDefault: 'desc' },
    }),
  ]);

  const defaultScheme = schemes[0] ?? null;
  const tiers = (defaultScheme?.tiers ?? []).map((t) => ({
    fromAmount: t.fromAmount,
    rate: t.adminRate,
  }));
  const tierMode = (defaultScheme?.tierMode === 'progressive' ? 'marginal' : 'cliff') as TierMode;

  const orderCounts = await db.project.groupBy({
    by: ['branch'],
    where: {
      status: { in: ['delivered', 'collected'] },
      deliveredAt: { gte: start, lte: end },
    },
    _count: { _all: true },
  });
  const ordersByBranch = new Map(orderCounts.map((r) => [r.branch ?? '—', r._count._all]));

  const rows: BranchReport[] = branches.map((b) => {
    const revenue = slice.revenueByBranch.get(b.code) ?? 0;
    const direct = slice.directByBranch.get(b.code) ?? 0;
    const depreciation = slice.depreciationByBranch.get(b.code) ?? 0;
    const applied = appliedRate(rate.standardRate, maturityFactor(b.maturityStage, settings));

    // العمولة من خطة الفرع إن وُجدت — وصفر إن لم تُضبط، لا رقم مخترَع
    const commissions = tiers.length ? commissionAmount(tiers, revenue, tierMode) : 0;
    const cRate = tiers.length ? commissionRate(tiers, revenue) : 0;

    const pl = branchPL({
      code: b.code,
      name: b.name,
      revenue,
      directExpenses: direct,
      depreciation,
      commissions,
      appliedRate: applied,
      maturityStage: b.maturityStage,
      orders: ordersByBranch.get(b.code) ?? 0,
      adSpend: slice.adByBranch.get(b.code) ?? 0,
    });

    const be = breakEven({
      directExpenses: direct,
      depreciation,
      appliedRate: applied,
      commissionRate: cRate,
    });
    const targets = deriveTargets(be.loaded, settings.target_factor, settings.stretch_factor);

    return {
      ...pl,
      status: b.status,
      type: b.type,
      advice: closureAdvice(pl),
      breakEven: be,
      targets,
      commissionRate: cRate,
      achievement: achievement(revenue, targets.target),
    };
  });

  const company = companyRollup({
    branches: rows,
    sharedMass: slice.sharedMass,
    standardRate: rate.standardRate,
  });

  const totalDirect = round2(rows.reduce((s, r) => s + r.directExpenses, 0));
  const avgCommission =
    company.revenue > 0
      ? round2(rows.reduce((s, r) => s + r.commissions, 0)) / company.revenue
      : 0;
  const cbe = companyBreakEven({
    sharedMass: slice.sharedMass,
    totalDirect,
    avgCommissionRate: avgCommission,
  });

  return {
    period,
    standardRate: rate.standardRate,
    rateLocked: rate.locked,
    branches: rows,
    company,
    sharedByKind: [...slice.sharedByKind.entries()].map(([kind, amount]) => ({ kind, amount })),
    misclassified: slice.misclassified,
    companyBreakEven: cbe,
    safetyMargin: safetyMargin(company.revenue, cbe),
    settings,
  };
}

// ═══════════════════════════════════════════════════════════════
//  الاتجاه ونسبة الإعلان
// ═══════════════════════════════════════════════════════════════

/** سلسلة زمنية من الإقفالات المحفوظة — لا يُعاد حسابها فتتغيّر بأثر رجعي */
export async function branchTrend(branchCode: string, months = 12) {
  const rows = await db.branchPeriodResult.findMany({
    where: { branchCode },
    orderBy: { period: 'desc' },
    take: months,
  });
  const ordered = rows.reverse();
  return {
    rows: ordered,
    ad: adTrend(ordered.map((r) => (r.revenue > 0 ? r.adSpend / r.revenue : null))),
  };
}

// ═══════════════════════════════════════════════════════════════
//  الطاقة الإنتاجية
// ═══════════════════════════════════════════════════════════════

/**
 * لقطة الطاقة لفترة.
 *
 * الوحدات تُقرأ من المشاريع المسلَّمة. وما لم تُسجَّل وحداته **يُعدّ ويُعرض**:
 * الرصد اللاحق يتسرّب دائمًا، والرقم الناقص يجعل الاستغلال يبدو أقلّ مما هو
 * فيُؤجَّل تعيينٌ واجب.
 */
export async function capacityReport(period: string) {
  const { start, end } = monthRange(period);
  const settings = await branchSettings();

  const projects = await db.project.findMany({
    where: {
      status: { in: ['delivered', 'collected'] },
      deliveredAt: { gte: start, lte: end },
    },
    select: {
      unitsTranslated: true,
      unitsReviewed: true,
      pages: true,
      weightedPages: true,
      reviewerId: true,
      reviewerFreelancerId: true,
      deadline: true,
      deliveredAt: true,
      createdAt: true,
    },
  });

  let translated = 0;
  let reviewed = 0;
  let unrecorded = 0;
  let late = 0;
  let withDeadline = 0;
  let turnaroundSum = 0;

  for (const p of projects) {
    const t = p.unitsTranslated ?? p.pages ?? 0;
    if (p.unitsTranslated === null && p.pages === null) unrecorded += 1;
    translated += t;
    reviewed += p.unitsReviewed ?? (p.reviewerId || p.reviewerFreelancerId ? t : 0);

    if (p.deadline && p.deliveredAt) {
      withDeadline += 1;
      if (p.deliveredAt > p.deadline) late += 1;
    }
    if (p.deliveredAt) {
      turnaroundSum += (p.deliveredAt.getTime() - p.createdAt.getTime()) / 86_400_000;
    }
  }

  const slice = await readLedger(start, end);
  const productionMass = slice.sharedByKind.get('production') ?? 0;

  const snapshot = capacitySnapshot({
    unitsTranslated: translated,
    unitsReviewed: reviewed,
    translationCapacity: settings.capacity_translation_units,
    reviewCapacity: settings.capacity_review_units,
    productionMass,
  });

  const lateRate = withDeadline > 0 ? late / withDeadline : null;
  const avgTurnaround = projects.length > 0 ? turnaroundSum / projects.length : null;

  return {
    period,
    snapshot,
    projects: projects.length,
    unrecorded,
    lateRate,
    avgTurnaround,
    productionMass,
    alert: capacityAlert({
      utilization: snapshot.utilization,
      utilizationThreshold: settings.capacity_utilization_alert,
      lateRate,
      lateThreshold: settings.capacity_late_alert,
      avgTurnaroundDays: avgTurnaround,
      turnaroundThreshold: settings.capacity_turnaround_alert,
    }),
  };
}

// ═══════════════════════════════════════════════════════════════
//  الإقفال
// ═══════════════════════════════════════════════════════════════

export type CloseResult = { ok: true; branches: number } | { ok: false; error: string };

/**
 * إقفال شهر محاسبة الفروع.
 *
 * **يُرفض الإقفال عند اختلال معادلة التحقّق** (القاعدة ٤): المساران محسوبان
 * بطريقين مستقلّين، وتطابقهما هو الضمانة الوحيدة لصحة التصنيف. وأي فرق غير
 * الصفر خطأٌ في تصنيف بند أو في الإدخال، لا انحراف مقبول.
 *
 * ويُرفض كذلك ما دام في الفترة بندٌ مخالف للتصنيف: إقفالٌ فوق بند مجهول
 * الفئة إقفالٌ على رقم لا سند له.
 */
export async function closePeriod(period: string, userId: string): Promise<CloseResult> {
  const report = await periodReport(period);

  if (report.misclassified.length) {
    return {
      ok: false,
      error: `${report.misclassified.length} بندًا بلا تصنيف صحيح — صحّحها قبل الإقفال (القاعدة ١)`,
    };
  }
  if (Math.abs(report.company.reconciliation) > 0.01) {
    return {
      ok: false,
      error:
        `معادلة التحقّق لا تساوي صفرًا (${report.company.reconciliation}) — ` +
        'خطأ في تصنيف بند أو في الإدخال، لا انحراف مقبول (القاعدة ٤)',
    };
  }
  if (report.standardRate <= 0) {
    return { ok: false, error: 'لم يُثبَّت المعدل المعياري لهذه السنة — لا يُقفل شهر بلا تحميل' };
  }

  const now = new Date();
  for (const b of report.branches) {
    await db.branchPeriodResult.upsert({
      where: { period_branchCode: { period, branchCode: b.code } },
      update: {
        revenue: b.revenue,
        directExpenses: b.directExpenses,
        depreciation: b.depreciation,
        commissions: b.commissions,
        contribution: b.contribution,
        allocated: b.allocated,
        loadedNet: b.loadedNet,
        appliedRate: b.appliedRate,
        maturityStage: b.maturityStage,
        orders: b.orders ?? 0,
        adSpend: b.adSpend ?? 0,
        closedAt: now,
        closedById: userId,
      },
      create: {
        period,
        branchCode: b.code,
        revenue: b.revenue,
        directExpenses: b.directExpenses,
        depreciation: b.depreciation,
        commissions: b.commissions,
        contribution: b.contribution,
        allocated: b.allocated,
        loadedNet: b.loadedNet,
        appliedRate: b.appliedRate,
        maturityStage: b.maturityStage,
        orders: b.orders ?? 0,
        adSpend: b.adSpend ?? 0,
        closedAt: now,
        closedById: userId,
      },
    });
  }

  // سطر الشركة — الكتلة وفرق الاسترداد والصافي الحقيقي
  const companyRow = {
    revenue: report.company.revenue,
    contribution: report.company.totalContribution,
    allocated: report.company.totalAllocated,
    sharedMass: report.company.sharedMass,
    recoveryVariance: report.company.recoveryVariance,
    companyNet: report.company.companyNet,
    closedAt: now,
    closedById: userId,
  };
  // `upsert` لا يقبل قيمة فارغة في مفتاح مركّب — نبحث ثم نكتب
  const existingCompany = await db.branchPeriodResult.findFirst({
    where: { period, branchCode: null },
    select: { id: true },
  });
  if (existingCompany) {
    await db.branchPeriodResult.update({ where: { id: existingCompany.id }, data: companyRow });
  } else {
    await db.branchPeriodResult.create({ data: { period, branchCode: null, ...companyRow } });
  }

  return { ok: true, branches: report.branches.length };
}
