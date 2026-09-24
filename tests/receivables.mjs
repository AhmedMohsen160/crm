/**
 * اختبار أعمار الذمم.
 *
 * **مئة ألف عمرها أسبوع غير مئة ألف عمرها أربعة أشهر.** والرقم المجرّد
 * يخفي الفرق فيُقرأ الاثنان سواءً — وهذا الاختبار يحرس الحدود وما بينها.
 *
 * التشغيل:  npm run test:receivables
 */
import {
  bucketOf,
  daysBetween,
  ageReceivables,
  AGING_ORDER,
  AGING_LABELS,
} from '../src/lib/receivables.ts';

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

console.log('\n── ١ · الشرائح وحدودها ──────────────────────────────\n');

eq(bucketOf(0), 'current', 'اليوم نفسه: خلال ٣٠');
eq(bucketOf(29), 'current', 'واليوم ٢٩ كذلك');
eq(
  bucketOf(30),
  'current',
  '★ **والحدّ يُبلَغ لا يُتجاوَز** — يوم ٣٠ ما زال «خلال ٣٠» لا متأخّرًا'
);
eq(bucketOf(31), 'd30', 'والحادي والثلاثون أول المتأخّر');
eq(bucketOf(60), 'd30', 'ويوم ٦٠ آخر شريحته');
eq(bucketOf(61), 'd60', 'و٦١ ينتقل');
eq(bucketOf(90), 'd60', 'و٩٠ آخر شريحته');
eq(bucketOf(91), 'd90', 'و٩١ ينتقل');
eq(bucketOf(120), 'd90', 'و١٢٠ آخرها');
eq(bucketOf(121), 'over90', 'وما بعدها: أكثر من ٩٠');

eq(AGING_ORDER.length, 5, 'خمس شرائح');
check(
  AGING_ORDER.every((k) => (AGING_LABELS[k] ?? '').length > 0),
  'ولكل شريحة اسمٌ عربي — لا مفتاح إنجليزي في شاشة'
);

console.log('\n── ٢ · حساب الأيام ──────────────────────────────────\n');

const day = (n) => new Date(2026, 0, n);
eq(daysBetween(day(1), day(31)), 30, 'ثلاثون يومًا بين الأول والحادي والثلاثين');
eq(daysBetween(day(10), day(10)), 0, 'وبلا فارق صفر');

console.log('\n── ٣ · التوزيع ──────────────────────────────────────\n');

const asOf = new Date(2026, 5, 30);
const ago = (days) => new Date(asOf.getTime() - days * 86_400_000);

const aged = ageReceivables(
  [
    { outstanding: 10000, deliveredAt: ago(5) },
    { outstanding: 20000, deliveredAt: ago(45) },
    { outstanding: 30000, deliveredAt: ago(200) },
    { outstanding: 5000, deliveredAt: null },
  ],
  asOf
);

eq(aged.buckets.current, 10000, 'الحديث في شريحته');
eq(aged.buckets.d30, 20000, 'والمتأخر ٤٥ يومًا في شريحته');
eq(aged.buckets.over90, 30000, 'والمتأخر ٢٠٠ يوم في الأخيرة');
eq(aged.total, 60000, 'والمجموع لا يشمل ما لم يُسلَّم');
eq(
  aged.notDue,
  5000,
  '★ **وما لم يُسلَّم مستحقٌّ قادم لا دَينٌ متأخّر** — عدّه تأخّرًا اتهامٌ في غير محلّه'
);
eq(aged.atRisk, 30000, 'وما جاوز ٩٠ يومًا هو الرقم الذي يستدعي قرارًا');

const paid = ageReceivables([{ outstanding: 0, deliveredAt: ago(300) }], asOf);
eq(paid.total, 0, 'والمسدَّد لا يدخل الأعمار — ولو طال عمره');

const negative = ageReceivables([{ outstanding: -500, deliveredAt: ago(10) }], asOf);
eq(negative.total, 0, 'والمدفوع زيادةً لا يُعدّ دَينًا سالبًا على العميل');

const none = ageReceivables([], asOf);
eq(none.total, 0, 'وبلا ذمم صفر — والصفر هنا حقيقة لا غياب قياس');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
