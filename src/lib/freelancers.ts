/**
 * الفريلانسرز — الوحدة الخالصة (§١١ و§١٤ المصدر ج).
 *
 * لا تلمس قاعدة بيانات ولا تقرأ شبكة، فتُختبر بأرقامها الحرفية. كل ما فيها
 * قواعد نصّت عليها المواصفة، ومنها ما يبدو غريبًا حتى تعرف مصدره:
 * التقييم مخزَّن كتواريخ، والأسعار نصوص، والصفر يعني «لم يُتفق» لا «مجاني».
 */

// ── الثوابت ────────────────────────────────────────────────────

/** درجة الفريلانسر عندنا — «معتمد» هو الفريق الحقيقي والباقي مخزون مواهب */
export const FREELANCER_TIERS = {
  approved: 'معتمد',
  bench: 'مخزون',
  trial: 'تحت التجربة',
  suspended: 'موقوف',
} as const;
export type FreelancerTier = keyof typeof FREELANCER_TIERS;

/** ترتيب الدرجات في الفرز — المعتمد أولًا دائمًا */
const TIER_ORDER: Record<string, number> = {
  approved: 0,
  trial: 1,
  bench: 2,
  suspended: 3,
};

/** وحدة الأجر — الخلط بينها وبين الصفحة هو خطأ الاستيراد الساذج (§١٤) */
export const RATE_UNITS = {
  page: 'الصفحة',
  word_250: '٢٥٠ كلمة',
  word: 'الكلمة',
  hour: 'الساعة',
  project: 'المشروع كاملًا',
  minute: 'الدقيقة',
} as const;
export type RateUnit = keyof typeof RATE_UNITS;

export const PAYMENT_STATUSES = {
  due: 'مستحق',
  paid: 'مدفوع',
  held: 'معلّق',
} as const;
export type PaymentStatus = keyof typeof PAYMENT_STATUSES;

// ── تنظيف الاسم (§١٤ المصدر ج) ─────────────────────────────────

/**
 * ألقاب تسبق الاسم في المصدر. تُحذف من **أول** الاسم وحده — فمن اسمه
 * «محمد دراز» لا يفقد شيئًا، ومن كُتب «د محمد» يفقد اللقب.
 */
const TITLES = [
  'د.', 'د', 'دكتور', 'دكتورة', 'أ.د', 'ا.د',
  'مهندس', 'مهندسة', 'م.', 'الأستاذ', 'الاستاذ', 'أ.', 'ا.',
  'dr.', 'dr', 'prof.', 'prof', 'mr.', 'mr', 'mrs.', 'mrs', 'ms.', 'ms', 'eng.', 'eng',
];

/**
 * ينظّف اسمًا قادمًا من ملف: مسافات زائدة · أسطر داخل الخلية · `~` ·
 * الألقاب في المقدمة. ولا يغيّر حروف الاسم نفسه.
 */
