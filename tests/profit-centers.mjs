/**
 * اختبار مراكز الربحية.
 *
 * **مركز الربحية غير مركز تصنيف الإنفاق.** كان النظام يخلطهما في حقل واحد،
 * فيُولد كل مشروع أنشأه المحاسب لقياس ربحيته «مصاريف فرع ذاتية» ثم يطالب
 * بفرع لا يخصّه. وهذا الاختبار يحرس المعنى الصحيح: وحدةٌ يُقاس ربحُها.
 *
 * التشغيل:  npm run test:profit-centers
 */
import { centerPL, rankCenters, centerTotals } from '../src/lib/profit-centers.ts';

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

const center = (id, name, revenue, cost, project = null) => ({ id, name, project, revenue, cost });

console.log('\n── ١ · هامش المركز الواحد ───────────────────────────\n');

const tibyan = centerPL(center('c1', 'جمعية التبيان', 250000, 160000));
eq(tibyan.margin, 90000, 'الهامش = الإيراد ناقص التكلفة');
eq(tibyan.marginPct, 36, 'ونسبته من الإيراد ٣٦٪');

const losing = centerPL(center('c2', 'مشروع خاسر', 40000, 55000));
eq(losing.margin, -15000, 'والخسارة تظهر سالبة لا مطلقة');
check(losing.marginPct < 0, 'ونسبتها سالبة كذلك');

console.log('\n── ٢ · مصيدة الصفر ──────────────────────────────────\n');

const fresh = centerPL(center('c3', 'مشروع لم يبدأ', 0, 12000));
eq(
  fresh.marginPct,
  null,
  '★ **مركزٌ بلا إيراد نسبته `null` لا صفر** — الصفر يعني «باع ولم يربح»، والغياب «لم يبع بعد»'
);
eq(fresh.margin, -12000, 'ويبقى هامشه المطلق ظاهرًا — التكلفة أُنفقت فعلًا');

console.log('\n── ٣ · الترتيب ──────────────────────────────────────\n');

const ranked = rankCenters([
  center('a', 'أ', 100000, 40000), // 60000
  center('b', 'ب', 90000, 30000), // 60000
  center('c', 'ج', 50000, 20000), // 30000
]);

eq(ranked.map((r) => r.name), ['أ', 'ب', 'ج'], 'الترتيب بالهامش نزولًا');
eq(
  ranked.map((r) => r.rank),
  [1, 1, 3],
  '★ **والمتساويان يشتركان في المركز ثم يقفز التالي** — لا فصلَ بترتيب الحروف'
);

console.log('\n── ٤ · الإجمالي ─────────────────────────────────────\n');

const totals = centerTotals(ranked);
eq(totals.revenue, 240000, 'إجمالي الإيراد');
eq(totals.cost, 90000, 'وإجمالي التكلفة');
eq(totals.margin, 150000, 'والهامش الكلي');
eq(totals.losing, 0, 'ولا مركز خاسرًا هنا');

const withLoss = centerTotals(rankCenters([center('a', 'أ', 10000, 4000), center('b', 'ب', 1000, 9000)]));
eq(withLoss.losing, 1, 'ومركزٌ خاسر يُعدّ — أول ما يبحث عنه المالك');

const empty = centerTotals([]);
eq(empty.marginPct, null, 'وبلا مراكز لا نسبة تُخترع');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
