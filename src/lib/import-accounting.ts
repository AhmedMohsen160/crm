/**
 * ترحيل دفتر المحاسب — من ورقة «Journal Entry» إلى دفتر النظام.
 *
 * **لماذا وحدة مستقلّة عن `import-legacy`:** تلك تُرحّل ليدز ومبيعات، وهذه
 * تُرحّل **قيودًا**. والقيد لا يُرحَّل كما يُرحَّل السجل: لا يدخل الدفتر
 * سطرٌ إلا في قيد متوازن، ولا يُخمَّن الاتزان أبدًا.
 *
 * ── الحقيقة التي بُني عليها كل ما هنا ──────────────────────────
 *
 * ورقة المحاسب **ليست فيها أرقام قيود**. هي دفتر مسطَّح: كل صف طرفٌ واحد،
 * والقيد يتكوّن من صفوفٍ **متتالية** يتوازن عندها المجموع. أغلبها زوجان
 * (مدين ثم دائن)، وبعضها كتلة كبيرة (الأرصدة الافتتاحية ٦٨ سطرًا، والرواتب
 * ٢٤).
 *
 * فالتجميع **بالرصيد الجاري**: نُراكم حتى يتساوى المدين والدائن، فيُغلق
 * القيد. ولا نتجاوز الشهر: شهرٌ فيه خلل لا يُفسد الذي بعده. ولا نتجاوز
 * `MAX_ENTRY_LINES` سطرًا: خللٌ في صفٍّ واحد كان سيبتلع بقية الشهر.
 *
 * وما لم يتوازن **لا يدخل الدفتر ولا يُجبَر على التوازن** — يُعاد كدفعةٍ
 * موقوفة بفارقها المكتوب، ليراها المحاسب ويصحّحها في ورقته. وهذا هو ما
 * كشف في دفتر ٢٠٢٦ فارقًا حقيقيًّا في يوليو.
 */

// ═══════════════════════════════════════════════════════════════
//  خرائط المفردات — من إنجليزية الدفتر إلى مفاتيح النظام
// ═══════════════════════════════════════════════════════════════

/** الحساب الرئيسي ← نوع الحساب في شجرتنا */
export const MAIN_ACCOUNT_TYPES: Record<string, string> = {
  'Fixed Assets': 'asset',
  // مجمّع الإهلاك حساب أصل **مقابل** (رصيده دائن) — ويبقى في جانب الأصول
  'Accumulated Depreciation of Fixed Assets': 'asset',
  'Current Assets': 'asset',
  'Current Liabilities': 'liability',
  'Owner’s Equity': 'equity',
  "Owner's Equity": 'equity',
  Revenues: 'revenue',
  Expenses: 'expense',
};

/**
 * المجموعة الأولى تحت «المصروفات» ← مجموعة المصروف عندنا.
 *
 * وهي المطابقة التي جعلت الترحيل ممكنًا أصلًا: تقسيم المحاسب الثلاثي
 * (تشغيلي · بيعي وتسويقي · عمومي وإداري) هو نفسه تقسيمنا حرفًا بحرف.
 */
export const EXPENSE_GROUPS: Record<string, string> = {
  'Production and Operating Expenses': 'production_operating',
  'Selling and Marketing Expenses': 'selling_marketing',
  'General and administrative expenses': 'general_admin',
};

/**
 * أسماء الفروع في الدفتر ← مفاتيح قائمة `branch`.
 *
 * **و«Saudi Arabia» هي الرياض**: هكذا كتبها المحاسب في دفتر ٢٠٢٦ ولم يكتب
 * `Riyadh` مرة واحدة. وبلا هذا السطر تسقط ثلاثة عشر سطرًا سعوديًّا بلا فرع.
 */
export const BRANCH_KEYS: Record<string, string> = {
  Mokattam: 'mokattam',
  Mohandessin: 'mohandessin',
  Alexandria: 'alexandria',
  'Nasr City': 'nasr_city',
  Riyadh: 'riyadh',
  'Saudi Arabia': 'riyadh',
  Buraidah: 'buraidah',
};

