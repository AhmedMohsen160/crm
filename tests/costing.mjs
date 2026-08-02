/**
 * اختبار معادلات §٨ رقمًا برقم — واختبارات القبول ٨ إلى ١٢ و١٧ من §١٧.
 *
 * تعمل بلا متصفح ولا قاعدة بيانات، فهي أرخص وأسرع مكان لاكتشاف خطأ حسابي
 * قبل أن يمسّ مشروعًا حقيقيًا.
 *
 * التشغيل:  npm run test:costing
 */
import {
  weightedPages,
  standardCostPerWeightedPage,
  internalStepCost,
  externalStepCost,
  reviewerCost,
  priceProject,
  balanceOf,
  marginOf,
  attributeRevenue,
  absorptionRate,
  actualCostOfStaff,
  roiDirect,
  roiLoaded,
  onTimeRate,
  discountRatio,
} from '../src/lib/costing.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}
function near(actual, expected, label, tolerance = 1e-9) {
  const ok = Math.abs(actual - expected) < tolerance;
  check(ok, label, `نتج ${actual} والمتوقع ${expected}`);
}

console.log('معادلات §٨ واختبارات القبول\n');

// ── اختبار ٨: الحد الأدنى للوحدة الموزونة ────────────────────
// «weighted_pages لمشروع 0.5 صفحة = 1.0»
near(weightedPages(0.5, 1.0, 1.0, 1.0), 1.0, 'اختبار ٨: نصف صفحة تُحتسب وحدة كاملة');
near(weightedPages(0.1, 0.35, 0.85, 1.0), 1.0, 'الحد الأدنى يعمل مع معاملات صغيرة أيضًا');

// ── اختبار ٩: المثال الرقمي الحرفي في المواصفة ───────────────
// «مشروع 7 صفحات · معتمدة (0.85) · مراجعة خفيفة (0.35) → weighted_pages = 2.0825»
near(
  weightedPages(7, 0.35, 0.85, 1.0),
  2.0825,
  'اختبار ٩: ٧ صفحات × معتمدة ٠٫٨٥ × مراجعة خفيفة ٠٫٣٥ = ٢٫٠٨٢٥'
);

// المعامل لا يُطبَّق على مشروع كبير بالحد الأدنى
near(weightedPages(100, 1.0, 1.25, 1.0), 125, 'مشروع كبير: المعامل يُطبَّق بلا حد أدنى');

// ── تكلفة الصفحة الموزونة للموظف الداخلي ─────────────────────
// راتب 12,000 · 26 يوم عمل · نسبة إنتاج 0.70 · طاقة 4 صفحات/يوم
// (12000 ÷ 26 × 0.70) ÷ 4 = 80.769...
const staff = { monthlySalary: 12000, productiveRatio: 0.7, dailyCapacity: 4 };
const perPage = standardCostPerWeightedPage(staff, 26);
near(perPage, (12000 / 26) * 0.7 / 4, 'تكلفة الصفحة الموزونة للموظف الداخلي');
check(perPage > 80 && perPage < 81, `القيمة في المدى المتوقع (${perPage.toFixed(2)})`);

// بيانات ناقصة → صفر لا قسمة على صفر
near(
  standardCostPerWeightedPage({ monthlySalary: 0, productiveRatio: 0.7, dailyCapacity: 4 }, 26),
  0,
  'راتب غير مسجّل ← تكلفة صفر (لا قسمة على صفر)'
);
near(
  standardCostPerWeightedPage({ monthlySalary: 12000, productiveRatio: 0.7, dailyCapacity: 0 }, 26),
  0,
  'طاقة يومية صفر ← تكلفة صفر لا لا نهاية'
);

// ── التكلفة الداخلية والخارجية ───────────────────────────────
near(internalStepCost(2.0825, 80), 166.6, 'تكلفة خطوة داخلية = الموزونة × سعر الصفحة');

// الخارجية بالصفحات **الخام** لا الموزونة
near(externalStepCost(7, 50), 350, 'تكلفة الفريلانسر بالصفحات الخام لا الموزونة');

// اختبار ١٦ (الجزء الحسابي): فريلانسر بلا سعر ← صفر، ويُمسك بتنبيه
near(externalStepCost(7, null), 0, 'اختبار ١٦: فريلانسر بلا سعر ← تكلفة صفر');
near(externalStepCost(7, NaN), 0, 'قيمة غير رقمية في الأجر ← صفر لا NaN');
// اختبار ١٥: نص في حقل الأجر لا يكسر الحساب ولا ينتشر
near(externalStepCost(7, Number('نص')), 0, 'اختبار ١٥: نص في حقل الأجر لا يكسر الحساب');

