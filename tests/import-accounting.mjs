/**
 * اختبار ترحيل دفتر المحاسب.
 *
 * **الأرقام هنا من دفتر ٢٠٢٦ الفعلي** لا مفترضة: تركيب الصفوف، وأسماء
 * الحسابات، وطريقة كتابة المحاسب لخاناته. والخطأ في هذا الملف يعني قيدًا
 * يدخل الدفتر مقلوبًا أو لا يدخل أصلًا — فيُختبر رقمًا برقم.
 *
 * التشغيل:  npm run test:import-accounting
 */
import {
  parseAmount,
  parseSheetDate,
  periodOfDate,
  accountPath,
  parseRow,
  isHeaderLine,
  isBlankLine,
  groupEntries,
  parseDepreciationSheet,
  summaryLine,
  MAIN_ACCOUNT_TYPES,
  EXPENSE_GROUPS,
  BRANCH_KEYS,
  COST_CENTER_ALIASES,
  SALES_ADMIN_ALIASES,
  MAX_ENTRY_LINES,
  COLUMNS,
} from '../src/lib/import-accounting.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}
function near(actual, expected, label, tolerance = 0.005) {
  check(Math.abs(actual - expected) < tolerance, label, `نتج ${actual} والمتوقع ${expected}`);
}

console.log('ترحيل دفتر المحاسب\n');

// ── الأرقام كما يكتبها المحاسب ───────────────────────────────

near(parseAmount('232157.3010000007'), 232157.301, 'العشريات الطويلة تُقرأ كما هي');
near(parseAmount('1,375.00'), 1375, 'فاصلة الآلاف لا تُفسد الرقم');
near(parseAmount('.'), 0, 'النقطة علامةُ مراجعةٍ في خانة المبلغ ← صفر لا خطأ');
near(parseAmount(''), 0, 'الخانة الفارغة صفر');
near(parseAmount(null), 0, 'والغائبة صفر');
near(parseAmount('  1 200 '), 1200, 'المسافات داخل الرقم تُطرح');
near(parseAmount('abc'), 0, 'نصٌّ محضٌ ← صفر، والاتزان هو الحكم');

// ── التواريخ ─────────────────────────────────────────────────

const d = parseSheetDate('2026-01-01');
check(d?.getFullYear() === 2026 && d?.getMonth() === 0, 'صيغة ISO تُقرأ');
const slash = parseSheetDate('03/08/2026');
check(slash?.getMonth() === 7 && slash?.getDate() === 3, 'صيغة يوم/شهر/سنة تُقرأ يومًا أولًا');
check(parseSheetDate('') === null, 'الفراغ ليس تاريخًا');
check(parseSheetDate('2026-13-01') === null, 'شهر ثلاثة عشر يُرفض ولا يُلَفّ للسنة التالية');
check(periodOfDate(new Date(2026, 7, 3)) === '2026-08', 'مفتاح الفترة YYYY-MM');

// ── مسار الحساب ──────────────────────────────────────────────

check(
  accountPath(['Current Assets', 'Cash and Cash Equivalents', 'Treasury', 'Treasury - Egyptian Pound'])
    .length === 4,
  'المسار الرباعي يبقى أربعة مستويات'
);
check(
  accountPath(['Accumulated Depreciation', 'Accumulated Depreciation', 'Accumulated Depreciation'])
    .length === 1,
  '**المكرَّر المتجاور يُطوى**: المحاسب يكرّر الاسم حين لا يحتاج تفريعًا'
);
check(
  accountPath(['Expenses', 'Unspecified', 'Rent expense', '']).join('|') ===
    'Expenses|Rent expense',
  '«غير محدَّد» والفراغ يسقطان من المسار'
);
check(accountPath([undefined, '', 'Unspecified']).length === 0, 'مسارٌ كله فراغ ← لا حساب');

// ── قراءة صفٍّ كاملٍ من الدفتر ────────────────────────────────

