/**
 * حساب المال بالقرش الصحيح — الوحدة الخالصة.
 *
 * **الفاصلة العائمة لا تعرف عُشرًا.** الحاسوب يخزّن `0.1 + 0.2` فيعطي
 * `0.30000000000000004`. على قيدين لا يظهر شيء؛ على آلاف القيود يتراكم
 * الفرق فيُخرج **ميزان المراجعة** عن التوازن — وقد وقع ذلك فعلًا بقرش بعد
 * ترحيل ٢٬٢٤٧ قيدًا.
 *
 * **والعلاج أن يُجمع المال بالقرش لا بالجنيه.** القرش عددٌ صحيح، والأعداد
 * الصحيحة تُجمع في الفاصلة العائمة **بلا أي خطأ** ما دامت دون ٩٬٠٠٧ تريليون
 * — أي تسعين تريليون جنيه. فالمجموع يخرج صحيحًا مهما طال، ثم يُقسم على مئة
 * مرةً واحدة في آخر خطوة.
 *
 * القاعدة العملية: **لا تجمع مبالغ بـ`+` ولا بـ`reduce` — استعمل `sum`.**
 */

/** القرش وحدة الحساب — والجنيه وحدة العرض */
export const MINOR_UNITS = 100;

/**
 * الجنيه إلى قروش صحيحة.
 *
 * `Number.EPSILON` يُصلح ما أفسدته الفاصلة قبل التقريب: `1.005 * 100` تعطي
 * `100.49999999999999` فتُقرَّب نزولًا خطأً، والإضافة تجعلها `100.5` فتُقرَّب
 * صعودًا كما يتوقّع من يقرأ الرقم.
 */
export function toPiastres(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * MINOR_UNITS);
}

/** القروش إلى جنيهات — القسمة الوحيدة، وفي آخر خطوة */
export function fromPiastres(piastres: number): number {
  return piastres / MINOR_UNITS;
}

/** يُثبّت المبلغ على قرشٍ صحيح — بابُ كل كتابة إلى القاعدة */
export function money(value: number): number {
  return fromPiastres(toPiastres(value));
}

/**
 * مجموع مبالغ — **بالقرش الصحيح**.
 *
 * هذه هي الدالة التي تُستعمل بدل `reduce((s, x) => s + x, 0)` في كل موضع
 * يُجمع فيه مالٌ من أكثر من سطر: الدفتر، وميزان المراجعة، وإجماليات المشاريع.
 */
export function sum(values: number[]): number {
  let piastres = 0;
  for (const value of values) piastres += toPiastres(value);
  return fromPiastres(piastres);
}

/** مجموع حقلٍ من صفوف — اختصارٌ لأشيع استعمال */
export function sumBy<T>(rows: T[], pick: (row: T) => number): number {
  return sum(rows.map(pick));
}

export function add(a: number, b: number): number {
  return fromPiastres(toPiastres(a) + toPiastres(b));
}

export function subtract(a: number, b: number): number {
  return fromPiastres(toPiastres(a) - toPiastres(b));
}

/**
 * ضربُ مبلغ في معامل (نسبة أو كمية).
 *
 * الضرب يقع على القروش ثم يُقرَّب مرة واحدة — لا على الجنيهات فتتراكم كسورٌ
 * أطول من قرشين ثم تُقرَّب في كل خطوة.
 */
export function multiply(value: number, factor: number): number {
  if (!Number.isFinite(factor)) return 0;
  return fromPiastres(Math.round(toPiastres(value) * factor));
}

/** هل المبلغان متساويان بالقرش؟ — والمقارنة بـ`===` على الجنيهات كذبة */
export function equal(a: number, b: number): boolean {
  return toPiastres(a) === toPiastres(b);
}

/**
 * توزيع مبلغ على حصص — **والباقي على آخر سطر**.
 *
 * قسمة ١٠٠ على ثلاثة تعطي ٣٣٫٣٣ ثلاث مرات ومجموعها ٩٩٫٩٩. والقرش الضائع
 * يُخرج القيدَ عن التوازن، فيُعطى لآخر نصيب. وهي القاعدة نفسها المستعملة في
 * توزيع النسب على المشاريع وفي تسوية القيود المستوردة.
 */
export function allocate(total: number, weights: number[]): number[] {
  const totalPiastres = toPiastres(total);
  const weightSum = weights.reduce((s, w) => s + w, 0);

  if (weights.length === 0) return [];
  if (weightSum <= 0) {
    // بلا أوزان: الكلّ لآخر نصيب — ولا يُخترع توزيع
    return weights.map((_, i) => (i === weights.length - 1 ? fromPiastres(totalPiastres) : 0));
  }

  const shares = weights.map((w) => Math.round((totalPiastres * w) / weightSum));
  const distributed = shares.reduce((s, x) => s + x, 0);
  shares[shares.length - 1] += totalPiastres - distributed;

  return shares.map(fromPiastres);
}
