import 'server-only';
import { db } from './db';
import {
  computeCommission,
  attributeShares,
  commissionableAmount,
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
  /** عتبة استحقاق هذا الشخص — من إسناده لا من الخطة */
  target: number | null;
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

  const assigned = assignment?.scheme?.active === true;
  const scheme = assigned
    ? assignment!.scheme
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
    // العتبة تتبع الإسناد: سقطت الخطة المسنَدة فسقطت عتبتها معها
    target: assigned ? (assignment!.target ?? null) : null,
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
    /** المدير الغالب في صفقات الفترة — للعرض وحده، والإسناد يقع بالصفقة */
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
    /** عتبة استحقاقه وحالها */
    target: number | null;
    targetMet: boolean;
    remainingToTarget: number | null;
    projects: {
      id: string;
      code: string | null;
      title: string;
      collected: number;
      /** مستحقّ حصة المدير عن هذه الصفقة */
      managerId: string | null;
      managerName: string | null;
    }[];
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
      // ما مسّته التسوية لا يُحسب عليه نسبةً — ولا كاملًا ولا موسَّعًا
      importTag: true,
      preSettleTotal: true,
      owner: { select: { id: true, name: true, reportsToId: true } },
    },
  });

  /**
   * **مالكٌ واحد للصفقة: من أدخلها** (قرار الإدارة — المرحلة ١٦).
   *
   * كانت هناك «ملكية مزدوجة» تُقسّم الحصص بين جالبٍ وخادم، فأُلغيت: «من يدخل
   * البيانات هو المالك الرئيسي وله ٣٪»، ولمديره المباشر ٢٪ عن كل صفقة له.
   */
  const byOwner = new Map<string, typeof projects>();
  for (const project of projects) {
    if (!project.ownerId) continue;
    const list = byOwner.get(project.ownerId) ?? [];
    list.push(project);
    byOwner.set(project.ownerId, list);
  }

  const managerIds = new Set<string>();
  for (const project of projects) {
    const managerId = project.owner?.reportsToId ?? null;
    if (managerId && managerId !== project.ownerId) managerIds.add(managerId);
  }
  const managers = managerIds.size
    ? await db.user.findMany({
        where: { id: { in: [...managerIds] } },
        select: { id: true, name: true },
      })
    : [];
  const managerName = new Map(managers.map((m) => [m.id, m.name]));

  const sellers: PeriodSummary['sellers'] = [];

  for (const [sellerId, list] of byOwner) {
    const scheme = await schemeForUser(sellerId, end);
    const seller = list[0].owner;
    // مستحقّ حصة المدير — المدير المباشر للبائع، ولا يأخذ أحدٌ الحصتين عن نفسه
    const rawManagerId = seller?.reportsToId ?? null;
    const managerId = rawManagerId && rawManagerId !== sellerId ? rawManagerId : null;

    // المحصَّل من كل مشروع = المقدم + ما حُصّل بعده
    const perProject = list.map((p) => ({
      id: p.id,
      code: p.code,
      title: p.title,
      collected: commissionableAmount({
        amount:
          scheme?.basis === 'net'
            ? p.netTotal
            : Math.min(p.netTotal, p.deposit + p.collectedAmount),
        importTag: p.importTag,
        preSettleTotal: p.preSettleTotal,
      }),
      managerId,
      managerName: managerId ? (managerName.get(managerId) ?? null) : null,
    }));
    const achieved = perProject.reduce((s, p) => s + p.collected, 0);

    const result = computeCommission({
      total: achieved,
      tiers: scheme?.tiers ?? [],
      mode: (scheme?.tierMode as TierMode) ?? 'progressive',
      // يكفي أن يكون لصفقةٍ واحدة مستحقٌّ لحصة المدير ليُحسب النصيبان،
      // ثم يُوزَّع كلٌّ على صفقته، وما لا مستحقّ له يعود للبائع.
      hasManager: perProject.some((p) => p.managerId),
      target: scheme?.target ?? null,
    });

    // المدير الغالب — للعرض في صف الملخّص وحده
    const dominant = perProject.find((p) => p.managerId)?.managerId ?? null;

    sellers.push({
      userId: sellerId,
      userName: seller?.name ?? 'غير معروف',
      managerId: dominant,
      managerName: dominant ? (managerName.get(dominant) ?? null) : null,
      schemeName: scheme?.name ?? null,
      achieved,
      adminAmount: result.adminAmount,
      managerAmount: result.managerAmount,
      tierIndex: result.tierIndex,
      currentAdminRate: result.currentAdminRate,
      nextTierAt: result.nextTierAt,
      remainingToNext: result.remainingToNext,
      target: scheme?.target ?? null,
      targetMet: result.targetMet,
      remainingToTarget: result.remainingToTarget,
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
    const baseOf = new Map(seller.projects.map((p) => [p.id, p.collected]));

    /**
     * الحصتان تُوزَّعان على المشاريع، **ولكل مشروع مديرُه هو** — فصفقةٌ جلبها
     * مدير المبيعات وخدمها الأدمن تُعطي المديرَ حصتَه عنها هي وحدها. فيمكن
     * تتبّع كل جنيه إلى صفقته ومستحقّه، وعكسُه وحده عند الاسترداد.
     */
    for (const row of attributeShares({
      sellerId: seller.userId,
      adminAmount: seller.adminAmount,
      managerAmount: seller.managerAmount,
      projects: seller.projects.map((p) => ({
        projectId: p.id,
        collected: p.collected,
        managerId: p.managerId,
      })),
    })) {
      rows.push({
        period,
        userId: row.userId,
        role: row.role,
        sourceUserId: seller.userId,
        projectId: row.projectId,
        base: baseOf.get(row.projectId) ?? 0,
        rate: row.role === 'admin' ? seller.currentAdminRate : 0,
        amount: row.amount,
        schemeId: scheme?.id ?? null,
      });
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
