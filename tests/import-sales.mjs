/**
 * اختبار قراءة شيت المبيعات.
 *
 * الترويسة هنا **منقولة حرفيًّا** من الشيت الفعلي بأخطائها الإملائية التي
 * بقيت فيه سنوات — `Rٌequested` بضمّةٍ عربية عالقة، و`Handeld`. واختبارٌ
 * بترويسةٍ مصحَّحة يمرّ على شيتٍ لا يمرّ.
 *
 * التشغيل:  npm run test:import-sales
 */
import {
  findSalesHeader,
  cleanClientName,
  nameKeyOf,
  salesTag,
  isImportTag,
} from '../src/lib/import-sales.ts';

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

console.log('\n── ١ · الترويسة ─────────────────────────────────────\n');

// منقولة حرفيًّا عن ورقة DATA
const HEADER = [
  'Date','Client Name','Phone Number','Communication Platform','Translation Type',
  'Rٌequested Services','Number of Pages','Funnel','branch','Sales Admin',
  'price collected','Customer Country','On deadline','with problem?','Handeld',
  'Review','Follow Up','date',
];

const found = findSalesHeader([HEADER]);
eq(found.row, 0, 'الترويسة في صفّها');
eq(found.columns.date, 0, 'والتاريخ أول عمود');
eq(found.columns.name, 1, 'واسم العميل بعده');
eq(
  found.columns.service,
  5,
  '★ **والضمّة العالقة في `Rٌequested` لا تمنع المطابقة** — بقيت في الشيت سنوات'
);
eq(found.columns.price, 10, 'وعمود المحصَّل في موضعه');
eq(found.columns.problem, 13, 'وعمود المشكلة كذلك');
eq(
  found.columns.date,
  0,
  '★ **وعمود `date` المكرَّر في آخر الصفّ لا يزيح الأول** — وهو عمود متابعةٍ لا تاريخ الطلب'
);

// عمود يُدرج في المنتصف — من يعدّ الأعمدة يعمى عنه
const shifted = findSalesHeader([['Date', 'Serial', 'Client Name', 'price collected']]);
eq(
  [shifted.columns.name, shifted.columns.price],
  [2, 3],
  '★ **وعمودٌ يُدرج في المنتصف لا يُزيح القراءة** — لأنها بالأسماء لا بالترتيب'
);

eq(findSalesHeader([['Date', 'Amount']]), null, 'وورقةٌ بلا عمود اسم ليست شيت مبيعات');
eq(findSalesHeader([]), null, 'وورقةٌ فارغة تُعاد فارغة');

// الترويسة قد لا تكون في الصف الأول
const late = findSalesHeader([[], ['تقرير المبيعات'], HEADER]);
eq(late.row, 2, 'وترويسةٌ تحتها صفوفُ عنوان تُوجد في موضعها');

console.log('\n── ٢ · اسم العميل ───────────────────────────────────\n');

eq(cleanClientName('  أحمد   محمد  '), 'أحمد محمد', 'الفراغات الزائدة تُطوى');
eq(cleanClientName('أحمد‏'), 'أحمد', 'ومحارف الاتجاه غير المرئية تُزال');
eq(
  cleanClientName('هبة'),
  'هبة',
  '★ **والتاء المربوطة تبقى** — الاسم يُعرض للموظف، وطيُّه يجعله «هبه» في شاشة يقرؤها كل يوم'
);
eq(cleanClientName(null), '', 'والفراغ فراغ');

console.log('\n── ٣ · مفتاح العميل بلا رقم ─────────────────────────\n');

eq(
  nameKeyOf('هبه عادل'),
  nameKeyOf('هبه  عادل'),
  '★ **وصفّان لاسمٍ واحد بلا رقم عميلٌ واحد** — وإفرادُ كلٍّ بمفتاح يمزّق سجلّ مشترياته'
);
check(nameKeyOf('أحمد').startsWith('NAME:'), 'والبادئة صريحة فلا يلتبس بهاتفٍ مطبَّع');
check(nameKeyOf('أحمد') !== nameKeyOf('محمد'), 'واسمان مختلفان مفتاحان مختلفان');

console.log('\n── ٤ · وسم الترحيل ──────────────────────────────────\n');

eq(salesTag(2022), 'sales-2022', 'الوسم بالسنة');
eq(
  salesTag(2026) !== salesTag(2025),
  true,
  '★ **والسنة وحدةُ السحب** — فتُعاد ٢٠٢٦ وحدها ويبقى ما قبلها'
);
check(isImportTag('ledger-2023'), 'ووسم الدفتر معروف');
check(isImportTag('settle-2024'), 'ووسم التسوية كذلك');
check(!isImportTag('ledger-٢٠٢٣'), 'وما ليس بالصيغة يُرفض — فلا يُسحب وسمٌ مخترَع');
check(!isImportTag(''), 'والفراغ ليس وسمًا');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
