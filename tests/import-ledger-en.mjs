/**
 * اختبار قراءة دفتر ٢٠٢٦ الإنجليزي.
 *
 * الخطر الذي يحرسه هذا الملف: **قارئٌ يعدّ الأعمدة بدل أن يقرأ أسماءها**.
 * أضاف المحاسب عمود `Social insurance` في آخر الورقة مكان `3rd Sub Account`،
 * فصار القارئ الملصوق يقرأ رقم تأمينٍ اجتماعيّ اسمَ حساب — ولا شيء يُنبّه:
 * القيد يتوازن، والدفتر يبدو سليمًا، والشجرة وحدها فيها فرعٌ لا وجود له.
 *
 * التشغيل:  npm run test:import-ledger-en
 */
import {
  enKey,
  findEnglishHeader,
  parseEnglishLedgerRow,
  isOpeningBalanceMemo,
  trafficKeyOf,
} from '../src/lib/import-ledger-en.ts';

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

// ═══════════════════════════════════════════════════════════════
//  ١ · مفتاح المطابقة
// ═══════════════════════════════════════════════════════════════

eq(enKey('Main Account'), 'mainaccount', 'المفتاح يطوي الفراغ ويصغّر الحروف');
eq(enKey('N 🔒'), 'n', 'القفل المرسوم في الترويسة يُطوى');
eq(enKey('1nd Sub Account'), '1ndsubaccount', 'خطأ المحاسب الإملائي يُقرأ كما هو');
check(enKey('Debt') !== enKey('Debt $'), '★ الجنيه والدولار مفتاحان لا مفتاح', 'لو تساويا لقُرئ الدولار مبلغًا أساسيًّا');

// ═══════════════════════════════════════════════════════════════
//  ٢ · الترويسة — بالأسماء لا بالترتيب
// ═══════════════════════════════════════════════════════════════

/** ترويسة الملف الحقيقي حرفًا بحرف — وفيها `Social insurance` في الذيل */
const HEADER = [
  'N 🔒', 'Date', 'Month 🔒', 'Document type', 'Document Number', 'Description',
  'Debt', 'Debt $', 'Credit', 'Credit $', 'Sub balance', 'Sub balance $',
  'Branch', 'Sales Admin', 'Traffic Source', 'Units sold', 'Translation type',
  'Account', 'Project', 'Main Account', '1nd Sub Account', '2nd Sub Account',
  'Social insurance',
];

const found = findEnglishHeader([['تقرير القيود'], [], HEADER, []]);
check(found !== null, 'الترويسة تُوجد ولو سبقتها صفوف عناوين');
eq(found.row, 2, 'ورقمُ صفّها يُعاد');
eq(found.columns.debit, 6, '«Debt» هو عمود المدين بالجنيه');
eq(found.columns.mainAccount, 19, '«Main Account» بموضعه لا بترتيبه');
eq(found.columns.subAccount, 20, 'والمستوى الثاني');
eq(found.columns.subAccount2, 21, 'والثالث');
check(
  found.columns.subAccount3 === undefined,
  '★ **ولا مستوى رابع في هذه الورقة** — و`Social insurance` لا يُقرأ حسابًا',
  `قُرئ العمود ${found.columns.subAccount3}`
);

/** والعمود لو انتقل موضعه تُقرأ الورقة كما هي */
const shuffled = findEnglishHeader([['Main Account', 'Date', 'Debt', 'Credit', '1nd Sub Account']]);
eq(shuffled.columns.mainAccount, 0, 'ترتيبٌ مقلوب يُقرأ بأسمائه');
eq(shuffled.columns.date, 1, 'والتاريخ في موضعه الجديد');

check(
  findEnglishHeader([['التاريخ', 'مدين', 'الحساب الرئيسي']]) === null,
  'والترويسة العربية لا تُقرأ هنا — لكلٍّ قارئُه'
);
check(findEnglishHeader([['Date', 'Credit']]) === null, 'وصفٌّ بلا «Debt» ولا حساب ليس ترويسة');

// ═══════════════════════════════════════════════════════════════
//  ٣ · قراءة الصف
// ═══════════════════════════════════════════════════════════════

const columns = found.columns;

