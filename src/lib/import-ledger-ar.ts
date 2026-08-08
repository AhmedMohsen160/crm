/**
 * قراءة دفتر المحاسب **العربي** — لهجة شيت ٢٠٢٢ وما قبله.
 *
 * **لماذا وحدة ثانية بجانب `import-accounting`:** تلك تقرأ ورقة
 * «Journal Entry» بأعمدة وأسماء حسابات **إنجليزية**، وهذه تقرأ الورقة
 * العربية بترتيب أعمدة مختلف تمامًا. والدمج في قارئٍ واحد يجعل كل تعديل
 * في إحداهما خطرًا على الأخرى.
 *
 * أعمدة الورقة العربية:
 *   م · التاريخ · Descripition · رقم القيد · نوع المستند · رقم المستند ·
 *   البيان · مدين · دائن · **مركز التكلفة** · الحساب الرئيسي · الحساب الفرعي
 *
 * ── ثلاث حقائق بُني عليها ما هنا ───────────────────────────────
 *
 * ١) **الشجرة مستواها اثنان** — رئيسي وفرعي، لا أربعة. فيُبنى المسار من
 *    الاثنين، ويُنشأ الناقص تحت أبيه.
 *
 * ٢) **رقم القيد غير صالح**: في دفتر ٢٠٢٢ ثلاث قيم لكل السنة. فالتجميع
 *    **بالرصيد الجاري** كما في القارئ الإنجليزي — نُراكم حتى يتوازن.
 *
 * ٣) **مركز التكلفة مركز ربحية** — «نشاط الترجمة»، «نشاط الدعاية»، «المقر
 *    الإداري». وهذا ما أكّده الدفتر نفسه: وحدةٌ يُقاس ربحُها، لا تصنيفٌ
 *    للإنفاق بين مركزي وفرعي.
 */

/** ترتيب أعمدة الورقة العربية — بالفهرس لا بالاسم، فالترويسة قد تختلف */
export const ARABIC_COLUMNS = [
  'serial',
  'date',
  'monthNo',
  'voucher',
  'docType',
  'docNumber',
  'description',
  'debit',
  'credit',
  'costCenter',
  'mainAccount',
  'subAccount',
] as const;

/**
 * الحساب الرئيسي العربي ← نوع الحساب في شجرتنا.
 *
 * **ولا يُخمَّن ما ليس هنا**: حسابٌ رئيسيّ غير معروف يُوقف صفَّه ويُقال
 * اسمُه، ولا يُنسب إلى نوعٍ بالتقريب — فنوع الحساب يقرّر أين يقع في قائمة
 * الدخل والميزانية معًا.
 */
export const ARABIC_MAIN_ACCOUNTS: Record<string, string> = {
  // الأصول
  'النقدية': 'asset',
  'الاصول الثابتة': 'asset',
  'الأصول الثابتة': 'asset',
  // مجمّع الإهلاك حساب أصل **مقابل** (رصيده دائن) ويبقى في جانب الأصول
  'مجمع إهلاك الاصول الثابتة': 'asset',
  'مجمع إهلاك الأصول الثابتة': 'asset',
  'حسابات مدينة': 'asset',
  'العملاء': 'asset',
  'العهد': 'asset',
  'موردين دفعات مقدمة': 'asset',
  // الالتزامات
  'حسابات دائنة': 'liability',
  'الموردون': 'liability',
  'عملاء دفعات مقدمة': 'liability',
  // حقوق الملكية — وجاري الشركاء منها في الشركات ذات المسؤولية المحدودة
  'رأس المال المدفوع': 'equity',
  'حسابات جارية': 'equity',
  // النتيجة
  'الايرادات': 'revenue',
  'الإيرادات': 'revenue',
  'أرباح وخسائر فروق العملة': 'revenue',
  'مصروفات عمومية وإدارية': 'expense',
  'مصروفات بيعية وتسويقية': 'expense',
  'مصروفات تشغيلية وإنتاجية': 'expense',
};

/**
 * الحساب الرئيسي ← مجموعة المصروف في قائمة الدخل.
 *
 * **ويُقرأ كما صنّفه المحاسب لا كما نراه نحن.** دفتر ٢٠٢٢ يضع كل المصروفات
 * تحت «عمومية وإدارية» — بما فيها أجور الإنتاج وخدمات الغير. وإعادةُ
 * تصنيفها في الترحيل اجتهادٌ على دفترٍ مقفل، ومكانها الصحيح شاشةُ شجرة
 * الحسابات بعد الترحيل: يُعاد تصنيف الحساب مرة فتُصحَّح كل قيوده.
 */