export function cleanName(raw: string): string {
  let name = String(raw ?? '')
    .replace(/[~*_]+/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // نحذف لقبًا واحدًا فقط في كل دورة، ونكرر لأن «أ.د محمد» لقبان
  let changed = true;
  while (changed) {
    changed = false;
    for (const title of TITLES) {
      const lower = name.toLowerCase();
      const t = title.toLowerCase();
      if (lower.startsWith(t + ' ') || lower.startsWith(t) && /^[\s.]/.test(name.slice(t.length))) {
        const rest = name.slice(title.length).replace(/^[\s.]+/, '');
        // لا نُفرغ الاسم: لو لم يبقَ شيء فاللقب هو الاسم كله
        if (rest.length > 0) {
          name = rest;
          changed = true;
          break;
        }
      }
    }
  }

  return name.trim();
}

// ── البحث الفوري في المتصفح ────────────────────────────────────

/**
 * يوحّد نصًا للمطابقة: أرقام عربية ← لاتينية · همزات ← ألف · التاء
 * المربوطة ← هاء · الياء المقصورة ← ياء · التشكيل يُحذف.
 *
 * الغرض عملي: من يكتب «احمد» يجب أن يجد «أحمد»، ومن يكتب «هبه» يجد «هبة».
 */
export function normalizeSearch(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[ً-ْٰ]/g, '') // التشكيل
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

/** هل يطابق الاسم عبارة البحث؟ كل كلمة في العبارة يجب أن تظهر في الاسم */
export function matchesQuery(name: string, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const target = normalizeSearch(name);
  return q.split(' ').every((word) => target.includes(word));
}

// ── حلّ سعر الفريلانسر (§٨) ────────────────────────────────────

export type RateRow = {
  langFrom: string | null;
  langTo: string | null;
  serviceLine: string | null;
  stepType: string | null;
  rate: number;
  rateUnit: string;
  currency: string;
};

export type RateContext = {
  langFrom?: string | null;
  langTo?: string | null;
  serviceLine?: string | null;
  stepType?: string | null;
};

export type ResolvedRate = {
  rate: number | null;
  rateUnit: string;
  currency: string;
  /** من أين جاء: استثناء مطابق أم السعر الافتراضي أم لا شيء */
  source: 'exception' | 'default' | 'none';
  /** كم حقلًا طابق — للتفسير لا للحساب */
  specificity: number;
};

/**
 * **أدقّ تطابق يفوز.** بند يذكر اللغتين وخط الخدمة ونوع الخطوة يسبق بندًا
 * يذكر اللغتين وحدهما. والحقل الفارغ في البند يعني «أي قيمة» فلا يُسقطه.
 *
 * وإن لم يطابق شيء، فالسعر الافتراضي. وإن لم يوجد ولا هو، فـ`null` —
 * **وليس صفرًا**: الصفر في المصدر يعني «لم يُتفق»، وحسابه مجانًا يُنتج
 * هامشًا ١٠٠٪ صامتًا وهو أخطر من عدم الحساب (§١٧ بند ١٦).
 */
export function resolveRate(
  freelancer: { defaultRate: number | null; rateUnit: string; currency: string },
  rates: RateRow[],
  ctx: RateContext
): ResolvedRate {
  let best: RateRow | null = null;
  let bestScore = -1;

  for (const row of rates) {
    let score = 0;
    let ok = true;
    for (const [field, wanted] of [
      ['langFrom', ctx.langFrom],
      ['langTo', ctx.langTo],
      ['serviceLine', ctx.serviceLine],
      ['stepType', ctx.stepType],
    ] as const) {
      const value = row[field];
      if (value === null || value === undefined || value === '') continue; // «أي قيمة»
      if (!wanted || value !== wanted) {
        ok = false;
        break;
      }
      score += 1;
    }
    if (!ok) continue;
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }

  // بند بلا أي حقل محدَّد ليس أدقّ من السعر الافتراضي — نتجاهله لصالحه
  if (best && bestScore > 0) {
    return {
      rate: best.rate > 0 ? best.rate : null,
      rateUnit: best.rateUnit,
      currency: best.currency,
      source: 'exception',
      specificity: bestScore,
    };
  }

  const fallback = freelancer.defaultRate;
  return {
    rate: fallback && fallback > 0 ? fallback : null,
    rateUnit: freelancer.rateUnit,
    currency: freelancer.currency,
    source: fallback && fallback > 0 ? 'default' : 'none',
    specificity: 0,
  };
}

/**
 * تكلفة خطوة بأجر فريلانسر بوحدته.
 *
 * الوحدة ليست تفصيلة شكلية: من يُدفع له بالساعة لا تُضرب صفحاته في أجره.
 * ما لا نملك تحويله (ساعة/مشروع) يُطلب صراحةً من المستخدم بدل التخمين.
 */
export function freelancerStepCost(params: {
  rate: number | null;
  rateUnit: string;
  pages: number;
  /** كلمات الصفحة الواحدة — من الإعدادات */
  wordsPerPage: number;
  /** للساعة والمشروع: الكمية التي أدخلها المستخدم */
  units?: number | null;
}): number {
  const { rate, rateUnit, pages, wordsPerPage, units } = params;
  if (!rate || !Number.isFinite(rate) || rate <= 0) return 0;

  switch (rateUnit) {
    case 'page':
      return pages * rate;
    case 'word':
      return pages * wordsPerPage * rate;
    case 'word_250':
      return (pages * wordsPerPage) / 250 * rate;
    case 'hour':
    case 'minute':
      return (units ?? 0) * rate;
    case 'project':
      return rate;
    default:
      return pages * rate;
  }
}

// ── الترتيب الخماسي (§١١ بند ٣) ────────────────────────────────

export type RankableFreelancer = {
  id: string;
  name: string;
  tier: string;
  effectiveRate: number | null;
  rating: number | null;
  projectsCount: number;
  lastUsedAt: Date | string | null;
};

/**
 * **المعتمدون أولًا، ثم الأرخص، ثم الأعلى تقييمًا، ثم الأكثر عملًا معنا،
 * ثم الأحدث تعاملًا.** بهذا الترتيب حرفيًا.
 *
 * من بلا سعر يذهب لآخر شريحته لا لأولها — فسعر مجهول ليس رخيصًا.
 * والترتيب **ثابت**: متساويان في الخمسة يُرتَّبان بالاسم فلا تتراقص القائمة.
 */
export function rankFreelancers<T extends RankableFreelancer>(list: T[]): T[] {
  const time = (v: Date | string | null) => (v ? new Date(v).getTime() : 0);

  return [...list].sort((a, b) => {
    const tier = (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9);
    if (tier !== 0) return tier;

    const ar = a.effectiveRate ?? Number.POSITIVE_INFINITY;
    const br = b.effectiveRate ?? Number.POSITIVE_INFINITY;
    if (ar !== br) return ar - br;

    const rating = (b.rating ?? -1) - (a.rating ?? -1);
    if (rating !== 0) return rating;

    const projects = b.projectsCount - a.projectsCount;
    if (projects !== 0) return projects;

    const used = time(b.lastUsedAt) - time(a.lastUsedAt);
    if (used !== 0) return used;

    return a.name.localeCompare(b.name, 'ar');
  });
}

// ── تفكيك أسعار المصدر النصية (§١٤ المصدر ج) ───────────────────

/** ما يُستخرج من خلية سعر واحدة — قد تكون سطرًا أو سطرين أو ثلاثة */
export type ParsedRate = {
  rate: number;
  currency: string;
  stepType?: string;
  langFrom?: string;
  langTo?: string;
  serviceLine?: string;
  /** نصّ الخلية الأصلي حين لا نستطيع الحسم — يُحفظ في الملاحظات */
  note?: string;
  /** يحتاج مراجعة بشرية قبل الاعتماد */
  needsReview?: boolean;
};

const CURRENCY_HINTS: [RegExp, string][] = [
  [/€|\beur?\b|\be\b(?!n)/i, 'EUR'],
  [/\$|\busd?\b/i, 'USD'],
  [/﷼|\bsar\b|ريال/i, 'SAR'],
  [/\ble\b|\begp\b|جنيه|ج\.م/i, 'EGP'],
];

const STEP_HINTS: [RegExp, string][] = [
  [/\btr\b|translation|ترجمة/i, 'human_translation'],
  [/\bre\b|review|مراجعة/i, 'heavy_review'],
  [/\bpr\b|proof|تدقيق/i, 'proofread'],
];

const LANG_HINTS: Record<string, string> = {
  ar: 'ar', arabic: 'ar', عربي: 'ar',
  en: 'en', english: 'en', انجليزي: 'en',
  sp: 'es', es: 'es', spanish: 'es',
  fr: 'fr', french: 'fr',
  de: 'de', german: 'de',
  it: 'it', italian: 'it',
  tr: 'tr', turkish: 'tr',
  ru: 'ru', russian: 'ru',
  zh: 'zh', chinese: 'zh',
};

function detectCurrency(text: string, fallback: string): string {
  for (const [pattern, code] of CURRENCY_HINTS) {
    if (pattern.test(text)) return code;
  }
  return fallback;
}

function detectLangPair(text: string): { langFrom?: string; langTo?: string } {
  const pair = text.match(/\b([a-z]{2,8})\s*-\s*([a-z]{2,8})\b/i);
  if (!pair) return {};
  const from = LANG_HINTS[pair[1].toLowerCase()];
  const to = LANG_HINTS[pair[2].toLowerCase()];
  return from && to ? { langFrom: from, langTo: to } : {};
}

/**
 * يفكّك خلية سعر من ملف الفريلانسرز إلى بند واحد أو أكثر.
 *
 * الأنماط التي رصدتها المواصفة في المصدر بعينها:
 *   `350`                    → سعر واحد
 *   `0`                      → **لم يُتفق** لا مجاني → لا بند
 *   `350 Tr - 250 Re`        → ترجمة ٣٥٠ · مراجعة ٢٥٠
 *   `70 Sp-Ar \\ 80 Sp-En`   → بندان باتجاهين
 *   `1500 on site / 1000 Online` → بندان بنوعَي خدمة
 *   `150-350`                → نطاق: الحدّ الأدنى، والأصل في الملاحظات
 *   `13 E` · `5$` · `100 Le` → عملات مختلطة بلا عمود
 */
export function parseRateCell(raw: string, defaultCurrency = 'EGP'): ParsedRate[] {
  const text = String(raw ?? '').trim();
  if (!text) return [];

  // رقم صريح وحده
  const plain = text.match(/^-?\d+(\.\d+)?$/);
  if (plain) {
    const value = Number(plain[0]);
    // الصفر يعني «لم يُتفق» — لا بند، ولا سعر صفر
    return value > 0 ? [{ rate: value, currency: defaultCurrency }] : [];
  }

  // نطاق «١٥٠-٣٥٠»: الحد الأدنى مع الأصل، ويُراجع
  const range = text.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (range) {
    const low = Math.min(Number(range[1]), Number(range[2]));
    return [
      {
        rate: low,
        currency: defaultCurrency,
        note: `نطاق في المصدر: ${text}`,
        needsReview: true,
      },
    ];
  }

  // أجزاء متعددة يفصلها \\ أو / أو - بين مقطعين يحمل كل منهما رقمًا
  const parts = text
    .split(/\\{1,2}|\||\/(?![^\s]*\d\s*[-–]\s*\d)|(?<=\D)\s+-\s+(?=\d)/)
    .map((p) => p.trim())
    .filter(Boolean);

  const out: ParsedRate[] = [];
  for (const part of parts) {
    const numbers = part.match(/\d+(\.\d+)?/g);
    if (!numbers) continue;

    // «350 Tr - 250 Re» داخل جزء واحد: رقمان بوسمين
    const tagged = [...part.matchAll(/(\d+(?:\.\d+)?)\s*([A-Za-z؀-ۿ]{2,12})/g)];
    if (tagged.length > 1) {
      for (const match of tagged) {
        const value = Number(match[1]);
        if (value <= 0) continue;
        const label = match[2];
        const step = STEP_HINTS.find(([p]) => p.test(label))?.[1];
        out.push({
          rate: value,
          currency: detectCurrency(part, defaultCurrency),
          ...(step ? { stepType: step } : {}),
          ...(step ? {} : { note: `وسم غير مفهوم: ${label}`, needsReview: true }),
        });
      }
      continue;
    }

    const value = Number(numbers[0]);
    if (value <= 0) continue;

    const step = STEP_HINTS.find(([p]) => p.test(part))?.[1];
    const langs = detectLangPair(part);
    const currency = detectCurrency(part, defaultCurrency);
    const hasWords = /[A-Za-z؀-ۿ]{3,}/.test(part.replace(/\d+/g, ''));

    out.push({
      rate: value,
      currency,
      ...(step ? { stepType: step } : {}),
      ...langs,
      // نصّ لم نفهمه لا يُهمَل بصمت — يُحفظ ويُعلَّم للمراجعة
      ...(hasWords && !step && !langs.langFrom
        ? { note: `أصل الخلية: ${part}`, needsReview: true }
        : {}),
    });
  }

  return out;
}

/**
 * التقييم في المصدر مخزَّن **كتاريخ** لأن `7/10` تحوّلت إلى ٧ أكتوبر.
 * الدرجة = **رقم الشهر**، من ١٠.
 *
 * ونفس العمود يحمل بريدًا إلكترونيًا في ٦٢ خلية — نفصلهما هنا.
 */
export function parseRatingCell(raw: unknown): { rating: number | null; email: string | null } {
  if (raw === null || raw === undefined || raw === '') return { rating: null, email: null };

  if (raw instanceof Date) {
    const month = raw.getMonth() + 1;
    return { rating: month >= 1 && month <= 10 ? month : null, email: null };
  }

  const text = String(raw).trim();

  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (email) return { rating: null, email: email[0].toLowerCase() };

  // «7/10» كما هي
  const fraction = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*10$/);
  if (fraction) {
    const value = Number(fraction[1]);
    return { rating: value >= 0 && value <= 10 ? value : null, email: null };
  }

  // تاريخ نصي: الجزء الذي يمثّل الشهر هو الدرجة
  const date = text.match(/^(\d{1,2})[/\\-](\d{1,2})[/\\-](\d{2,4})$/);
  if (date) {
    const month = Number(date[2]);
    return { rating: month >= 1 && month <= 10 ? month : null, email: null };
  }

  const number = Number(text);
  if (Number.isFinite(number) && number >= 0 && number <= 10) {
    return { rating: number, email: null };
  }

  return { rating: null, email: null };
}