// ── اختبارا ١٠ و١١: منع الاحتساب المزدوج لتكلفة المراجع ──────
const base = {
  pages: 10,
  reviewFactor: 0.33,
  lineFactor: 1.0,
  reviewerCostPerWeightedPage: 80,
};

near(
  reviewerCost({
    ...base,
    reviewerId: 'reviewer-1',
    primaryProducerId: 'producer-1',
    workModeIsReview: false,
  }),
  10 * 0.33 * 1.0 * 80,
  'الحالة العادية: تكلفة المراجع تُحتسب'
);

near(
  reviewerCost({
    ...base,
    reviewerId: 'reviewer-1',
    primaryProducerId: 'producer-1',
    workModeIsReview: true,
  }),
  0,
  'اختبار ١٠: نمط التشغيل مراجعة + مراجع مسمّى ← تكلفة المراجع صفر'
);

near(
  reviewerCost({
    ...base,
    reviewerId: 'same-person',
    primaryProducerId: 'same-person',
    workModeIsReview: false,
  }),
  0,
  'اختبار ١١: المراجع = المنتِج ← تكلفة المراجع صفر'
);

near(
  reviewerCost({
    ...base,
    reviewerId: null,
    primaryProducerId: 'producer-1',
    workModeIsReview: false,
  }),
  0,
  'لا مراجع مسمّى ← صفر'
);

// ── التسعير ──────────────────────────────────────────────────
const settings = { rushSurcharge: 0.25, minOrderValue: 150 };

let price = priceProject({
  pages: 10,
  unitPrice: 100,
  isRush: false,
  discount: { type: null, value: null },
  settings,
});
near(price.netTotal, 1000, 'التسعير الأساسي: ١٠ صفحات × ١٠٠');

price = priceProject({
  pages: 10,
  unitPrice: 100,
  isRush: true,
  discount: { type: null, value: null },
  settings,
});
near(price.netTotal, 1250, 'رسم الاستعجال ٢٥٪ يُضاف');

price = priceProject({
  pages: 10,
  unitPrice: 100,
  isRush: false,
  discount: { type: 'percent', value: 0.1 },
  settings,
});
near(price.netTotal, 900, 'خصم نسبة ١٠٪');

price = priceProject({
  pages: 10,
  unitPrice: 100,
  isRush: false,
  discount: { type: 'amount', value: 250 },
  settings,
});
near(price.netTotal, 750, 'خصم مبلغ ثابت');

price = priceProject({
  pages: 1,
  unitPrice: 50,
  isRush: false,
  discount: { type: null, value: null },
  settings,
});
near(price.netTotal, 150, 'الحد الأدنى للطلب يرفع السعر الصغير');

price = priceProject({
  pages: 10,
  unitPrice: 100,
  isRush: false,
  discount: { type: 'percent', value: 0.95 },
  settings,
});
near(price.netTotal, 150, 'خصم مبالغ فيه لا ينزل تحت الحد الأدنى');

near(balanceOf(1000, 500, 200), 300, 'الرصيد = الإجمالي − المقدم − المحصَّل');

// ── حدّ الخصم: المبلغ الثابت لا يفلت من الحد (§١٠ بند ٤) ──────
near(discountRatio({ type: 'percent', value: 0.3 }, 1000), 0.3, 'خصم النسبة يُقارن كما هو');
near(
  discountRatio({ type: 'amount', value: 500 }, 1000),
  0.5,
  'خصم ٥٠٠ على ألف = ٥٠٪ — المبلغ الثابت يُحوَّل لنسبة فلا يفلت من الحد'
);
near(discountRatio({ type: 'none', value: 0 }, 1000), 0, 'بلا خصم ← صفر');
near(discountRatio({ type: 'amount', value: 500 }, 0), 0, 'إجمالي صفر ← صفر لا لا نهاية');

// ── الهامش ───────────────────────────────────────────────────
const m = marginOf(1000, 400);
near(m.margin, 600, 'الهامش = الإجمالي − التكلفة');
near(m.marginPct, 0.6, 'نسبة الهامش');
near(marginOf(0, 0).marginPct, 0, 'إجمالي صفر ← نسبة صفر لا قسمة على صفر');

// ── اختبار ١٢: مجموع الإيراد المنسوب = net_total بالضبط ──────
function sumAttribution(list) {
  return Math.round(list.reduce((s, a) => s + a.amount, 0) * 100) / 100;
}

