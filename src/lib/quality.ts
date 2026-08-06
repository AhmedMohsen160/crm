/**
 * قياس الجودة — الوحدة الخالصة.
 *
 * **المعيار الصناعي: كثافة الأخطاء لكل ألف كلمة، لا عددُها المجرّد.**
 * نماذج تقييم الترجمة المعتمدة عالميًا (SAE J2450 و LISA QA و MQM) تتفق على
 * هذا: الخطأ يُنسب إلى الحجم الذي وقع فيه. والسبب عمليّ لا نظريّ — من يترجم
 * خمسين صفحة يقع في أخطاء أكثر ممّن ترجم خمسًا وهو أجودُ منه عملًا، فالعدد
 * المجرّد يعاقب المجتهد ويكافئ المتقاعس.
 *
 * **ومؤشران لا واحد**، لأنهما يقيسان شيئين مختلفين:
 *
 * ١) **كثافة الملاحظات** — أخطاءٌ أمسكها المكتب **قبل** أن يراها العميل.
 *    تقيس دقّة العمل، وارتفاعها عبءٌ على المراجعة لا فضيحةٌ عند العميل.
 *
 * ٢) **نسبة الإعادة** — عملٌ رجع **بعد** التسليم. هذا هو الخطأ الذي أفلت،
 *    وهو الذي يكلّف المكتب سمعته ووقته مرتين. صفرُ ملاحظات مع إعادةٍ متكرّرة
 *    ليس جودةً بل مراجعةً لا تعمل.
 *
 * والعقوبة والهدف **إعدادان يضبطهما المكتب**، لا رقمان محفوران في الكود:
 * ما يصلح لعقدٍ قانونيّ لا يصلح لمستندٍ شخصيّ.
 */

// ── الثوابت الافتراضية ─────────────────────────────────────────

/**
 * الهدف: خطأٌ واحد لكل ألف كلمة.
 * وهو الحدّ المتعارف عليه في الترجمة المعتمدة — دونه يُقبل العمل بلا تحفّظ.
 */
export const DEFAULT_TARGET_DENSITY = 1;

/**
 * كل خطأ في الألف يخصم عشر درجات.
 * فخطأٌ واحد = ٩٠ (ممتاز)، وثلاثة = ٧٠ (مقبول)، وعشرة = صفر.
 */
export const DEFAULT_PENALTY_PER_ERROR = 10;

/** كلمات الصفحة الافتراضية — يضبطها المكتب في الإعدادات */
export const DEFAULT_WORDS_PER_PAGE = 250;

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// ── الكثافة والدرجة ────────────────────────────────────────────

/**
 * عدد الملاحظات لكل ألف كلمة.
 *
 * **وبلا حجمٍ مقيس لا كثافة** — مشروعٌ بلا صفحات مسجّلة لا يُقال عنه «صفر
 * أخطاء»، يُقال «لم يُقَس». والفرق حكمٌ في حقّ إنسان.
 */
export function errorDensity(issues: number, words: number): number | null {
  if (words <= 0) return null;
  return round1((issues / words) * 1000);
}

/**
 * درجة الجودة من مئة.
 *
 * `١٠٠ − (الكثافة × العقوبة)` محصورةً بين صفر ومئة. والحصر مقصود: عملٌ
 * بأربعين خطأً في الألف لا يُعطى درجةً سالبة — الصفر قاعُ المقياس.
 */
export function qualityScore(
  density: number | null,
  penaltyPerError = DEFAULT_PENALTY_PER_ERROR
): number | null {
  if (density === null) return null;
  return Math.max(0, Math.min(100, round1(100 - density * penaltyPerError)));
}

// ── الشرائح ────────────────────────────────────────────────────

export const QUALITY_BANDS = [
  { min: 95, key: 'excellent', label: 'ممتاز', tone: 'good' as const },
  { min: 85, key: 'good', label: 'جيد', tone: 'good' as const },
  { min: 70, key: 'fair', label: 'مقبول', tone: 'warn' as const },
  { min: 0, key: 'poor', label: 'دون المستوى', tone: 'bad' as const },
];

export type QualityBand = (typeof QUALITY_BANDS)[number];

/** الشريحة التي تقع فيها الدرجة — و«غير مقيس» ليست شريحة */
export function qualityBand(score: number | null): QualityBand | null {
  if (score === null) return null;
  return QUALITY_BANDS.find((b) => score >= b.min) ?? QUALITY_BANDS[QUALITY_BANDS.length - 1];
}

// ── نسبة الإعادة ───────────────────────────────────────────────

/**
 * نسبة ما رجع للتصحيح بعد التسليم.
 *
 * **هذا هو الخطأ الذي أفلت** — وهو أغلى من عشرة أمسكتها المراجعة.
 */
export function reworkRate(reworked: number, delivered: number): number | null {
  if (delivered <= 0) return null;
  return round1((reworked / delivered) * 100);
}

// ── التجميع ────────────────────────────────────────────────────

export type QualityInput = {
  /** عدد ملاحظات الجودة على المشروع */
  qaIssues: number;
  /** الصفحات المسلَّمة */
  pages: number;
  /** الكلمات إن سُجّلت صراحةً — وإلا اشتُقّت من الصفحات */
  words?: number | null;
  /** رجع للتصحيح بعد التسليم */
  isRework: boolean;
};

export type QualitySummary = {
  projects: number;
  /** المشاريع التي لها حجمٌ مقيس — وهي وحدها تدخل الكثافة */
  measured: number;
  issues: number;
  words: number;
  density: number | null;
  score: number | null;
  band: QualityBand | null;
  reworked: number;
  reworkPct: number | null;
  /** نسبة المشاريع التي سُلّمت بلا ملاحظة واحدة */
  cleanPct: number | null;
};

/**
 * خلاصة الجودة لمجموعة مشاريع.
 *
 * **الكثافة تُحسب على المجموع لا كمتوسّطٍ للمتوسّطات.** لو جمعنا كثافة كل
 * مشروع ثم قسمنا، لَساوى مشروعُ صفحةٍ واحدة مشروعَ مئة صفحة في وزنه — فيكفي
 * خطأٌ في مستندٍ صغير ليهبط تقييمُ شهرٍ كامل.
 */
export function qualitySummary(
  rows: QualityInput[],
  opts: {
    wordsPerPage?: number;
    penaltyPerError?: number;
  } = {}
): QualitySummary {
  const wordsPerPage = opts.wordsPerPage || DEFAULT_WORDS_PER_PAGE;

  const withWords = rows.map((r) => ({
    ...r,
    resolvedWords: r.words && r.words > 0 ? r.words : r.pages * wordsPerPage,
  }));

  const measuredRows = withWords.filter((r) => r.resolvedWords > 0);
  const words = measuredRows.reduce((s, r) => s + r.resolvedWords, 0);
  const issues = measuredRows.reduce((s, r) => s + Math.max(0, r.qaIssues), 0);

  const density = errorDensity(issues, words);
  const score = qualityScore(density, opts.penaltyPerError);
  const reworked = rows.filter((r) => r.isRework).length;

  return {
    projects: rows.length,
    measured: measuredRows.length,
    issues,
    words,
    density,
    score,
    band: qualityBand(score),
    reworked,
    reworkPct: reworkRate(reworked, rows.length),
    cleanPct: measuredRows.length
      ? round1((measuredRows.filter((r) => r.qaIssues === 0).length / measuredRows.length) * 100)
      : null,
  };
}
