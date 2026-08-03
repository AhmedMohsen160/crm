/**
 * عروض الأسعار الاحترافية — الوحدة الخالصة.
 *
 * مبنية على عرض «Tristar Group — KSA» الفعلي، فكل قاعدة هنا مأخوذة من
 * التزام مكتوب في عرض أُرسل لعميل حقيقي، لا من تصوّر.
 *
 * وأهمّها قاعدة **الشريحة بأثر رجعي**:
 *
 * > «Tiers are applied retroactively to the entire month's volume — not only
 * >  to the words above the threshold.»
 *
 * وهي عكس شرائح النسب في §٦ تمامًا (تلك تصاعدية جزئية). الخلط بينهما يغيّر
 * الفاتورة بآلاف الريالات، ولذلك تُحسب هنا بدالة مستقلة مختبَرة.
 */

/** الصفحة القياسية = ٢٥٠ كلمة مصدر — الوحدة المعتمدة عالميًا في الصناعة */
export const WORDS_PER_STANDARD_PAGE = 250;

export type ProposalTier = {
  label: string;
  /** أدنى حجم شهري بالكلمات يُفعّل هذه الشريحة (شامل) */
  fromWords: number;
  /** أعلاه (غير شامل) — فارغ يعني «فما فوق» */
  toWords: number | null;
  /** نسبة الخصم عن السعر القياسي — للعرض */
  discountPct: number;
  /** سعر الصفحة في هذه الشريحة */
  ratePerPage: number;
};

export function wordsToPages(words: number): number {
  if (!Number.isFinite(words) || words <= 0) return 0;
  return round2(words / WORDS_PER_STANDARD_PAGE);
}