/** نوع المستند في الدفتر ← `JournalEntry.docType` */
export const DOC_TYPES: Record<string, string> = {
  'E-invoice': 'e_invoice',
  'Proforma Invoice': 'proforma',
  'Credit Note': 'credit_note',
  Unspecified: 'journal',
};

/** قناة الوصول في الدفتر ← مفاتيح قائمة `channel` */
export const TRAFFIC_KEYS: Record<string, string> = {
  'Google Ads': 'google_ads',
  Website: 'website',
  'Old Client': 'returning',
  Recommendation: 'referral',
  PR: 'other',
};

/**
 * مراكز التكلفة في الدفتر بالإنجليزية، وفي النظام بالعربية — **وهي هي**.
 *
 * بلا هذه المطابقة يُنشئ الترحيل نسخةً ثانية من كل مركز، فتُقسَّم ربحية
 * المشروع الواحد على سجلَّين ولا يُقرأ رقمٌ صحيح. والقائمة من `SEED_COST_CENTERS`
 * حرفًا بحرف، ومن أضاف مركزًا جديدًا في ورقته أضافه هنا أو تركه يُنشأ باسمه.
 */
export const COST_CENTER_ALIASES: Record<string, { name: string; project: string }> = {
  'General Clients|General project': { name: 'عملاء عامون', project: 'مشروع عام' },
  'Salam Center|Haqibat Salam': { name: 'مركز سلام', project: 'حقيبة سلام' },
  'Tibyan Association|The Masjid al-Haram Project': {
    name: 'جمعية التبيان',
    project: 'مشروع المسجد الحرام',
  },
  'Strategic client|Strategic project': { name: 'عميل استراتيجي', project: 'مشروع استراتيجي' },
  'Al-Zulfi Foundation|Abu al-Haytham 1': { name: 'مؤسسة الزلفي', project: 'أبو الهيثم ١' },
};

/**
 * أدمن المبيعات في الدفتر بالإنجليزية وفي النظام بالعربية.
 *
 * **من لا اسم له هنا لا يُخمَّن**: يدخل سطره بلا أدمن ويُذكر اسمه في تقرير
 * الترحيل، فتُضيفه بنفسك أو تصحّح ورقتك.
 */
export const SALES_ADMIN_ALIASES: Record<string, string> = {
  'Ahmed Megaly': 'أحمد مجلي',
  'Ahmad Megaly': 'أحمد مجلي',
  'Mohamed Elsawy': 'الصاوي',
  'Noura Anwer': 'نورا',
  'Yahia Nasser': 'يحيى',
  'Mohamed Bakry': 'محمد بكري',
};

/**
 * القيمة التي يكتبها المحاسب حين لا بُعد للسطر. تُقرأ **فراغًا** لا اسمَ
 * فرعٍ ولا مركزَ تكلفة: «غير محدَّد» غيابٌ لا كيان.
 */
export const UNSPECIFIED = 'Unspecified';

/** أقصى عدد أسطر يُنتظر توازنها قبل أن تُعتبر الدفعة موقوفة */
export const MAX_ENTRY_LINES = 80;

/** فارق يُغتفر في مقارنة العشريات (نصف قرش) */
export const BALANCE_TOLERANCE = 0.005;

// ═══════════════════════════════════════════════════════════════
//  قراءة الصف
// ═══════════════════════════════════════════════════════════════

/** ترتيب الأعمدة كما هو في ورقة المحاسب — وعليه يقوم التحليل */
export const COLUMNS = [
  'serial',
  'date',
  'month',
  'docType',
  'docNumber',
  'description',
  'debit',
  'debitUsd',
  'credit',
  'creditUsd',
  'subBalance',
  'subBalanceUsd',
  'branch',
  'salesAdmin',
  'trafficSource',
  'units',
  'translationType',
  'costCenterAccount',
  'costCenterProject',
  'mainAccount',
  'sub1',
  'sub2',
  'sub3',
] as const;

export type AccountingRow = {
  serial: string;
  date: Date;
  period: string;
  docType: string;
  docNumber: string | null;
  description: string;
  debit: number;
  credit: number;
  branch: string | null;
  /** اسم الفرع كما ورد حين تعذّرت مطابقته — للتقرير لا للحفظ */
  branchRaw: string | null;
  salesAdmin: string | null;
  trafficSource: string | null;
  units: number | null;
  translationType: string | null;
  costCenterName: string | null;
  costCenterProject: string | null;
  /** مسار الحساب من الأعلى للأسفل، بلا فراغات ولا تكرار متجاور */
  path: string[];
  accountType: string;
  expenseGroup: string | null;
};

