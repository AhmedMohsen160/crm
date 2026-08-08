/**
 * قراءة دفاتر المحاسب العربية — ٢٠٢٢ وما بعدها.
 *
 * **لماذا وحدة ثانية بجانب `import-accounting`:** تلك تقرأ ورقة
 * «Journal Entry» بأسماء حسابات **إنجليزية**، وهذه تقرأ دفاتر المكتب
 * العربية. والدمج في قارئٍ واحد يجعل كل تعديل في إحداهما خطرًا على الأخرى.
 *
 * ── والقاعدة الحاكمة هنا: **تُقرأ الترويسة بالأسماء لا الأعمدة بترتيبها**
 *
 * دفتر ٢٠٢٢ ترتيبه غير دفتر ٢٠٢٣: أُضيف عمود «رصيد الفرعي» ومستوى حساب
 * ثالث. وقارئٌ يعدّ الأعمدة يقرأ سنةً ويعمى عن التي بعدها — فيُبحث عن صفّ
 * الترويسة أولًا، ثم يُؤخذ كل حقل من عموده بالاسم.
 *
 * وأسماء الحسابات نفسها تغيّرت: «مصروفات عمومية وإدارية» في ٢٠٢٢ صارت
 * «المصروفات العمومية والإدارية» في ٢٠٢٣. فالمطابقة **بعد تطبيع** يُسقط
 * «ال» والتطويل والهمزات — لا بالنصّ الحرفيّ.
 *
 * ── وثلاث حقائق أخرى بُني عليها ما هنا ────────────────────────
 *
 * ١) **رقم القيد غير صالح**: في دفتر ٢٠٢٢ ثلاث قيم لكل السنة. فالتجميع
 *    **بالرصيد الجاري** — نُراكم حتى يتوازن.
 * ٢) **مركز التكلفة مركز ربحية** — «مشروع سوليد»، «مركز سلام»، «المقر
 *    الإداري». أكّده الدفتر في السنوات الأربع.
 * ٣) **الشجرة ثلاثة مستويات** من ٢٠٢٣: رئيسي وفرعي وفرعي الفرعي.
 */

// ═══════════════════════════════════════════════════════════════
//  ١ · التطبيع — لتُطابَق الأسماء رغم اختلاف كتابتها
// ═══════════════════════════════════════════════════════════════

/**
 * تنظيفٌ **للعرض** — ما يُحفظ في القاعدة ويقرؤه المحاسب.
 *
 * يُنزع التطويل وعلامات الاتجاه والتشكيل وتُوحَّد الفراغات، **ولا تُمسّ
 * الهمزات ولا التاء المربوطة**: «نشــــــــــاط الترجمة» تصير «نشاط
 * الترجمة» لا «نشاط الترجمه».
 */