export function pagesToWords(pages: number): number {
  return Math.round(pages * WORDS_PER_STANDARD_PAGE);
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** سعر الكلمة مشتق من سعر الصفحة — لا يُدخَل مستقلًا فيتناقضان */
export function ratePerWord(ratePerPage: number): number {
  return round4(ratePerPage / WORDS_PER_STANDARD_PAGE);
}

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

/**
 * الشريحة المنطبقة على حجم شهري.
 *
 * **بأثر رجعي على كل حجم الشهر**: من تجاوز العتبة نزل سعرُ كل كلماته لا
 * ما فوق العتبة وحده. وهذا ما يجعل تجاوز العتبة قرارًا مربحًا للعميل
 * بوضوح — وهو الغرض التجاري من الجدول أصلًا.
 */
export function tierFor(tiers: ProposalTier[], monthlyWords: number): ProposalTier | null {
  if (tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => a.fromWords - b.fromWords);

  let match: ProposalTier | null = null;
  for (const tier of sorted) {
    const above = monthlyWords >= tier.fromWords;
    const below = tier.toWords === null || monthlyWords <= tier.toWords;
    if (above && below) match = tier;
  }
  // أقل من أدنى شريحة ← الشريحة القياسية (الأولى)
  return match ?? sorted[0];
}

export type VolumeRow = {
  words: number;
  pages: number;
  tierLabel: string;
  ratePerPage: number;
  discountPct: number;
  total: number;
  /** ما وفّره العميل مقارنةً بالسعر القياسي */
  saving: number;
  vat: number;
  totalWithVat: number;
};

/**
 * صف واحد في جدول «ما يعنيه هذا عمليًا» — الجدول الذي يُقنع لا الذي يشرح.
 *
 * الوفر يُقاس بالسعر القياسي (أعلى شريحة سعرًا) لأنه ما كان العميل سيدفعه
 * بلا هذا العرض.
 */
export function volumeRow(
  tiers: ProposalTier[],
  monthlyWords: number,
  vatRate: number
): VolumeRow {
  const pages = wordsToPages(monthlyWords);
  const tier = tierFor(tiers, monthlyWords);
  const standard = [...tiers].sort((a, b) => a.fromWords - b.fromWords)[0];

  const rate = tier?.ratePerPage ?? 0;
  const total = round2(pages * rate);
  const standardTotal = round2(pages * (standard?.ratePerPage ?? rate));
  const vat = round2(total * vatRate);

  return {
    words: monthlyWords,
    pages,
    tierLabel: tier?.label ?? '—',
    ratePerPage: rate,
    discountPct: tier?.discountPct ?? 0,
    total,
    saving: round2(standardTotal - total),
    vat,
    totalWithVat: round2(total + vat),
  };
}

/** جدول الأمثلة كاملًا — أحجام يختارها معدّ العرض */
export function volumeTable(
  tiers: ProposalTier[],
  samples: number[],
  vatRate: number
): VolumeRow[] {
  return samples
    .filter((w) => Number.isFinite(w) && w > 0)
    .sort((a, b) => a - b)
    .map((w) => volumeRow(tiers, w, vatRate));
}

/**
 * تسعير دفعة واحدة (لا شهر كامل).
 *
 * **الحد الأدنى صفحة واحدة**: مستند بستين كلمة يُحاسَب صفحةً كاملة لا ربعها،
 * وهو التزام مكتوب في العرض. وبدونه تصير الفاتورة أصغر من كلفة إصدارها.
 */
export function quoteBatch(params: {
  words: number;
  ratePerPage: number;
  vatRate: number;
  minimumPages?: number;
}): { pages: number; billablePages: number; net: number; vat: number; total: number } {
  const minimum = params.minimumPages ?? 1;
  const pages = wordsToPages(params.words);
  const billablePages = Math.max(minimum, pages);
  const net = round2(billablePages * params.ratePerPage);
  const vat = round2(net * params.vatRate);
  return { pages, billablePages, net, vat, total: round2(net + vat) };
}

/**
 * مدة التنفيذ حسب حجم الدفعة — جدول العرض الفعلي.
 *
 * ويُرجَع «خطة مجدولة» لما فوق الخمسين ألفًا لأن العرض لا يعد بمدة ثابتة
 * فوقها: الوعد الذي لا يُضبط بخطة وعدٌ يُخلَف.
 */
export const TURNAROUND_BANDS: { upTo: number | null; days: string }[] = [
  { upTo: 5000, days: '١–٢ يوم عمل' },
  { upTo: 15000, days: '٢–٤ أيام عمل' },
  { upTo: 50000, days: '٥–٨ أيام عمل' },
  { upTo: null, days: 'خطة تسليم مجدولة تُتفق قبل البدء' },
];

export function turnaroundFor(words: number): string {
  for (const band of TURNAROUND_BANDS) {
    if (band.upTo === null || words <= band.upTo) return band.days;
  }
  return TURNAROUND_BANDS[TURNAROUND_BANDS.length - 1].days;
}

// ── المحتوى الافتراضي: التزامات مكتوبة في العرض الفعلي ─────────

export const PROPOSAL_STATUSES = {
  draft: 'مسوَّدة',
  sent: 'مُرسَل',
  accepted: 'مقبول',
  declined: 'مرفوض',
  expired: 'منتهي',
} as const;
export type ProposalStatus = keyof typeof PROPOSAL_STATUSES;

/** مراحل الإنتاج الثلاث — «ثلاثة متخصصين لكل ملف بلا استثناء» */
export const PRODUCTION_STAGES = [
  {
    title: 'الترجمة',
    body: 'مترجم مؤهَّل في المجال — قانوني أو تقني أو سلامة أو مالي — يترجم النص وفق مسردك المعتمد وذاكرة الترجمة. ولا يُسنَد عامٌّ إلى محتوى متخصص.',
  },
  {
    title: 'المراجعة الثنائية',
    body: 'لغوي ثانٍ يقابل الهدف بالمصدر سطرًا سطرًا: الدقة والاكتمال والمصطلح، وكل رقم وتاريخ ووحدة وكمية واسم عَلَم. لا إضافة ولا إسقاط ولا تخفيف.',
  },
  {
    title: 'التدقيق',
    body: 'متخصص ثالث يقرأ النص الهدف وحده — كما سيقرؤه مستقبِلك — للأسلوب والوضوح والاتساق وأمانة الإخراج، ثم يعتمده وفق قائمة فحص منظَّمة.',
  },
];

/** دورة حياة المشروع — من بريدك إلى بريدك */
export const LIFECYCLE_STEPS = [
  { title: 'الاستلام والإقرار', body: 'استلام الملفات وتسجيلها وإسناد رقم مرجعي خلال ساعتَي عمل.' },
  { title: 'التحليل والتأكيد', body: 'عدّ إلكتروني للكلمات وتصنيف المجال وتقدير التعقيد. التكلفة وموعد التسليم يُؤكَّدان كتابةً قبل بدء العمل — لا مفاجآت في الفاتورة.' },
  { title: 'الإسناد', body: 'إسناد لفريق مطابق للمجال، مع تثبيت الفريق نفسه على أعمالك ليألف مصطلحك وقوالبك.' },
  { title: 'ترجمة ← مراجعة ← تدقيق', body: 'الدورة الثلاثية أعلاه، متتبَّعة مرحلةً مرحلة بأثر كامل لكل مهمة.' },
  { title: 'إعادة الإخراج والفحص النهائي', body: 'إعادة بناء الشكل ليطابق المصدر — الجداول ومواضع الأختام وكتل التوقيع والترويسات والترقيم — ثم فحص إفراج نهائي.' },
  { title: 'التسليم والتغذية الراجعة', body: 'التسليم بالصيغة المطلوبة. وأي تفضيل أو تصحيح يُكتب في مسردك وذاكرتك فيُطبَّق تلقائيًا بعدها.' },
];

/** ما يشمله السعر — وما يُسعَّر مستقلًا */
export const SCOPE_INCLUDED = [
  'الدورة الثلاثية كاملة: ترجمة ومراجعة ثنائية وتدقيق.',
  'المسرد وذاكرة الترجمة ودليل الأسلوب — إنشاءً وصيانةً مستمرة.',
  'إعادة بناء الشكل والإخراج ليطابق المستند المصدر.',
  'مدير حساب مخصَّص ومدير مشروع.',
  'تقرير شهري: الأحجام المسلَّمة ونسبة الالتزام بالمواعيد والاستفسارات.',
  'إعادة تنفيذ أي ملف لا يبلغ المستوى المتفق عليه.',
];

export const SCOPE_EXCLUDED = [
  'التنفيذ العاجل في نفس اليوم أو خارج ساعات العمل.',
  'الترجمة المعتمدة التي تحتاج توثيقًا أو تصديق غرفة تجارة.',
  'إعادة البناء الجرافيكي لملفات التصميم (InDesign / Illustrator).',
  'أزواج لغوية غير المذكورة في هذا العرض.',
  'الترجمة الفورية الحضورية ودعم الفعاليات.',
];

/** الالتزام عند الخلل — «نعيد التنفيذ على حسابنا وبالأولوية» */
export const DEFECT_COMMITMENT =
  'إن جاء ملف مسلَّم دون المستوى المتفق عليه، نعيد تنفيذه على حسابنا وبالأولوية. لا نزاع على الفاتورة ولا تفاوض ولا تأخير — يُعاد الملف المصحَّح أولًا، ويُكتب سبب الخلل في مسردك حتى لا يتكرر.';

/** البنود التجارية — الجدول الذي يوقّع عليه العميل */
export function commercialTerms(params: {
  currency: string;
  vatPct: number;
  validityDays: number;
  entity: string;
  paymentDays: number;
}) {
  return [
    { label: 'العملة والضريبة', value: `${params.currency}، غير شامل ضريبة القيمة المضافة ${params.vatPct}٪` },
    { label: 'وحدة التسعير', value: `الصفحة القياسية ${WORDS_PER_STANDARD_PAGE} كلمة مصدر، تُعدّ إلكترونيًا وتُؤكَّد كتابةً قبل بدء العمل` },
    { label: 'الحد الأدنى', value: `صفحة قياسية واحدة (${WORDS_PER_STANDARD_PAGE} كلمة) لكل مهمة` },
    { label: 'الفوترة', value: 'فاتورة شهرية موحَّدة، بسعر الشريحة المنطبقة على حجم الشهر كاملًا' },
    { label: 'شروط السداد', value: `صافي ${params.paymentDays} يومًا من تاريخ الفاتورة، بتحويل بنكي` },
    { label: 'الجهة المتعاقدة', value: params.entity },
    { label: 'مدة الصلاحية', value: `${params.validityDays} يومًا تقويميًا من تاريخ العرض` },
  ];
}

/** الشرائح الافتراضية — كما في عرض Tristar، وكلها تُعدَّل من الشاشة */
export const DEFAULT_TIERS: ProposalTier[] = [
  { label: 'قياسي', fromWords: 0, toWords: 100_000, discountPct: 0, ratePerPage: 20 },
  { label: 'كمّي', fromWords: 100_001, toWords: 250_000, discountPct: 10, ratePerPage: 18 },
  { label: 'مؤسسي', fromWords: 250_001, toWords: 999_999, discountPct: 20, ratePerPage: 16 },
  { label: 'شريك استراتيجي', fromWords: 1_000_000, toWords: null, discountPct: 25, ratePerPage: 15 },
];
