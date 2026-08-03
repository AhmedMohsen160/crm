/**
 * اختبار بناء الموازنة السنوية — الخطوات السبع.
 *
 * أخطر ما هنا **نقطة التعادل حين تبلغ التكلفة المتغيّرة الإيراد**: الصيغة
 * الساذجة تقسم على صفر أو على سالب فتعطي رقمًا ضخمًا أو سالبًا يبدو هدفًا
 * قابلًا للتحقيق — وهو في الحقيقة يقول إن المشكلة في السعر لا في الحجم.
 *
 * التشغيل:  npm run test:budget
 */
import {
  BUDGET_STEPS,
  annualOf,
  seasonalWeights,
  spreadBy,
  fromLastYear,
  guessBehaviour,
  splitByBehaviour,
  variableRatio,
  cashflow,
  firstShortfall,
  marginPlan,
  contingencyAmount,
  quarterOfMonth,
  quarterlyReview,
  isMaterial,
  stepStates,
  round2,
} from '../src/lib/budget.ts';

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
function near(actual, expected, label, tol = 0.02) {
  check(Math.abs(actual - expected) < tol, label, `نتج ${actual} والمتوقع ${expected}`);
}

console.log('\n── الخطوات ───────────────────────────────────────────');

eq(BUDGET_STEPS.length, 7, 'سبع خطوات كما أقرّتها الإدارة');
eq(BUDGET_STEPS[0].key, 'history', 'تبدأ بتحليل التاريخ');
eq(BUDGET_STEPS[6].key, 'review', 'وتنتهي بالمراجعة الدورية');
check(
  BUDGET_STEPS.every((s, i) => s.order === i + 1),
  'وترتيبها متّصل بلا فجوة'
);

console.log('\n── ١ · التاريخ والموسمية ─────────────────────────────');

const flat = Array(12).fill(1000);
const seasonal = [500, 500, 1000, 1000, 1500, 2000, 3000, 2000, 1000, 500, 500, 500];

eq(annualOf(flat), 12000, 'مجموع السنة');
eq(annualOf([]), 0, 'وسنة فارغة صفر');
eq(annualOf([1, NaN, 2]), 3, 'وما ليس رقمًا يُتجاهل لا يُفسد المجموع');

near(seasonalWeights(flat)[0], 1 / 12, 'الشهور المتساوية أوزانها متساوية');
near(seasonalWeights(seasonal)[6], 3000 / 14000, 'ويوليو أثقل الشهور في المثال');
near(seasonalWeights(Array(12).fill(0))[0], 1 / 12, 'وسنة بلا حركة تُوزَّع بالتساوي — صراحةً');

const spread = spreadBy(12000, seasonalWeights(seasonal));
eq(annualOf(spread), 12000, '**التوزيع يساوي الإجمالي بالضبط** — والفارق يذهب لآخر شهر');
check(spread[6] > spread[0], 'ويحترم الموسمية: يوليو أكبر من يناير');

const grown = fromLastYear(seasonal, 20, true);
near(annualOf(grown), 14000 * 1.2, 'النمو ٢٠٪ يرفع الإجمالي');
check(grown[6] > grown[0], 'ويبقى الشكل الموسمي كما هو');

const flattened = fromLastYear(seasonal, 0, false);
near(flattened[0], flattened[6], 'وبإلغاء الموسمية تتساوى الشهور');

console.log('\n── ٣ و٤ · سلوك التكلفة ───────────────────────────────');

eq(guessBehaviour('إيجار المقر'), 'fixed', 'الإيجار ثابت');
eq(guessBehaviour('رواتب إدارية — أساسي'), 'fixed', 'والرواتب ثابتة');
eq(guessBehaviour('أتعاب مترجمين خارجيين'), 'variable', 'وأتعاب المترجمين متغيّرة');
eq(guessBehaviour('عمولات مبيعات'), 'variable', 'والعمولات متغيّرة');
eq(guessBehaviour('إعلانات جوجل'), 'variable', 'والإعلانات متغيّرة');
eq(guessBehaviour('حساب لا يشبه شيئًا'), null, '**وما لم يُعرف يُترك سؤالًا لا افتراضًا**');

const split = splitByBehaviour([
  { amount: 1000, behaviour: 'fixed' },
  { amount: 500, behaviour: 'variable' },
  { amount: 300, behaviour: null },
]);
eq(split.fixed, 1000, 'الثابت');
eq(split.variable, 500, 'والمتغيّر');
eq(split.unclassified, 300, 'وغير المصنَّف يُعدّ على حدة ليُرى');

near(variableRatio(3500, 10000), 0.35, 'نسبة التكلفة المتغيّرة من الإيراد');
eq(variableRatio(3500, 0), null, 'وبلا إيراد لا نسبة — لا صفر');

console.log('\n── ٥ · التدفق النقدي ─────────────────────────────────');

const flow = cashflow(Array(12).fill(1000), Array(12).fill(800));
eq(flow.length, 12, 'اثنا عشر شهرًا');
eq(flow[0].net, 200, 'وصافي الشهر');
eq(flow[11].running, 2400, 'والرصيد التراكمي يتجمّع');
eq(firstShortfall(flow), null, 'ولا عجز حين يفوق الإيراد المصروف');

