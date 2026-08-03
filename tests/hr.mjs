/**
 * اختبار قواعد الموارد البشرية — بلا قاعدة بيانات.
 *
 * أخطر ما هنا **أن النسبة تُحسب على الأساسي لا على الإجمالي**: لو حُسبت على
 * الإجمالي لصار البدل يزيد بزيادة بدلٍ آخر، فيتغيّر راتب الموظف بترتيب إدخال
 * البنود لا بقرار الإدارة — وهو خطأ صامت لا يكتشفه أحد إلا في كشف الشهر.
 *
 * التشغيل:  npm run test:hr
 */
import {
  EMPLOYMENT_TYPES,
  COMPONENT_KINDS,
  EARNING_KINDS,
  appliesTo,
  payslip,
  payrollTotals,
  employeeRoi,
  loadedHourlyCost,
  tenureMonths,
  tenureLabel,
  weightedScore,
  buildTree,
  flattenTree,
  periodOf,
  periodRange,
  round2,
} from '../src/lib/hr.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}
function eq(actual, expected, label) {
  check(
    actual === expected,
    label,
    `نتج ${JSON.stringify(actual)} والمتوقع ${JSON.stringify(expected)}`
  );
}
function near(actual, expected, label, tol = 0.01) {
  check(Math.abs(actual - expected) < tol, label, `نتج ${actual} والمتوقع ${expected}`);
}

const D = (s) => new Date(s);
const base = (over = {}) => ({
  kind: 'basic',
  label: 'أساسي',
  amount: 10000,
  isPercent: false,
  frequency: 'monthly',
  effectiveFrom: D('2026-01-01'),
  active: true,
  ...over,
});

console.log('\n── الفترات ───────────────────────────────────────────');

eq(periodOf(D('2026-08-03')), '2026-08', 'الشهر يُشتقّ من التاريخ');
eq(periodOf(D('2026-01-31')), '2026-01', 'وشهرٌ برقم واحد يُصفَّر يمينه');
eq(periodRange('2026-02').start.getMonth(), 1, 'أول فبراير هو الشهر الثاني');
eq(periodRange('2026-02').end.getDate(), 28, 'وآخر فبراير ٢٠٢٦ يوم ٢٨');
eq(periodRange('2024-02').end.getDate(), 29, 'وفي السنة الكبيسة ٢٩');

console.log('\n── سريان البنود ──────────────────────────────────────');

check(appliesTo(base(), '2026-03'), 'البند الساري يسري');
check(!appliesTo(base({ effectiveFrom: D('2026-06-01') }), '2026-03'), 'وما لم يبدأ بعد لا يسري');
check(
  !appliesTo(base({ effectiveTo: D('2026-02-28') }), '2026-03'),
  'وما انتهى قبل الشهر لا يسري'
);
check(appliesTo(base({ effectiveTo: D('2026-03-15') }), '2026-03'), 'وما انتهى داخل الشهر يسري كاملًا');
check(
  appliesTo(base({ effectiveFrom: D('2026-03-20') }), '2026-03'),
  'وما بدأ داخل الشهر يسري على الشهر كلّه — الكشف شهري لا يومي'
);
check(!appliesTo(base({ active: false }), '2026-03'), 'والموقوف لا يسري');
check(
  appliesTo(base({ kind: 'bonus', frequency: 'once', period: '2026-03' }), '2026-03'),
  'وبند المرة الواحدة يسري في شهره'
);
check(
  !appliesTo(base({ kind: 'bonus', frequency: 'once', period: '2026-03' }), '2026-04'),
  'ولا يسري في غيره'
);
check(
  !appliesTo(base({ kind: 'bonus', frequency: 'once', period: null }), '2026-03'),
  'وبلا شهر محدَّد لا يسري أبدًا — لا في كل شهر'
);

console.log('\n── كشف الراتب ────────────────────────────────────────');

