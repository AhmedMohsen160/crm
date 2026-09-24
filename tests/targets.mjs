/**
 * اختبار أهداف الفروع.
 *
 * **مصيدة القرش الأخير**: مجموع الشهور الاثني عشر يجب أن يطابق الرقم السنوي
 * **بالضبط** — وإلا رأى المالك رقمًا لم يكتبه.
 *
 * التشغيل:  npm run test:targets
 */
import {
  spreadYear,
  seasonalWeights,
  applyGrowth,
  yearTotals,
  periodOfMonth,
  MONTH_NAMES,
} from '../src/lib/targets.ts';

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
const sum = (arr) => Math.round(arr.reduce((s, v) => s + v, 0) * 100) / 100;

console.log('\n── ١ · التوزيع بالتساوي ─────────────────────────────\n');

const even = spreadYear(1_200_000);
eq(even.length, 12, 'اثنا عشر شهرًا');
eq(even[0], 100000, 'ولكل شهر مئة ألف');
eq(sum(even), 1_200_000, 'والمجموع يطابق');

// الرقم الذي لا يقبل القسمة على ١٢
const awkward = spreadYear(1000);
eq(
  sum(awkward),
  1000,
  '★ **والقرش الأخير يُسوَّى على آخر شهر** — ١٠٠٠ على ١٢ يطابق ١٠٠٠ لا ٩٩٩٫٩٦'
);

console.log('\n── ٢ · التوزيع بأوزان موسمية ────────────────────────\n');

const weights = [1, 1, 2, 1, 1, 1, 0.5, 0.5, 2, 1, 1, 1];
const seasonal = spreadYear(1_200_000, weights);
eq(sum(seasonal), 1_200_000, 'المجموع يطابق مع الأوزان كذلك');
check(
  seasonal[2] > seasonal[6],
  '★ **والشهر القوي أعلى من الضعيف** — تارجتٌ متساوٍ يعاقب الفريق في رمضان ويكافئه في سبتمبر'
);

eq(
  spreadYear(120000, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  spreadYear(120000),
  'وأوزانٌ كلها أصفار تعود إلى التساوي — لا قسمة على صفر'
);
eq(spreadYear(120000, [1, 2]), spreadYear(120000), 'وأوزانٌ ناقصة تُهمَل');

console.log('\n── ٣ · ما لا يُوزَّع ────────────────────────────────\n');

eq(sum(spreadYear(0)), 0, 'وصفرٌ يبقى صفرًا في كل شهر');
eq(sum(spreadYear(-5000)), 0, 'والسالب لا يُوزَّع — التارجت لا يكون سالبًا');

console.log('\n── ٤ · الأوزان من سنة فعلية ─────────────────────────\n');

const full = [80, 90, 140, 100, 95, 90, 50, 55, 150, 110, 100, 105];
check(seasonalWeights(full) !== null, 'سنةٌ كاملة تصلح نمطًا موسميًّا');

const sparse = [80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 120];
eq(
  seasonalWeights(sparse),
  null,
  '★ **وسنةٌ نصفها أصفار ليست نمطًا** — البناء عليها يُثبّت تشوّهًا في السنة القادمة كلها'
);
eq(seasonalWeights([1, 2, 3]), null, 'وما ليس اثني عشر شهرًا لا يُقرأ');
eq(seasonalWeights(Array(12).fill(0)), null, 'وسنةٌ كلها أصفار لا وزن لها');

console.log('\n── ٥ · النمو ────────────────────────────────────────\n');

eq(applyGrowth([100, 200], 20), [120, 240], 'نمو ٢٠٪ يضرب في ١٫٢');
eq(applyGrowth([100], 0), [100], 'وصفر نمو يُبقي الرقم');
eq(applyGrowth([100], -10), [90], 'والانكماش ينقص — نمو سالب مقبول');

console.log('\n── ٦ · المجاميع والأسماء ────────────────────────────\n');

const rows = [
  { branch: 'a', label: 'أ', months: Array(12).fill(100), annual: 1200 },
  { branch: 'b', label: 'ب', months: Array(12).fill(50), annual: 600 },
];
const totals = yearTotals(rows);
eq(totals.byMonth[0], 150, 'مجموع الشهر عبر الفروع');
eq(totals.grand, 1800, 'والإجمالي الكلي');

eq(MONTH_NAMES.length, 12, 'اثنا عشر اسمًا عربيًّا للشهور');
eq(periodOfMonth(2026, 0), '2026-01', 'ومفتاح الشهر بصفر مُقدَّم');
eq(periodOfMonth(2026, 11), '2026-12', 'وديسمبر الثاني عشر');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
