/**
 * ترحيل البيانات القديمة (§١٤) — الوحدة الخالصة.
 *
 * **القاعدة الحاكمة: لا تحذف ولا تخمّن.** كل صف لا يمكن حسمه يخرج بسبب
 * واضح ليُراجَع يدويًا، ولا يدخل النظام صامتًا ولا يُهمَل صامتًا.
 *
 * كل قاعدة هنا مأخوذة من عيب **موجود فعلًا** في ملفَّي الليدز والمبيعات،
 * ومكتوب في §١٤ بعينه. لا قاعدة احترازية بلا مصدر.
 */

// ── التواريخ ───────────────────────────────────────────────────

export type ParsedDate = {
  date: Date | null;
  /** ما لم نستطع حسمه — يذهب لجدول المراجعة */
  problem?: string;
  /** صحّحناه بقاعدة، فيُعلَّم ليراه المراجع */
  corrected?: string;
  /**
   * التاريخ مقروء لكنه لم يأتِ بعد.
   *
   * **لا يُرفض هنا:** صفوف انقلاب مارس ٢٠٢٦ تبدو مستقبلية قبل تصحيحها
   * (٣ أكتوبر يصير ١٠ مارس)، فلو رفضناها في القراءة لما بلغت قاعدة
   * التصحيح أبدًا. القرار يقع بعد التصحيح لا قبله.
   */
  future?: boolean;
};

/** الملف يكتب `24\11\2025` و`26/07/2026` و`23-5-2026` — ثلاثة فواصل */
const TEXT_DATE = /^\s*(\d{1,2})\s*[\\/\-]\s*(\d{1,4})\s*[\\/\-]?\s*(\d{2,4})?\s*$/;

/**
 * يقرأ خلية تاريخ من الملف.
 *
 * **ترتيب الأجزاء يوم/شهر/سنة** — هو ما كتبه الفريق فعلًا. ومن كتب
 * `5\112025` (بلا فاصل ثانٍ) نفكّه: الجزء الثاني يحمل الشهر والسنة ملتصقين.
 */
export function parseSheetDate(raw: unknown, options: { today?: Date } = {}): ParsedDate {
  const today = options.today ?? new Date();

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return { date: null, problem: 'تاريخ غير صالح' };
    return { date: raw };
  }
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { date: null, problem: 'التاريخ فارغ' };
  }

  const text = String(raw).trim();

  // `2026-02-03` — الصيغة العالمية. **لا لبس فيها**: الجزء الأول بأربعة
  // أرقام سنةٌ قطعًا، فتُقرأ سنة/شهر/يوم لا يوم/شهر/سنة.
  const isoParts = text.match(/^\s*(\d{4})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{1,2})\s*$/);
  if (isoParts) {
    return build(Number(isoParts[3]), Number(isoParts[2]), Number(isoParts[1]), today);
  }

  // `5\112025` — الشهر والسنة ملتصقان
  const glued = text.match(/^\s*(\d{1,2})\s*[\\/\-]\s*(\d{1,2})(\d{4})\s*$/);
  if (glued) {
    return build(Number(glued[1]), Number(glued[2]), Number(glued[3]), today, 'شهر وسنة ملتصقان في المصدر');
  }

  const parts = text.match(TEXT_DATE);
  if (!parts) return { date: null, problem: `صيغة تاريخ غير مفهومة: ${text}` };

  const day = Number(parts[1]);
  const month = Number(parts[2]);
  const year = parts[3] ? Number(parts[3]) : today.getFullYear();
  return build(day, month, year, today);
}

