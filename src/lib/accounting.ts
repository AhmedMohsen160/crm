/**
 * المحاسبة — الوحدة الخالصة (`docs/FINANCE-SPEC.md`).
 *
 * لا تلمس قاعدة بيانات. كل ما فيها معادلات وقواعد تُختبر بأرقامها الحرفية،
 * وعلى رأسها القاعدة التي لا يقوم بدونها دفتر: **مجموع المدين = مجموع
 * الدائن**.
 */

import { money, toPiastres, fromPiastres } from './money';

// ── أنواع الحسابات ─────────────────────────────────────────────

export const ACCOUNT_TYPES = {
  asset: 'أصول',
  liability: 'التزامات',
  equity: 'حقوق ملكية',
  revenue: 'إيرادات',
  expense: 'مصروفات',
} as const;
export type AccountType = keyof typeof ACCOUNT_TYPES;

/**
 * الطبيعة المدينة أو الدائنة لكل نوع.
 *
 * الأصول والمصروفات تزيد بالمدين؛ الالتزامات وحقوق الملكية والإيرادات تزيد
 * بالدائن. عليها يقوم حساب الرصيد وإشارة كل سطر في ميزان المراجعة.
 */
export const NORMAL_BALANCE: Record<AccountType, 'debit' | 'credit'> = {
  asset: 'debit',
  expense: 'debit',
  liability: 'credit',
  equity: 'credit',
  revenue: 'credit',
};

/** المصروفات ثلاثة بنود — قرار الإدارة وهيكل الدفاتر الفعلي */
export const EXPENSE_GROUPS = {
  selling_marketing: 'مصاريف بيعية وتسويقية',
  general_admin: 'مصاريف عمومية وإدارية',
  production_operating: 'مصاريف تشغيلية وإنتاجية',
} as const;
export type ExpenseGroup = keyof typeof EXPENSE_GROUPS;

/**
 * تصنيف الإيراد. يستخدم **نفس العمود** الذي يحمل بند المصروف، لأن كليهما
 * إجابة عن سؤال واحد: «أين يقع هذا الحساب في قائمة الدخل؟».
 *
 * و«إيرادات أخرى» ليست تفصيلة: فروق العملة تُعرض **بعد** صافي الربح في
 * دفاتر فاست ترانس، فخلطها بإيراد الخدمات يرفع الهامش المجمل زورًا.
 */
export const REVENUE_GROUPS = {
  service_revenue: 'إيرادات الخدمات',
  other_income: 'إيرادات أخرى',
} as const;
export type RevenueGroup = keyof typeof REVENUE_GROUPS;

/** بند قائمة الدخل — مصروف أو إيراد */
export type StatementGroup = ExpenseGroup | RevenueGroup;

export function isOtherIncome(group: string | null | undefined): boolean {
  return group === 'other_income';
}

export const DOCUMENT_TYPES = {
  unspecified: 'غير محدد',
  e_invoice: 'فاتورة إلكترونية',
  proforma: 'فاتورة مبدئية',
  credit_note: 'إشعار خصم',
  receipt: 'إيصال قبض',
  payment_voucher: 'إذن صرف',
  journal: 'قيد يومية',
} as const;
export type DocumentType = keyof typeof DOCUMENT_TYPES;

export const ENTRY_STATUSES = {
  draft: 'مسوَّدة',
  posted: 'مرحَّل',
  void: 'ملغى',
} as const;
export type EntryStatus = keyof typeof ENTRY_STATUSES;

// ── توازن القيد ────────────────────────────────────────────────

export type LineInput = {
  accountId: string;
  debit: number;
  credit: number;
};

export type BalanceCheck = {
  totalDebit: number;
  totalCredit: number;
  difference: number;
  balanced: boolean;
  /** أسباب رفض القيد — كلها تُعرض، لا أولها */
  problems: string[];
};

/** تقريب لقرشين — الفرق الأصغر منه كسرُ حساب لا خطأ إدخال */
const CENT = 0.005;
/**
 * تثبيت المبلغ على قرشٍ صحيح.
 *
 * **يبقى بهذا الاسم** لأنه مستعمل في عشرات المواضع، وصار يفوّض إلى وحدة
 * المال الخالصة فلا يبقى تعريفان لقاعدة واحدة.
 */
export function round2(value: number): number {
  return money(value);
}

/**
 * **القاعدة التي لا يقوم بدونها دفتر.**
 *
 * ويرفض معها: السطر الفارغ (لا مدين ولا دائن)، والسطر الذي يحمل الاثنين
 * معًا (خطأ إدخال شائع يوهم بالتوازن)، والقيمة السالبة (تُعكس بتبديل
 * العمودين لا بإشارة)، والقيد بسطر واحد.
 */
