/**
 * بناء الموازنة السنوية — القواعد الخالصة.
 *
 * الخطوات السبع التي أقرّتها الإدارة، منفَّذةً لا مشروحةً: كل خطوة هنا دالّة
 * تأخذ أرقامًا وتعيد أرقامًا، فتُختبر بلا قاعدة بيانات ويُبنى عليها قرار.
 *
 * والفرق بين موازنة تُملأ يدويًا وموازنة تُبنى: الأولى رقمٌ يُكتب في خانة،
 * والثانية رقمٌ **مشتقّ من تاريخ الشركة** ومنسوب إلى فرضية معلنة.
 */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════
//  الخطوات السبع
// ═══════════════════════════════════════════════════════════════

export type BudgetStep = {
  key: string;
  order: number;
  title: string;
  body: string;
  /** ما يجب أن يكون جاهزًا لتُعدّ الخطوة منجزة */
  done: string;
};

export const BUDGET_STEPS: BudgetStep[] = [
  {
    key: 'history',
    order: 1,
    title: 'تحليل البيانات المالية السابقة',
    body: 'اقرأ فعليّ آخر اثني عشر شهرًا لكل حساب: نمط الإنفاق، والاتجاه، والموسمية.',
    done: 'ظهر لكل حساب فعليّ العام الماضي وتوزيعه على الشهور.',
  },
  {
    key: 'revenue',
    order: 2,
    title: 'توقّع الإيرادات والمبيعات',
    body: 'قدّر المبيعات المتوقعة من العقود القائمة وأداء المندوبين واتجاه السوق.',
    done: 'لكل حساب إيراد مستهدف موزَّع على الشهور.',
  },
  {
    key: 'fixed',
    order: 3,
    title: 'تحديد التكاليف الثابتة',
    body: 'احصر ما لا يتغيّر بحجم الإنتاج: الإيجارات والرواتب والاشتراكات والتأمينات.',
    done: 'كل حساب مصروف مصنَّف ثابتًا أو متغيّرًا، ولا حساب بلا تصنيف.',
  },
  {
    key: 'variable',
    order: 4,
    title: 'تقدير التكاليف المتغيّرة',
    body: 'قدّر ما يرتبط بحجم المبيعات: أتعاب الفريلانسرز، والعمولات، ومصاريف التشغيل.',
    done: 'المتغيّر مقدَّر كنسبة من الإيراد المستهدف لا كرقم مستقلّ عنه.',
  },
  {
    key: 'margin',
    order: 5,
    title: 'حساب هامش الربح والتدفق النقدي',
    body: 'اطرح التكاليف من الإيرادات، وتتبّع الرصيد شهرًا بشهر لتضمن سيولة العام كلّه.',
    done: 'ظهر الهامش المخطَّط، ولا شهر برصيد تراكمي سالب.',
  },
  {
    key: 'contingency',
    order: 6,
    title: 'الاستعداد للطوارئ',
    body: 'خصّص نسبة من المصروفات صندوقًا للطوارئ يواجه ما لم يكن في الحسبان.',
    done: 'نسبة الطوارئ مضبوطة وظاهرة في الإجمالي.',
  },
  {
    key: 'review',
    order: 7,
    title: 'المراجعة والتعديل الدوري',
    body: 'قارن الموازنة بالفعلي شهريًا وربعيًا، وصحّح الانحراف قبل أن يتراكم.',
    done: 'جدول الانحراف مقروء، والانحرافات الكبيرة لها سبب مكتوب.',
  },
];

export function stepByKey(key: string): BudgetStep | undefined {
  return BUDGET_STEPS.find((s) => s.key === key);
}

// ═══════════════════════════════════════════════════════════════
//  ١ · قراءة التاريخ
// ═══════════════════════════════════════════════════════════════

export type MonthlyHistory = {
  accountId: string;
  /** اثنا عشر رقمًا: يناير … ديسمبر */
  months: number[];
};

/** مجموع سنة من توزيعها الشهري */
export function annualOf(months: number[]): number {
  return round2(months.reduce((sum, m) => sum + (Number.isFinite(m) ? m : 0), 0));
}

