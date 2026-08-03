/**
 * قواعد الموارد البشرية الخالصة — بلا قاعدة بيانات ولا شبكة.
 *
 * الأجر هنا **بنود بتاريخ سريان** لا رقم واحد: الأساسي والبدلات والحوافز
 * والاستقطاعات. وزيادةُ راتبٍ هذا الشهر لا تُعيد كتابة كشف الشهر الماضي،
 * كما أن تعديل سعر اليوم لا يغيّر فاتورة الماضي (§٤).
 */

// ═══════════════════════════════════════════════════════════════
//  التصنيفات
// ═══════════════════════════════════════════════════════════════

export const EMPLOYMENT_TYPES = {
  full_time: 'دوام كامل',
  part_time: 'دوام جزئي',
  contract: 'بعقد',
  freelance: 'بالقطعة',
  intern: 'تدريب',
} as const;
export type EmploymentType = keyof typeof EMPLOYMENT_TYPES;

/**
 * أنواع بنود الأجر.
 *
 * الترتيب مقصود: هو ترتيب ظهورها في كشف الراتب، ومن ثمّ ترتيب حسابها.
 */
export const COMPONENT_KINDS = {
  basic: 'أساسي',
  allowance: 'بدل',
  incentive: 'حافز',
  bonus: 'مكافأة',
  deduction: 'استقطاع',
} as const;
export type ComponentKind = keyof typeof COMPONENT_KINDS;
export const COMPONENT_KIND_KEYS = Object.keys(COMPONENT_KINDS) as ComponentKind[];

/** البنود التي تُضاف للأجر — والاستقطاع وحده يُطرح */
export const EARNING_KINDS: ComponentKind[] = ['basic', 'allowance', 'incentive', 'bonus'];

export const COMPONENT_FREQUENCIES = {
  monthly: 'شهري متكرر',
  once: 'مرة واحدة',
} as const;
export type ComponentFrequency = keyof typeof COMPONENT_FREQUENCIES;

export const PAYROLL_STATUSES = {
  draft: 'مسوّدة',
  approved: 'معتمد',
  paid: 'مصروف',
} as const;
export type PayrollStatus = keyof typeof PAYROLL_STATUSES;

/** أمثلة تُقترح في الشاشة — بيانات ابتدائية لا قيدًا */
export const COMMON_ALLOWANCES = [
  'بدل انتقالات',
  'بدل سكن',
  'بدل هاتف',
  'بدل وجبة',
  'بدل طبيعة عمل',
];
export const COMMON_DEDUCTIONS = [
  'تأمينات اجتماعية',
  'ضريبة كسب العمل',
  'سلفة',
  'جزاءات',
  'تأمين طبي',
];

// ═══════════════════════════════════════════════════════════════
//  حساب الأجر
// ═══════════════════════════════════════════════════════════════

export type Component = {
  kind: string;
  label: string;
  amount: number;
  /** نسبة من الأساسي بدل مبلغ ثابت */
  isPercent: boolean;
  frequency: string;
  /** الشهر `YYYY-MM` حين يكون البند لمرة واحدة */
  period?: string | null;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  active?: boolean;
};

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** `YYYY-MM` من تاريخ */
export function periodOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** أول يوم في الشهر وآخر لحظة فيه */
export function periodRange(period: string): { start: Date; end: Date } {
  const [y, m] = period.split('-').map(Number);
  return {
    start: new Date(y, (m || 1) - 1, 1),
    end: new Date(y, m || 1, 0, 23, 59, 59, 999),
  };
}

/**
 * هل يسري هذا البند في هذا الشهر؟
 *
 * البند الذي بدأ في منتصف الشهر يسري على الشهر كلّه: كشف الراتب شهري لا
 * يومي، وتجزئته باليوم قرارُ إدارةٍ لم يُتّخذ — ولا نخترعه (§٣ بند ٥).
 */
