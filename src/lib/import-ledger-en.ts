/**
 * قراءة دفتر ٢٠٢٦ — الورقة التي كتبها المحاسب **بالإنجليزية**.
 *
 * **لماذا وحدة ثالثة:** `import-ledger-ar` تقرأ دفاتر ٢٠٢٢–٢٠٢٥ العربية،
 * و`import-accounting` تقرأ صفوفًا **ملصوقة** بترتيب أعمدةٍ ثابت. وهذه تقرأ
 * **ملفّ إكسل** بترويسةٍ إنجليزية — وهي الحال التي كسرت القارئ الملصوق:
 * أضاف المحاسب عمود `Social insurance` في آخر الورقة **مكان** عمود
 * `3rd Sub Account`، فصار قارئُ الترتيب يقرأ رقم تأمينٍ اجتماعيّ حسابًا.
 *
 * ── والقاعدة الحاكمة هي نفسها: **الترويسة تُقرأ بالأسماء لا بترتيبها**
 *
 * ── وثلاث حقائق في هذا الملف بعينه ────────────────────────────
 *
 * ١) **الشجرة أربعة مستويات وجذرُها جديد.** كان الجذر في العربية
 *    «النقدية» و«الإيرادات»، وصار هنا `Current Assets` و`Revenues` وتحته
 *    `Cash and Cash Equivalents`. فمجموعةُ المصروف تُقرأ من **المستوى
 *    الثاني** (`1nd Sub Account`) لا من الجذر.
 *
 * ٢) **الأرصدة الافتتاحية ٦٨ سطرًا** تحمل أرصدة ٢٠٢٥ المرحَّلة. والشركة
 *    واحدة مستمرّة لا دفتران، فدفاترُ ٢٠٢٢–٢٠٢٥ تحمل هذه الأرصدة أصلًا في
 *    حركتها — وإدخالها ثانيةً يحسب المال مرتين.
 *
 * ٣) **الأبعاد أغنى مما قبلها**: فرعٌ وأدمن مبيعات وقناة وصول ونوع ترجمة.
 *    وهي مبتدأ كل تحليل ٢٠٢٦ — تكلفةُ اكتساب العميل وربحيةُ الفرع.
 */

import {
  MAIN_ACCOUNT_TYPES,
  EXPENSE_GROUPS,
  BRANCH_KEYS,
  DOC_TYPES,
  TRAFFIC_KEYS,
  UNSPECIFIED,
} from './import-accounting';
import { parseArabicAmount, parseArabicLedgerDate, periodOfDate, cleanText } from './import-ledger-ar';
import type { ArabicLedgerRow, ArabicRowError, ColumnMap } from './import-ledger-ar';

// ═══════════════════════════════════════════════════════════════
//  ١ · الترويسة
// ═══════════════════════════════════════════════════════════════

/**
 * مفتاح المطابقة الإنجليزي.
 *
 * **ويبقى `$` وحده من الرموز**: `Debt` و`Debt $` عمودان مختلفان — الأول
 * بالجنيه والثاني بالدولار — وطيُّ الرموز كلِّها يجعلهما مفتاحًا واحدًا،
 * فيُقرأ عمود الدولار مبلغًا أساسيًّا.
 *
 * وما عداه يُطوى: `N 🔒` و`Month 🔒` تحملان قفلًا مرسومًا، و`1nd Sub Account`
 * كُتبت هكذا بخطأٍ إملائيّ من المحاسب ولا تُصحَّح في ورقته.
 */
export function enKey(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9$]/g, '');
}

/** اسم العمود في الورقة ← مفتاحه عندنا. الترتيب لا يهمّ، الاسم يهمّ */
export const ENGLISH_HEADERS: Record<string, string> = {
  n: 'serial',
  date: 'date',
  documenttype: 'docType',
  documentnumber: 'docNumber',
  description: 'memo',
  debt: 'debit',
  credit: 'credit',
  branch: 'branch',
  salesadmin: 'salesAdmin',
  trafficsource: 'trafficSource',
  unitssold: 'units',
  translationtype: 'translationType',
  // عمود «Account» في هذه الورقة **عميلُ مركز الربحية** لا اسم الحساب
  account: 'centerAccount',
  project: 'centerProject',
  mainaccount: 'mainAccount',
  '1ndsubaccount': 'subAccount',
  // ولو صحّح المحاسب إملاءه غدًا فالقارئ يبقى عاملًا
  '1stsubaccount': 'subAccount',
  '2ndsubaccount': 'subAccount2',
  '3rdsubaccount': 'subAccount3',
};

/**
 * يجد صفّ الترويسة الإنجليزية ويبني خريطة الأعمدة.
 *
 * **والأوّل يفوز عند التكرار**: في الورقة عمودان اسمهما `Credit` (جنيه
 * ودولار) بعد طيّ الرموز، وآخرُهما هو الدولار.
 */