/**
 * وزن كل شهر من إجمالي السنة — **شكل الموسمية**.
 *
 * هذا ما يفرق موازنةً تُبنى عن موازنةٍ تُقسَّم على اثني عشر: مكتب الترجمة له
 * موسم، وتوزيع مبلغ العام بالتساوي يُنتج انحرافًا شهريًا لا يعني شيئًا.
 * وحين لا يكون للسنة الماضية أثر، نرجع للتساوي — وهو صريحٌ لا مخفيّ.
 */
export function seasonalWeights(months: number[]): number[] {
  const total = annualOf(months);
  if (!total) return Array(12).fill(1 / 12);
  return months.map((m) => (Number.isFinite(m) && m > 0 ? m / total : 0));
}

/** يوزّع مبلغًا سنويًا بشكل موسمية معطاة — والفارق يذهب لآخر شهر */
export function spreadBy(annual: number, weights: number[]): number[] {
  const usable = weights.length === 12 ? weights : Array(12).fill(1 / 12);
  const sum = usable.reduce((s, w) => s + w, 0) || 1;

  const out = usable.map((w) => round2((annual * w) / sum));
  const drift = round2(annual - out.reduce((s, v) => s + v, 0));
  if (drift) out[11] = round2(out[11] + drift);
  return out;
}

/** موازنة السنة القادمة من فعليّ الماضية بنسبة نمو */
export function fromLastYear(
  lastYear: number[],
  growthPct: number,
  keepSeasonality = true
): number[] {
  const annual = round2(annualOf(lastYear) * (1 + growthPct / 100));
  return spreadBy(annual, keepSeasonality ? seasonalWeights(lastYear) : Array(12).fill(1 / 12));
}

// ═══════════════════════════════════════════════════════════════
//  ٣ و٤ · التكاليف الثابتة والمتغيّرة
// ═══════════════════════════════════════════════════════════════

export const COST_BEHAVIOURS = {
  fixed: 'ثابتة',
  variable: 'متغيّرة',
} as const;
export type CostBehaviour = keyof typeof COST_BEHAVIOURS;

/**
 * تخمين سلوك التكلفة من اسم الحساب — **اقتراح يُراجَع لا حكم**.
 *
 * الإيجار والرواتب والاشتراكات لا تتغيّر بحجم الإنتاج؛ وأتعاب الفريلانسرز
 * والعمولات تتغيّر معه مباشرةً. وما لم يُعرف يُترك بلا تصنيف — والفراغ هنا
 * سؤالٌ معروض على المحاسب، لا افتراض صامت.
 */
const FIXED_HINTS =
  /إيجار|رواتب|راتب|تأمين|اشتراك|رخص|صيانة دورية|إهلاك|كهرباء|مياه|إنترنت|حراسة|نظافة/;
const VARIABLE_HINTS =
  /فريلانس|مترجم|خارجي|عمولة|عمولات|إعلان|تسويق|شحن|طباعة|توصيل|مصاريف بنكية|رسوم تحويل/;

export function guessBehaviour(accountName: string): CostBehaviour | null {
  const name = accountName ?? '';
  if (VARIABLE_HINTS.test(name)) return 'variable';
  if (FIXED_HINTS.test(name)) return 'fixed';
  return null;
}

export type BehaviourSplit = { fixed: number; variable: number; unclassified: number };

export function splitByBehaviour(
  rows: { amount: number; behaviour: string | null }[]
): BehaviourSplit {
  const out: BehaviourSplit = { fixed: 0, variable: 0, unclassified: 0 };
  for (const row of rows) {
    if (row.behaviour === 'fixed') out.fixed += row.amount;
    else if (row.behaviour === 'variable') out.variable += row.amount;
    else out.unclassified += row.amount;
  }
  return { fixed: round2(out.fixed), variable: round2(out.variable), unclassified: round2(out.unclassified) };
}