export const ARABIC_EXPENSE_GROUPS: Record<string, string> = {
  'مصروفات عمومية وإدارية': 'general_admin',
  'مصروفات بيعية وتسويقية': 'selling_marketing',
  'مصروفات تشغيلية وإنتاجية': 'production_operating',
};

const MONTHS_EN = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

/**
 * تاريخٌ بصيغة `1-Jan-22` — وهي صيغة إكسل العربية الشائعة.
 *
 * **والسنة ذات الرقمين تُقرأ ٢٠xx لا ١٩xx**: دفاتر المكتب كلها بعد ٢٠٢٠،
 * وقراءة `22` سنةَ ١٩٢٢ تُلقي القيد خارج كل فترة.
 */
export function parseArabicLedgerDate(raw: string | undefined | null): Date | null {
  const text = (raw ?? '').trim();
  if (!text) return null;

  const match = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = MONTHS_EN.indexOf(match[2].toLowerCase());
    if (month < 0) return null;
    const rawYear = Number(match[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const date = new Date(Date.UTC(year, month, day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // `2022-03-15` أو `15/03/2022` — احتياطًا لو صُدِّرت الورقة بصيغة أخرى
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]));

  return null;
}

export type ArabicLedgerRow = {
  serial: string;
  date: Date;
  period: string;
  description: string;
  debit: number;
  credit: number;
  /** مركز الربحية كما ورد — «نشاط الترجمة»، «المقر الإداري» */
  costCenter: string | null;
  /** مسار الحساب: [الرئيسي, الفرعي] بلا فراغ ولا تكرار متجاور */
  path: string[];
  accountType: string;
  expenseGroup: string | null;
};

export type ArabicRowError = { line: number; raw: string; reason: string };

function clean(value: string | undefined): string {
  return (value ?? '').replace(/‏|‎|⁦|⁩/g, '').trim();
}

/** رقمٌ من خانة قد تحمل فاصلة آلاف أو فراغًا غير قابل للكسر */
export function parseArabicAmount(raw: string | undefined | null): number {
  if (raw === undefined || raw === null) return 0;
  const cleaned = String(raw)
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

export function parseArabicLedgerRow(
  cells: string[],
  line: number
): ArabicLedgerRow | ArabicRowError {
  const raw = cells.join('\t');
  const get = (key: (typeof ARABIC_COLUMNS)[number]) => cells[ARABIC_COLUMNS.indexOf(key)];

  const date = parseArabicLedgerDate(get('date'));
  if (!date) return { line, raw, reason: `التاريخ غير مقروء: «${clean(get('date')) || '—'}»` };

  const main = clean(get('mainAccount'));
  if (!main) return { line, raw, reason: 'الصف بلا حساب رئيسي' };

  const accountType = ARABIC_MAIN_ACCOUNTS[main];
  if (!accountType) return { line, raw, reason: `حساب رئيسي غير معروف: «${main}»` };

  const debit = parseArabicAmount(get('debit'));
  const credit = parseArabicAmount(get('credit'));
  if (debit === 0 && credit === 0) {
    return { line, raw, reason: 'صف بلا مبلغ — لا مدين ولا دائن' };
  }
  if (debit > 0 && credit > 0) return { line, raw, reason: 'الصف مدين ودائن معًا' };

  const sub = clean(get('subAccount'));
  const path = sub && sub !== main ? [main, sub] : [main];

  return {
    serial: clean(get('serial')),
    date,
    period: periodOfDate(date),
    description: clean(get('description')) || 'قيد مرحَّل من دفتر ٢٠٢٢',
    debit,
    credit,
    costCenter: clean(get('costCenter')) || null,
    path,
    accountType,
    expenseGroup: accountType === 'expense' ? (ARABIC_EXPENSE_GROUPS[main] ?? null) : null,
  };
}

/** هل هذا السطر ترويسة الورقة العربية؟ */
export function isArabicHeaderLine(cells: string[]): boolean {
  const joined = cells.join(' ');
  return joined.includes('الحساب الرئيسي') && (joined.includes('مدين') || joined.includes('التاريخ'));
}

/** سطرٌ فارغ أو سطر مجاميع لا يحمل قيدًا */
export function isArabicBlankLine(cells: string[]): boolean {
  return cells.every((c) => clean(c) === '');
}