/** يبني صفًّا بترتيب أعمدة ورقة المحاسب */
function row(overrides = {}) {
  const base = {
    serial: '700',
    date: '2026-02-10',
    month: '2',
    docType: 'Unspecified',
    docNumber: '',
    description: 'Proof of Receipt of Revenue',
    debit: '',
    debitUsd: '',
    credit: '1200',
    creditUsd: '',
    subBalance: '',
    subBalanceUsd: '',
    branch: 'Mohandessin',
    salesAdmin: 'Noura Anwer',
    trafficSource: 'Google Ads',
    units: '2',
    translationType: 'General Translation',
    costCenterAccount: 'General Clients',
    costCenterProject: 'General project',
    mainAccount: 'Revenues',
    sub1: 'Translation services Revenue',
    sub2: 'Written translation revenue',
    sub3: 'Written translation revenue',
    ...overrides,
  };
  return COLUMNS.map((key) => base[key] ?? '');
}

const revenue = parseRow(row(), 1);
check(!('reason' in revenue), 'صف إيراد كامل يُقرأ');
near(revenue.credit, 1200, 'المبلغ في جانب الدائن');
check(revenue.branch === 'mohandessin', 'اسم الفرع يُترجم لمفتاحه');
check(revenue.accountType === 'revenue', 'نوع الحساب من الحساب الرئيسي');
check(revenue.expenseGroup === null, 'الإيراد بلا مجموعة مصروف');
check(revenue.units === 2, 'الوحدات المباعة تُقرأ');
check(revenue.path.length === 3, 'ومسار الحساب طُوي مكرَّرُه: ثلاثة لا أربعة');

const expense = parseRow(
  row({
    credit: '',
    debit: '66000',
    branch: 'Mokattam',
    mainAccount: 'Expenses',
    sub1: 'General and administrative expenses',
    sub2: 'Rent expense',
    sub3: 'Mokattam branch rent expense',
    costCenterAccount: 'Unspecified',
    costCenterProject: 'Unspecified',
    salesAdmin: '',
  }),
  2
);
check(expense.expenseGroup === 'general_admin', 'مصروف عمومي وإداري ← general_admin');
check(expense.costCenterName === null, '«غير محدَّد» في مركز التكلفة ← فراغ لا كيان');
near(expense.debit, 66000, 'إيجار المقطم في جانب المدين');

const production = parseRow(
  row({ credit: '', debit: '100', mainAccount: 'Expenses', sub1: 'Production and Operating Expenses' }),
  3
);
check(production.expenseGroup === 'production_operating', 'المصروف التشغيلي ← production_operating');

// ── الصفوف التي تُرفض بسببٍ مكتوب ─────────────────────────────

check('reason' in parseRow(row({ date: '' }), 4), 'صف بلا تاريخ يُرفض');
check('reason' in parseRow(row({ debit: '', credit: '' }), 5), 'صف بلا مبلغ يُرفض');
check('reason' in parseRow(row({ debit: '50', credit: '50' }), 6), 'صف مدين ودائن معًا يُرفض');
check(
  'reason' in parseRow(row({ mainAccount: 'Something Else' }), 7),
  'حساب رئيسي غير معروف يُرفض ولا يُخمَّن'
);
check(
  parseRow(row({ branch: 'Tanta' }), 8).branchRaw === 'Tanta',
  'الفرع غير المطابق يُذكر اسمه ولا يُخمَّن له مفتاح'
);
check(parseRow(row({ branch: 'Tanta' }), 8).branch === null, 'وسطره يدخل بلا فرع');

// ── الترويسة والحشو ──────────────────────────────────────────

check(
  isHeaderLine(['N', 'Date', 'Month', 'x', 'y', 'z'].concat(Array(17).fill('')).map((c, i) => (i === 19 ? 'Main Account' : c))),
  'ترويسة الورقة تُعرف'
);
check(isBlankLine(Array(23).fill('')), 'السطر الفارغ حشو');
check(
  isBlankLine(['5019', ...Array(22).fill('')]),
  '**والسطر الذي فيه مسلسل بلا محتوى حشوٌ أيضًا** — ذيل الورقة ثلاثة آلاف صف'
);
check(!isBlankLine(row()), 'وصف البيانات ليس حشوًا');

// ── تجميع القيود بالرصيد الجاري ──────────────────────────────