/**
 * التكلفة المتغيّرة كنسبة من الإيراد.
 *
 * هي الرقم الذي يجعل الخطوة الرابعة **مقيسة لا مقدَّرة**: إن كانت أتعاب
 * الفريلانسرز ٣٥٪ من الإيراد العام الماضي، فالمتوقَّع أن تبقى كذلك ما لم
 * يتغيّر نمط التشغيل.
 */
export function variableRatio(variableCost: number, revenue: number): number | null {
  if (!revenue || revenue <= 0) return null;
  return round2(variableCost / revenue);
}

// ═══════════════════════════════════════════════════════════════
//  ٥ · الهامش والتدفق النقدي
// ═══════════════════════════════════════════════════════════════

export type CashflowMonth = {
  month: number;
  revenue: number;
  expense: number;
  net: number;
  /** الرصيد التراكمي من أول العام */
  running: number;
};

/**
 * التدفق النقدي شهرًا بشهر.
 *
 * الشهر السالب وحده لا يقلق — والرصيد التراكمي السالب يقلق: هو اللحظة التي
 * لا يجد فيها المكتب ما يدفع به الرواتب.
 */
export function cashflow(
  revenue: number[],
  expense: number[],
  openingBalance = 0
): CashflowMonth[] {
  let running = openingBalance;
  const out: CashflowMonth[] = [];
  for (let m = 0; m < 12; m++) {
    const r = round2(revenue[m] ?? 0);
    const e = round2(expense[m] ?? 0);
    const net = round2(r - e);
    running = round2(running + net);
    out.push({ month: m + 1, revenue: r, expense: e, net, running });
  }
  return out;
}

/** أول شهر يصير فيه الرصيد التراكمي سالبًا — أو `null` إن لم يقع */
export function firstShortfall(rows: CashflowMonth[]): CashflowMonth | null {
  return rows.find((r) => r.running < 0) ?? null;
}

export type MarginPlan = {
  revenue: number;
  fixed: number;
  variable: number;
  contingency: number;
  totalCost: number;
  grossMargin: number;
  marginPct: number | null;
  /** الإيراد الذي يتعادل عنده الربح بصفر */
  breakEven: number | null;
};

/**
 * خلاصة الخطوة الخامسة مع نقطة التعادل.
 *
 * `نقطة التعادل = التكاليف الثابتة ÷ (١ − نسبة التكلفة المتغيّرة)`
 *
 * وتعود `null` حين تبلغ التكلفة المتغيّرة الإيراد أو تتجاوزه: عندها لا يوجد
 * حجمُ مبيعاتٍ يُنقذ الموازنة، والمشكلة في السعر لا في الحجم — ورقمٌ ضخم في
 * الخانة يخفي هذا المعنى.
 */
export function marginPlan(params: {
  revenue: number;
  fixed: number;
  variable: number;
  contingencyPct: number;
}): MarginPlan {
  const { revenue, fixed, variable } = params;
  const contingency = round2((fixed + variable) * (params.contingencyPct / 100));
  const totalCost = round2(fixed + variable + contingency);
  const grossMargin = round2(revenue - totalCost);

  const varRatio = revenue > 0 ? variable / revenue : 1;
  const breakEven = varRatio >= 1 ? null : round2((fixed + contingency) / (1 - varRatio));

  return {
    revenue: round2(revenue),
    fixed: round2(fixed),
    variable: round2(variable),
    contingency,
    totalCost,
    grossMargin,
    marginPct: revenue > 0 ? round2(grossMargin / revenue) : null,
    breakEven,
  };
}

// ═══════════════════════════════════════════════════════════════
//  ٦ · صندوق الطوارئ
// ═══════════════════════════════════════════════════════════════

/** النسب الشائعة — اقتراحات في الشاشة لا قيد */
export const CONTINGENCY_PRESETS = [3, 5, 10];

export function contingencyAmount(expenses: number, pct: number): number {
  return round2(expenses * (Math.max(0, pct) / 100));
}

// ═══════════════════════════════════════════════════════════════
//  ٧ · المراجعة الدورية
// ═══════════════════════════════════════════════════════════════

export const QUARTERS = ['الربع الأول', 'الربع الثاني', 'الربع الثالث', 'الربع الرابع'];