const simple = payslip(
  [
    base(),
    base({ kind: 'allowance', label: 'انتقالات', amount: 1500 }),
    base({ kind: 'allowance', label: 'هاتف', amount: 500 }),
    base({ kind: 'deduction', label: 'تأمينات', amount: 800 }),
  ],
  '2026-03'
);
eq(simple.basic, 10000, 'الأساسي');
eq(simple.allowances, 2000, 'والبدلات تُجمع');
eq(simple.deductions, 800, 'والاستقطاع');
eq(simple.gross, 12000, 'والإجمالي = أساسي + بدلات + حوافز');
eq(simple.net, 11200, 'والصافي = الإجمالي − الاستقطاع');

const withPercent = payslip(
  [
    base(),
    base({ kind: 'allowance', label: 'سكن', amount: 20, isPercent: true }),
    base({ kind: 'allowance', label: 'انتقالات', amount: 1000 }),
    base({ kind: 'incentive', label: 'حافز إنتاج', amount: 10, isPercent: true }),
  ],
  '2026-03'
);
eq(withPercent.allowances, 3000, '٢٠٪ من الأساسي = ٢٠٠٠، ومع الألف يصير ٣٠٠٠');
eq(
  withPercent.incentives,
  1000,
  '**والنسبة على الأساسي لا على الإجمالي** — ١٠٪ من ١٠٠٠٠ لا من ١٣٠٠٠'
);
check(
  withPercent.gross === 14000,
  'فالإجمالي ١٤٠٠٠ — ولو حُسبت النسبة على الإجمالي لتغيّر الراتب بترتيب الإدخال'
);

const negative = payslip(
  [base({ amount: 3000 }), base({ kind: 'deduction', label: 'سلفة', amount: 5000 })],
  '2026-03'
);
eq(negative.net, 0, 'واستقطاعٌ يتجاوز الأجر يُصفِّر الصافي ولا ينزل تحته');
eq(negative.deductions, 5000, 'ويبقى الاستقطاع كاملًا في الكشف — لا يُبتر ليتّزن الرقم');

const empty = payslip([], '2026-03');
eq(empty.gross, 0, 'ولا بنود يعني صفرًا بلا استثناء');
eq(empty.lines.length, 0, 'وبلا سطور');

eq(simple.lines.length, 4, 'وكل بند يظهر سطرًا في التفصيل');

console.log('\n── مجاميع الكشف ──────────────────────────────────────');

const totals = payrollTotals([simple, withPercent]);
eq(totals.count, 2, 'موظفان');
eq(totals.basic, 20000, 'ومجموع الأساسي');
eq(totals.net, 11200 + 14000, 'ومجموع الصافي');

console.log('\n── العائد والتكلفة ───────────────────────────────────');

near(employeeRoi(30000, 10000), 2, 'إيراد ٣٠ ألفًا بتكلفة ١٠ آلاف = عائد ٢٠٠٪');
near(employeeRoi(10000, 10000), 0, 'والتعادل عائدُه صفر');
near(employeeRoi(5000, 10000), -0.5, 'وما دون التكلفة عائد سالب');
eq(employeeRoi(30000, 0), null, '**وبلا تكلفة مسجَّلة لا عائد** — لا صفر ولا لا نهاية');
eq(employeeRoi(0, 0), null, 'وكذلك بلا شيء أصلًا');

near(
  loadedHourlyCost({ monthlyCost: 10400, workingDays: 26, hoursPerDay: 8, productiveRatio: 0.5 }),
  100,
  'الساعة المحمَّلة تحمل نصيبها من الوقت غير المنتج فترتفع لا تنخفض'
);
eq(
  loadedHourlyCost({ monthlyCost: 0, workingDays: 26, hoursPerDay: 8, productiveRatio: 0.7 }),
  null,
  'وبلا تكلفة لا ساعة محمَّلة'
);
eq(
  loadedHourlyCost({ monthlyCost: 10000, workingDays: 0, hoursPerDay: 8, productiveRatio: 0.7 }),
  null,
  'ولا قسمة على صفر'
);

