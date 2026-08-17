/**
 * أعمار الذمم المدينة — القواعد الخالصة.
 *
 * **السؤال الأول عند المحاسب كل صباح**: كم لنا عند العملاء، ومنذ متى.
 * ومئة ألف عمرها أسبوع غير مئة ألف عمرها أربعة أشهر — والرقم المجرّد يخفي
 * الفرق فيُقرأ الاثنان سواءً.
 *
 * والعمر **يُحسب من التسليم** لا من فتح المشروع: قبل التسليم لا شيء مستحقّ
 * أصلًا، فعدّه دَينًا متأخّرًا ظلمٌ للعميل واتهامٌ في غير محلّه.
 */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** حدود الشرائح بالأيام — معيار صناعي (30 · 60 · 90) */
export const AGING_EDGES = [30, 60, 90] as const;

export type AgingBucket = 'current' | 'd30' | 'd60' | 'd90' | 'over90';

export const AGING_LABELS: Record<AgingBucket, string> = {
  current: 'خلال ٣٠ يومًا',
  d30: 'متأخر ٣٠ يومًا',
  d60: 'متأخر ٦٠ يومًا',
  d90: 'متأخر ٩٠ يومًا',
  over90: 'أكثر من ٩٠ يومًا',
};

export const AGING_ORDER: AgingBucket[] = ['current', 'd30', 'd60', 'd90', 'over90'];

/**
 * الشريحة التي يقع فيها دَينٌ عمره `days` يومًا.
 *
 * **والحدّ يُبلَغ لا يُتجاوَز**: يومٌ رقم ٣٠ ما زال «خلال ٣٠»، والحادي
 * والثلاثون هو أول المتأخّر. وإلا قفز الدين شريحةً قبل أوانه بيوم.
 */
export function bucketOf(days: number): AgingBucket {
  if (days <= AGING_EDGES[0]) return 'current';
  if (days <= AGING_EDGES[1]) return 'd30';
  if (days <= AGING_EDGES[2]) return 'd60';
  // ما بين ٩١ و١٢٠ شريحةُ «متأخر ٩٠»، وما بعدها هو «أكثر من ٩٠»
  if (days <= AGING_EDGES[2] + 30) return 'd90';
  return 'over90';
}

/** عدد الأيام بين تاريخين — بالأيام الكاملة لا بالكسور */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export type ReceivableInput = {
  /** المتبقّي على العميل — لا الإجمالي */
  outstanding: number;
  /** تاريخ التسليم — منه يبدأ العمر. و`null` يعني «لم يُسلَّم بعد» */
  deliveredAt: Date | null;
};

export type AgingResult = {
  buckets: Record<AgingBucket, number>;
  total: number;
  /** ما لم يُسلَّم بعد — مستحقٌّ قادم لا دَينٌ متأخّر */
  notDue: number;
  /** أكثر من ٩٠ يومًا — الرقم الذي يستدعي قرارًا */
  atRisk: number;
};

export function ageReceivables(items: ReceivableInput[], asOf: Date): AgingResult {
  const buckets: Record<AgingBucket, number> = {
    current: 0,
    d30: 0,
    d60: 0,
    d90: 0,
    over90: 0,
  };
  let notDue = 0;

  for (const item of items) {
    if (item.outstanding <= 0) continue;
    if (!item.deliveredAt) {
      notDue += item.outstanding;
      continue;
    }
    buckets[bucketOf(daysBetween(item.deliveredAt, asOf))] += item.outstanding;
  }

  for (const key of AGING_ORDER) buckets[key] = round2(buckets[key]);

  return {
    buckets,
    total: round2(AGING_ORDER.reduce((s, k) => s + buckets[k], 0)),
    notDue: round2(notDue),
    atRisk: buckets.over90,
  };
}