export type RowError = { line: number; raw: string; reason: string };

/**
 * رقمٌ من خانة قد تحمل فراغًا أو نقطة أو فاصلة آلاف.
 *
 * **الخانة غير الرقمية تُقرأ صفرًا لا تُرفض:** المحاسب يكتب `.` علامةَ
 * مراجعةٍ في خانة الدائن أحيانًا، والصف نفسه سليم. والاتزان هو الحكم
 * الأخير على أي حال.
 */
export function parseAmount(raw: string | undefined | null): number {
  if (raw === undefined || raw === null) return 0;
  const cleaned = String(raw).replace(/[,\s ]/g, '').replace(/[^\d.\-]/g, '');
  if (cleaned === '' || cleaned === '.' || cleaned === '-') return 0;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

/** تاريخٌ بصيغة الشيت (`YYYY-MM-DD` أو `DD/MM/YYYY`) */
export function parseSheetDate(raw: string | undefined): Date | null {
  const text = (raw ?? '').trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return safeDate(Number(y), Number(m), Number(d));
  }
  const slash = text.match(/^(\d{1,2})[/](\d{1,2})[/](\d{4})/);
  if (slash) {
    const [, d, m, y] = slash;
    return safeDate(Number(y), Number(m), Number(d));
  }
  return null;
}

function safeDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return date.getMonth() === month - 1 ? date : null;
}

export function periodOfDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** «غير محدَّد» والفراغ سواء — كلاهما غياب */
function dimension(raw: string | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!text || text === UNSPECIFIED || text === '#N/A') return null;
  return text;
}

/**
 * مسار الحساب: يُنظَّف من الفراغات ومن **التكرار المتجاور**.
 *
 * المحاسب يكرّر الاسم نفسه في المستويات الأربعة حين لا يحتاج تفريعًا
 * (مجمّع الإهلاك مثلًا). وبناء أربعة مستويات باسم واحد يُنتج شجرةً كاذبة
 * عمقُها وهمٌ — فالمكرَّر المتجاور يُطوى في واحد.
 */
export function accountPath(parts: (string | undefined)[]): string[] {
  const out: string[] = [];
  for (const part of parts) {
    const name = (part ?? '').trim();
    if (!name || name === UNSPECIFIED) continue;
    if (out[out.length - 1] === name) continue;
    out.push(name);
  }
  return out;
}

/** يقرأ صفًّا واحدًا — ويُعيد سببًا مكتوبًا حين يتعذّر */
export function parseRow(cells: string[], line: number): AccountingRow | RowError {
  const raw = cells.join('\t');
  const get = (key: (typeof COLUMNS)[number]) => cells[COLUMNS.indexOf(key)];

  const date = parseSheetDate(get('date'));
  if (!date) return { line, raw, reason: 'التاريخ غير مقروء' };

  const path = accountPath([get('mainAccount'), get('sub1'), get('sub2'), get('sub3')]);
  if (path.length === 0) return { line, raw, reason: 'الصف بلا حساب' };

  const main = (get('mainAccount') ?? '').trim();
  const accountType = MAIN_ACCOUNT_TYPES[main];
  if (!accountType) {
    return { line, raw, reason: `حساب رئيسي غير معروف: «${main || '—'}»` };
  }

  const debit = parseAmount(get('debit'));
  const credit = parseAmount(get('credit'));
  if (debit === 0 && credit === 0) {
    return { line, raw, reason: 'صف بلا مبلغ — لا مدين ولا دائن' };
  }
  if (debit > 0 && credit > 0) {
    return { line, raw, reason: 'الصف مدين ودائن معًا' };
  }

  const branchRaw = dimension(get('branch'));
  const branch = branchRaw ? (BRANCH_KEYS[branchRaw] ?? null) : null;

  const units = parseAmount(get('units'));

  return {
    serial: (get('serial') ?? '').trim(),
    date,
    period: periodOfDate(date),
    docType: DOC_TYPES[(get('docType') ?? '').trim()] ?? 'journal',
    docNumber: dimension(get('docNumber')),
    description: (get('description') ?? '').trim() || 'قيد مرحَّل من دفتر المحاسب',
    debit,
    credit,
    branch,
    branchRaw: branchRaw && !branch ? branchRaw : null,
    salesAdmin: dimension(get('salesAdmin')),
    trafficSource: dimension(get('trafficSource')),
    units: units > 0 ? units : null,
    translationType: dimension(get('translationType')),
    costCenterName: dimension(get('costCenterAccount')),
    costCenterProject: dimension(get('costCenterProject')),
    path,
    accountType,
    expenseGroup: accountType === 'expense' ? (EXPENSE_GROUPS[(get('sub1') ?? '').trim()] ?? null) : null,
  };
}

