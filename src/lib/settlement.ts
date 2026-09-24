/**
 * تسوية إيراد المبيعات على دفتر المحاسب — القواعد الخالصة.
 *
 * ── القاعدة التي أقرّها أحمد ──────────────────────────────────
 *
 * **شيت المحاسب هو الحقيقة المالية ولا يُناقَش.** وشيت المبيعات ناقصٌ لا
 * خاطئ: حين يرصد ١٠٠ ألف على مئة عميل ويقول الدفتر ١٢٠ ألفًا، فالعشرون
 * الباقية ليست وهمًا — هي عملاء لم يُرصدوا ومشترياتٌ متكرّرة لم تُسجَّل.
 *
 * **فتُسوّى ولا تُعرَض فجوةً.** والفارق يُوزَّع **بالتناسب مع ما رُصد لكل
 * عميل** — فيكبر الجميع بنفس النسبة، ويبقى ترتيبهم وأوزانهم كما هو. ولا
 * يُوزَّع بالتساوي على الرؤوس: احتمال أن يكون العميل الكبير صاحبَ المشتريات
 * غير المرصودة أعلى من الصغير.
 *
 * **وشهرٌ بلا عميل واحد لا يُوزَّع عليه شيء** — لا عملاء ليُنسَب إليهم.
 * فيُنشأ له **عميل شهريّ مجمَّع** («عملاء المقطم — مارس ٢٠٢٢») يحمل إيراد
 * الشهر كلَّه، فيتساوى مجموع الإيراد بالعميل مع الدفتر ويبقى السجل صادقًا
 * يقول ما هو. وهذا حال يناير حتى أكتوبر ٢٠٢٢: ٥٤٪ من إيراد السنة رُصد
 * ماليًّا قبل أن يبدأ رصد المبيعات أصلًا.
 *
 * ── وثلاثة حدود لا تُتجاوَز ──────────────────────────────────
 *
 * ١) **التسوية شهرًا بشهر وداخل الفرع** — فلا يُنقل مال ديسمبر إلى فبراير،
 *    ولا وارد الإسكندرية إلى عملاء المقطم.
 * ٢) **القرش الأخير على آخر سطر** — فيطابق المجموع الدفترَ بالقرش لا
 *    بالتقريب.
 * ٣) **ولا تُحسب نسب مبيعات على المبالغ الموزَّعة** — وإلا استحقّ الموظفون
 *    نسبًا عن مالٍ نسبه النظام إليهم ولم يبيعوه.
 */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** وسم التسوية لسنةٍ — يُسحب فتعود الأرقام كما رصدها الشيت */
export function settleTag(year: number): string {
  return `settle-${year}`;
}

/**
 * مراكز الربحية العامّة — ما وقع عليها ليس لعميل بعينه.
 *
 * **وأهمّ ما في التسوية أنّ مراكز الربحية في الدفتر أسماءُ عملاء**: «مشروع
 * دار يتخيلون»، «مشروع قرآن هاوس»، «مشروع مركز سلام». وهذه ثلثا الإيراد —
 * تدخل بأرقامها كما كتبها المحاسب لا بتوزيعٍ بالتناسب. ولا يُوزَّع إلا ما
 * وقع على مركزٍ عامّ: المقرّ الإداري ونشاط الترجمة والمشروع العامّ.
 */
const GENERIC_CENTERS = [
  /^مشروع عام/,
  /^المقر الإداري/,
  /^نشاط الترجمة/,
  /^مركز التكلفة/,
  /**
   * **و«عملاء عامون» وعاءٌ لا اسم.**
   *
   * دفتر ٢٠٢٦ يضع عليه ٢٬٢٠٣٬٥٨٢ ج — وهو ثلثا إيراد السنة. ولو عُومل اسمَ
   * عميلٍ لوُلدت بطاقةٌ اسمُها «عملاء عامون» تحمل مليونين، فتتصدّر ترتيب
   * العملاء وتُقرأ قيمتُها العمرية وتُصنَّف — وهي ليست عميلًا أصلًا. والصواب
   * أن يُوزَّع على من رصدهم الشيت في شهره كما يُوزَّع «مشروع عام».
   */
  /^عملاء عامون/,
  /^عميل استراتيجي/,
  /^غير محدد/,
];

export function isGenericCenter(name: string | null | undefined): boolean {
  /**
   * **والتطويل يُنزع هنا أيضًا** ولو نُزع عند الحفظ: المحاسب يكتب
   * «نشــــــــــاط الترجمة»، ومطابقةٌ تعتمد على أن غيرها نظّف النصّ
   * تنكسر أول مرة يُقرأ فيها الاسم من مصدرٍ آخر.
   */
  const text = (name ?? '').replace(/ـ+/g, '').trim();
  if (!text) return true;
  return GENERIC_CENTERS.some((pattern) => pattern.test(text));
}