function r(serial, date, debit, credit, description = 'قيد') {
  const parsed = parseRow(
    row({
      serial: String(serial),
      date,
      description,
      debit: debit ? String(debit) : '',
      credit: credit ? String(credit) : '',
      mainAccount: debit ? 'Expenses' : 'Revenues',
      sub1: debit ? 'General and administrative expenses' : 'Translation services Revenue',
    }),
    serial
  );
  if ('reason' in parsed) throw new Error(parsed.reason);
  return parsed;
}

const pairs = groupEntries([
  r(1, '2026-02-10', 1200, 0),
  r(2, '2026-02-10', 0, 1200),
  r(3, '2026-02-10', 260, 0),
  r(4, '2026-02-10', 0, 260),
]);
check(pairs.entries.length === 2, 'الزوجان المتتاليان قيدان — وهذا شكل ٩٥٪ من الدفتر');
check(pairs.unbalanced.length === 0, 'ولا شيء موقوف');
near(pairs.entries[0].totalDebit, 1200, 'ومجموع القيد الأول صحيح');

const block = groupEntries([
  r(1, '2026-01-01', 100, 0),
  r(2, '2026-01-01', 200, 0),
  r(3, '2026-01-01', 300, 0),
  r(4, '2026-01-01', 0, 600),
]);
check(block.entries.length === 1 && block.entries[0].rows.length === 4, 'الكتلة الكبيرة قيد واحد — كالأرصدة الافتتاحية');

const crossDay = groupEntries([r(1, '2026-06-10', 500, 0), r(2, '2026-06-11', 0, 500)]);
check(crossDay.entries.length === 1, 'القيد الذي يعبر منتصف الليل لا يُقطع');

const crossMonth = groupEntries([r(1, '2026-06-30', 500, 0), r(2, '2026-07-01', 0, 500)]);
check(
  crossMonth.entries.length === 0 && crossMonth.unbalanced.length === 2,
  '**والشهر حدٌّ لا يُتجاوز**: خللٌ في يونيو لا يبتلع يوليو'
);

const stuck = groupEntries([
  ...Array.from({ length: MAX_ENTRY_LINES }, (_, i) => r(i + 1, '2026-07-22', 100, 0)),
  r(999, '2026-07-22', 0, MAX_ENTRY_LINES * 100),
]);
check(stuck.entries.length === 0, 'ما تجاوز الحدّ يُوقف بدل أن يبتلع بقية الشهر');
check(stuck.unbalanced[0].lines === MAX_ENTRY_LINES, 'والدفعة الموقوفة بحجم الحدّ');
near(stuck.unbalanced[0].difference, MAX_ENTRY_LINES * 100, 'وفارقها مكتوب بالجنيه');
check(
  stuck.unbalanced.length === 2,
  'وما بقي بعدها دفعةٌ ثانية موقوفة — لا يُلحق بقيدٍ ليس منه'
);

const unresolved = groupEntries([r(1, '2026-07-31', 40115, 0)]);
check(unresolved.entries.length === 0, '**لا يدخل الدفتر ما لم يتوازن**');
near(unresolved.unbalanced[0].difference, 40115, 'ويُعرض فارقه كما هو — وهو خلل يوليو الفعلي');

const preserved = groupEntries([r(1, '2026-02-10', 1200, 0), r(2, '2026-02-10', 0, 1200)]);
check(
  preserved.entries[0].rows.map((x) => x.serial).join(',') === '1,2',
  'ترتيب الصفوف محفوظ — وهو الرابط الوحيد بين طرفَي القيد'
);

// ── ورقة الإهلاك ─────────────────────────────────────────────