/** يبني صفًّا بمواضع الترويسة الحقيقية */
function row(overrides = {}) {
  const cells = new Array(HEADER.length).fill('');
  const set = (key, value) => {
    if (columns[key] !== undefined) cells[columns[key]] = value;
  };
  set('serial', '1');
  set('date', '2026-03-15');
  set('memo', 'Revenue');
  set('debit', '');
  set('credit', '');
  set('branch', 'Unspecified');
  set('salesAdmin', 'Unspecified');
  set('trafficSource', 'Unspecified');
  set('centerAccount', 'Unspecified');
  set('centerProject', 'Unspecified');
  set('mainAccount', 'Revenues');
  set('subAccount', 'Translation services Revenue');
  set('subAccount2', 'Written translation revenue');
  for (const [key, value] of Object.entries(overrides)) set(key, value);
  // «Social insurance» يبقى في ذيل الصف — والقارئ لا يراه
  cells[22] = '1234567890';
  return cells;
}

const revenue = parseEnglishLedgerRow(row({ credit: '5,000.50' }), columns, 10);
check(!('reason' in revenue), 'صفّ إيرادٍ سليم يُقرأ', revenue.reason);
eq(revenue.credit, 5000.5, 'والمبلغ بفاصلة الآلاف يُقرأ رقمًا');
eq(revenue.accountType, 'revenue', 'ونوعُه من «Revenues»');
eq(revenue.period, '2026-03', 'وفترتُه من تاريخه');
eq(
  revenue.path,
  ['Revenues', 'Translation services Revenue', 'Written translation revenue'],
  '★ والمسار ثلاثة مستويات — بلا التأمين الاجتماعي في ذيله'
);
eq(revenue.expenseGroup, null, 'والإيراد بلا مجموعة مصروف');

/**
 * ★ **مجموعة المصروف من المستوى الثاني لا من الجذر.**
 *
 * الجذر في الدفتر العربي كان «المصروفات العمومية والإدارية»، وصار هنا
 * `Expenses` وحده لكل المصروفات. وقراءتُها من الجذر تُنتج قائمة دخلٍ فيها
 * صفرٌ في البنود الثلاثة كلها والمصروف بأكمله خارجها.
 */
const expense = parseEnglishLedgerRow(
  row({
    debit: '1200',
    mainAccount: 'Expenses',
    subAccount: 'Selling and Marketing Expenses',
    subAccount2: 'Paid Advertising via Platforms Expenses',
  }),
  columns,
  11
);
eq(expense.accountType, 'expense', 'المصروف نوعُه من «Expenses»');
eq(expense.expenseGroup, 'selling_marketing', '★ ومجموعتُه من المستوى الثاني');

const admin = parseEnglishLedgerRow(
  row({ debit: '300', mainAccount: 'Expenses', subAccount: 'General and administrative expenses', subAccount2: 'Rent expense' }),
  columns,
  12
);
eq(admin.expenseGroup, 'general_admin', 'وعمومية وإدارية كذلك');

const production = parseEnglishLedgerRow(
  row({ debit: '900', mainAccount: 'Expenses', subAccount: 'Production and Operating Expenses', subAccount2: 'Outsourced Operational Services Expenses' }),
  columns,
  13
);
eq(production.expenseGroup, 'production_operating', 'وإنتاجية وتشغيلية');

// ── التكرار المتجاور يُطوى ──────────────────────────────────────
const repeated = parseEnglishLedgerRow(
  row({ credit: '10', mainAccount: 'Revenues', subAccount: 'Other revenue', subAccount2: 'Other revenue' }),
  columns,
  14
);
eq(repeated.path, ['Revenues', 'Other revenue'], 'الاسم المكرَّر لا يُنشئ مستوًى وهميًّا');

// ── «Unspecified» غيابٌ لا كيان ────────────────────────────────
eq(revenue.branch, null, '«Unspecified» في الفرع تُقرأ فراغًا');
eq(revenue.costCenter, null, 'وفي مركز الربحية كذلك');
eq(revenue.salesAdmin, null, 'وفي أدمن المبيعات');

// ── الأبعاد حين تُذكر ──────────────────────────────────────────
const dimensions = parseEnglishLedgerRow(
  row({
    credit: '7500',
    branch: 'Mokattam',
    salesAdmin: 'Yahia Nasser',
    trafficSource: 'Google Ads',
    centerAccount: 'Salam Center',
    centerProject: 'Haqibat Salam',
    units: '12',
    translationType: 'General Translation',
  }),
  columns,
  15
);
eq(dimensions.branch, 'mokattam', 'الفرع يُطابَق بمفتاح القائمة');
eq(dimensions.branchRaw, null, 'وما طُوبق لا يُذكر في التقرير');
eq(dimensions.salesAdmin, 'Yahia Nasser', 'وأدمن المبيعات يُحفظ كما ورد ليُطابَق في المحرّك');
eq(dimensions.trafficSource, 'Google Ads', 'وقناة الوصول');
eq(dimensions.costCenter, 'Haqibat Salam', 'ومركز الربحية هو المشروع لا العميل');
eq(dimensions.centerAccount, 'Salam Center', 'والعميل فوقه يُحفظ ليُبنى منهما المركز');
eq(dimensions.units, 12, 'وعدد الوحدات');