/**
 * حسابُ فروق العملة — يُستثنى من التسوية باللهجتين.
 *
 * **ربحُ صرفٍ لا مشترياتِ عميل**، ونسبتُه إلى عميل تكذب على سجلّه. وكانت
 * القاعدة تطابق النصّ العربيّ وحده (`فروق العملة`)، والمحاسب حوّل دفتره إلى
 * الإنجليزية في ٢٠٢٦ فكتبها `Foreign currency exchange gains and losses` —
 * فدخلت ١٨٬١٥٠ ج ربحَ صرفٍ في مشتريات العملاء صامتةً.
 *
 * **وهي المصيدة نفسها التي أوقعت قارئ الترويسة**: قاعدةٌ بلهجةٍ واحدة تكفّ
 * عن العمل في اليوم الذي يغيّر فيه المحاسب لغته، ولا شيء يُنبّه.
 */
const FX_ACCOUNT =
  /فروق\s*العملة|تحويلات\s*العملات|foreign\s*currency|exchange\s*(gain|difference)/i;

export function isFxAccount(name: string | null | undefined): boolean {
  return FX_ACCOUNT.test(String(name ?? ''));
}

/** «مشروع دار يتخيلون» ← «دار يتخيلون» — والباقي كما كتبه المحاسب */
export function clientNameOfCenter(center: string): string {
  return center.replace(/^\s*مشروع\s+/, '').trim() || center.trim();
}

// ═══════════════════════════════════════════════════════════════
//  المركز مشروعٌ، والعميل فوقه
// ═══════════════════════════════════════════════════════════════

/**
 * **ومركزُ الربحية مشروعٌ لا عميلًا بالضرورة.**
 *
 * قالها أحمد: «أسورة اليقين مشروع للعميل سلام أيضًا»، و«مع المصطفى مشروع
 * تابع لأكاديمية الأسرة للدكتور علي الشبيلي». فالعميل الواحد قد يكون له
 * عدة مشاريع، ولكلٍّ مركزُ ربحيةٍ في دفتر المحاسب.
 *
 * وبلا هذه الخريطة يصير العميلُ الواحد ثلاثةَ عملاء في سجلٍّ واحد: تنكسر
 * قيمتُه العمرية، ويسقط تصنيفُه، ويظهر ثلاث مرات في أي ترتيب.
 *
 * **وهي خريطةٌ تُكتب في الشاشة لا قاعدةٌ في الكود** — أحمد وحده يعرف أيّ
 * مشروعٍ لأيّ عميل، ولا يُستنتج ذلك من الأسماء. والتقريب هنا يخلط مالَ
 * عميلٍ بمالِ غيره.
 */
export const DEFAULT_CENTER_CLIENTS: [center: string, client: string][] = [
  // ── سلام ومشاريعه ──
  ['مركز سلام', 'سلام'],
  ['أسورة اليقين', 'سلام'],
  ['حقيبة سلام', 'سلام'],
  // ── أكاديمية الأسرة — د. علي الشبيلي ومشاريعه ──
  ['مع المصطفي', 'أكاديمية الأسرة — د. علي الشبيلي'],
  ['دبلومة الوالدية', 'أكاديمية الأسرة — د. علي الشبيلي'],
  ['دبلومة الزوجية', 'أكاديمية الأسرة — د. علي الشبيلي'],
  // ── وبقية عملاء المدير التنفيذي بأسمائهم الكاملة ──
  ['بصيرة', 'مؤسسة البصيرة'],
];

/** يقرأ الخريطة كما تُكتب في الشاشة: `اسم المركز = اسم العميل` سطرًا سطرًا */
export function parseCenterClients(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of (text ?? '').split(/\r?\n/)) {
    const at = line.indexOf('=');
    if (at < 0) continue;
    const center = clientNameOfCenter(line.slice(0, at).trim());
    const client = line.slice(at + 1).trim();
    // **والطرفان لازمان**: سطرٌ ناقصٌ يُتخطّى ولا يُنشئ عميلًا بلا اسم
    if (!center || !client) continue;
    map.set(centerKey(center), client);
  }
  return map;
}

