/**
 * اختبار قراءة دفتر المحاسب العربي (لهجة شيت ٢٠٢٢).
 *
 * الصفوف هنا **منقولة حرفيًّا** من دفتر ٢٠٢٢ الفعلي — لا مخترعة. وهذا
 * مقصود: اختبارٌ بصفٍّ مصنوع يمرّ على دفترٍ لا يمرّ.
 *
 * التشغيل:  npm run test:import-ledger-ar
 */
import {
  parseArabicLedgerDate,
  parseArabicAmount,
  parseArabicLedgerRow,
  periodOfDate,
  isArabicHeaderLine,
  ARABIC_MAIN_ACCOUNTS,
} from '../src/lib/import-ledger-ar.ts';

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

console.log('\n── ١ · التاريخ ──────────────────────────────────────\n');

eq(parseArabicLedgerDate('1-Jan-22')?.toISOString().slice(0, 10), '2022-01-01', 'صيغة 1-Jan-22');
eq(parseArabicLedgerDate('31-Dec-22')?.toISOString().slice(0, 10), '2022-12-31', 'وآخر يوم في السنة');
eq(
  parseArabicLedgerDate('1-Jan-22')?.getUTCFullYear(),
  2022,
  '★ **والسنة ذات الرقمين تُقرأ ٢٠٢٢ لا ١٩٢٢** — وإلا سقط القيد خارج كل فترة'
);
eq(parseArabicLedgerDate('2022-03-15')?.toISOString().slice(0, 10), '2022-03-15', 'وصيغة ISO احتياطًا');
eq(parseArabicLedgerDate('15/03/2022')?.toISOString().slice(0, 10), '2022-03-15', 'وصيغة يوم/شهر/سنة');
eq(parseArabicLedgerDate('كلام'), null, 'وما لا يُقرأ يُعاد فارغًا لا يُخمَّن');
eq(parseArabicLedgerDate(''), null, 'والفراغ كذلك');
eq(periodOfDate(parseArabicLedgerDate('1-Jan-22')), '2022-01', 'والفترة بصفر مُقدَّم');

console.log('\n── ٢ · المبالغ ──────────────────────────────────────\n');

eq(parseArabicAmount('98896'), 98896, 'رقم عادي');
eq(parseArabicAmount('3,827,409.375'), 3827409.375, 'وفاصلة الآلاف تُزال والكسر يبقى');
eq(parseArabicAmount(''), 0, 'والفراغ صفر');
eq(parseArabicAmount('.'), 0, 'وعلامة المراجعة صفر — الصف نفسه سليم');

console.log('\n── ٣ · صفوف من الدفتر الحقيقي ───────────────────────\n');

// نقلًا حرفيًّا عن الصف الأول في دفتر ٢٠٢٢
const opening = parseArabicLedgerRow(
  ['1','1-Jan-22','1','1','','',
   'بدأ أعمال شركة فاست ترانس للترجمة والدعاية والإعلان - إيداع نقدي بالخزينة الرئيسية للشركة',
   '98896','','المقر الإداري للشركة','النقدية','الخزينة'],
  1
);
eq(opening.accountType, 'asset', 'النقدية أصل');
eq(opening.debit, 98896, 'والمبلغ مدين');
eq(opening.path, ['النقدية','الخزينة'], '★ **والمسار مستواه اثنان** — رئيسي وفرعي كما في دفتر المحاسب');
eq(opening.costCenter, 'المقر الإداري للشركة', 'ومركز الربحية كما ورد');
eq(opening.period, '2022-01', 'وفترته يناير');

const capital = parseArabicLedgerRow(
  ['8','1-Jan-22','1','1','','',
   'بدأ ت شركة فاست ترانس أعمالها برأس مال قدره 600,000 جنيه مصري',
   '','600000','المقر الإداري للشركة','رأس المال المدفوع','رأس المال المدفوع'],
  8
);
eq(capital.accountType, 'equity', 'رأس المال حقوق ملكية');
eq(capital.credit, 600000, 'ودائن ٦٠٠ ألف');
eq(
  capital.path,
  ['رأس المال المدفوع'],
  '★ **والفرعي المطابق للرئيسي لا يُكرَّر** — وإلا صار حسابٌ ابنًا لنفسه'
);