export function appliesTo(component: Component, period: string): boolean {
  if (component.active === false) return false;

  const { start, end } = periodRange(period);
  if (component.effectiveFrom > end) return false;
  if (component.effectiveTo && component.effectiveTo < start) return false;

  // البند لمرة واحدة يسري في شهره وحده — وبلا شهر محدَّد لا يسري أبدًا
  if (component.frequency === 'once') return component.period === period;

  return true;
}

export type PayslipLine = { kind: string; label: string; amount: number };

export type Payslip = {
  basic: number;
  allowances: number;
  incentives: number;
  deductions: number;
  /** إجمالي المستحق قبل الاستقطاع */
  gross: number;
  /** الصافي المصروف */
  net: number;
  lines: PayslipLine[];
};

/**
 * كشف راتب موظف في شهر.
 *
 * **النسبة تُحسب على الأساسي لا على الإجمالي** — وإلا صار البدل يزيد بزيادة
 * بدلٍ آخر، فيتغيّر الراتب بترتيب إدخال البنود لا بقرار الإدارة.
 * والصافي لا ينزل تحت الصفر: استقطاعٌ يتجاوز الأجر يُرحَّل لا يُنتج دَينًا
 * صامتًا في كشف الشهر.
 */
export function payslip(components: Component[], period: string): Payslip {
  const due = components.filter((c) => appliesTo(c, period));

  const basic = round2(
    due
      .filter((c) => c.kind === 'basic')
      .reduce((sum, c) => sum + (c.isPercent ? 0 : c.amount), 0)
  );

  const lines: PayslipLine[] = [];
  const valueOf = (c: Component) => round2(c.isPercent ? basic * (c.amount / 100) : c.amount);

  let allowances = 0;
  let incentives = 0;
  let deductions = 0;

  for (const c of due) {
    const amount = valueOf(c);
    lines.push({ kind: c.kind, label: c.label, amount });
    if (c.kind === 'allowance') allowances += amount;
    else if (c.kind === 'incentive' || c.kind === 'bonus') incentives += amount;
    else if (c.kind === 'deduction') deductions += amount;
  }

  allowances = round2(allowances);
  incentives = round2(incentives);
  deductions = round2(deductions);

  const gross = round2(basic + allowances + incentives);
  return {
    basic,
    allowances,
    incentives,
    deductions,
    gross,
    net: round2(Math.max(0, gross - deductions)),
    lines,
  };
}

/** مجاميع كشف الشهر كلّه */
export function payrollTotals(slips: Payslip[]) {
  const sum = (pick: (s: Payslip) => number) => round2(slips.reduce((t, s) => t + pick(s), 0));
  return {
    count: slips.length,
    basic: sum((s) => s.basic),
    allowances: sum((s) => s.allowances),
    incentives: sum((s) => s.incentives),
    deductions: sum((s) => s.deductions),
    gross: sum((s) => s.gross),
    net: sum((s) => s.net),
  };
}

// ═══════════════════════════════════════════════════════════════
//  الأداء وعائد الموظف
// ═══════════════════════════════════════════════════════════════

/**
 * عائد الموظف على تكلفته.
 *
 * `ROI = (الإيراد المنسوب − التكلفة) ÷ التكلفة`
 *
 * يعيد `null` حين تكون التكلفة صفرًا — لا صفرًا ولا ما لا نهاية: موظف بلا
 * تكلفة مسجَّلة **رقمٌ ناقص لا عائد لانهائي**، وعرضه رقمًا يُبنى عليه قرار.
 */
export function employeeRoi(attributedRevenue: number, cost: number): number | null {
  if (!cost || cost <= 0) return null;
  return round2((attributedRevenue - cost) / cost);
}

/** حصة الموظف من التكلفة الشهرية بما فيها البدلات — لا الأساسي وحده */
export function loadedMonthlyCost(slip: Payslip): number {
  return slip.gross;
}

