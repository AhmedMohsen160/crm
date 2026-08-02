import 'server-only';
import { db } from './db';
import {
  computeCommission,
  splitByProject,
  periodRange,
  type CommissionTier,
  type TierMode,
} from './commission';

/**
 * محرّك نسب المبيعات.
 *
 * **القاعدة الحاكمة: الاستحقاق مشتق لا مُدخَل.** يُعاد بناؤه من المشاريع
 * المحصَّلة في أي لحظة، فلا يوجد إدخال يدوي ولا تعديل على مبلغ. وأي خطأ
 * في بيانات مشروع يُصحَّح بتصحيح المشروع ثم إعادة البناء.
 *
 * **الفترة المغلقة لا تُعاد.** بعد إغلاق شهر تبقى استحقاقاته كما هي مهما
 * عُدِّلت الخطة أو الشرائح.
 */

export type SchemeWithTiers = {
  id: string;
  name: string;
  basis: string;
  tierMode: string;
  tiers: CommissionTier[];
};

/** الخطة السارية لمستخدم في تاريخ محدَّد — أو الافتراضية */
export async function schemeForUser(
  userId: string,
  asOf: Date
): Promise<SchemeWithTiers | null> {
  const assignment = await db.commissionAssignment.findFirst({
    where: { userId, effectiveFrom: { lte: asOf } },
    orderBy: { effectiveFrom: 'desc' },
    include: { scheme: { include: { tiers: true } } },
  });

  const scheme =
    assignment?.scheme?.active === true
      ? assignment.scheme
      : await db.commissionScheme.findFirst({
          where: { isDefault: true, active: true, effectiveFrom: { lte: asOf } },
          orderBy: { effectiveFrom: 'desc' },
          include: { tiers: true },
        });

  if (!scheme) return null;
  return {
    id: scheme.id,
    name: scheme.name,
    basis: scheme.basis,
    tierMode: scheme.tierMode,
    tiers: scheme.tiers.map((t) => ({
      fromAmount: t.fromAmount,
      toAmount: t.toAmount,
      adminRate: t.adminRate,
      managerRate: t.managerRate,
    })),
  };
}

export type PeriodSummary = {
  period: string;
  closed: boolean;
  /** ما حقّقه كل بائع وما استحقّه هو ومديره */
  sellers: {
    userId: string;
    userName: string;
    managerId: string | null;
    managerName: string | null;
    schemeName: string | null;
    achieved: number;
    adminAmount: number;
    managerAmount: number;
    tierIndex: number;
    currentAdminRate: number;
    nextTierAt: number | null;
    remainingToNext: number | null;
    projects: { id: string; code: string | null; title: string; collected: number }[];
  }[];
  totalAchieved: number;
  totalCommission: number;
};

/**
 * يحسب استحقاقات فترة **بلا كتابة** — يُستخدم للعرض الحيّ.
 *
 * الأساس هو ما نصّت عليه الخطة: `collected` (المحصَّل فعلًا، وهو المعتمد)
 * أو `net` (إجمالي المبيعات). التوقيت: المشروع يدخل الفترة التي **حُصّل**
 * فيها لا التي بيع فيها.
 */