/**
 * ★ **و«Saudi Arabia» هي الرياض.**
 *
 * هكذا كتبها المحاسب في ٢٠٢٦ ولم يكتب `Riyadh` مرة واحدة — وبلا مطابقتها
 * يسقط فرعٌ كاملٌ بلا بُعد، فيظهر إيرادُه في «غير محدَّد».
 */
const saudi = parseEnglishLedgerRow(row({ credit: '900', branch: 'Saudi Arabia' }), columns, 16);
eq(saudi.branch, 'riyadh', '★ «Saudi Arabia» تُقرأ فرع الرياض');

const unknownBranch = parseEnglishLedgerRow(row({ credit: '900', branch: 'Tanta' }), columns, 17);
eq(unknownBranch.branch, null, 'وفرعٌ غير معروف لا يُخمَّن');
eq(unknownBranch.branchRaw, 'Tanta', 'بل يُذكر اسمُه في التقرير');

// ── ما يُوقَف ولا يدخل ─────────────────────────────────────────
const noDate = parseEnglishLedgerRow(row({ date: '', credit: '100' }), columns, 18);
check('reason' in noDate, 'صفٌّ بلا تاريخ يُوقَف');

const noAmount = parseEnglishLedgerRow(row({}), columns, 19);
check('reason' in noAmount && noAmount.reason.includes('بلا مبلغ'), 'وصفٌّ بلا مبلغ');

const both = parseEnglishLedgerRow(row({ debit: '5', credit: '5' }), columns, 20);
check('reason' in both, 'وصفٌّ مدين ودائن معًا');

const strange = parseEnglishLedgerRow(row({ credit: '5', mainAccount: 'Suspense' }), columns, 21);
check(
  'reason' in strange && strange.reason.includes('Suspense'),
  '★ وحسابٌ رئيسيّ لا نعرفه يُوقَف **باسمه** — ولا يُخمَّن نوعُه',
  JSON.stringify(strange)
);

// ═══════════════════════════════════════════════════════════════
//  ٤ · الأرصدة الافتتاحية
// ═══════════════════════════════════════════════════════════════

check(
  isOpeningBalanceMemo('Opening balances for fiscal year 2026 carried forward from fiscal year 2025.'),
  'بيان الرصيد الافتتاحي يُعرف'
);
check(isOpeningBalanceMemo('رصيد افتتاحي مرحَّل'), 'وبالعربية كذلك');
check(
  !isOpeningBalanceMemo('Proof of Receipt of Revenue from Written Translation Services'),
  '★ وقيدُ حركةٍ في أول يناير ليس رصيدًا افتتاحيًّا',
  'وإسقاطُه يمحو بيعًا حدث فعلًا'
);

const opening = parseEnglishLedgerRow(
  row({ date: '2026-01-01', debit: '3199585', memo: 'Opening balances for fiscal year 2026 carried forward from fiscal year 2025.' }),
  columns,
  22
);
eq(opening.isOpeningBalance, true, 'والصفّ يحمل وسمَه فيُسقط في المحرّك');
eq(revenue.isOpeningBalance, false, 'وصفُّ الحركة لا يحمله');

// ═══════════════════════════════════════════════════════════════
//  ٥ · قناة الوصول
// ═══════════════════════════════════════════════════════════════

eq(trafficKeyOf('Google Ads'), 'google_ads', 'قناة الوصول تُطابَق بمفتاح القائمة');
eq(trafficKeyOf('Old Client'), 'returning', 'و«العميل القديم» عودةٌ لا قناة جديدة');
eq(trafficKeyOf('Banners'), null, 'وما ليس في القائمة لا يُخمَّن');
eq(trafficKeyOf(null), null, 'والفراغ فراغ');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
if (failed.length) console.log(failed.map((f) => `  ✗ ${f.label}`).join('\n'));
process.exit(failed.length ? 1 : 0);
