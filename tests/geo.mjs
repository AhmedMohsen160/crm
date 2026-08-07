/**
 * اختبار الدول والمدن.
 *
 * **الكتابة الحرّة تُنتج «مصر» و«مصر ‏» و«Egypt» أربعةَ صفوف لشيء واحد.**
 * والقائمة تُغلق الباب — وهذا الاختبار يحرس أن تبقى مغلقة ومرتّبة.
 *
 * التشغيل:  npm run test:geo
 */
import { COUNTRIES, COUNTRY_NAMES, citiesOf, isKnownCountry } from '../src/lib/geo.ts';

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

console.log('\n── ١ · القائمة ──────────────────────────────────────\n');

check(COUNTRIES.length > 40, `${COUNTRIES.length} دولة`);
check(
  new Set(COUNTRIES.map((c) => c.code)).size === COUNTRIES.length,
  'ولا مفتاح دولة مكرَّر'
);
check(
  new Set(COUNTRY_NAMES).size === COUNTRY_NAMES.length,
  'ولا اسم مكرَّر — وإلا اختار المستخدم واحدًا وحُفظ الآخر'
);
check(
  COUNTRIES.every((c) => /[؀-ۿ]/.test(c.name)),
  'وكل الأسماء بالعربية — الواجهة عربية وحدها'
);

console.log('\n── ٢ · دول العمل أولًا ──────────────────────────────\n');

eq(COUNTRIES[0].name, 'مصر', '★ **مصر أولًا** — أغلب البيع فيها، ونزولُ المستخدم إليها كل مرة عبثٌ يتكرّر');
eq(COUNTRIES[1].name, 'السعودية', 'ثم السعودية — فرعا الرياض وبريدة');

console.log('\n── ٣ · المدن ────────────────────────────────────────\n');

eq(citiesOf('مصر').length, 27, 'محافظات مصر السبع والعشرون');
check(citiesOf('مصر').includes('الإسكندرية'), 'وفيها الإسكندرية — فرعٌ للمكتب');
check(citiesOf('السعودية').includes('الرياض'), 'ومدن السعودية فيها الرياض');
check(citiesOf('السعودية').includes('بريدة'), 'وبريدة — الفرع الثاني');

check(
  COUNTRIES.every((c) => new Set(c.cities).size === c.cities.length),
  'ولا مدينة مكرَّرة داخل دولتها'
);

console.log('\n── ٤ · ما لا نعرفه ──────────────────────────────────\n');

eq(
  citiesOf('أطلانتس'),
  [],
  '★ **ودولةٌ لا نعرفها تُعيد فارغًا** — والشاشة تترك الخانة تُكتب، فلا يُردّ عميل'
);
eq(citiesOf(null), [], 'وبلا دولة لا مدن');
eq(citiesOf(''), [], 'والفراغ كذلك');

check(isKnownCountry('مصر'), 'ومصر دولةٌ نعرفها');
check(!isKnownCountry('Egypt'), 'و«Egypt» ليست منها — الأسماء عربية وحدها');
check(!isKnownCountry(null), 'والفراغ ليس دولة');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