export async function computePeriod(period: string): Promise<PeriodSummary> {
  const { start, end } = periodRange(period);
  const closedRow = await db.commissionPeriod.findUnique({ where: { period } });
  const closed = Boolean(closedRow?.closedAt);

  // المشاريع المحصَّلة في هذه الفترة — الملغى خارجها بحكم الحالة
  const projects = await db.project.findMany({
    where: { status: 'collected', collectedAt: { gte: start, lt: end } },
    select: {
      id: true,
      code: true,
      title: true,
      netTotal: true,
      deposit: true,
      collectedAmount: true,
      ownerId: true,
      owner: { select: { id: true, name: true, reportsToId: true } },
    },
  });

  // نجمّع بالبائع
  const byOwner = new Map<string, typeof projects>();
  for (const project of projects) {
    if (!project.ownerId) continue;
    const list = byOwner.get(project.ownerId) ?? [];
    list.push(project);
    byOwner.set(project.ownerId, list);
  }

  const managerIds = [
    ...new Set(
      [...byOwner.values()].map((list) => list[0].owner?.reportsToId).filter(Boolean)
    ),
  ] as string[];
  const managers = managerIds.length
    ? await db.user.findMany({
        where: { id: { in: managerIds } },
        select: { id: true, name: true },
      })
    : [];
  const managerName = new Map(managers.map((m) => [m.id, m.name]));

  const sellers: PeriodSummary['sellers'] = [];

  for (const [ownerId, list] of byOwner) {
    const scheme = await schemeForUser(ownerId, end);
    const owner = list[0].owner;
    const managerId = owner?.reportsToId ?? null;

    // المحصَّل من كل مشروع = المقدم + ما حُصّل بعده
    const perProject = list.map((p) => ({
      id: p.id,
      code: p.code,
      title: p.title,
      collected:
        scheme?.basis === 'net' ? p.netTotal : Math.min(p.netTotal, p.deposit + p.collectedAmount),
    }));
    const achieved = perProject.reduce((s, p) => s + p.collected, 0);

    const result = computeCommission({
      total: achieved,
      tiers: scheme?.tiers ?? [],
      mode: (scheme?.tierMode as TierMode) ?? 'progressive',
      hasManager: Boolean(managerId),
    });

    sellers.push({
      userId: ownerId,
      userName: owner?.name ?? 'غير معروف',
      managerId,
      managerName: managerId ? (managerName.get(managerId) ?? null) : null,
      schemeName: scheme?.name ?? null,
      achieved,
      adminAmount: result.adminAmount,
      managerAmount: result.managerAmount,
      tierIndex: result.tierIndex,
      currentAdminRate: result.currentAdminRate,
      nextTierAt: result.nextTierAt,
      remainingToNext: result.remainingToNext,
      projects: perProject,
    });
  }

  sellers.sort((a, b) => b.achieved - a.achieved);

  return {
    period,
    closed,
    sellers,
    totalAchieved: sellers.reduce((s, x) => s + x.achieved, 0),
    totalCommission: sellers.reduce((s, x) => s + x.adminAmount + x.managerAmount, 0),
  };
}

/**
 * يعيد بناء قيود الفترة ويكتبها.
 *
 * القيود العادية تُحذف وتُكتب من جديد — فهي مشتقة بالكامل.
 *
 * **والقيد العكسي يُصفّى مع أصله.** القيد العكسي وُجد ليخصم استحقاقًا مكتوبًا
 * لمشروع استُرد. فإذا أُعيد البناء خرج المشروع المسترد من الحساب أصلًا (لم
 * يعد محصَّلًا)، فلو بقي العكسي لخُصم المبلغ **مرتين**. لذلك يُحذف كل قيد
 * عكسي لم يعد له أصل في الفترة. لا يضيع الأثر: الاسترداد مسجَّل في المشروع
 * نفسه وفي سجل التدقيق، وشاشة «نسبي» تستخرج الخصومات من المشاريع لا من
 * القيود — فتبقى ظاهرة مهما أُعيد البناء.
 *
 * الفترة المغلقة تُترك كما هي.
 */
