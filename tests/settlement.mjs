/**
 * اختبار تسوية إيراد المبيعات على دفتر المحاسب.
 *
 * ثلاث مصائد يحرسها:
 *   ١) **مجموع المسوّى يطابق الدفتر بالقرش** — لا بالتقريب. وإلا رأى المالك
 *      رقمًا لم يكتبه محاسبُه.
 *   ٢) **التوزيع بالتناسب لا بالتساوي** — فيبقى ترتيب العملاء وأوزانهم.
 *   ٣) **شهرٌ بلا عميل لا يُوزَّع عليه** — بل يُنشأ له عميل مجمَّع باسمه.
 *
 * التشغيل:  npm run test:settlement
 */
import {
  settleMonth,
  buildPlan,
  bucketClientName,
  periodLabel,
  settleTag,
  isGenericCenter,
  isFxAccount,
  clientNameOfCenter,
  parseCenterClients,
  clientOfCenter,
  centerClientsText,
  DEFAULT_CENTER_CLIENTS,
} from '../src/lib/settlement.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}
function eq(actual, expected, label) {
  check(
    JSON.stringify(actual) === JSON.stringify(expected),
    label,
    `نتج ${JSON.stringify(actual)} والمتوقع ${JSON.stringify(expected)}`
  );
}
const sum = (rows) => Math.round(rows.reduce((s, r) => s + r.settled, 0) * 100) / 100;

const month = (over) =>
  settleMonth({
    period: '2022-11',
    branch: 'mokattam',
    branchLabel: 'المقطم',
    ledger: 89210,
    rows: [],
    ...over,
  });

console.log('\n── ١ · التوزيع بالتناسب ─────────────────────────────\n');

// مثال أحمد الحقيقي: نوفمبر ٢٠٢٢ — رُصد ٦٢٬٣٦٦ والدفتر ٨٩٬٢١٠
const real = month({
  rows: [
    { key: 'a', amount: 19116 },
    { key: 'b', amount: 4400 },
    { key: 'c', amount: 2070 },
    { key: 'd', amount: 36780 },
  ],
});
eq(real.state, 'settled', 'الشهر المرصود يُسوَّى');
eq(
  sum(real.rows),
  89210,
  '★ **ومجموع المسوّى يطابق الدفتر بالقرش** — لا رقمَ يراه المالك ولم يكتبه محاسبه'
);
check(
  real.rows[0].settled > real.rows[1].settled &&
    real.rows[1].settled > real.rows[2].settled,
  '★ **والترتيب يبقى كما هو** — كلٌّ يكبر بنفس النسبة'
);
check(real.factor > 1.4 && real.factor < 1.44, `ومعامل التوسّع ${real.factor.toFixed(3)}`);

// التناسب لا التساوي: من رُصد له ضعفُ غيره يبقى ضعفَه بعد التسوية
const ratio = month({
  ledger: 3000,
  rows: [
    { key: 'كبير', amount: 1000 },
    { key: 'صغير', amount: 500 },
  ],
});
eq(ratio.rows[0].settled, 2000, 'الكبير يصير ٢٠٠٠');
eq(ratio.rows[1].settled, 1000, 'والصغير ١٠٠٠ — النسبة بينهما ٢:١ كما كانت');
eq(
  sum(ratio.rows),
  3000,
  '★ **ولو وُزّع بالتساوي لصار ١٧٥٠ و١٢٥٠** — ولانقلبت أوزان العملاء'
);

console.log('\n── ٢ · القرش الأخير ─────────────────────────────────\n');

const awkward = month({
  ledger: 1000,
  rows: [
    { key: 'a', amount: 1 },
    { key: 'b', amount: 1 },
    { key: 'c', amount: 1 },
  ],
});
eq(
  sum(awkward.rows),
  1000,
  '★ **ثلاثة أثلاث تطابق الألف بالضبط** — الفارق يُحمَّل على آخر سطر'
);

console.log('\n── ٣ · شهرٌ بلا عميل ────────────────────────────────\n');

const empty = settleMonth({
  period: '2022-03',
  branch: 'mokattam',
  branchLabel: 'المقطم',
  ledger: 8800,
  rows: [],
});
eq(empty.state, 'bucketed', 'شهرٌ بلا عميل يُنشأ له عميل مجمَّع');
eq(empty.bucket.amount, 8800, 'يحمل إيراد الشهر كلَّه');
eq(
  empty.bucket.name,
  'عملاء المقطم — مارس 2022',
  '★ **واسمه يقول ما هو** — فمن يفتحه بعد سنتين لا يظنّه شخصًا يتّصل به'
);
eq(empty.rows, [], 'ولا سطور عملاء');

console.log('\n── ٤ · ما لا يُسوَّى ────────────────────────────────\n');