export function checkBalance(lines: LineInput[]): BalanceCheck {
  const problems: string[] = [];
  /**
   * **المجموع بالقرش الصحيح لا بالجنيه العائم.** جمعُ ثمانين سطرًا بـ`+`
   * ينحرف بكسرٍ لا يُرى في القيد الواحد ويتراكم عبر آلاف القيود حتى يُخرج
   * ميزان المراجعة عن التوازن — وقد وقع ذلك بقرش بعد ترحيل ٢٬٢٤٧ قيدًا.
   */
  let debitPiastres = 0;
  let creditPiastres = 0;

  lines.forEach((line, i) => {
    const debit = Number(line.debit) || 0;
    const credit = Number(line.credit) || 0;
    const at = `السطر ${i + 1}`;

    if (debit < 0 || credit < 0) {
      problems.push(`${at}: لا مبالغ سالبة — العكس يكون بتبديل المدين والدائن`);
    }
    if (debit > 0 && credit > 0) {
      problems.push(`${at}: لا يجتمع مدين ودائن في سطر واحد`);
    }
    if (debit === 0 && credit === 0) {
      problems.push(`${at}: سطر بلا مبلغ`);
    }
    if (!line.accountId) {
      problems.push(`${at}: بلا حساب`);
    }

    debitPiastres += toPiastres(Math.max(0, debit));
    creditPiastres += toPiastres(Math.max(0, credit));
  });

  if (lines.length < 2) {
    problems.push('القيد المزدوج يحتاج سطرين على الأقل');
  }

  const totalDebit = fromPiastres(debitPiastres);
  const totalCredit = fromPiastres(creditPiastres);
  const difference = fromPiastres(debitPiastres - creditPiastres);
  // التوازن صار مقارنةَ عددين صحيحين — لا «فرقًا أصغر من قرش»
  const balanced = debitPiastres === creditPiastres;

  if (!balanced) {
    problems.push(
      `القيد غير متوازن: المدين ${totalDebit} والدائن ${totalCredit} والفرق ${difference}`
    );
  }

  return { totalDebit, totalCredit, difference, balanced, problems };
}

// ── الأرصدة ────────────────────────────────────────────────────

/**
 * رصيد حساب من مجموع مدينه ودائنه، **بإشارة طبيعته**.
 *
 * حساب إيراد دائنه ١٠٠٠ ومدينه ٢٠٠ رصيده ٨٠٠ موجب — لا سالب. الخلط هنا
 * يقلب كل قائمة دخل.
 */
export function accountBalance(
  type: AccountType,
  totalDebit: number,
  totalCredit: number
): number {
  return NORMAL_BALANCE[type] === 'debit'
    ? round2(totalDebit - totalCredit)
    : round2(totalCredit - totalDebit);
}

export type TrialRow = {
  accountId: string;
  type: AccountType;
  debit: number;
  credit: number;
};