export async function rebuildPeriod(period: string): Promise<{ written: number; skipped: boolean }> {
  const closedRow = await db.commissionPeriod.findUnique({ where: { period } });
  if (closedRow?.closedAt) return { written: 0, skipped: true };

  const summary = await computePeriod(period);

  await db.commissionEntry.deleteMany({ where: { period, isReversal: false } });

  const rows: {
    period: string;
    userId: string;
    role: string;
    sourceUserId: string | null;
    projectId: string;
    base: number;
    rate: number;
    amount: number;
    schemeId: string | null;
  }[] = [];

  for (const seller of summary.sellers) {
    const scheme = await schemeForUser(seller.userId, periodRange(period).end);

    // حصة الأدمن موزّعة على مشاريعه، فيمكن تتبّع كل جنيه لمصدره
    for (const row of splitByProject(seller.adminAmount, seller.projects.map((p) => ({
      projectId: p.id,
      collected: p.collected,
    })))) {
      rows.push({
        period,
        userId: seller.userId,
        role: 'admin',
        sourceUserId: seller.userId,
        projectId: row.projectId,
        base: seller.projects.find((p) => p.id === row.projectId)?.collected ?? 0,
        rate: seller.currentAdminRate,
        amount: row.amount,
        schemeId: scheme?.id ?? null,
      });
    }

    if (seller.managerId && seller.managerAmount > 0) {
      for (const row of splitByProject(seller.managerAmount, seller.projects.map((p) => ({
        projectId: p.id,
        collected: p.collected,
      })))) {
        rows.push({
          period,
          userId: seller.managerId,
          role: 'manager',
          sourceUserId: seller.userId,
          projectId: row.projectId,
          base: seller.projects.find((p) => p.id === row.projectId)?.collected ?? 0,
          rate: 0,
          amount: row.amount,
          schemeId: scheme?.id ?? null,
        });
      }
    }
  }

  if (rows.length > 0) await db.commissionEntry.createMany({ data: rows });

  // القيود العكسية اليتيمة — أصلها لم يُكتب من جديد، فلا شيء لتخصم منه
  const liveProjectIds = [...new Set(rows.map((r) => r.projectId))];
  await db.commissionEntry.deleteMany({
    where: {
      period,
      isReversal: true,
      OR: [{ projectId: null }, { projectId: { notIn: liveProjectIds } }],
    },
  });

  return { written: rows.length, skipped: false };
}

/**
 * قيد عكسي عند استرداد أو إلغاء مشروع بعد احتساب نسبته.
 *
 * > «نعم تُخصم نسبته لو المشروع تم استرداده.» — قرار الإدارة
 *
 * **لا يُحذف الأصلي** (§٣ بند ٥): يُضاف سطر بمبلغ سالب فيبقى الأثر كاملًا
 * ويمكن تفسير أي فرق في كشف الحساب.
 */
export async function reverseProjectCommission(
  projectId: string,
  reason: string
): Promise<number> {
  const entries = await db.commissionEntry.findMany({
    where: { projectId, isReversal: false },
  });
  if (entries.length === 0) return 0;

  // ما عُكس سابقًا لا يُعكس مرتين
  const reversed = await db.commissionEntry.findMany({
    where: { projectId, isReversal: true },
    select: { userId: true, role: true, amount: true },
  });
  const already = new Map<string, number>();
  for (const r of reversed) {
    const key = `${r.userId}|${r.role}`;
    already.set(key, (already.get(key) ?? 0) + r.amount);
  }

  const rows = [];
  for (const entry of entries) {
    const key = `${entry.userId}|${entry.role}`;
    const outstanding = entry.amount + (already.get(key) ?? 0);
    if (outstanding <= 0) continue;
    rows.push({
      period: entry.period,
      userId: entry.userId,
      role: entry.role,
      sourceUserId: entry.sourceUserId,
      projectId: entry.projectId,
      base: -entry.base,
      rate: entry.rate,
      amount: -entry.amount,
      schemeId: entry.schemeId,
      isReversal: true,
      note: reason,
    });
    already.set(key, (already.get(key) ?? 0) - entry.amount);
  }

  if (rows.length > 0) await db.commissionEntry.createMany({ data: rows });
  return rows.length;
}

/** صافي استحقاق شخص في فترة — القيود العادية والعكسية معًا */
export async function netEntitlement(userId: string, period: string): Promise<number> {
  const result = await db.commissionEntry.aggregate({
    where: { userId, period },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}
