/**
 * حساب نسب المبيعات — المعادلة وحدها، بلا قاعدة بيانات ولا شبكة.
 *
 * كل رقم هنا يصل **كوسيط**: الشرائح والنسب وطريقة الاحتساب كلها بيانات
 * تُعدَّل من الشاشة (`CommissionScheme`). لا رقم واحد مكتوب في هذا الملف.
 *
 * يُختبر رقمًا برقم في `tests/commission.mjs` — وفيه الأمثلة الحرفية التي
 * أقرّتها الإدارة في `COMMISSION-SPEC.md`.
 */

export type CommissionTier = {
  /** بداية الشريحة (شامل) */
  fromAmount: number;
  /** نهاية الشريحة (غير شامل) — null تعني «فما فوق» */
  toAmount: number | null;
  /** نسبة الأدمن صاحب المبيعة */
  adminRate: number;
  /** نسبة مديره المباشر */
  managerRate: number;
};

/**
 * طريقة احتساب الشريحة عند تجاوزها:
 *   `progressive` — كل شريحة على الجزء الواقع فيها (المطبَّق افتراضيًا)
 *   `whole`       — الشريحة المحققة تُطبَّق على المبلغ كله
 */
export type TierMode = 'progressive' | 'whole';

export type CommissionResult = {
  /** ما يستحقه الأدمن */
  adminAmount: number;
  /** ما يستحقه مديره المباشر */
  managerAmount: number;
  /** الشريحة التي بلغها (فهرس في المصفوفة المرتّبة) */
  tierIndex: number;
  /** النسبة الحدّية للأدمن عند هذا المستوى */
  currentAdminRate: number;
  currentManagerRate: number;
  /** عتبة الشريحة التالية — null إن كان في الأعلى */
  nextTierAt: number | null;
  /** كم يتبقى لبلوغ الشريحة التالية */
  remainingToNext: number | null;
};

/** يرتّب الشرائح تصاعديًا ويتجاهل المشوّه منها */
export function sortTiers(tiers: CommissionTier[]): CommissionTier[] {
  return [...tiers]
    .filter((t) => Number.isFinite(t.fromAmount) && t.fromAmount >= 0)
    .sort((a, b) => a.fromAmount - b.fromAmount);
}

/** الشريحة التي يقع فيها مبلغ ما */
function tierIndexFor(sorted: CommissionTier[], amount: number): number {
  let index = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (amount >= sorted[i].fromAmount) index = i;
    else break;
  }
  return index;
}

/**
 * يحسب استحقاق الأدمن ومديره على إجمالي محقَّق في فترة.
 *
 * **قاعدة «من لا مدير له يأخذ النسبة كاملة»:** حين لا يوجد مدير مباشر،
 * يستحق الأدمن حصته وحصة المدير معًا — لأن العمل كله عمله.
 */
export function computeCommission(params: {
  /** الإجمالي المحقَّق في الفترة (المحصَّل عادةً) */
  total: number;
  tiers: CommissionTier[];
  mode: TierMode;
  /** هل له مدير مباشر يستحق حصته؟ */
  hasManager: boolean;
}): CommissionResult {
  const sorted = sortTiers(params.tiers);

  const empty: CommissionResult = {
    adminAmount: 0,
    managerAmount: 0,
    tierIndex: 0,
    currentAdminRate: 0,
    currentManagerRate: 0,
    nextTierAt: null,
    remainingToNext: null,
  };

  if (sorted.length === 0 || !Number.isFinite(params.total) || params.total <= 0) {
    return empty;
  }

  const index = tierIndexFor(sorted, params.total);
  const tier = sorted[index];

  let adminAmount = 0;
  let managerAmount = 0;

  if (params.mode === 'whole') {
    // الشريحة المحققة تبتلع المبلغ كله
    adminAmount = params.total * tier.adminRate;
    managerAmount = params.total * tier.managerRate;
  } else {
    // تصاعدية جزئية: كل شريحة على الجزء الواقع فيها
    for (let i = 0; i <= index; i++) {
      const current = sorted[i];
      const upper = current.toAmount ?? Infinity;
      const sliceStart = current.fromAmount;
      const sliceEnd = Math.min(params.total, upper);
      const slice = Math.max(0, sliceEnd - sliceStart);
      if (slice === 0) continue;
      adminAmount += slice * current.adminRate;
      managerAmount += slice * current.managerRate;
    }
  }

  // من لا مدير له يستحق الحصتين معًا
  if (!params.hasManager) {
    adminAmount += managerAmount;
    managerAmount = 0;
  }

  const next = sorted[index + 1] ?? null;

  return {
    adminAmount: round2(adminAmount),
    managerAmount: round2(managerAmount),
    tierIndex: index,
    currentAdminRate: tier.adminRate,
    currentManagerRate: tier.managerRate,
    nextTierAt: next ? next.fromAmount : null,
    remainingToNext: next ? Math.max(0, round2(next.fromAmount - params.total)) : null,
  };
}

/**
 * يوزّع مبلغ الاستحقاق على المشاريع التي صنعته، بنسبة ما حصّله كل مشروع.
 *
 * **لماذا التوزيع أصلًا:** كل استحقاق يجب أن يكون متتبَّعًا إلى مشروعه، فإن
 * استُرد مشروع عرفنا كم نعكس بالضبط. والمجموع يساوي الاستحقاق **بالضبط** —
 * فارق التقريب يذهب لآخر سطر.
 */
export function splitByProject(
  amount: number,
  projects: { projectId: string; collected: number }[]
): { projectId: string; amount: number }[] {
  const positive = projects.filter((p) => p.collected > 0);
  const total = positive.reduce((s, p) => s + p.collected, 0);
  if (total <= 0 || positive.length === 0) return [];

  const rows = positive.map((p) => ({
    projectId: p.projectId,
    amount: round2((amount * p.collected) / total),
  }));

  const sum = rows.reduce((s, r) => s + r.amount, 0);
  const diff = round2(amount - sum);
  if (diff !== 0) {
    rows[rows.length - 1] = {
      ...rows[rows.length - 1],
      amount: round2(rows[rows.length - 1].amount + diff),
    };
  }
  return rows;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** نسبة بلوغ الهدف — للعرض في شاشة «نسبي» */
export function targetProgress(achieved: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.min(1, achieved / target);
}

/** `YYYY-MM` من تاريخ */
export function periodOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function periodLabel(period: string): string {
  const months = [
    'يناير',
    'فبراير',
    'مارس',
    'أبريل',
    'مايو',
    'يونيو',
    'يوليو',
    'أغسطس',
    'سبتمبر',
    'أكتوبر',
    'نوفمبر',
    'ديسمبر',
  ];
  const [y, m] = period.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return period;
  return `${months[m - 1]} ${y}`;
}

export function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  return periodOf(new Date(y, m - 1 + delta, 1));
}

/** بداية ونهاية الفترة كتاريخين — للاستعلام */
export function periodRange(period: string): { start: Date; end: Date } {
  const [y, m] = period.split('-').map(Number);
  return {
    start: new Date(y, m - 1, 1, 0, 0, 0, 0),
    end: new Date(y, m, 1, 0, 0, 0, 0),
  };
}