export function cleanText(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/[ـً-ٕ‏‎⁦⁩‎‏]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * يوحّد النصّ العربي **قبل المقارنة وحدها**.
 *
 * **بلا هذا لا يُطابَق شيء**: «الاصول الثابتة» و«الأصول الثابتة»
 * و«الأصــول الثابتة» ثلاثة نصوص لحساب واحد، والفرق همزةٌ وتطويل.
 *
 * **ولا يُحفظ ناتجه قطّ**: الطيّ يُبدّل «الخزينة» بـ«الخزينه»، وحسابٌ
 * يُعرض باسمٍ مشوّه يقرؤه المحاسب كل يوم.
 */
export function normalizeArabic(value: string | null | undefined): string {
  return cleanText(value)
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

/** مفتاح مطابقة: مطبَّعٌ بلا «ال» التعريف ولا مسافات */
export function matchKey(value: string | null | undefined): string {
  return normalizeArabic(value).replace(/\bال/g, '').replace(/\s/g, '');
}

// ═══════════════════════════════════════════════════════════════
//  ٢ · الترويسة
// ═══════════════════════════════════════════════════════════════

/** اسم العمود في الورقة ← مفتاحه عندنا. الترتيب لا يهمّ، الاسم يهمّ */
export const ARABIC_HEADERS: Record<string, string> = {
  التاريخ: 'date',
  الشهر: 'monthNo',
  'رقم القيد': 'voucher',
  'نوع المستند': 'docType',
  'رقم المستند': 'docNumber',
  بيان: 'memo',
  مدين: 'debit',
  دائن: 'credit',
  'مركز التكلفة': 'costCenter',
  'الحساب الرئيسي': 'mainAccount',
  'الحساب الفرعي': 'subAccount',
  'فرعي الحساب الفرعي': 'subAccount2',
};

export type ColumnMap = Partial<Record<string, number>>;

/**
 * يجد صفّ الترويسة ويبني خريطة الأعمدة.
 *
 * **ولا يُبحث في الورقة كلها**: الترويسة في الصفوف الأولى دائمًا، وفوقها
 * صفوفُ مجاميعَ وعناوين. والبحث بلا حدّ يلتقط صفّ بياناتٍ فيه كلمة «مدين».
 */
export function findHeader(
  rows: (string | null | undefined)[][],
  limit = 40
): { row: number; columns: ColumnMap } | null {
  for (let i = 0; i < Math.min(rows.length, limit); i += 1) {
    const cells = rows[i].map((c) => normalizeArabic(c));
    const hasDate = cells.some((c) => c === 'التاريخ');
    const hasDebit = cells.some((c) => c === 'مدين');
    const hasMain = cells.some((c) => matchKey(c) === matchKey('الحساب الرئيسي'));
    if (!hasDate || !hasDebit || !hasMain) continue;

    const columns: ColumnMap = {};
    for (const [label, key] of Object.entries(ARABIC_HEADERS)) {
      const want = matchKey(label);
      let at = cells.findIndex((c) => matchKey(c) === want);
      // «بيــــان» يُكتب بتطويل طويل، فيُقبل ما يبدأ بالمفتاح
      if (at < 0) at = cells.findIndex((c) => matchKey(c).startsWith(want) && want.length >= 4);
      if (at >= 0 && columns[key] === undefined) columns[key] = at;
    }
    if (columns.date === undefined || columns.mainAccount === undefined) continue;
    return { row: i, columns };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
//  ٣ · خرائط الحسابات
// ═══════════════════════════════════════════════════════════════

/**
 * الحساب الرئيسي ← نوع الحساب. **بمفتاح مطبَّع** فتُطابَق كل صياغاته.
 *
 * ولا يُخمَّن ما ليس هنا: حسابٌ مجهول يُوقف صفَّه ويُقال اسمُه — فالنوع
 * يقرّر أين يقع السطر في قائمة الدخل والميزانية معًا.
 */
const TYPE_SOURCE: [string, string][] = [
  ['النقدية', 'asset'],
  ['الأصول الثابتة', 'asset'],
  ['مجمع إهلاك الأصول الثابتة', 'asset'],
  ['حسابات مدينة', 'asset'],
  ['العملاء', 'asset'],
  ['العهد', 'asset'],
  ['موردين دفعات مقدمة', 'asset'],
  ['أوراق القبض', 'asset'],
  ['خصم المنبع لدي الغير', 'asset'],
  ['تحويلات العملات', 'asset'],
  ['حسابات دائنة', 'liability'],
  ['الموردون', 'liability'],
  ['عملاء دفعات مقدمة', 'liability'],
  ['أوراق الدفع', 'liability'],
  ['رأس المال المدفوع', 'equity'],
  ['رأس المال', 'equity'],
  ['حسابات جارية', 'equity'],
  ['الأرباح المرحلة', 'equity'],
  /**
   * حسابات الإقفال السنوي — تظهر في ديسمبر وحده وتحمل مبالغ ضخمة.
   * وإسقاطُها يُخرج الدفتر عن التوازن بمئات الآلاف: ٢٠٢٤ اختلّ ٨٦٧ ألفًا
   * حتى أُضيفت.
   */
  ['المسحوبات', 'equity'],
  ['أرباح وخسائر فترات سابقة', 'equity'],
  ['أرباح وخسائر الفترة', 'equity'],
  ['ملخص الدخل', 'equity'],
  ['خصم المنبع للغير', 'asset'],
  ['الإيرادات', 'revenue'],
  ['أرباح وخسائر فروق العملة', 'revenue'],
  ['المصروفات العمومية والإدارية', 'expense'],
  ['مصروفات عمومية وإدارية', 'expense'],
  ['المصروفات البيعية والتسويقية', 'expense'],
  ['مصروفات بيعية وتسويقية', 'expense'],
  ['المصروفات الإنتاجية والتشغيلية', 'expense'],
  ['مصروفات تشغيلية وإنتاجية', 'expense'],
];

const TYPE_BY_KEY = new Map(TYPE_SOURCE.map(([name, type]) => [matchKey(name), type]));

export function accountTypeOf(mainAccount: string | null | undefined): string | null {
  return TYPE_BY_KEY.get(matchKey(mainAccount)) ?? null;
}

const GROUP_SOURCE: [string, string][] = [
  ['المصروفات العمومية والإدارية', 'general_admin'],
  ['مصروفات عمومية وإدارية', 'general_admin'],
  ['المصروفات البيعية والتسويقية', 'selling_marketing'],
  ['مصروفات بيعية وتسويقية', 'selling_marketing'],
  ['المصروفات الإنتاجية والتشغيلية', 'production_operating'],
  ['مصروفات تشغيلية وإنتاجية', 'production_operating'],
];
const GROUP_BY_KEY = new Map(GROUP_SOURCE.map(([name, group]) => [matchKey(name), group]));

/**
 * مجموعة المصروف في قائمة الدخل — **كما صنّفها المحاسب لا كما نراها**.
 *
 * دفتر ٢٠٢٢ يضع كل المصروفات تحت «عمومية وإدارية» بما فيها أجور الإنتاج،
 * ومن ٢٠٢٣ فصلها المحاسب إلى الثلاثة. وإعادةُ تصنيفها في الترحيل اجتهادٌ
 * على دفترٍ مقفل — ومكانها شاشةُ شجرة الحسابات بعده.
 */
export function expenseGroupOf(mainAccount: string | null | undefined): string | null {
  return GROUP_BY_KEY.get(matchKey(mainAccount)) ?? null;
}

// ═══════════════════════════════════════════════════════════════
//  ٤ · التاريخ والمبلغ
// ═══════════════════════════════════════════════════════════════

const MONTHS_EN = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

/**
 * تاريخٌ من خانة الورقة.
 *
 * **والسنة ذات الرقمين تُقرأ ٢٠xx لا ١٩xx**: دفاتر المكتب كلها بعد ٢٠٢٠،
 * وقراءة `22` سنةَ ١٩٢٢ تُلقي القيد خارج كل فترة.
 *
 * **والشرطة المائلة العكسية تُقبل**: `1\11\2025` كُتبت في ٤٢٩ صفًّا من شيت
 * المبيعات، ورفضُها يُسقط أربعمئة ألف جنيه من البيانات لسبب إملائي.
 */
export function parseArabicLedgerDate(raw: unknown): Date | null {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime())
      ? null
      : new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate()));
  }
  const text = String(raw ?? '').trim().replace(/\\/g, '/');
  if (!text) return null;

  const named = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/);
  if (named) {
    const month = MONTHS_EN.indexOf(named[2].toLowerCase());
    if (month < 0) return null;
    const rawYear = Number(named[3]);
    return build(rawYear < 100 ? 2000 + rawYear : rawYear, month, Number(named[1]));
  }

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return build(+iso[1], +iso[2] - 1, +iso[3]);

  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (dmy) {
    const rawYear = Number(dmy[3]);
    return build(rawYear < 100 ? 2000 + rawYear : rawYear, +dmy[2] - 1, +dmy[1]);
  }
  return null;
}