function build(day: number, month: number, year: number, today: Date, note?: string): ParsedDate {
  let fullYear = year;
  let corrected = note;

  // سنة من رقمين: `25` تعني ٢٠٢٥ — تحويل مباشر لا تخمين فيه
  if (fullYear < 100) fullYear += 2000;

  // `01/07/0205` و`6\11\2005` — سنة تالفة. §١٤ يصنّفها «تُصلَح يدويًا»،
  // وقد كتب المُواصِف المقصودَ بين قوسين لأنه **قرأ الصف** لا لأن قاعدة
  // تستنتجه. فلا نخمّن: تذهب للمراجعة بسببها.
  if (fullYear < 2015 || fullYear > today.getFullYear() + 1) {
    return { date: null, problem: `سنة خارج المدى: ${year} — تُصحَّح يدويًا` };
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { date: null, problem: `يوم أو شهر خارج المدى: ${day}/${month}` };
  }

  const date = new Date(fullYear, month - 1, day);
  if (date.getMonth() !== month - 1) {
    return { date: null, problem: `يوم لا يوجد في شهره: ${day}/${month}/${fullYear}` };
  }

  // `24\11\2026` والمقصود ٢٠٢٥ (§١٤). التاريخ الذي لم يأتِ بعد لا يكون
  // تاريخ بيعة تمّت — لكن الحكم يُؤجَّل حتى بعد تصحيح انقلاب مارس.
  const horizon = new Date(today.getTime() + 7 * 86_400_000);
  const future = date > horizon;

  return { date, ...(corrected ? { corrected } : {}), ...(future ? { future: true } : {}) };
}

/**
 * انقلاب اليوم والشهر في مارس ٢٠٢٦ (§١٤، ٤٦ صفًا).
 *
 * > «كُتبت `d/3/2026` فقُرئت شهرًا/يومًا فتوزّعت على تسعة أشهر حتى ديسمبر.
 * >  القاعدة: لأي صف في المدى، إن كان `DAY=3` و`MONTH≠3` فالتاريخ الصحيح =
 * >  `DATE(2026, 3, MONTH)`.»
 *
 * تُطبَّق **على النطاق المحدَّد وحده**، لأنها تقلب أي تاريخ يومه الثالث لو
 * عُمّمت — والثالث من كل شهر تاريخ مشروع.
 */
export function fixMarch2026Flip(
  date: Date,
  options: { enabled: boolean }
): { date: Date; corrected?: string } {
  if (!options.enabled) return { date };
  if (date.getFullYear() !== 2026) return { date };
  if (date.getDate() !== 3) return { date };
  if (date.getMonth() === 2) return { date }; // مارس نفسه سليم

  const fixed = new Date(2026, 2, date.getMonth() + 1);
  return {
    date: fixed,
    corrected: `انقلاب يوم/شهر: ${date.getMonth() + 1}/3 ← 3/${date.getMonth() + 1}`,
  };
}

// ── المبالغ والعملات ───────────────────────────────────────────

export type ParsedAmount = {
  amount: number | null;
  currency: string;
  problem?: string;
  corrected?: string;
};

const CURRENCY_WORDS: [RegExp, string][] = [
  [/ريال|sar|﷼/i, 'SAR'],
  [/دولار|\$|usd/i, 'USD'],
  [/يورو|€|eur/i, 'EUR'],
  [/جنيه|egp|ج\.?م/i, 'EGP'],
];

/**
 * `60 ريال` — ملف الليدز يخلط العملة نصًّا في عمود الجنيه (٨ خلايا).
 *
 * **لا يُحوَّل الرقم:** يُخزَّن بعملته ويُعلَّم، لأن سعر يوم القيد غير معروف
 * وتحويله بسعر اليوم يزوّر إيراد ذلك الشهر.
 */
export function parseSheetAmount(raw: unknown, defaultCurrency = 'EGP'): ParsedAmount {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { amount: null, currency: defaultCurrency };
  }
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { amount: raw, currency: defaultCurrency } : { amount: null, currency: defaultCurrency, problem: 'مبلغ غير صالح' };
  }

  const text = String(raw).trim();
  const currency = CURRENCY_WORDS.find(([p]) => p.test(text))?.[1] ?? defaultCurrency;
  const match = text.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!match) return { amount: null, currency, problem: `مبلغ غير مفهوم: ${text}` };

  const amount = Number(match[0]);
  if (!Number.isFinite(amount)) return { amount: null, currency, problem: `مبلغ غير مفهوم: ${text}` };

  return currency === defaultCurrency
    ? { amount, currency }
    : { amount, currency, corrected: `عملة مكتوبة نصًّا في عمود ${defaultCurrency}: ${text}` };
}

// ── القوائم: من نص المصدر إلى مفتاح النظام ─────────────────────

/** يوحّد نصًّا للمطابقة: مسافات · همزات · حالة الأحرف */
function key(raw: unknown): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function lookup(map: Record<string, string>, raw: unknown): string | null {
  const k = key(raw);
  if (!k) return null;
  return map[k] ?? null;
}