export type TrialBalance = {
  rows: (TrialRow & { balance: number; side: 'debit' | 'credit' })[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
};

/**
 * ميزان المراجعة. **مجموعا العمودين يجب أن يتساويا** — وإن لم يتساويا فالخلل
 * في الترحيل لا في التقرير، فنقولها صراحةً بدل إخفائها.
 */
export function trialBalance(rows: TrialRow[]): TrialBalance {
  const out = rows.map((r) => {
    const balance = accountBalance(r.type, r.debit, r.credit);
    return {
      ...r,
      balance: Math.abs(balance),
      side: (balance >= 0 ? NORMAL_BALANCE[r.type] : NORMAL_BALANCE[r.type] === 'debit' ? 'credit' : 'debit') as
        | 'debit'
        | 'credit',
    };
  });

  const totalDebit = round2(
    out.filter((r) => r.side === 'debit').reduce((s, r) => s + r.balance, 0)
  );
  const totalCredit = round2(
    out.filter((r) => r.side === 'credit').reduce((s, r) => s + r.balance, 0)
  );

  return {
    rows: out,
    totalDebit,
    totalCredit,
    balanced: Math.abs(round2(totalDebit - totalCredit)) < CENT,
  };
}

// ── قائمة الدخل ────────────────────────────────────────────────

export type PLInput = {
  revenue: number;
  /** مصاريف تشغيلية وإنتاجية — تكلفة الخدمة المباعة */
  productionOperating: number;
  sellingMarketing: number;
  generalAdmin: number;
  /** فروق العملة وغيرها — تُعرض بعد الصافي التشغيلي كما في الدفاتر */
  otherIncome?: number;
};

export type PLResult = {
  revenue: number;
  productionOperating: number;
  grossProfit: number;
  grossMarginPct: number;
  sellingMarketing: number;
  generalAdmin: number;
  totalOperatingExpenses: number;
  netProfit: number;
  netMarginPct: number;
  otherIncome: number;
  finalNetProfit: number;
  /** نسبة كل بند من الإيراد — هيكل المصروف الذي يُقارَن سنة بسنة */
  structure: {
    productionOperatingPct: number;
    sellingMarketingPct: number;
    generalAdminPct: number;
    totalPct: number;
  };
};

const pct = (part: number, whole: number) => (whole === 0 ? 0 : part / whole);

/**
 * قائمة الدخل بترتيب الدفاتر الفعلي:
 *
 * ```
 * مجمل الربح   = الإيراد − المصاريف التشغيلية والإنتاجية
 * صافي الربح   = مجمل الربح − (البيعية والتسويقية + العمومية والإدارية)
 * الصافي النهائي = صافي الربح + إيرادات أخرى (فروق العملة)
 * ```
 *
 * **المصروف التشغيلي وحده يدخل مجمل الربح** — لأنه تكلفة الخدمة المباعة.
 * إدخال الإداري فيه يخفض الهامش المجمل ويُفقد القدرة على مقارنة التسعير.
 */
export function incomeStatement(input: PLInput): PLResult {
  const revenue = round2(input.revenue);
  const productionOperating = round2(input.productionOperating);
  const sellingMarketing = round2(input.sellingMarketing);
  const generalAdmin = round2(input.generalAdmin);
  const otherIncome = round2(input.otherIncome ?? 0);

  const grossProfit = round2(revenue - productionOperating);
  const totalOperatingExpenses = round2(
    productionOperating + sellingMarketing + generalAdmin
  );
  const netProfit = round2(grossProfit - sellingMarketing - generalAdmin);
  const finalNetProfit = round2(netProfit + otherIncome);

  return {
    revenue,
    productionOperating,
    grossProfit,
    grossMarginPct: pct(grossProfit, revenue),
    sellingMarketing,
    generalAdmin,
    totalOperatingExpenses,
    netProfit,
    netMarginPct: pct(netProfit, revenue),
    otherIncome,
    finalNetProfit,
    structure: {
      productionOperatingPct: pct(productionOperating, revenue),
      sellingMarketingPct: pct(sellingMarketing, revenue),
      generalAdminPct: pct(generalAdmin, revenue),
      totalPct: pct(totalOperatingExpenses, revenue),
    },
  };
}

// ── الموازنة والانحراف ─────────────────────────────────────────

export type VarianceResult = {
  budget: number;
  actual: number;
  /** الفرق بالمعنى **الإداري** لا الحسابي — انظر الشرح */
  variance: number;
  variancePct: number;
  favourable: boolean;
};

/**
 * انحراف الموازنة.
 *
 * **الإشارة تتبع المعنى لا الطرح:** تجاوز الإيراد موازنته مكسب، وتجاوز
 * المصروف موازنته خسارة. لذلك يُحسب الانحراف للإيراد `فعلي − موازنة`
 * وللمصروف `موازنة − فعلي`، فيصير الموجب دائمًا في صالح الشركة، ويقرأ
 * المدير عمودًا واحدًا بلا أن يتذكّر نوع الحساب.
 */
export function budgetVariance(
  type: AccountType,
  budget: number,
  actual: number
): VarianceResult {
  const isIncomeLike = type === 'revenue';
  const variance = round2(isIncomeLike ? actual - budget : budget - actual);
  return {
    budget: round2(budget),
    actual: round2(actual),
    variance,
    variancePct: budget === 0 ? 0 : variance / Math.abs(budget),
    favourable: variance >= 0,
  };
}

/** يوزّع مستهدفًا سنويًا على شهور — بالتساوي أو بأوزان شهرية */
export function spreadAnnual(
  annual: number,
  weights?: number[]
): number[] {
  const months = 12;
  if (!weights || weights.length !== months) {
    const each = round2(annual / months);
    const out = Array(months).fill(each);
    // الفرق الناتج عن التقريب يُحمَّل على الشهر الأخير فيطابق المجموع تمامًا
    out[months - 1] = round2(annual - each * (months - 1));
    return out;
  }

  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return spreadAnnual(annual);

  const out = weights.map((w) => round2((annual * w) / total));
  const drift = round2(annual - out.reduce((s, v) => s + v, 0));
  out[months - 1] = round2(out[months - 1] + drift);
  return out;
}

// ── الإهلاك ────────────────────────────────────────────────────

/**
 * قسط الإهلاك الشهري بطريقة القسط الثابت.
 *
 * ```
 * القسط الشهري = التكلفة × النسبة السنوية ÷ ١٢
 * ```
 *
 * **ولا يتجاوز المجمّع تكلفة الأصل أبدًا.** أصل بلغ إهلاكه تكلفته يتوقف
 * قسطه، وإلا صار مجمّع الإهلاك أكبر من الأصل وظهرت قيمة دفترية سالبة.
 */
export function monthlyDepreciation(params: {
  cost: number;
  annualRate: number;
  accumulated: number;
  /** القيمة المتبقية المقدَّرة — تُطرح من الأساس القابل للإهلاك */
  salvage?: number;
}): number {
  const { cost, annualRate, accumulated } = params;
  const salvage = params.salvage ?? 0;
  if (cost <= 0 || annualRate <= 0) return 0;

  const depreciable = Math.max(0, cost - salvage);
  const remaining = round2(depreciable - accumulated);
  if (remaining <= 0) return 0;

  return round2(Math.min((cost * annualRate) / 12, remaining));
}

/** القيمة الدفترية = التكلفة − مجمّع الإهلاك، ولا تنزل تحت الصفر */
export function bookValue(cost: number, accumulated: number): number {
  return round2(Math.max(0, cost - accumulated));
}

/** عدد الشهور بين تاريخين شاملًا شهر البداية — يُستخدم للاستكمال بأثر رجعي */
export function monthsBetween(from: Date, to: Date): number {
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return Math.max(0, months);
}

// ── تحليلات الاكتساب ───────────────────────────────────────────

/**
 * تكلفة اكتساب العميل. **تعريفها يتغيّر بتغيّر البسط والمقام**، ولذلك
 * تُحسب بثلاثة تعريفات لا واحد — كما فعل المحاسب في دفاتره:
 *
 *   ١) إنفاق قناة ÷ عملاء تلك القناة
 *   ٢) الإنفاق الأورجانيك ÷ العملاء الأورجانيك
 *   ٣) كل مصاريف التسويق والمبيعات ÷ كل العملاء الجدد
 *
 * وبلا عملاء لا تُقسَّم على صفر: تعود `null` وتُعرض «لا بيانات» — والصفر
 * هنا كذبة صريحة.
 */
export function cac(spend: number, customers: number): number | null {
  if (!customers || customers <= 0) return null;
  return round2(spend / customers);
}

/** عائد الإنفاق الإعلاني: إيراد القناة ÷ إنفاقها */
export function roas(revenue: number, spend: number): number | null {
  if (!spend || spend <= 0) return null;
  return round2(revenue / spend);
}

/** نمو سنة على سنة — والقسمة على صفر تعني «لا خط أساس» لا نموًّا لانهائيًا */
export function yoyGrowth(current: number, previous: number): number | null {
  if (!previous || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

// ── الفترات ────────────────────────────────────────────────────

/** `YYYY-MM` من تاريخ */
export function fiscalMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** الربع الميلادي `YYYY-Qn` */
export function fiscalQuarter(date: Date): string {
  return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
}

export function monthRange(period: string): { start: Date; end: Date } {
  const [year, month] = period.split('-').map(Number);
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 1),
  };
}

export function yearRange(year: number): { start: Date; end: Date } {
  return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) };
}

const MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month);
}

/** ينقل مفتاح الشهر أشهرًا للأمام أو للخلف — ويعبر السنة صحيحًا */
export function shiftMonth(period: string, delta: number): string {
  const [year, month] = period.split('-').map(Number);
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function fiscalMonthLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return `${monthName(month)} ${year}`;
}

// ── تحويل العملات ──────────────────────────────────────────────

/**
 * يحوّل مبلغًا إلى العملة الأساس.
 *
 * **السعر يُخزَّن على القيد نفسه** لا يُقرأ من الإعدادات وقت التقرير: قيد
 * محرَّر بسعر ٤٨ يبقى بـ٤٨ مهما تغيّر السعر غدًا، وإلا تغيّرت أرباح الماضي
 * كلما تحرّك الدولار.
 */
export function toBase(amount: number, fxRate: number): number {
  if (!Number.isFinite(amount)) return 0;
  const rate = Number.isFinite(fxRate) && fxRate > 0 ? fxRate : 1;
  return round2(amount * rate);
}