/**
 * صفّ الاستيراد صالح؟ الاسم وحده لا يكفي: صفوف الرؤوس الثانية في المصدر
 * اسمها حرفيًا «Name»، والاستيراد الساذج يُدخلها شخصًا (§١٤ المصدر ج).
 */
const HEADER_WORDS = new Set([
  'name', 'names', 'الاسم', 'اسم', 'rate', 'price', 'phone', 'email', 'language',
  'rate for 1hour', 'rate for 1 hour', 'n/a', 'na', '-',
]);

export function isHeaderRow(name: string): boolean {
  const cleaned = normalizeSearch(cleanName(name));
  if (!cleaned) return true;
  if (HEADER_WORDS.has(cleaned)) return true;
  // صف بلا حرف واحد (أرقام ورموز فقط) ليس اسم شخص
  return !/[a-z؀-ۿ]/i.test(cleaned);
}

/** مفتاح الدمج: نفس الهاتف = نفس الشخص، وإلا نفس الاسم المطبَّع */
export function mergeKey(name: string, phone: string | null): string {
  if (phone && phone.trim()) return 'p:' + phone.trim();
  return 'n:' + normalizeSearch(cleanName(name));
}

/** يدمج لغات وتخصصات الصفوف المكررة في مجموعة واحدة بلا تكرار */
export function mergeMultiValue(existing: string | null, incoming: string | null): string {
  const set = new Set(
    [existing, incoming]
      .filter(Boolean)
      .flatMap((v) => String(v).split(','))
      .map((v) => v.trim())
      .filter(Boolean)
  );
  return [...set].sort().join(',');
}