/** القنوات كما كُتبت في الملفين — بالعربية والإنجليزية وبأخطائها */
const CHANNEL_MAP: Record<string, string> = {
  'google ads': 'google_ads',
  google: 'google_ads',
  ads: 'google_ads',
  'اعلانات جوجل': 'google_ads',
  'meta ads': 'meta_ads',
  facebook: 'meta_ads',
  'facebook ads': 'meta_ads',
  فيسبوك: 'meta_ads',
  meta: 'meta_ads',
  organic: 'organic',
  gmb: 'organic',
  banners: 'organic',
  banner: 'organic',
  website: 'website',
  'web site': 'website',
  'الموقع': 'website',
  'old client': 'returning',
  'عميل قديم': 'returning',
  recommendation: 'referral',
  'توصيه': 'referral',
  referral: 'referral',
  // «علاقات عامة» و«تحرّك مندوب» ليسا قناتين في القائمة المزروعة —
  // يُصنّفان «أخرى» ويُحفظ الأصل في ملاحظة الترحيل، فلا يُخترع مفتاح
  pr: 'other',
  outreach: 'other',
  other: 'other',
  'غير محدد': 'other',
};

const CONTACT_MAP: Record<string, string> = {
  whatsapp: 'whatsapp',
  واتس: 'whatsapp',
  'واتس اب': 'whatsapp',
  phone: 'call',
  اتصال: 'call',
  call: 'call',
  office: 'office',
  مقر: 'office',
  'walk in': 'office',
  mail: 'email',
  ميل: 'email',
  email: 'email',
  // «ماسنجر» ليس في القائمة المزروعة — يُصنّف «واتس» خطأً لو خُمّن،
  // فيُترك بلا مطابقة ويُحفظ الأصل
};

const BRANCH_MAP: Record<string, string> = {
  mokattam: 'mokattam',
  'فرع المقطم': 'mokattam',
  المقطم: 'mokattam',
  'gameat aldwal': 'mohandessin',
  mohandessin: 'mohandessin',
  'فرع المهندسين': 'mohandessin',
  المهندسين: 'mohandessin',
  alex: 'alexandria',
  alexandria: 'alexandria',
  'فرع اسكندريه': 'alexandria',
  اسكندريه: 'alexandria',
  'nasr city': 'nasr_city',
  'مدينه نصر': 'nasr_city',
  'فرع الرياض': 'riyadh',
  riyadh: 'riyadh',
  'saudi arabia': 'riyadh',
};

export function mapChannel(raw: unknown): string | null {
  return lookup(CHANNEL_MAP, raw);
}
export function mapContactMethod(raw: unknown): string | null {
  return lookup(CONTACT_MAP, raw);
}
export function mapBranch(raw: unknown): string | null {
  return lookup(BRANCH_MAP, raw);
}

/**
 * أسماء أدمن المبيعات كما كُتبت في الملفين — بالعربية والإنجليزية.
 *
 * **يُبنى من مستخدمي النظام لا من قائمة ثابتة**، فمن يُضاف غدًا يُطابَق بلا
 * تعديل كود. والمعجم أدناه للمرادفات التي لا يمكن استنتاجها من الاسم.
 */
export const ADMIN_ALIASES: Record<string, string[]> = {
  'أحمد مجلي': ['ahmad megaly', 'ahmed megaly', 'megaly', 'مجلي'],
  'الصاوي': ['muhammad elsawy', 'mohamed elsawy', 'elsawy', 'محمد الصاوي', 'الصاوي'],
  'نورا': ['nora', 'noura', 'noura anwer', 'نورا', 'نورا أنور'],
  'يحيى': ['yahia', 'yahia nasser', 'yahya', 'يحيي', 'يحيى'],
  'محمد بكري': ['mohamed bakry', 'bakry', 'بكري'],
  /**
   * **«Ahmad Alsohagy» هو المدير التنفيذي نفسه** — أحمد محسن، الشريك.
   *
   * قالها بنفسه: «هو المدير التنفيذي (أنا) الشريك… وليس لي نسبة من المبيعات
   * لكن اتفقنا أن نحسبها بحيث أراها كأداء أمامي». فصفوفُه تُنسب إليه ليراها
   * في شاشة أدائه، **ولا نسبة عليها**: النسبة تُحسب على من له إسنادُ خطة
   * نسب، وهو بلا إسناد.
   */
  'أحمد محسن': ['ahmed alsohagyy', 'ahmad alsohagy', 'ahmed elsohagy', 'alsohagy', 'السوهاجي', 'أحمد السوهاجي', 'ahmed mohsen', 'ahmad mohsen'],
  'سارة': ['sara', 'sarah', 'ساره', 'sara alqahtani'],
  // ظهر في عمود «Sales Admin» بدفتر ٢٠٢٦ — وهو مدير المشاريع نفسه
  'طارق يوسف': ['tarek yousef', 'tarek', 'طارق', 'طارق إسماعيل يوسف'],
};

