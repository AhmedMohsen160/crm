/**
 * اختبار تصنيف العملاء وفتراتهم وترتيبهم.
 *
 * **لماذا يُختبر تصنيف؟** لأن كلمة «متوقّف» في شاشةٍ يفتحها الأدمن كل صباح
 * هي أمرٌ بالاتصال. فإن أخطأ التصنيف يومًا واحدًا في حدّه، ظهر عميلٌ حيٌّ في
 * قائمة المهجورين — أو اختفى المهجور تحت وسام «متكرّر» فلم يتصل به أحد.
 *
 * التشغيل:  npm run test:client-segments
 */
import {
  CLIENT_SEGMENTS,
  CLIENT_SEGMENT_ORDER,
  CLIENT_SEGMENT_COLORS,
  CLIENT_PERIODS,
  CLIENT_SORTS,
  DORMANT_AFTER_DAYS,
  clientSegment,
  daysBetween,
  periodRange,
  sortClients,
} from '../src/lib/client-segments.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}

const NOW = new Date('2026-08-05T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000);
const seg = (dealCount, lastDealAt) => clientSegment({ dealCount, lastDealAt }, NOW);

console.log('\n── ١ · التصنيف ──────────────────────────────────────\n');

check(seg(0, null) === 'prospect', 'من لا مشروع له: «بلا تعامل بعد» لا «متوقّف»');
check(
  seg(3, null) === 'prospect',
  'وعددٌ بلا تاريخ يُقرأ «غير مقيس» — لا يُخترع له تاريخ'
);
check(seg(1, daysAgo(3)) === 'new', 'مشروعٌ واحد حديث: عميل جديد');
check(seg(2, daysAgo(3)) === 'repeat', 'واثنان: متكرّر — تعريف التسعير نفسه (§١٠ بند ٣)');
check(seg(9, daysAgo(30)) === 'repeat', 'وتسعةٌ خلال الشهر: متكرّر');

console.log('\n── ٢ · حدّ التوقّف ──────────────────────────────────\n');

check(DORMANT_AFTER_DAYS === 120, 'الحدّ ١٢٠ يومًا — لا شهرًا يُلوّن السجل كله');
check(
  seg(5, daysAgo(DORMANT_AFTER_DAYS)) === 'repeat',
  '★ بلوغُ الحدّ ليس تجاوزًا — في اليوم ١٢٠ ما زال متكرّرًا'
);
check(
  seg(5, daysAgo(DORMANT_AFTER_DAYS + 1)) === 'dormant',
  'وفي اليوم ١٢١ صار متوقّفًا'
);
check(
  seg(9, daysAgo(200)) === 'dormant',
  '★ **«متوقّف» تسبق «متكرّر»** — تسعةُ مشاريع انقطعت اسمٌ يُتصل به لا وسامٌ يُخفيه'
);
check(seg(1, daysAgo(200)) === 'dormant', 'وصاحب المشروع الواحد المنقطع متوقّف كذلك');
check(daysBetween(daysAgo(10), NOW) === 10, 'حساب الأيام صحيح');

console.log('\n── ٣ · التسميات ─────────────────────────────────────\n');

check(
  CLIENT_SEGMENT_ORDER.length === Object.keys(CLIENT_SEGMENTS).length,
  'كل تصنيف له مكانه في الترتيب'
);
check(
  CLIENT_SEGMENT_ORDER.every((k) => CLIENT_SEGMENTS[k] && CLIENT_SEGMENT_COLORS[k]),
  'وكل تصنيف له اسمٌ عربي ولونٌ — فلا يظهر مفتاحٌ إنجليزي في شاشة'
);

console.log('\n── ٤ · الفترات ──────────────────────────────────────\n');

const all = periodRange(undefined, NOW);
check(
  all.from === null && all.to === null,
  '★ **الغياب يعني كل الفترات لا هذا الشهر** — من يفتح الشاشة أول مرة يريد سجلّه كاملًا'
);
check(periodRange('نصف قرن', NOW).from === null, 'وقيمةٌ غريبة تُقرأ «كل الفترات» لا تُسقط الشاشة');

const month = periodRange('month', NOW);
check(
  month.from.getMonth() === 7 && month.from.getDate() === 1 && month.to.getMonth() === 8,
  'هذا الشهر: من أول أغسطس إلى أول سبتمبر'
);

const quarter = periodRange('quarter', NOW);
check(
  quarter.from.getMonth() === 5 && quarter.from.getFullYear() === 2026,
  'آخر ٣ شهور: من أول يونيو'
);

const half = periodRange('half', NOW);
check(half.from.getMonth() === 2, 'آخر ٦ شهور: من أول مارس');

const year = periodRange('year', NOW);
check(
  year.from.getFullYear() === 2026 && year.from.getMonth() === 0,
  'هذه السنة: من أول يناير ٢٠٢٦'
);

const prev = periodRange('prev_year', NOW);
check(
  prev.from.getFullYear() === 2025 && prev.to.getFullYear() === 2026,
  'السنة الماضية: كل ٢٠٢٥ ولا يومَ من ٢٠٢٦'
);

// انقلاب السنة: يناير ناقص شهرين = نوفمبر السابقة
const JAN = new Date('2026-01-10T12:00:00Z');
const janQuarter = periodRange('quarter', JAN);
check(
  janQuarter.from.getFullYear() === 2025 && janQuarter.from.getMonth() === 10,
  '★ وفي يناير ترجع الفترة إلى نوفمبر السنة الماضية — لا تنكسر عند حدّ السنة'
);

check(
  Object.keys(CLIENT_PERIODS).every((k) => periodRange(k, NOW).from !== null),
  'كل فترة معروضة في الشاشة لها مدى محسوب'
);

console.log('\n── ٥ · الترتيب ──────────────────────────────────────\n');

const rows = [
  { name: 'باسم', dealCount: 1, totalValue: 9000, lastDealAt: daysAgo(300) },
  { name: 'أحمد', dealCount: 7, totalValue: 5000, lastDealAt: daysAgo(2) },
  { name: 'زياد', dealCount: 0, totalValue: 0, lastDealAt: null },
];

check(sortClients(rows, 'value')[0].name === 'باسم', 'الأعلى قيمة أولًا');
check(sortClients(rows, 'deals')[0].name === 'أحمد', 'والأكثر تكرارًا أولًا');
check(sortClients(rows, 'recent')[0].name === 'أحمد', 'والأحدث تعاملًا أولًا');
check(
  sortClients(rows, 'recent').at(-1).name === 'زياد',
  '★ **من لم يتعامل بعدُ يذهب إلى الآخر** — لا إلى الأول لأن تاريخه صفر'
);
check(sortClients(rows, 'name')[0].name === 'أحمد', 'والاسم يُرتَّب عربيًا');
check(sortClients(rows, undefined)[0].name === 'باسم', 'والافتراضي القيمة');
check(
  sortClients(rows, 'value') !== rows && rows[0].name === 'باسم',
  'والترتيب لا يعبث بالمصفوفة الأصلية'
);
check(
  Object.keys(CLIENT_SORTS).every((k) => sortClients(rows, k).length === rows.length),
  'ولا ترتيبٌ يُسقط صفًّا'
);

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