const tight = cashflow([100, 100, 100, ...Array(9).fill(3000)], Array(12).fill(1000));
const short = firstShortfall(tight);
check(short !== null, 'العجز يُكتشف');
eq(short.month, 1, '**وأول شهر يقع فيه** — لا آخره: هو موعد التصرّف');
check(tight[11].running > 0, 'ولو انتهى العام موجبًا — الأزمة في وسطه لا في ختامه');

console.log('\n── ٥ · الهامش ونقطة التعادل ──────────────────────────');

const plan = marginPlan({ revenue: 100000, fixed: 30000, variable: 40000, contingencyPct: 10 });
eq(plan.contingency, 7000, 'الطوارئ ١٠٪ من مجموع التكاليف');
eq(plan.totalCost, 77000, 'وإجمالي التكلفة يشملها');
eq(plan.grossMargin, 23000, 'والهامش');
near(plan.marginPct, 0.23, 'ونسبته');
near(plan.breakEven, 61666.67, 'ونقطة التعادل = (ثابت + طوارئ) ÷ (١ − نسبة المتغيّر)');

const doomed = marginPlan({ revenue: 100000, fixed: 20000, variable: 100000, contingencyPct: 0 });
eq(
  doomed.breakEven,
  null,
  '**والتكلفة المتغيّرة التي تبلغ الإيراد لا تتعادل بأي حجم** — المشكلة في السعر'
);
check(doomed.grossMargin < 0, 'والهامش سالب');

const noRevenue = marginPlan({ revenue: 0, fixed: 10000, variable: 0, contingencyPct: 0 });
eq(noRevenue.marginPct, null, 'وبلا إيراد لا نسبة هامش');

eq(contingencyAmount(50000, 5), 2500, 'مبلغ الطوارئ');
eq(contingencyAmount(50000, -5), 0, 'ونسبة سالبة تُعامَل صفرًا');

console.log('\n── ٧ · المراجعة الربعية ──────────────────────────────');

eq(quarterOfMonth(1), 1, 'يناير في الربع الأول');
eq(quarterOfMonth(4), 2, 'وأبريل في الثاني');
eq(quarterOfMonth(12), 4, 'وديسمبر في الرابع');

const revQ = quarterlyReview(Array(12).fill(1000), Array(12).fill(1200), true);
eq(revQ[0].budget, 3000, 'موازنة الربع');
eq(revQ[0].actual, 3600, 'وفعليّه');
eq(revQ[0].variance, 600, '**تجاوز الإيراد موازنته مكسب — فالانحراف موجب**');

const expQ = quarterlyReview(Array(12).fill(1000), Array(12).fill(1200), false);
eq(
  expQ[0].variance,
  -600,
  '**وتجاوز المصروف موازنته خسارة — فالانحراف سالب بنفس الأرقام**'
);

const saved = quarterlyReview(Array(12).fill(1000), Array(12).fill(800), false);
eq(saved[0].variance, 600, 'وتوفير المصروف مكسب كذلك — فالأخضر دائمًا في صالح الشركة');

eq(quarterlyReview(Array(12).fill(0), Array(12).fill(100), true)[0].variancePct, null, 'وبلا موازنة لا نسبة انحراف');

check(isMaterial(0.15), 'انحراف ١٥٪ جوهري');
check(isMaterial(-0.2), 'والسالب الكبير كذلك');
check(!isMaterial(0.05), 'و٥٪ ليس جوهريًا');
check(!isMaterial(null), 'وغير المقيس ليس جوهريًا');

console.log('\n── حال الخطوات ───────────────────────────────────────');

const states = stepStates({
  hasHistory: true,
  revenueBudgeted: 100000,
  expenseAccounts: 10,
  classifiedAccounts: 10,
  variableBudgeted: 40000,
  contingencyPct: 5,
  hasActuals: true,
  shortfallMonth: null,
});
eq(states.length, 7, 'حالٌ لكل خطوة');
check(
  states.every((s) => s.done),
  'وموازنة مكتملة تُظهر الخطوات السبع منجزة'
);

const partial = stepStates({
  hasHistory: false,
  revenueBudgeted: 0,
  expenseAccounts: 10,
  classifiedAccounts: 6,
  variableBudgeted: 0,
  contingencyPct: 0,
  hasActuals: false,
  shortfallMonth: 3,
});
check(!partial.find((s) => s.key === 'fixed').done, 'وأربعة حسابات بلا تصنيف تُبقي الخطوة مفتوحة');
check(
  partial.find((s) => s.key === 'fixed').note.includes('4'),
  'والرسالة تقول كم بقي بالضبط لا «غير مكتمل»'
);
check(
  partial.find((s) => s.key === 'margin').note.includes('3'),
  'وتقول في أي شهر يقع العجز'
);

eq(round2(0.1 + 0.2), 0.3, 'والتقريب يمنع ذيل الفاصلة العائمة');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