const rent = parseArabicLedgerRow(
  ['11','3-Jan-22','1','','','','سداد إيجار المقر الإداري للشركة عن شهر يناير 2022م',
   '3500','','المقر الإداري للشركة','مصروفات عمومية وإدارية','مصروف الإيجار'],
  11
);
eq(rent.accountType, 'expense', 'الإيجار مصروف');
eq(
  rent.expenseGroup,
  'general_admin',
  '★ **والمجموعة كما صنّفها المحاسب لا كما نراها** — وإعادةُ التصنيف مكانها شاشة الحسابات'
);

const revenue = parseArabicLedgerRow(
  ['1','10-Mar-22','3','','','','إيراد خدمات الترجمة - ترجمة سجل تجاري',
   '','350','نشــــــــــاط الترجمة (فاست ترانس)','الايرادات','إيرادات ترجمة'],
  1
);
eq(revenue.accountType, 'revenue', 'الإيراد إيراد');
eq(revenue.expenseGroup, null, 'وليس له مجموعة مصروف');
eq(revenue.costCenter, 'نشــــــــــاط الترجمة (فاست ترانس)', 'ومركز ربحيته نشاط الترجمة');

console.log('\n── ٤ · ما يُرفض ─────────────────────────────────────\n');

const unknown = parseArabicLedgerRow(
  ['1','1-Jan-22','1','','','','بيان','100','','','حساب مخترَع','فرعي'],
  1
);
check(
  'reason' in unknown && unknown.reason.includes('حساب رئيسي غير معروف'),
  '★ **وحسابٌ رئيسيّ مجهول يُوقف صفَّه ولا يُخمَّن نوعه** — النوع يقرّر أين يقع في القائمتين'
);

const both = parseArabicLedgerRow(
  ['1','1-Jan-22','1','','','','بيان','100','100','','النقدية','الخزينة'],
  1
);
check('reason' in both && both.reason.includes('مدين ودائن'), 'وصفٌ مدين ودائن معًا يُوقف');

const empty = parseArabicLedgerRow(
  ['1','1-Jan-22','1','','','','بيان','','','','النقدية','الخزينة'],
  1
);
check('reason' in empty && empty.reason.includes('بلا مبلغ'), 'وصفٌ بلا مبلغ يُوقف');

const badDate = parseArabicLedgerRow(
  ['1','لا تاريخ','1','','','','بيان','100','','','النقدية','الخزينة'],
  1
);
check('reason' in badDate && badDate.reason.includes('التاريخ'), 'وتاريخٌ غير مقروء يُوقف ويُقال');

console.log('\n── ٥ · الترويسة والخريطة ────────────────────────────\n');

check(
  isArabicHeaderLine(['م','التاريخ','Descripition','رقم القيد','','','بيان','مدين','دائن','مركز التكلفة','الحساب الرئيسي','الحساب الفرعي']),
  'الترويسة تُعرف فتُتخطّى'
);
check(!isArabicHeaderLine(['1','1-Jan-22']), 'وصفُّ بياناتٍ ليس ترويسة');

// كل الحسابات الرئيسية الخمسة عشر التي ظهرت في دفتر ٢٠٢٢ معروفة
const inLedger2022 = ['النقدية','الايرادات','مصروفات عمومية وإدارية','حسابات دائنة',
  'حسابات جارية','الاصول الثابتة','الموردون','العملاء','العهد',
  'مجمع إهلاك الاصول الثابتة','حسابات مدينة','عملاء دفعات مقدمة',
  'موردين دفعات مقدمة','رأس المال المدفوع','أرباح وخسائر فروق العملة'];
const missing = inLedger2022.filter((m) => !ARABIC_MAIN_ACCOUNTS[m]);
eq(missing, [], '★ **وكل حساب رئيسيّ في دفتر ٢٠٢٢ معروف** — فلا يُوقَف صفٌّ لسببٍ كان يمكن تفاديه');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