export function quarterOfMonth(month: number): number {
  return Math.min(4, Math.max(1, Math.ceil(month / 3)));
}

export type QuarterRow = {
  quarter: number;
  label: string;
  budget: number;
  actual: number;
  variance: number;
  variancePct: number | null;
};

/**
 * الموازنة مقابل الفعلي بالربع.
 *
 * `variance` **موجبٌ يعني في صالح الشركة دائمًا**: تجاوز الإيراد موازنته
 * مكسب، وتوفير المصروف عنها مكسب كذلك. فلا يحتاج القارئ أن يتذكّر نوع
 * الحساب ليقرأ إشارة العمود.
 */
export function quarterlyReview(
  budgetMonths: number[],
  actualMonths: number[],
  isRevenue: boolean
): QuarterRow[] {
  const out: QuarterRow[] = [];
  for (let q = 1; q <= 4; q++) {
    const from = (q - 1) * 3;
    const budget = round2(budgetMonths.slice(from, from + 3).reduce((s, v) => s + (v || 0), 0));
    const actual = round2(actualMonths.slice(from, from + 3).reduce((s, v) => s + (v || 0), 0));
    const variance = round2(isRevenue ? actual - budget : budget - actual);
    out.push({
      quarter: q,
      label: QUARTERS[q - 1],
      budget,
      actual,
      variance,
      variancePct: budget ? round2(variance / budget) : null,
    });
  }
  return out;
}

/** الانحراف الذي يستحق تفسيرًا — ما تجاوز العُشر */
export const MATERIAL_VARIANCE = 0.1;

export function isMaterial(variancePct: number | null): boolean {
  if (variancePct === null) return false;
  return Math.abs(variancePct) >= MATERIAL_VARIANCE;
}

/** حال إنجاز الخطوات — تُحسب من البيانات لا تُعلَّم يدويًا */
export type StepState = { key: string; done: boolean; note: string };

export function stepStates(facts: {
  hasHistory: boolean;
  revenueBudgeted: number;
  expenseAccounts: number;
  classifiedAccounts: number;
  variableBudgeted: number;
  contingencyPct: number;
  hasActuals: boolean;
  shortfallMonth: number | null;
}): StepState[] {
  const unclassified = Math.max(0, facts.expenseAccounts - facts.classifiedAccounts);
  return [
    {
      key: 'history',
      done: facts.hasHistory,
      note: facts.hasHistory ? 'فعليّ العام الماضي متاح' : 'لا قيود مرحَّلة للعام الماضي',
    },
    {
      key: 'revenue',
      done: facts.revenueBudgeted > 0,
      note: facts.revenueBudgeted > 0 ? 'الإيراد المستهدف مضبوط' : 'لم يُضبط إيراد مستهدف بعد',
    },
    {
      key: 'fixed',
      done: facts.expenseAccounts > 0 && unclassified === 0,
      note: unclassified ? `${unclassified} حسابًا بلا تصنيف` : 'كل حسابات المصروف مصنَّفة',
    },
    {
      key: 'variable',
      done: facts.variableBudgeted > 0,
      note: facts.variableBudgeted > 0 ? 'المتغيّر مقدَّر' : 'لم تُقدَّر تكلفة متغيّرة',
    },
    {
      key: 'margin',
      done: facts.revenueBudgeted > 0 && facts.shortfallMonth === null,
      note:
        facts.shortfallMonth !== null
          ? `الرصيد التراكمي يصير سالبًا في الشهر ${facts.shortfallMonth}`
          : 'لا عجز في الرصيد التراكمي',
    },
    {
      key: 'contingency',
      done: facts.contingencyPct > 0,
      note: facts.contingencyPct > 0 ? `${facts.contingencyPct}% للطوارئ` : 'لم تُخصَّص نسبة طوارئ',
    },
    {
      key: 'review',
      done: facts.hasActuals,
      note: facts.hasActuals ? 'الفعليّ يُقارَن بالموازنة' : 'لا فعليّ بعد لهذه السنة',
    },
  ];
}