const depreciation = parseDepreciationSheet([
  ['', 'Statement', 'Computer Hardware and Software', 'Air Conditioning Units', 'Total'],
  ['', 'Accounting depreciation rate', '0.25', '0.5', ''],
  ['', 'Total value of fixed assets', '174730', '45700', '220430'],
  ['', 'Accumulated depreciation of fixed assets', '-84248.21', '-42544.77', '-126792.98'],
]);
check(depreciation.length === 2, 'فئتا أصول تُقرآن — و«Total» ليست فئة');
near(depreciation[0].annualRate, 0.25, 'نسبة أجهزة الحاسب ٢٥٪');
near(depreciation[1].annualRate, 0.5, 'ونسبة التكييفات ٥٠٪ — من الدفتر لا من معيارٍ عامّ');
near(depreciation[0].cost, 174730, 'وتكلفتها كما في الورقة');
near(depreciation[1].accumulated, 42544.77, 'والمجمَّع يُقرأ موجبًا مهما كُتب سالبًا');

const asPercent = parseDepreciationSheet([
  ['', 'Statement', 'X'],
  ['', 'depreciation rate', '25'],
  ['', 'Total value of fixed assets', '100'],
]);
near(asPercent[0].annualRate, 0.25, '٢٥ و٠٫٢٥ كلاهما يعني الربع');

// ── خرائط المفردات ───────────────────────────────────────────

check(MAIN_ACCOUNT_TYPES['Revenues'] === 'revenue', 'الإيرادات إيراد');
check(MAIN_ACCOUNT_TYPES['Current Liabilities'] === 'liability', 'الالتزامات المتداولة التزام');
check(
  MAIN_ACCOUNT_TYPES['Accumulated Depreciation of Fixed Assets'] === 'asset',
  'مجمّع الإهلاك يبقى في جانب الأصول — حسابٌ مقابل لا التزام'
);
check(Object.keys(EXPENSE_GROUPS).length === 3, 'مجموعات المصروف ثلاث — كتقسيم المحاسب حرفًا بحرف');
check(BRANCH_KEYS['Nasr City'] === 'nasr_city', 'مدينة نصر تُطابَق بمفتاحها');
/**
 * ★ **و«Saudi Arabia» هي الرياض.**
 *
 * كان هذا الاختبار يقول عكسه — كُتب قبل أن يصل دفتر ٢٠٢٦ فلم يكن في
 * الأوراق فرعٌ سعوديّ أصلًا. ثم كتبه المحاسب في ٢٠٢٦ ثلاثة عشر مرة ولم
 * يكتب `Riyadh` مرة واحدة، وأكّد أحمد أن الرياض فرعٌ بدأ العمل فعلًا.
 * وتركُه بلا مطابقة يُسقط فرعًا كاملًا في «غير محدَّد».
 */
check(BRANCH_KEYS['Saudi Arabia'] === 'riyadh', '★ و«Saudi Arabia» هي الرياض — هكذا كتبها المحاسب');
check(BRANCH_KEYS['Tanta'] === undefined, 'وما ليس في قائمة الفروع لا يُخمَّن');
check(
  COST_CENTER_ALIASES['Tibyan Association|The Masjid al-Haram Project'].name === 'جمعية التبيان',
  'مركز التكلفة نفسه بالعربية والإنجليزية — فلا يُنشأ مرتين'
);
check(SALES_ADMIN_ALIASES['Mohamed Elsawy'] === 'الصاوي', 'وأدمن المبيعات كذلك');
check(SALES_ADMIN_ALIASES['Ahmed Elsohagy'] === undefined, 'ومن لا اسم له لا يُخمَّن');

// ── الملخّص ──────────────────────────────────────────────────

check(
  summaryLine({
    rows: 5013,
    accounts: 204,
    costCenters: 0,
    entries: 2247,
    lines: 4918,
    skipped: 3028,
    unbalancedBatches: 2,
    unbalancedLines: 95,
    unknownBranches: [],
    unknownAdmins: [],
    errors: [],
  }).includes('٢٢٤٧'.replace(/[٠-٩]/g, (x) => '٠١٢٣٤٥٦٧٨٩'.indexOf(x))) ||
    summaryLine({
      rows: 1,
      accounts: 1,
      costCenters: 0,
      entries: 2247,
      lines: 4918,
      skipped: 0,
      unbalancedBatches: 0,
      unbalancedLines: 0,
      unknownBranches: [],
      unknownAdmins: [],
      errors: [],
    }).includes('2247'),
  'سطر الملخّص يذكر عدد القيود'
);

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
