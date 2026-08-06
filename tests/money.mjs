/**
 * اختبار حساب المال بالقرش الصحيح.
 *
 * **هذا الاختبار يحرس ميزان المراجعة.** كل حالة فيه وقعت أو تكاد: كسرٌ
 * يتراكم عبر آلاف القيود، وقرشٌ يضيع في قسمة، ومقارنةٌ بـ`===` تكذب.
 *
 * التشغيل:  npm run test:money
 */
import {
  MINOR_UNITS,
  toPiastres,
  fromPiastres,
  money,
  sum,
  sumBy,
  add,
  subtract,
  multiply,
  equal,
  allocate,
} from '../src/lib/money.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}

console.log('\n── ١ · ما تفعله الفاصلة العائمة ─────────────────────\n');

check(0.1 + 0.2 !== 0.3, '★ **الحاسوب لا يعرف عُشرًا**: ٠٫١ + ٠٫٢ لا تساوي ٠٫٣ عنده');
check(add(0.1, 0.2) === 0.3, 'والجمع بالقرش يعطي ٠٫٣ بالضبط');
check(sum([0.1, 0.2]) === 0.3, 'والمجموع كذلك');

console.log('\n── ٢ · التحويل ──────────────────────────────────────\n');

check(MINOR_UNITS === 100, 'القرش جزءٌ من مئة');
check(toPiastres(12.34) === 1234, '١٢٫٣٤ ج = ١٢٣٤ قرشًا');
check(
  toPiastres(1.005) === 101,
  '★ و١٫٠٠٥ تُقرَّب صعودًا كما يتوقّع من يقرأها — لا نزولًا كما تفعل الفاصلة'
);
check(toPiastres(-5.5) === -550, 'والسالب يُقرَّب بعيدًا عن الصفر كذلك');
check(toPiastres(Number.NaN) === 0 && toPiastres(Infinity) === 0, 'وما ليس رقمًا صفر لا انهيار');
check(fromPiastres(1234) === 12.34, 'والعودة إلى الجنيه صحيحة');
check(money(12.344999) === 12.34 && money(12.345) === 12.35, 'و`money` تُثبّت على قرش صحيح');

console.log('\n── ٣ · التراكم عبر آلاف الصفوف ──────────────────────\n');

// الحالة التي أخرجت ميزان المراجعة عن التوازن: كسرٌ يتكرّر آلاف المرات
const many = Array.from({ length: 2247 }, () => 0.07);
const naive = many.reduce((s, x) => s + x, 0);
const exact = sum(many);

check(
  naive !== 157.29,
  `★ **الجمع العادي ينحرف عبر ٢٬٢٤٧ صفًّا** — أعطى ${naive}`
);
check(exact === 157.29, `والجمع بالقرش يعطي ١٥٧٫٢٩ بالضبط — ${exact}`);

const thousand = Array.from({ length: 10_000 }, (_, i) => (i % 3 === 0 ? 0.01 : 33.33));
check(
  Number.isInteger(toPiastres(sum(thousand))),
  'وعشرة آلاف صفّ تبقى على قرشٍ صحيح بلا كسر'
);

check(sum([]) === 0, 'ومجموع لا شيء صفر');
check(
  sumBy([{ v: 1.1 }, { v: 2.2 }], (r) => r.v) === 3.3,
  'و`sumBy` تجمع حقلًا من صفوف'
);

console.log('\n── ٤ · الطرح والضرب والمقارنة ───────────────────────\n');

check(subtract(0.3, 0.1) === 0.2, 'الطرح بالقرش: ٠٫٣ − ٠٫١ = ٠٫٢');
check(multiply(100, 0.03) === 3, 'ونسبة ٣٪ من مئة = ٣');
check(multiply(19.99, 3) === 59.97, 'و١٩٫٩٩ × ٣ = ٥٩٫٩٧');
check(
  multiply(0.615, 0.5) === 0.31,
  '★ والضرب يقع على القروش ثم يُقرَّب **مرة واحدة** لا في كل خطوة'
);
check(multiply(100, Number.NaN) === 0, 'ومعاملٌ ليس رقمًا يعطي صفرًا لا NaN');

check(equal(0.1 + 0.2, 0.3), '★ **والمقارنة بـ`===` على الجنيهات كذبة** — `equal` تقارن بالقرش');
check(!equal(1.0, 1.01), 'والقرش الواحد فرقٌ يُرى');

console.log('\n── ٥ · التوزيع ──────────────────────────────────────\n');

const thirds = allocate(100, [1, 1, 1]);
check(
  sum(thirds) === 100,
  `★ **والباقي على آخر نصيب** — ١٠٠ على ثلاثة يعود مجموعه ١٠٠ لا ٩٩٫٩٩ (${thirds.join(' · ')})`
);
check(thirds[2] > thirds[0], 'وآخرهم يحمل القرش الزائد');

const weighted = allocate(1000, [3, 2]);
check(
  weighted[0] === 600 && weighted[1] === 400,
  `والتوزيع بالأوزان: ٣ إلى ٢ يعطي ٦٠٠ و٤٠٠ — ${weighted.join(' · ')}`
);

const zero = allocate(500, [0, 0]);
check(sum(zero) === 500, 'وبلا أوزان لا يضيع المبلغ — يذهب لآخر نصيب');
check(allocate(100, []).length === 0, 'وبلا أنصبة لا توزيع');

const single = allocate(33.33, [1]);
check(single[0] === 33.33, 'ونصيبٌ واحد يأخذ الكل');

// حالة الدفتر: مدين ودائن من مصادر مختلفة يجب أن يتطابقا بالقرش
const debits = [1234.56, 78.9, 0.07, 999.99];
const credits = allocate(sum(debits), [4, 3, 2, 1]);
check(
  equal(sum(debits), sum(credits)),
  '★ وقيدٌ وُزّع دائنُه على أربعة أنصبة يتوازن بالقرش تمامًا'
);

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