console.log('\n── مدة الخدمة ────────────────────────────────────────');

eq(tenureMonths(D('2025-08-03'), D('2026-08-03')), 12, 'سنة كاملة');
eq(tenureMonths(D('2025-08-20'), D('2026-08-03')), 11, 'ولم يُكمل يومه بعد فأحد عشر شهرًا');
eq(tenureMonths(null, D('2026-08-03')), null, 'وبلا تاريخ تعيين لا مدة');
eq(tenureMonths(D('2026-09-01'), D('2026-08-03')), 0, 'ولا مدة سالبة');
eq(tenureLabel(12), '1 سنة', 'اثنا عشر شهرًا سنة');
eq(tenureLabel(18), '1 سنة و6 شهرًا', 'وثمانية عشر سنة ونصف');
eq(tenureLabel(5), '5 شهرًا', 'وما دون السنة بالشهور');
eq(tenureLabel(null), '—', 'والمجهول شرطة');

console.log('\n── التقييم الموزون ───────────────────────────────────');

near(
  weightedScore([
    { value: 1, weight: 3 },
    { value: 0.5, weight: 1 },
  ]),
  0.875,
  'التقييم يتبع الأوزان'
);
near(
  weightedScore([
    { value: 1, weight: 3 },
    { value: null, weight: 1 },
  ]),
  1,
  '**والمؤشر غير المقيس يُسقط ويُعاد توزيع وزنه** — لا يُحسب صفرًا'
);
eq(weightedScore([{ value: null, weight: 1 }]), null, 'وبلا مؤشر مقيس لا تقييم');
eq(weightedScore([]), null, 'وبلا مؤشرات أصلًا');
eq(weightedScore([{ value: 1, weight: 0 }]), null, 'ووزن صفر لا يُحتسب');

console.log('\n── الشجرة التنظيمية ──────────────────────────────────');

const tree = buildTree([
  { id: 'a', parentId: null, name: 'الإدارة العليا' },
  { id: 'b', parentId: 'a', name: 'الإنتاج' },
  { id: 'c', parentId: 'b', name: 'الترجمة القانونية' },
  { id: 'd', parentId: null, name: 'المبيعات' },
]);
eq(tree.length, 2, 'جذران');
eq(tree[0].children.length, 1, 'وللأول ابن');
eq(tree[0].children[0].children[0].name, 'الترجمة القانونية', 'والحفيد في مكانه');
eq(tree[0].children[0].children[0].depth, 2, 'وعمقه اثنان');

const orphan = buildTree([{ id: 'x', parentId: 'مفقود', name: 'يتيم' }]);
eq(orphan.length, 1, '**والأب المفقود يجعل الابن جذرًا** — لا يختفي السجلّ من الشجرة');

const cycle = buildTree([
  { id: 'p', parentId: 'q', name: 'أ' },
  { id: 'q', parentId: 'p', name: 'ب' },
]);
check(Array.isArray(cycle), 'وحلقةٌ في البيانات لا تُدخل الدالة في لا نهاية');

eq(flattenTree(tree).length, 4, 'والتسطيح يعيد الجميع');
eq(flattenTree(tree)[1].name, 'الإنتاج', 'بترتيب العرض لا بترتيب الإدخال');

console.log('\n── التصنيفات ─────────────────────────────────────────');

check(Object.keys(EMPLOYMENT_TYPES).includes('full_time'), 'دوام كامل من أنواع التعاقد');
check(Object.keys(COMPONENT_KINDS).length === 5, 'خمسة أنواع لبنود الأجر');
check(!EARNING_KINDS.includes('deduction'), 'والاستقطاع وحده ليس من المستحقات');
eq(round2(0.1 + 0.2), 0.3, 'والتقريب يمنع ذيل الفاصلة العائمة');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
