/**
 * أهداف الفروع — القواعد الخالصة.
 *
 * **إدخال شهرٍ بشهر اثنا عشر رحلة ذهابًا وإيابًا في كل فرع.** ستة فروع
 * وسنةٌ كاملة = ٧٢ خانة كانت تُملأ في ٢٤ صفحة. والسنة تُدخَل مرة واحدة:
 * رقمٌ سنويّ يُقسَّم، ثم تُعدَّل الشهور المستثناة بيدها.
 *
 * والقسمة **بأوزان موسمية** لا بالتساوي: رمضان والصيف ليسا كنوفمبر في مكتب
 * ترجمة، وتارجتٌ متساوٍ على الشهور يعاقب الفريق في الشهر الضعيف ويكافئه في
 * القوي — ثم يُقاس عليه استحقاقُ نسبة.
 */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const MONTH_NAMES = [
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

export function periodOfMonth(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

/**
 * توزيع رقمٍ سنويّ على اثني عشر شهرًا.
 *
 * **والقرش الأخير يُسوَّى على آخر شهر** فيطابق المجموع الرقم السنوي بالضبط.
 * وبلا هذه التسوية ينحرف المجموع عن المُدخَل، فيرى المالك رقمًا لم يكتبه.
 *
 * والأوزان اختيارية: بلا أوزان يُقسَّم بالتساوي — وهذا خيارٌ صريح لا افتراض،
 * فمن لا موسمية عنده لا تُخترع له واحدة.
 */
export function spreadYear(annual: number, weights?: number[]): number[] {
  const months = 12;
  if (!Number.isFinite(annual) || annual <= 0) return Array(months).fill(0);

  const usable =
    weights && weights.length === months && weights.every((w) => Number.isFinite(w) && w >= 0)
      ? weights
      : null;
  const total = usable ? usable.reduce((s, w) => s + w, 0) : 0;

  if (!usable || total <= 0) {
    const each = round2(annual / months);
    const out = Array(months).fill(each);
    out[months - 1] = round2(annual - each * (months - 1));
    return out;
  }

  const out = usable.map((w) => round2((annual * w) / total));
  const drift = round2(annual - out.reduce((s, v) => s + v, 0));
  out[months - 1] = round2(out[months - 1] + drift);
  return out;
}

/**
 * أوزانٌ موسمية مشتقّة من **إيراد سنةٍ فعلية** — لا مقدَّرة بالعين.
 *
 * تعيد `null` حين لا تكفي البيانات: سنةٌ نصفها أصفار ليست نمطًا موسميًّا،
 * والبناء عليها يُثبّت تشوّهًا في تارجت السنة القادمة كلها.
 */
export function seasonalWeights(monthlyActuals: number[], minMonths = 6): number[] | null {
  if (monthlyActuals.length !== 12) return null;
  const measured = monthlyActuals.filter((v) => Number.isFinite(v) && v > 0);
  if (measured.length < minMonths) return null;
  const total = monthlyActuals.reduce((s, v) => s + (v > 0 ? v : 0), 0);
  if (total <= 0) return null;
  return monthlyActuals.map((v) => (v > 0 ? v : 0));
}

/** يطبّق نسبة نمو على أرقام سنة سابقة */
export function applyGrowth(values: number[], growthPct: number): number[] {
  const factor = 1 + growthPct / 100;
  return values.map((v) => round2(v * factor));
}

export type YearRow = {
  branch: string;
  label: string;
  months: number[];
  annual: number;
};

/** مجموع كل فرع، ومجموع كل شهر، والإجمالي — للعرض تحت الجدول */
export function yearTotals(rows: YearRow[]): {
  byMonth: number[];
  grand: number;
} {
  const byMonth = Array(12)
    .fill(0)
    .map((_, m) => round2(rows.reduce((s, r) => s + (r.months[m] ?? 0), 0)));
  return { byMonth, grand: round2(byMonth.reduce((s, v) => s + v, 0)) };
}