const noLedger = settleMonth({
  period: '2026-05',
  branch: 'mokattam',
  branchLabel: 'المقطم',
  ledger: null,
  rows: [{ key: 'a', amount: 5000 }],
});
eq(noLedger.state, 'no_ledger', 'وشهرٌ بلا رقم في الدفتر لا أساس لتسويته');
eq(
  sum(noLedger.rows),
  5000,
  '★ **ويبقى المرصود كما هو** — تصفيرُه لأن الدفتر صامت يمحو بيعًا حدث فعلًا'
);

const exact = month({ ledger: 1000, rows: [{ key: 'a', amount: 1000 }] });
eq(exact.state, 'exact', 'والمطابق لا يُمسّ');
eq(exact.factor, 1, 'ومعامله واحد');

// الدفتر أقلّ من المرصود — يُصغَّر كذلك، فالمحاسب هو الحقيقة
const shrink = month({ ledger: 800, rows: [{ key: 'a', amount: 1000 }] });
eq(shrink.rows[0].settled, 800, 'ودفترٌ أقلّ من المرصود يُصغّر — المحاسب هو الحقيقة');

const negative = month({ ledger: 1000, rows: [{ key: 'a', amount: -50 }, { key: 'b', amount: 1000 }] });
eq(negative.rows.length, 1, 'والسالب لا يدخل التسوية');

console.log('\n── ٥ · الخطة كاملة ──────────────────────────────────\n');

const plan = buildPlan([
  settleMonth({ period: '2022-03', branch: 'mokattam', branchLabel: 'المقطم', ledger: 8800, rows: [] }),
  settleMonth({
    period: '2022-11',
    branch: 'mokattam',
    branchLabel: 'المقطم',
    ledger: 89210,
    rows: [{ key: 'a', amount: 62366 }],
  }),
]);
eq(plan.totals.ledger, 98010, 'إجمالي الدفتر');
eq(plan.totals.recorded, 62366, 'وإجمالي ما رُصد');
eq(
  plan.totals.settled,
  98010,
  '★ **وإجمالي ما دخل السجل يساوي الدفتر** — لا فجوة تبقى ولا قرش يضيع'
);
eq(plan.totals.bucketed, 8800, 'ومنه ما حملته العملاء المجمَّعة');
eq(plan.totals.bucketCount, 1, 'وعددها');

console.log('\n── ٦ · الأسماء ──────────────────────────────────────\n');
eq(periodLabel('2022-01'), 'يناير 2022', 'اسم الشهر عربيّ');
eq(periodLabel('2022-12'), 'ديسمبر 2022', 'وديسمبر');
eq(bucketClientName('الرياض', '2023-07'), 'عملاء الرياض — يوليو 2023', 'واسم المجمَّع يحمل فرعه وشهره');
eq(settleTag(2024), 'settle-2024', 'ووسم التسوية بسنته — يُسحب فتعود الأرقام كما رُصدت');

console.log('\n── ٧ · مركز الربحية اسمُ عميل ───────────────────────\n');

/**
 * أهمّ ما في التسوية: **ثلثا الإيراد على مراكز ربحيةٍ هي أسماء عملاء** —
 * تدخل بأرقامها كما كتبها المحاسب، ولا يُوزَّع بالتناسب إلا ما بقي.
 */
for (const generic of ['مشروع عام', 'المقر الإداري للشركة', 'نشــــاط الترجمة', '', null]) {
  check(isGenericCenter(generic), `«${generic ?? 'بلا مركز'}» مركزٌ عامّ — ما عليه يُوزَّع`);
}
for (const named of ['مشروع دار يتخيلون', 'مشروع قرآن هاوس', 'مشروع مركز سلام', 'مشروع أبو الهيثم']) {
  check(!isGenericCenter(named), `و«${named}» اسمُ عميل — يأخذ رقمه بالضبط`);
}
eq(
  clientNameOfCenter('مشروع دار يتخيلون'),
  'دار يتخيلون',
  '★ **وبادئة «مشروع» تُنزع للعرض** — العميل «دار يتخيلون» لا «مشروع دار يتخيلون»'
);
eq(clientNameOfCenter('مركز سلام'), 'مركز سلام', 'وما ليس عليه بادئة يبقى كما كتبه المحاسب');
eq(clientNameOfCenter('مشروع'), 'مشروع', 'واسمٌ ليس فيه غير البادئة يبقى — فلا يُفرَّغ');

console.log('\n── ٨ · المركز مشروعٌ والعميل فوقه ───────────────────\n');

/**
 * قالها أحمد: «أسورة اليقين مشروع للعميل سلام أيضًا»، و«مع المصطفى مشروع
 * تابع لأكاديمية الأسرة للدكتور علي الشبيلي». والعميل الواحد له عدة مشاريع،
 * ولكلٍّ مركزُ ربحيةٍ في الدفتر.
 */