export function findEnglishHeader(
  rows: (string | null | undefined)[][],
  limit = 40
): { row: number; columns: ColumnMap } | null {
  for (let i = 0; i < Math.min(rows.length, limit); i += 1) {
    const cells = rows[i].map((c) => enKey(c));
    if (!cells.includes('date') || !cells.includes('debt') || !cells.includes('mainaccount')) {
      continue;
    }

    const columns: ColumnMap = {};
    for (const [index, cell] of cells.entries()) {
      const key = ENGLISH_HEADERS[cell];
      if (key && columns[key] === undefined) columns[key] = index;
    }
    if (columns.date === undefined || columns.mainAccount === undefined) continue;
    return { row: i, columns };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
//  ٢ · الأرصدة الافتتاحية
// ═══════════════════════════════════════════════════════════════

/**
 * هل هذا السطر رصيدًا افتتاحيًّا مرحَّلًا من السنة السابقة؟
 *
 * يُقرأ من البيان: `Opening balances for fiscal year 2026 carried forward…`.
 * **ولا يُستدلّ عليه بالتاريخ**: أول يناير فيه قيودُ حركةٍ عاديّة أيضًا،
 * وإسقاطُها بحجّة أنها افتتاحية يمحو بيعًا حدث فعلًا.
 */
export function isOpeningBalanceMemo(memo: string | null | undefined): boolean {
  return /opening\s+balance/i.test(String(memo ?? '')) || /رصيد\s*افتتاح/.test(String(memo ?? ''));
}

// ═══════════════════════════════════════════════════════════════
//  ٣ · قراءة الصف
// ═══════════════════════════════════════════════════════════════

export type EnglishLedgerRow = ArabicLedgerRow & {
  serial: string;
  docType: string;
  docNumber: string | null;
  /** الفرع بمفتاح القائمة — و`null` لما لم يُطابَق أو لم يُذكر */
  branch: string | null;
  /** اسم الفرع كما ورد حين تعذّرت مطابقته — للتقرير لا للحفظ */
  branchRaw: string | null;
  salesAdmin: string | null;
  trafficSource: string | null;
  translationType: string | null;
  units: number | null;
  /** عميل مركز الربحية ومشروعه كما وردا بالإنجليزية */
  centerAccount: string | null;
  centerProject: string | null;
  isOpeningBalance: boolean;
};

/** «Unspecified» والفراغ سواء — كلاهما غياب لا كيان */
function dimension(raw: unknown): string | null {
  const text = cleanText(String(raw ?? ''));
  if (!text || text === UNSPECIFIED || text === '#N/A') return null;
  return text;
}

export function parseEnglishLedgerRow(
  cells: unknown[],
  columns: ColumnMap,
  line: number
): EnglishLedgerRow | ArabicRowError {
  const at = (key: string) => {
    const index = columns[key];
    return index === undefined ? undefined : cells[index];
  };
  const text = (key: string) => cleanText(String(at(key) ?? ''));
  const raw = cells.map((c) => String(c ?? '')).join('\t');

  const date = parseArabicLedgerDate(at('date'));
  if (!date) return { line, raw, reason: `التاريخ غير مقروء: «${String(at('date') ?? '—')}»` };

  const main = text('mainAccount');
  if (!main) return { line, raw, reason: 'الصف بلا حساب رئيسي' };

  const accountType = MAIN_ACCOUNT_TYPES[main];
  if (!accountType) return { line, raw, reason: `حساب رئيسي غير معروف: «${main}»` };

  const debit = parseArabicAmount(at('debit'));
  const credit = parseArabicAmount(at('credit'));
  if (debit === 0 && credit === 0) return { line, raw, reason: 'صف بلا مبلغ — لا مدين ولا دائن' };
  if (debit > 0 && credit > 0) return { line, raw, reason: 'الصف مدين ودائن معًا' };

  /**
   * المسار: أربعة مستويات، بلا فراغ ولا «Unspecified» ولا تكرار متجاور.
   *
   * المحاسب يكرّر الاسم نفسه في المستويات حين لا يحتاج تفريعًا (مجمّع
   * الإهلاك مثلًا)، وبناءُ مستويين باسم واحد يُنتج شجرةً عمقُها وهم.
   */
  const path: string[] = [];
  for (const key of ['mainAccount', 'subAccount', 'subAccount2', 'subAccount3']) {
    const part = text(key);
    if (!part || part === UNSPECIFIED) continue;
    if (part === path[path.length - 1]) continue;
    path.push(part);
  }

  const branchRaw = dimension(at('branch'));
  const branch = branchRaw ? (BRANCH_KEYS[branchRaw] ?? null) : null;
  const memo = cleanText(String(at('memo') ?? ''));
  const units = parseArabicAmount(at('units'));

  return {
    date,
    period: periodOfDate(date),
    memo: memo || 'قيد مرحَّل من دفتر المحاسب',
    debit,
    credit,
    // مركز الربحية في هذه الورقة عمودان — والمركز يُبنى منهما في المحرّك
    costCenter: dimension(at('centerProject')) ?? dimension(at('centerAccount')),
    path,
    accountType,
    /**
     * **ومجموعة المصروف من المستوى الثاني** لا من الجذر: الجذر هنا
     * `Expenses` وحده لكل المصروفات، والتقسيم الثلاثي تحته.
     */
    expenseGroup: accountType === 'expense' ? (EXPENSE_GROUPS[text('subAccount')] ?? null) : null,

    serial: text('serial'),
    docType: DOC_TYPES[text('docType')] ?? 'journal',
    docNumber: dimension(at('docNumber')),
    branch,
    branchRaw: branchRaw && !branch ? branchRaw : null,
    salesAdmin: dimension(at('salesAdmin')),
    trafficSource: dimension(at('trafficSource')),
    translationType: dimension(at('translationType')),
    units: units > 0 ? units : null,
    centerAccount: dimension(at('centerAccount')),
    centerProject: dimension(at('centerProject')),
    isOpeningBalance: isOpeningBalanceMemo(memo),
  };
}

/** قناة الوصول بمفتاح قائمة `channel` — وما لا يُطابَق يُحفظ كما ورد */
export function trafficKeyOf(raw: string | null): string | null {
  if (!raw) return null;
  return TRAFFIC_KEYS[raw] ?? null;
}