/** هل هذا السطر ترويسة الورقة؟ */
export function isHeaderLine(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase();
  return joined.includes('main account') && joined.includes('date');
}

/**
 * سطرُ حشوٍ من ذيل الورقة — بلا تاريخ ولا مبلغ ولا حساب.
 *
 * ورقة المحاسب تمتدّ آلاف الصفوف الفارغة تحت البيانات (٨٬٠٤٦ صفًّا وفيها
 * ٥٬٠١٨ صفَّ بيانات). هذه تُتخطّى **بصمت**: إدخالها قائمةَ المراجعة يُغرق
 * ما يستحق المراجعة حقًّا.
 */
export function isBlankLine(cells: string[]): boolean {
  const get = (key: (typeof COLUMNS)[number]) => (cells[COLUMNS.indexOf(key)] ?? '').trim();
  if (get('date') !== '') return false;
  if (parseAmount(get('debit')) !== 0 || parseAmount(get('credit')) !== 0) return false;
  return accountPath([get('mainAccount'), get('sub1'), get('sub2'), get('sub3')]).length === 0;
}

// ═══════════════════════════════════════════════════════════════
//  تجميع القيود بالرصيد الجاري
// ═══════════════════════════════════════════════════════════════

export type GroupedEntry = {
  /** مفتاح ثابت يمنع تكرار الترحيل — من مسلسل أول سطر في القيد */
  key: string;
  date: Date;
  period: string;
  docType: string;
  docNumber: string | null;
  description: string;
  rows: AccountingRow[];
  totalDebit: number;
  totalCredit: number;
};

/** دفعةٌ لم تتوازن — تُعرض بفارقها ولا تدخل الدفتر */
export type UnbalancedBatch = {
  period: string;
  firstSerial: string;
  lastSerial: string;
  lines: number;
  difference: number;
  reason: string;
};

export type GroupResult = {
  entries: GroupedEntry[];
  unbalanced: UnbalancedBatch[];
};

/**
 * يجمّع الصفوف قيودًا متوازنة.
 *
 * الصفوف تُقرأ بترتيبها في الورقة — **والترتيب جزء من المعنى هنا**، فهو
 * الرابط الوحيد بين طرفَي القيد. ولذلك لا تُرتَّب ولا تُفرَّق.
 */