const cases = [
  {
    label: 'منتِج وحده',
    input: {
      netTotal: 1000,
      steps: [],
      primaryProducerId: 'p1',
      reviewerId: null,
      producerShare: 0.7,
      reviewerShare: 0.3,
    },
  },
  {
    label: 'منتِج ومراجع',
    input: {
      netTotal: 1000,
      steps: [],
      primaryProducerId: 'p1',
      reviewerId: 'r1',
      producerShare: 0.7,
      reviewerShare: 0.3,
    },
  },
  {
    label: 'ثلاث خطوات بأوزان غير قابلة للقسمة',
    input: {
      netTotal: 1000,
      steps: [
        { performerId: 'a', weightedPages: 1 },
        { performerId: 'b', weightedPages: 1 },
        { performerId: 'c', weightedPages: 1 },
      ],
      primaryProducerId: 'a',
      reviewerId: null,
      producerShare: 0.7,
      reviewerShare: 0.3,
    },
  },
  {
    label: 'مبلغ كسري وأوزان كسرية',
    input: {
      netTotal: 3333.33,
      steps: [
        { performerId: 'a', weightedPages: 2.0825 },
        { performerId: 'b', weightedPages: 1.17 },
        { performerId: 'c', weightedPages: 0.33 },
      ],
      primaryProducerId: 'a',
      reviewerId: 'b',
      producerShare: 0.7,
      reviewerShare: 0.3,
    },
  },
  {
    label: 'منفِّذ واحد في خطوتين',
    input: {
      netTotal: 777.77,
      steps: [
        { performerId: 'a', weightedPages: 1.5 },
        { performerId: 'a', weightedPages: 2.5 },
      ],
      primaryProducerId: 'a',
      reviewerId: null,
      producerShare: 0.7,
      reviewerShare: 0.3,
    },
  },
];

let allExact = true;
for (const c of cases) {
  const list = attributeRevenue(c.input);
  const sum = sumAttribution(list);
  const exact = sum === c.input.netTotal;
  if (!exact) allExact = false;
  check(exact, `اختبار ١٢: ${c.label} — المجموع ${sum} = ${c.input.netTotal}`);
}
check(allExact, 'اختبار ١٢: مجموع الإيراد المنسوب يساوي net_total في كل الحالات');

// المنفِّذ الواحد في خطوتين يُجمع في سطر واحد
const merged = attributeRevenue(cases[4].input);
check(merged.length === 1, `المنفِّذ الواحد يُجمع في سطر واحد (${merged.length})`);

// بلا منتِج ولا خطوات ← لا توزيع (وليس توزيعًا خاطئًا)
check(
  attributeRevenue({
    netTotal: 1000,
    steps: [],
    primaryProducerId: null,
    reviewerId: null,
    producerShare: 0.7,
    reviewerShare: 0.3,
  }).length === 0,
  'مشروع بلا منفِّذ ← لا إيراد منسوب لأحد'
);

// ── الاستيعاب و ROI ──────────────────────────────────────────
near(actualCostOfStaff(staff), 8400, 'التكلفة الفعلية للموظف = الراتب × نسبة الإنتاج');
near(absorptionRate(4200, 8400), 0.5, 'نسبة الاستيعاب ٥٠٪ = طاقة غير مستغَلة');
near(absorptionRate(0, 0), 0, 'تكلفة فعلية صفر ← نسبة صفر لا قسمة على صفر');
near(roiDirect(16800, 8400), 2, 'ROI المباشر');
near(
  roiLoaded({
    attributedRevenue: 16800,
    actualCost: 8400,
    monthlyOverhead: 49000,
    referenceMonthlyRevenue: 196000,
  }),
  16800 / (8400 + 16800 * 0.25),
  'ROI المحمّل يضيف حصة المصروفات'
);

// ── اختبار ١٧: مقام نسبة الالتزام بالمواعيد ──────────────────
const d = (s) => new Date(s);
const rate = onTimeRate([
  { deadline: d('2026-08-10'), deliveredAt: d('2026-08-09') }, // ملتزم
  { deadline: d('2026-08-10'), deliveredAt: d('2026-08-12') }, // متأخر
  { deadline: null, deliveredAt: d('2026-08-11') }, // بلا موعد — يخرج
  { deadline: d('2026-08-20'), deliveredAt: null }, // لم يُسلَّم — يخرج
]);
near(rate.rate, 0.5, 'اختبار ١٧: المشروع بلا موعد يخرج من البسط والمقام معًا');
check(
  rate.onTime === 1 && rate.late === 1 && rate.excluded === 2,
  `التفصيل: ملتزم ${rate.onTime} · متأخر ${rate.late} · مستبعَد ${rate.excluded}`
);
near(onTimeRate([{ deadline: null, deliveredAt: null }]).rate, 0, 'لا مشاريع بموعد ← صفر لا NaN');

// ── النتيجة ──────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