const map = parseCenterClients(
  'أسورة اليقين = مركز سلام\nمشروع مع المصطفي = أكاديمية الأسرة — د. علي الشبيلي'
);
eq(
  clientOfCenter('مشروع أسورة اليقين', map),
  'مركز سلام',
  '★ **ومركزُ الربحية مشروعٌ لا عميلًا بالضرورة** — وبلا هذا يصير العميل الواحد ثلاثةً في سجلٍّ واحد'
);
eq(
  clientOfCenter('مع المصطفي', map),
  'أكاديمية الأسرة — د. علي الشبيلي',
  '★ **والبادئة «مشروع» لا تفرّق** — تُنزع من طرفَي السطر ومن اسم المركز معًا'
);
eq(
  clientOfCenter('مشروع دار يتخيلون', map),
  'دار يتخيلون',
  'وما ليس في الخريطة عميلٌ باسمه — فالخريطة استثناءٌ لا قاعدة'
);
eq(
  clientOfCenter('مشروع أســـورة اليقين', map),
  'مركز سلام',
  'والتطويل لا يمنع المطابقة — المحاسب يكتب «نشــــاط» و«أســـورة»'
);

eq(parseCenterClients('').size, 0, 'ونصٌّ فارغ خريطةٌ فارغة');
eq(parseCenterClients('سطرٌ بلا مساواة').size, 0, 'وسطرٌ بلا «=» يُتخطّى');
eq(parseCenterClients('أسورة =').size, 0, 'وسطرٌ بلا عميل يُتخطّى — فلا يُنشأ عميلٌ بلا اسم');
eq(parseCenterClients(' = عميل').size, 0, 'وسطرٌ بلا مركز كذلك');

// التقريب ممنوع: من كتب السطر يعرف ما يقصد
eq(
  clientOfCenter('مشروع سلام للدعوة', map),
  'سلام للدعوة',
  '★ **والمطابقة بالاسم الصريح لا بالتقريب** — واسمٌ قريب يبقى على حاله ولا يُضمّ لغيره'
);

// النصّ الذي تعرضه الشاشة يُقرأ بنفسه — فما يراه أحمد هو ما يُطبَّق
const roundTrip = parseCenterClients(centerClientsText());
eq(
  roundTrip.size,
  DEFAULT_CENTER_CLIENTS.length,
  '★ **ونصُّ الشاشة يُقرأ بنفسه** — فما يراه أحمد هو ما يُطبَّق بالضبط'
);
/**
 * **وعملاء المدير التنفيذي الكبار في الخريطة الابتدائية بأسمائهم.**
 *
 * سمّاهم أحمد واحدًا واحدًا: «سلام ومشاريع سلام — أسورة اليقين وحقيبة سلام»
 * و«أكاديمية الأسرة التابعة لعلي الشبيلي ومشاريعه — مع المصطفى ودبلومة
 * الوالدية ودبلومة الزوجية». وبلا الخريطة يصير العميل الواحد ثلاثة في سجلٍّ
 * واحد: تنكسر قيمتُه العمرية ويسقط تصنيفُه ويظهر ثلاث مرات في كل ترتيب.
 */
eq(clientOfCenter('أسورة اليقين', roundTrip), 'سلام', 'وأسورة اليقين مشروعٌ للعميل سلام');
eq(clientOfCenter('مركز سلام', roundTrip), 'سلام', 'ومركز سلام هو سلام نفسه لا عميلًا ثانيًا');
eq(
  clientOfCenter('دبلومة الوالدية', roundTrip),
  'أكاديمية الأسرة — د. علي الشبيلي',
  'ودبلومة الوالدية مشروعٌ لأكاديمية الأسرة'
);
eq(clientOfCenter('بصيرة', roundTrip), 'مؤسسة البصيرة', 'و«بصيرة» في الدفتر هي مؤسسة البصيرة');
eq(clientOfCenter('دار يتخيلون', roundTrip), 'دار يتخيلون', 'وما لا خريطة له يبقى باسمه');

// ── فروق العملة تُستثنى باللهجتين ──
check(isFxAccount('أرباح وخسائر فروق العملة'), 'فروق العملة العربية تُستثنى');
check(
  isFxAccount('Foreign currency exchange gains and losses'),
  '★ **وبالإنجليزية أيضًا** — دفتر ٢٠٢٦ غيّر لغته، وقاعدةٌ بلهجةٍ واحدة تكفّ عن العمل صامتة'
);
check(!isFxAccount('إيراد الترجمة التحريرية'), 'وإيراد الترجمة ليس فروق عملة');

// ── «عملاء عامون» وعاءٌ لا اسم ──
check(
  isGenericCenter('عملاء عامون'),
  '★ **و«عملاء عامون» مركزٌ عامّ يُوزَّع** — ٢٬٢٠٣٬٥٨٢ ج في ٢٠٢٦ لو صارت بطاقةً لتصدّرت ترتيب العملاء وليست عميلًا'
);
check(isGenericCenter('عميل استراتيجي'), 'و«عميل استراتيجي» كذلك — وصفٌ لا اسم');
check(!isGenericCenter('مشروع دار يتخيلون'), 'ومشروع دار يتخيلون عميلٌ باسمه');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
