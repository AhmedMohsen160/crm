/**
 * اختبار تجميع قيود الدفتر بالرصيد الجاري، وتسوية كسور القرش.
 *
 * وهما أخطر قاعدتين في ترحيل الدفاتر: خطأٌ فيهما يُنتج دفترًا يبدو سليمًا
 * وميزانَ مراجعةٍ لا يتوازن — ولا يُكتشف إلا بعد أن يُبنى عليه.
 *
 * التشغيل:  npm run test:ledger-batches
 */
import {
  groupBatches,
  settleRounding,
  MAX_ENTRY_LINES,
  SETTLE_LIMIT,
} from '../src/lib/ledger-batches.ts';

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

/** صفٌّ مختصر — ما يهمّ التجميع منه: مبلغُه وفترتُه */
function row(debit, credit, period = '2022-01') {
  return { debit, credit, period, memo: '', path: ['النقدية'], costCenter: null };
}

console.log('\n── ١ · التجميع بالرصيد الجاري ───────────────────────\n');

const simple = groupBatches([row(100, 0), row(0, 100), row(50, 0), row(0, 50)]);
eq(simple.length, 2, 'قيدان يُغلقان عند تساوي المجموع');
eq(simple.map((b) => b.rows.length), [2, 2], 'وكلٌّ بسطريه');
eq(simple.every((b) => b.balanced), true, 'وكلاهما متوازن');

const many = groupBatches([row(100, 0), row(0, 60), row(0, 40), row(30, 0), row(0, 30)]);
eq(
  many.map((b) => b.rows.length),
  [3, 2],
  '★ **والقيد لا يُغلق قبل أن يتوازن** — سطرٌ مدين يقابله سطران دائنان قيدٌ واحد'
);

const trailing = groupBatches([row(100, 0), row(0, 100), row(70, 0)]);
eq(trailing.length, 2, 'وما بقي معلّقًا في آخر الورقة يُقفل ولا يُهمَل');
eq(trailing[1].balanced, false, 'ويُعاد غيرَ متوازن');
eq(trailing[1].difference, 70, 'وفارقُه مكتوب — ليُقال ولا يُجبَر');

eq(groupBatches([]), [], 'وورقةٌ بلا صفوف تُعيد فارغًا');

console.log('\n── ٢ · حدّ الشهر وحدّ السطور ────────────────────────\n');

const crossMonth = groupBatches([
  row(100, 0, '2022-01'),
  row(0, 100, '2022-02'),
]);
eq(
  crossMonth.length,
  2,
  '★ **ولا يُتجاوز الشهر** — شهرٌ فيه خلل لا يُفسد الذي بعده ولو تقابل المبلغان'
);
eq(crossMonth.every((b) => !b.balanced), true, 'وكلاهما يُعاد غيرَ متوازن بفارقه');

// مئتا سطر مدين متتالٍ بلا مقابل: بلا حدٍّ يبتلع بقية السنة
const runaway = groupBatches(Array.from({ length: MAX_ENTRY_LINES + 3 }, () => row(10, 0)));
eq(
  runaway[0].rows.length,
  MAX_ENTRY_LINES,
  '★ **وخللٌ في صفٍّ واحد لا يبتلع بقية الشهر** — الدفعة تُقفل عند حدّ السطور'
);
eq(runaway.length, 2, 'وما بعده يبدأ دفعةً جديدة');

console.log('\n── ٣ · تسوية كسور القرش ─────────────────────────────\n');

const exact = [
  { debit: 100, credit: 0 },
  { debit: 0, credit: 100 },
];
eq(settleRounding(exact), { settled: true, difference: 0 }, 'المتوازن يمرّ بلا تعديل');
eq(exact[1].credit, 100, 'ولا يُمسّ سطرُه الأخير');

// ٣٬٨٢٧٬٤٠٩٫٣٧٥ في ورقة المحاسب — كسرٌ أطول من قرشين
const drift = [
  { debit: 3827409.375, credit: 0 },
  { debit: 0, credit: 3827409.372 },
];
const settled = settleRounding(drift);
eq(settled.settled, true, '★ **وكسرٌ أطول من قرشين يُسوَّى** — لا يُردّ القيد لأجله');
eq(drift[0].debit, 3827409.38, 'والسطور تُقرَّب إلى القرش أولًا');
eq(drift[1].credit, 3827409.38, 'والفارق يُحمَّل على آخر سطر في جانبه الناقص');
eq(
  Math.round(drift[0].debit * 100) - Math.round(drift[1].credit * 100),
  0,
  '★ **والمقارنة بالقرش الصحيح** — لا بجنيهٍ عائم لا يعرف عُشرًا'
);

const debitShort = [
  { debit: 0, credit: 200 },
  { debit: 199.98, credit: 0 },
];
eq(settleRounding(debitShort).settled, true, 'والنقص في المدين يُسوَّى كذلك');
eq(debitShort[1].debit, 200, 'ويُزاد آخرُ سطرٍ مدين');

const tooBig = [
  { debit: 1000, credit: 0 },
  { debit: 0, credit: 999 },
];
const refused = settleRounding(tooBig);
eq(
  refused,
  { settled: false, difference: 1 },
  `★ **وما جاوز ${SETTLE_LIMIT} جنيه لا يُجبَر** — اختلالٌ بجنيه خطأٌ في ورقة المحاسب، وإجبارُه يُخفيه`
);
eq(tooBig[1].credit, 999, 'والسطر يبقى كما ورد فيُراجَع بأرقامه');

eq(settleRounding([]), { settled: true, difference: 0 }, 'وقيدٌ بلا سطور لا يُوقع خطأً');

// خمسة قروش على الحدّ تمامًا — والحدّ يشمل ما عليه لا ما دونه فقط
const onEdge = [
  { debit: 100, credit: 0 },
  { debit: 0, credit: 99.95 },
];
eq(settleRounding(onEdge).settled, true, 'وما وقع على الحدّ تمامًا يُسوَّى');

console.log('\n── ٤ · التجميع ثم التسوية معًا ──────────────────────\n');

/**
 * الحالة التي كلّفتنا اثنين وستين سطرًا: دفعةٌ فارقها قرشٌ واحد كانت
 * تُردّ **قبل** أن تُسوَّى — فيسقط شهرٌ كاملٌ من الدفتر لأجل قرش.
 */
const nearly = groupBatches([
  ...Array.from({ length: 61 }, () => row(1000, 0)),
  row(0, 60999.99),
]);
eq(nearly.length, 1, 'دفعةٌ واحدة من اثنين وستين سطرًا');
eq(nearly[0].balanced, false, 'يراها التجميع غيرَ متوازنة بقرش');
const lines = nearly[0].rows.map((r) => ({ debit: r.debit, credit: r.credit }));
eq(
  settleRounding(lines).settled,
  true,
  '★ **والتسوية تقبلها** — فالحكم على التوازن بعد التسوية لا قبلها'
);

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