function build(year: number, month: number, day: number): Date | null {
  if (year < 2000 || year > 2100 || month < 0 || month > 11 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** رقمٌ من خانة قد تحمل فاصلة آلاف أو فراغًا غير قابل للكسر */
export function parseArabicAmount(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const cleaned = String(raw ?? '')
    .replace(/[,\s ]/g, '')
    .replace(/[^\d.\-]/g, '');
  if (cleaned === '' || cleaned === '.' || cleaned === '-') return 0;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

/** `YYYY-MM` بتوقيت UTC — فلا ينزلق القيد شهرًا بفارق المنطقة الزمنية */
export function periodOfDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════
//  ٥ · قراءة الصف
// ═══════════════════════════════════════════════════════════════

export type ArabicLedgerRow = {
  date: Date;
  period: string;
  memo: string;
  debit: number;
  credit: number;
  /** مركز الربحية كما ورد — «مشروع سوليد»، «المقر الإداري» */
  costCenter: string | null;
  /** مسار الحساب من الأعلى للأسفل، بلا فراغ ولا تكرار متجاور */
  path: string[];
  accountType: string;
  expenseGroup: string | null;
};

export type ArabicRowError = { line: number; raw: string; reason: string };

export function parseArabicLedgerRow(
  cells: unknown[],
  columns: ColumnMap,
  line: number
): ArabicLedgerRow | ArabicRowError {
  const at = (key: string) => {
    const index = columns[key];
    return index === undefined ? undefined : cells[index];
  };
  // **يُحفظ النصّ النظيف** — والتطبيع للمطابقة وحدها
  const text = (key: string) => cleanText(String(at(key) ?? ''));
  const raw = cells.map((c) => String(c ?? '')).join('\t');

  const date = parseArabicLedgerDate(at('date'));
  if (!date) return { line, raw, reason: `التاريخ غير مقروء: «${String(at('date') ?? '—')}»` };

  const main = text('mainAccount');
  if (!main) return { line, raw, reason: 'الصف بلا حساب رئيسي' };

  const accountType = accountTypeOf(main);
  if (!accountType) return { line, raw, reason: `حساب رئيسي غير معروف: «${main}»` };

  const debit = parseArabicAmount(at('debit'));
  const credit = parseArabicAmount(at('credit'));
  if (debit === 0 && credit === 0) return { line, raw, reason: 'صف بلا مبلغ — لا مدين ولا دائن' };
  if (debit > 0 && credit > 0) return { line, raw, reason: 'الصف مدين ودائن معًا' };

  // المسار: رئيسي ثم فرعي ثم فرعي الفرعي — بلا فراغ ولا تكرار متجاور
  const path: string[] = [];
  for (const key of ['mainAccount', 'subAccount', 'subAccount2']) {
    const part = text(key);
    if (part && part !== path[path.length - 1]) path.push(part);
  }

  return {
    date,
    period: periodOfDate(date),
    memo: cleanText(String(at('memo') ?? '')) || 'قيد مرحَّل من دفتر المحاسب',
    debit,
    credit,
    costCenter: text('costCenter') || null,
    path,
    accountType,
    expenseGroup: accountType === 'expense' ? expenseGroupOf(main) : null,
  };
}