export function groupEntries(rows: AccountingRow[]): GroupResult {
  const entries: GroupedEntry[] = [];
  const unbalanced: UnbalancedBatch[] = [];

  let batch: AccountingRow[] = [];
  let debit = 0;
  let credit = 0;
  let period: string | null = null;

  const flushUnbalanced = (reason: string) => {
    if (batch.length === 0) return;
    unbalanced.push({
      period: batch[0].period,
      firstSerial: batch[0].serial,
      lastSerial: batch[batch.length - 1].serial,
      lines: batch.length,
      difference: round2(debit - credit),
      reason,
    });
    batch = [];
    debit = 0;
    credit = 0;
  };

  for (const row of rows) {
    // الشهر حدٌّ لا يُتجاوز: خللٌ في شهر لا يبتلع الذي بعده
    if (period !== null && row.period !== period) {
      flushUnbalanced('انتهى الشهر ولم يتوازن ما بقي منه');
    }
    period = row.period;

    batch.push(row);
    debit += row.debit;
    credit += row.credit;

    if (Math.abs(debit - credit) < BALANCE_TOLERANCE && debit > 0) {
      entries.push({
        key: `JE-${batch[0].serial || batch[0].date.toISOString().slice(0, 10)}-${batch.length}`,
        date: batch[0].date,
        period: batch[0].period,
        docType: batch.find((r) => r.docType !== 'journal')?.docType ?? batch[0].docType,
        docNumber: batch.find((r) => r.docNumber)?.docNumber ?? null,
        description: batch[0].description,
        rows: batch,
        totalDebit: round2(debit),
        totalCredit: round2(credit),
      });
      batch = [];
      debit = 0;
      credit = 0;
      continue;
    }

    if (batch.length >= MAX_ENTRY_LINES) {
      flushUnbalanced(`تجاوزت ${MAX_ENTRY_LINES} سطرًا بلا اتزان`);
    }
  }

  flushUnbalanced('آخر الملف ولم يتوازن ما بقي');

  return { entries, unbalanced };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════
//  الأصول الثابتة ومعدلات الإهلاك
// ═══════════════════════════════════════════════════════════════

export type AssetCategoryRow = {
  name: string;
  /** النسبة السنوية عشريّة: ٠٫٢٥ = ٢٥٪ */
  annualRate: number;
  cost: number;
  accumulated: number;
};

/**
 * يقرأ ورقة الإهلاك: صفٌّ للنِّسَب وصفٌّ للتكلفة وصفٌّ للمجمَّع، والأعمدة
 * هي فئات الأصول.
 *
 * **النسبة تُقرأ ولا تُفترض:** ٥٠٪ للتكييفات و٢٥٪ لما عداها في دفتر ٢٠٢٦،
 * وهي أرقام المحاسب لا معيارٌ عامّ نُسقطه عليه.
 */
export function parseDepreciationSheet(lines: string[][]): AssetCategoryRow[] {
  const find = (needle: string) =>
    lines.find((cells) => cells.some((c) => (c ?? '').trim().toLowerCase().includes(needle)));

  const header = find('statement');
  const rates = find('depreciation rate');
  const cost = find('total value of fixed assets');
  const accumulated = find('accumulated depreciation of');
  if (!header || !rates) return [];

  const start = header.findIndex((c) => (c ?? '').trim().toLowerCase().includes('statement')) + 1;
  const out: AssetCategoryRow[] = [];

  for (let i = start; i < header.length; i++) {
    const name = (header[i] ?? '').trim();
    if (!name || name.toLowerCase() === 'total') continue;
    const rate = parseAmount(rates[i]);
    if (rate <= 0) continue;
    out.push({
      name,
      // ٢٥ و٠٫٢٥ كلاهما يعني الربع — الشيتات تكتبها بالوجهين
      annualRate: rate > 1 ? rate / 100 : rate,
      cost: parseAmount(cost?.[i]),
      accumulated: Math.abs(parseAmount(accumulated?.[i])),
    });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
//  ملخّص الترحيل
// ═══════════════════════════════════════════════════════════════

export type ImportSummary = {
  rows: number;
  accounts: number;
  costCenters: number;
  entries: number;
  lines: number;
  skipped: number;
  unbalancedBatches: number;
  unbalancedLines: number;
  /** أسماء فروع وردت في الدفتر ولا تطابق قائمة الفروع */
  unknownBranches: string[];
  /** أسماء أدمنز وردت ولا تطابق مستخدمًا */
  unknownAdmins: string[];
  errors: RowError[];
};

/** يجمع تقرير الترحيل في جملة عربية واحدة تُكتب في سجل التدقيق */
export function summaryLine(summary: ImportSummary): string {
  const parts = [
    `${summary.entries} قيدًا`,
    `${summary.lines} سطرًا`,
    `${summary.accounts} حسابًا`,
  ];
  if (summary.unbalancedLines > 0) {
    parts.push(`${summary.unbalancedLines} سطرًا موقوفًا لعدم الاتزان`);
  }
  if (summary.skipped > 0) parts.push(`${summary.skipped} صفًّا متخطًّى`);
  return parts.join(' · ');
}