/**
 * يطابق اسمًا من الملف بمستخدم في النظام.
 *
 * ثلاث محاولات بالترتيب: تطابق الاسم المطبَّع · مرادف معروف · احتواء
 * جزئي (اسم أول مشترك). وما لم يُطابَق يُرجَع `null` **ولا يُخمَّن** —
 * فإسناد ليد لمالك خاطئ أسوأ من تركه بلا مالك.
 */
export function matchAdmin(
  raw: unknown,
  users: { id: string; name: string }[]
): { id: string; name: string } | null {
  const k = key(raw);
  if (!k) return null;

  const exact = users.find((u) => key(u.name) === k);
  if (exact) return exact;

  for (const [canonical, aliases] of Object.entries(ADMIN_ALIASES)) {
    if (aliases.some((a) => key(a) === k) || key(canonical) === k) {
      const user = users.find(
        (u) => key(u.name) === key(canonical) || aliases.some((a) => key(u.name) === key(a))
      );
      if (user) return user;
    }
  }

  // اسم أول مشترك — بشرط ألا يطابق أكثر من مستخدم واحد
  const partial = users.filter((u) => key(u.name).includes(k) || k.includes(key(u.name)));
  return partial.length === 1 ? partial[0] : null;
}

// ── قواعد التصنيف ──────────────────────────────────────────────

/**
 * §١٤: «١٥٩ صفًا استفسارات خاسرة مختلطة بالطلبات — تُميَّز بأن السعر فارغ
 * — **حوّلها إلى ليدز خاسرة لا مشاريع**.»
 *
 * وفي ملف المبيعات ٥١٦ صفًا كذلك. الصف بلا سعر لم يُبَع، وإدخاله مشروعًا
 * يضخّم عدد الطلبات ويهبط بمتوسط قيمة الطلب.
 */
export function isLostInquiry(price: number | null | undefined): boolean {
  return price === null || price === undefined || price === 0;
}

/** ملف الليدز يكتب «نعم/لا» — والتحويل يُحسم بالسعر لا بالعمود وحده */
export function isConverted(flag: unknown, price: number | null): boolean {
  const k = key(flag);
  if (k === 'نعم' || k === 'yes' || k === 'true') return true;
  if (k === 'لا' || k === 'no' || k === 'false') return false;
  return price !== null && price > 0;
}

/**
 * **ولا سنةَ ناقصة بعد دخول الدفاتر.**
 *
 * كانت ٢٠٢٤ معلَّمة «ناقصة» لأن شيت المبيعات رصد فيها تسعين صفًّا مقابل
 * تسعمئة وواحدٍ وستين في ٢٠٢٥ — والحكم كان صحيحًا يومها: الشيت كان المصدر
 * الوحيد. ثم دخل دفتر المحاسب وسُوّيت السنة عليه، فصار إيرادُها في النظام
 * ٥٬٤٤٩٬١٦٠٫٤٥ — رقمَ المحاسب نفسه بالقرش.
 *
 * **وتغطيةُ السنة تُقرأ من بياناتها لا من قائمةٍ مكتوبة**: آخر شهرٍ فيه
 * تسليم يقول كم شهرًا غُطّي، فالسنة الجارية تُقارَن بمثلها من التي قبلها.
 */

// ── نتيجة الصف ─────────────────────────────────────────────────

export type RowOutcome<T> =
  | { ok: true; value: T; warnings: string[] }
  | { ok: false; reason: string; raw: string };

/** يجمع ملاحظات التصحيح في نص واحد يُحفظ مع السجل */
export function mergeNotes(...notes: (string | undefined | null)[]): string | null {
  const list = notes.filter(Boolean) as string[];
  return list.length ? list.join(' · ') : null;
}