/** مفتاح المطابقة: بلا تطويلٍ ولا فراغاتٍ زائدة — والحروف كما هي */
export function centerKey(name: string): string {
  return (name ?? '').replace(/ـ+/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * العميل صاحبُ هذا المركز.
 *
 * **والمطابقة بالاسم الصريح لا بالتقريب**: من كتب السطر يعرف ما يقصد،
 * وتخمينُ النظام على اسمٍ قريب يضمّ عميلًا إلى غيره بلا أن يطلب أحد.
 */
export function clientOfCenter(center: string, map: Map<string, string>): string {
  const name = clientNameOfCenter(center);
  return map.get(centerKey(name)) ?? name;
}

/** نصُّ الخريطة الابتدائيّ كما يُعرض في الشاشة */
export function centerClientsText(
  pairs: [string, string][] = DEFAULT_CENTER_CLIENTS
): string {
  return pairs.map(([center, client]) => `${center} = ${client}`).join('\n');
}

/** أسماء الشهور — تدخل اسم العميل المجمَّع فيقرؤه المالك بلا مفتاح */
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

/** «2022-03» تصير «مارس 2022» */
export function periodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  const name = MONTH_NAMES[month - 1];
  return name ? `${name} ${year}` : period;
}

/**
 * اسم العميل الشهريّ المجمَّع.
 *
 * **يقول ما هو صراحةً** — فمن يفتحه بعد سنتين يعرف أنه تجميعٌ لا شخص، ولا
 * يظنّه عميلًا يتّصل به.
 */
export function bucketClientName(branchLabel: string, period: string): string {
  return `عملاء ${branchLabel} — ${periodLabel(period)}`;
}

export type SalesRow = {
  /** مفتاح العميل في المصدر — الهاتف المطبَّع غالبًا */
  key: string;
  amount: number;
};

export type SettledRow = SalesRow & {
  /** بعد التسوية — وهو ما يدخل سجل العميل */
  settled: number;
};

export type MonthSettlement = {
  period: string;
  branch: string;
  /** إيراد الدفتر — الحقيقة */
  ledger: number;
  /** ما رصده المبيعات قبل التسوية */
  recorded: number;
  /** معامل التوسعة — `null` حين لا تسوية */
  factor: number | null;
  rows: SettledRow[];
  /** العميل المجمَّع حين لا عميل مرصودًا */
  bucket: { name: string; amount: number } | null;
  /**
   * حال الشهر — تُقرأ في تقرير الترحيل لا في شاشة يومية:
   *   settled     وُزّع الفارق بالتناسب
   *   bucketed    لا عميل مرصودًا، فأُنشئ عميل شهريّ مجمَّع
   *   exact       الرصد يطابق الدفتر — لا شيء يُفعل
   *   no_ledger   لا رقم في الدفتر لهذا الشهر، فلا أساس للتسوية
   */
  state: 'settled' | 'bucketed' | 'exact' | 'no_ledger';
};

/**
 * يسوّي شهرًا واحدًا في فرع واحد.
 *
 * **وبلا رقمٍ في الدفتر لا تسوية**: شهرٌ رصدت فيه المبيعات ولم يرصد المحاسب
 * شيئًا يبقى كما هو ويُقال. وتصفيرُه لأن الدفتر صامت يمحو بيعًا حدث فعلًا،
 * والصمت ليس رقمًا.
 */
export function settleMonth(input: {
  period: string;
  branch: string;
  branchLabel: string;
  ledger: number | null;
  rows: SalesRow[];
}): MonthSettlement {
  const rows = input.rows.filter((r) => Number.isFinite(r.amount) && r.amount > 0);
  const recorded = round2(rows.reduce((s, r) => s + r.amount, 0));
  const base = {
    period: input.period,
    branch: input.branch,
    ledger: round2(input.ledger ?? 0),
    recorded,
  };

  if (input.ledger === null || !Number.isFinite(input.ledger) || input.ledger <= 0) {
    return {
      ...base,
      factor: null,
      rows: rows.map((r) => ({ ...r, settled: round2(r.amount) })),
      bucket: null,
      state: 'no_ledger',
    };
  }

  const ledger = round2(input.ledger);

  // لا عميل مرصودًا: الشهر كلّه على عميل مجمَّع باسمه الصريح
  if (rows.length === 0 || recorded <= 0) {
    return {
      ...base,
      ledger,
      factor: null,
      rows: [],
      bucket: { name: bucketClientName(input.branchLabel, input.period), amount: ledger },
      state: 'bucketed',
    };
  }

  if (Math.abs(ledger - recorded) < 0.01) {
    return {
      ...base,
      ledger,
      factor: 1,
      rows: rows.map((r) => ({ ...r, settled: round2(r.amount) })),
      bucket: null,
      state: 'exact',
    };
  }

  const factor = ledger / recorded;
  const settled = rows.map((r) => ({ ...r, settled: round2(r.amount * factor) }));

  // **القرش الأخير على آخر سطر** — فيطابق المجموع الدفتر بالضبط
  const drift = round2(ledger - settled.reduce((s, r) => s + r.settled, 0));
  settled[settled.length - 1].settled = round2(settled[settled.length - 1].settled + drift);

  return {
    ...base,
    ledger,
    factor,
    rows: settled,
    bucket: null,
    state: 'settled',
  };
}

export type SettlementPlan = {
  months: MonthSettlement[];
  totals: {
    ledger: number;
    recorded: number;
    settled: number;
    /** ما حملته العملاء المجمَّعة — الشهور التي سبقت رصد المبيعات */
    bucketed: number;
    bucketCount: number;
  };
};

/** يسوّي كل الشهور، ويجمع ما صار عليه الحال */
export function buildPlan(months: MonthSettlement[]): SettlementPlan {
  const settledTotal = months.reduce(
    (s, m) => s + m.rows.reduce((t, r) => t + r.settled, 0) + (m.bucket?.amount ?? 0),
    0
  );
  return {
    months,
    totals: {
      ledger: round2(months.reduce((s, m) => s + m.ledger, 0)),
      recorded: round2(months.reduce((s, m) => s + m.recorded, 0)),
      settled: round2(settledTotal),
      bucketed: round2(months.reduce((s, m) => s + (m.bucket?.amount ?? 0), 0)),
      bucketCount: months.filter((m) => m.bucket).length,
    },
  };
}