/**
 * تكلفة الساعة المحمَّلة.
 *
 * `(الأجر الشهري ÷ أيام العمل ÷ ساعات اليوم) ÷ نسبة الوقت المنتج`
 *
 * القسمة على نسبة الإنتاجية **ترفع** التكلفة لا تخفضها: الساعة المنتجة تحمل
 * نصيبها من الساعات غير المنتجة، وإلا بدت الطاقة أرخص مما هي.
 */
export function loadedHourlyCost(params: {
  monthlyCost: number;
  workingDays: number;
  hoursPerDay: number;
  productiveRatio: number;
}): number | null {
  const { monthlyCost, workingDays, hoursPerDay, productiveRatio } = params;
  if (!monthlyCost || !workingDays || !hoursPerDay || !productiveRatio) return null;
  return round2(monthlyCost / workingDays / hoursPerDay / productiveRatio);
}

/** مدة الخدمة بالشهور — للاستحقاقات وتقارير الدوران */
export function tenureMonths(hireDate: Date | null, now: Date): number | null {
  if (!hireDate) return null;
  const months =
    (now.getFullYear() - hireDate.getFullYear()) * 12 + (now.getMonth() - hireDate.getMonth());
  return Math.max(0, months - (now.getDate() < hireDate.getDate() ? 1 : 0));
}

export function tenureLabel(months: number | null): string {
  if (months === null) return '—';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (!years) return `${rest} شهرًا`;
  if (!rest) return `${years} سنة`;
  return `${years} سنة و${rest} شهرًا`;
}

/**
 * تقييم أداء من مؤشرات موزونة.
 *
 * الأوزان بيانات تصلها الشاشة، فلا رقم مثبَّت هنا. والمؤشر الذي لا قيمة له
 * **يُسقط ويُعاد توزيع وزنه** على الباقي — لا يُحسب صفرًا، فالصفر يعني
 * «أدّى ولم يُنجز»، والغياب يعني «لم يُقَس».
 */
export function weightedScore(
  metrics: { value: number | null; weight: number }[]
): number | null {
  const usable = metrics.filter((m) => m.value !== null && m.weight > 0);
  if (!usable.length) return null;
  const totalWeight = usable.reduce((s, m) => s + m.weight, 0);
  if (!totalWeight) return null;
  const score = usable.reduce((s, m) => s + (m.value as number) * m.weight, 0) / totalWeight;
  return round2(score);
}

/** شجرة الأقسام من قائمة مسطّحة — للعرض المتشجّر */
export type TreeNode<T> = T & { children: TreeNode<T>[]; depth: number };

export function buildTree<T extends { id: string; parentId: string | null }>(
  rows: T[]
): TreeNode<T>[] {
  const byId = new Map<string, TreeNode<T>>();
  for (const row of rows) byId.set(row.id, { ...row, children: [], depth: 0 });

  const roots: TreeNode<T>[] = [];
  for (const row of rows) {
    const node = byId.get(row.id)!;
    // الأب المفقود يجعل الابن جذرًا — لا يختفي السجلّ من الشجرة
    const parent = row.parentId ? byId.get(row.parentId) : null;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }

  // العمق يُحسب بالنزول، فحلقةٌ في البيانات لا تُدخل الدالة في لا نهاية
  const seen = new Set<string>();
  const stamp = (nodes: TreeNode<T>[], depth: number) => {
    for (const node of nodes) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      node.depth = depth;
      stamp(node.children, depth + 1);
    }
  };
  stamp(roots, 0);

  return roots;
}

/** الشجرة مسطّحةً بترتيب العرض — لقوائم الاختيار والجداول */
export function flattenTree<T extends { id: string; parentId: string | null }>(
  roots: TreeNode<T>[]
): TreeNode<T>[] {
  const out: TreeNode<T>[] = [];
  const walk = (nodes: TreeNode<T>[]) => {
    for (const node of nodes) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(roots);
  return out;
}
