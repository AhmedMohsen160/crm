/**
 * اختبار تنظيف أسماء العملاء ودمجها.
 *
 * **الأسماء هنا منقولة من دفاتر المكتب الفعلية** لا مخترعة — اختبارٌ بأسماء
 * مصنوعة يمرّ على دفترٍ لا يمرّ.
 *
 * التشغيل:  npm run test:client-merge
 */
import {
  clientCore,
  mergeKey,
  looksSame,
  groupNames,
  isExecutiveClient,
  ownerFor,
  EXECUTIVE_CLIENT_NAMES,
} from '../src/lib/client-merge.ts';

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
// الدمج الفعلي يقع على `looksSame` لا على تطابق المفتاح — فيُختبر به
const same = (a, b) => looksSame(mergeKey(a), mergeKey(b));

console.log('\n── ١ · لبّ الاسم ────────────────────────────────────\n');

eq(clientCore('شركة سوليد للإنشاءات'), 'سوليد للانشاءات', 'تُنزع «شركة»');
eq(clientCore('مؤسسة البصيرة الإسلامية'), 'البصيره الاسلاميه', 'وتُنزع «مؤسسة» وتُطبَّع الهمزات');
eq(clientCore('مشروع دار يتخيلون'), 'يتخيلون', '★ **والصفات المتراكمة تُنزع كلها** — «مشروع دار يتخيلون»');
eq(clientCore('د.علي الشبيلي'), 'علي الشبيلي', 'واللقب يُنزع');
eq(clientCore('العميل/علي الشبيلي'), 'علي الشبيلي', 'و«العميل/» كذلك');

console.log('\n── ٢ · اللواحق الوصفية ──────────────────────────────\n');

eq(
  clientCore('قرآن هاوس نظير تقديم خدمات تحسين محركات البحث'),
  'قران هاوس',
  '★ **وما بعد «نظير» وصفُ خدمةٍ لا اسمُ عميل**'
);
eq(
  clientCore('د.علي الشبيلي لمشروع دبلومة الوالدية'),
  'علي الشبيلي',
  'وما بعد «لمشروع» مشروعُه لا اسمُه'
);

console.log('\n── ٣ · الدمج — صيغ حقيقية من الدفاتر ────────────────\n');

check(same('قرآن هاوس', 'أكاديمية قرآن هاوس'), '«قرآن هاوس» و«أكاديمية قرآن هاوس» عميل واحد');
check(same('مشروع قرآن هاوس', 'قرآن هاوس'), 'ومركز الربحية باسمه يُدمج معه');
check(same('دار يتخيلون للنشر والتوزيع', 'مشروع دار يتخيلون'), 'ويتخيلون كذلك');
check(same('شركة ترانسليشن هوم للترجمة', 'ترانزليشن هوم للترجمة'), 'وترانسليشن/ترانزليشن — والفرق سين وزاي');
check(same('مركز سلام للدعوة والحوار', 'مركز سلام للدعوة والحوار '), 'والفراغ الزائد لا يفرّق');
check(same('الاصول', 'الأصول'), 'والهمزة لا تفرّق');

check(
  !same('دار العالمية للتشييد والبناء', 'دار يتخيلون للنشر والتوزيع'),
  '★ **وعميلان مختلفان لا يُدمجان** — الدمج على اللبّ لا على الصفة المشتركة'
);
check(!same('شركة غاز مصر', 'شركة حلوان للاسمدة'), 'ولا هذان');

console.log('\n── ٤ · التجميع ──────────────────────────────────────\n');

const groups = groupNames([
  { raw: 'قرآن هاوس', amount: 80710, count: 8, years: [2023] },
  { raw: 'أكاديمية قرآن هاوس', amount: 142898, count: 12, years: [2024] },
  { raw: 'قرآن هاوس نظير تقديم خدمات تحسين محركات البحث', amount: 117685, count: 6, years: [2024] },
  { raw: 'شركة سوليد للإنشاءات', amount: 138965, count: 25, years: [2023] },
]);

eq(groups.length, 2, 'أربع صيغ صارت عميلين');
eq(groups[0].amount, 341293, 'ومبلغ قرآن هاوس مجموعٌ من الثلاثة');
eq(groups[0].count, 26, 'وعدد سطوره');
eq(groups[0].years, [2023, 2024], 'وسنواته مرتَّبة');
eq(
  groups[0].suggested,
  'قرآن هاوس نظير تقديم خدمات تحسين محركات البحث',
  'والمقترح أطول الصيغ — يُعدَّل في الشاشة'
);
eq(groups[0].variants.length, 3, 'والصيغ الثلاث محفوظة ليراها أحمد');
check(groups[0].amount > groups[1].amount, 'والترتيب بالأكبر مبلغًا');

eq(groupNames([{ raw: '   ', amount: 5, count: 1, years: [2023] }]).length, 0, 'والفراغ لا يصير عميلًا');

console.log('\n── ٥ · الملكية ──────────────────────────────────────\n');

const rule = { defaultOwnerId: 'megaly', executiveOwnerId: 'ahmed' };

/**
 * **والعدد ليس ثابتًا فلا يُختبر برقم.** أحمد يتذكّر عميلًا فيضيفه من
 * الشاشة، واختبارٌ يفحص «خمسة» يسقط كلما تذكّر — والمقصود أن كل اسمٍ في
 * القائمة يُلتقط بصياغاته لا أن يبقى عددُها كما كان.
 */
for (const name of EXECUTIVE_CLIENT_NAMES) {
  check(isExecutiveClient(name), `«${name}» من عملاء المدير التنفيذي`);
}
check(isExecutiveClient('مركز سلام للدعوة والحوار'), 'و«مركز سلام للدعوة والحوار» بصياغته الكاملة');
check(isExecutiveClient('أكاديمية قرآن هاوس'), 'وقرآن هاوس');
check(isExecutiveClient('مؤسسة البصيرة الإسلامية'), 'والبصيرة');
check(isExecutiveClient('شركة ترانسليشن هوم للترجمة'), 'وترانسليشن هوم');
check(isExecutiveClient('د.علي الشبيلي'), 'وعلي الشبيلي');
check(isExecutiveClient('مشروع دار يتخيلون'), 'ودار يتخيلون');
check(!isExecutiveClient('شركة سوليد للإنشاءات'), 'وسوليد ليس منهم');
check(!isExecutiveClient('فضة'), 'ولا فضة — هي لأحمد مجلي');

eq(ownerFor('مركز سلام', rule), 'ahmed', 'فيُنسب سلام للمدير التنفيذي');
eq(
  ownerFor('شركة سوليد للإنشاءات', rule),
  'megaly',
  '★ **وما عداهم لأحمد مجلي** — كان الوحيد قبل توظيف الفريق'
);
eq(
  ownerFor('مركز سلام', rule, 'nora'),
  'nora',
  '★ **وما قاله شيت المبيعات يعلو على القاعدة** — القاعدة لمن لم يُذكر له بائع'
);
eq(ownerFor('', rule), 'megaly', 'وبلا اسم: الافتراضي');
eq(
  ownerFor('عميل جديد', { ...rule, executiveNames: ['عميل جديد'] }),
  'ahmed',
  'والقائمة تُوسَّع من الشاشة بلا كود'
);

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
