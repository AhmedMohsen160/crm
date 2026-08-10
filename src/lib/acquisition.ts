/**
 * تكلفة اكتساب العميل — الوحدة الخالصة.
 *
 * **المصروف التسويقي مُدخَلٌ مرة واحدة: في دفتر الأستاذ.** شجرة الحسابات فيها
 * «مصاريف بيعية وتسويقية» بفروعها — إعلانات فيسبوك وجوجل وتيك توك
 * وإنستجرام وخدمات التسويق الخارجية. فلا شاشةَ إدخالٍ ثانية ولا خانةَ
 * «مصروف تسويق شهري» تُملأ بيدٍ أخرى: رقمان لشيء واحد يختلفان، ولا يُعرف
 * أيّهما الصحيح حين يختلفان.
 *
 * وهذه الوحدة تقرأ ما قيّده المحاسب وتقسمه على ما جاء من ليدز، فتُجيب عن
 * السؤال الذي يقرّر أين يوضع المال الإعلاني: **كم كلّفنا الليدُ الواحد، وكم
 * كلّفنا العميلُ الذي دفع فعلًا؟**
 */

import { money, sum } from './money';

/**
 * ربط حساب الإعلان بقناة الليد.
 *
 * **بالرمز الثابت لا بالاسم**: اسم الحساب يُعدَّل من الشاشة، ورمزه لا يُمسّ.
 * وما لا رمز له يدخل «تسويق عام» ولا يُنسب لقناة بعينها — النسبة الخاطئة
 * أسوأ من عدم النسبة، لأنها تُبنى عليها قرارات إنفاق.
 */
export const ACCOUNT_CHANNEL: Record<string, string> = {
  exp_ads_facebook: 'meta_ads',
  exp_ads_instagram: 'meta_ads',
  exp_ads_google: 'google_ads',
};

/** ما لم يُنسب لقناة — يُعرض ولا يُخفى */
export const UNATTRIBUTED = 'general';
export const UNATTRIBUTED_LABEL = 'تسويق عام (غير منسوب لقناة)';

/**
 * قناةُ الحساب.
 *
 * **والحقل المضبوط من الشاشة يعلو على الرمز المزروع.** الرمز يخدم شجرةَ
 * الحسابات التي زرعها النظام، وحسابات المحاسب المرحَّلة بلا رموز أصلًا —
 * فبلا `adChannel` كان إنفاقُ المكتب كلُّه يقع في «غير منسوب» ولا تظهر
 * تكلفةُ عميلٍ واحد.
 */
export function channelOfAccount(code: string | null, adChannel?: string | null): string {
  if (adChannel) return adChannel;
  if (!code) return UNATTRIBUTED;
  return ACCOUNT_CHANNEL[code] ?? UNATTRIBUTED;
}

/**
 * القنوات التي يصحّ أن يُنسب إليها إنفاق.
 *
 * **وهي قنواتُ الليدز نفسها** — لأن القسمة تقع بينهما: إنفاقُ جوجل على
 * ليدز جوجل. وقناةٌ في جانبٍ بلا نظيرها في الآخر تُنتج كسرًا بلا مقام.
 */
export const SPEND_CHANNELS: { value: string; label: string }[] = [
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'meta_ads', label: 'Meta Ads' },
  { value: 'organic', label: 'Organic — السيو والمحتوى' },
  { value: 'website', label: 'الموقع الإلكتروني' },
  { value: 'referral', label: 'توصية' },
  { value: 'walk_in', label: 'زيارة فرع' },
];

const SPEND_LABELS = new Map(SPEND_CHANNELS.map((c) => [c.value, c.label]));

export function channelLabel(channel: string): string {
  return SPEND_LABELS.get(channel) ?? (channel === UNATTRIBUTED ? UNATTRIBUTED_LABEL : channel);
}

/**
 * قناةُ السطر من **بيان القيد** — حين يجمع الحسابُ الواحد قناتين.
 *
 * **ولماذا نقرأ البيان أصلًا:** دفتر ٢٠٢٦ يضع جوجل وفيسبوك في حسابٍ واحد
 * (`Paid Advertising via Platforms Expenses`)، والتمييز بينهما في البيان
 * وحده: `… - Google Ads` و«… - سوشيال ميديا (فيسبوك)». فبلا قراءته يبقى
 * ٢١٣ ألفًا كتلةً واحدة لا تُقسَم على قناة.
 *
 * **وليست تخمينًا**: المحاسب هو من كتب اسم القناة صريحًا. والكلمات أدناه
 * أسماءُ المنصّات نفسها لا استنتاجٌ من سياق.
 *
 * **وتُقرأ عند الترحيل وحده** ثم تُحفظ على السطر — فمن صحّحها بيده بعد ذلك
 * لا يُكتب فوق عمله في رفعةٍ تالية.
 */
const MEMO_CHANNELS: [RegExp, string][] = [
  [/google\s*ads?|جوجل|جوحل/i, 'google_ads'],
  [/facebook|meta\s*ads?|instagram|فيسبوك|فيس بوك|انستجرام|إنستجرام|سوشيال ميديا/i, 'meta_ads'],
  [/\bseo\b|سيو|باك ?لينك|back\s*link|content\s*writing|كتابة محتوي|كتابة محتوى/i, 'organic'],
];

export function adChannelOfMemo(memo: string | null | undefined): string | null {
  const text = String(memo ?? '');
  if (!text) return null;
  for (const [pattern, channel] of MEMO_CHANNELS) {
    if (pattern.test(text)) return channel;
  }
  return null;
}

/**
 * هل يصحّ أن يحمل هذا الحساب قناةً؟
 *
 * **المصروف البيعيّ والتسويقيّ وحده.** ووضعُ قناةٍ على حساب الإيجار يقسم
 * إيجارَ المكتب على ليدز جوجل — وهو رقمٌ لا معنى له يُبنى عليه قرارُ إنفاق.
 */
export function mayCarryChannel(type: string, expenseGroup: string | null | undefined): boolean {
  return type === 'expense' && expenseGroup === 'selling_marketing';
}

// ── المؤشرات ───────────────────────────────────────────────────

export type ChannelInput = {
  channel: string;
  label: string;
  /** ما قُيّد في الدفتر على حسابات هذه القناة */
  spend: number;
  leads: number;
  /** ليدز صارت مشاريع */
  won: number;
  /** إيراد ما سُلّم أو حُصّل من هذه القناة */
  revenue: number;
};

export type ChannelResult = ChannelInput & {
  /** تكلفة الليد الواحد — `null` بلا ليدز */
  costPerLead: number | null;
  /** تكلفة العميل المكتسب — `null` بلا عميل واحد */
  costPerWon: number | null;
  /** نسبة التحويل من ليد إلى مشروع */
  conversionPct: number | null;
  /** عائد الإنفاق الإعلاني: الإيراد ÷ المصروف — `null` بلا إنفاق */
  roas: number | null;
  /** الربح بعد خصم الإنفاق التسويقي */
  net: number;
};

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10) / 10;
}

/**
 * حساب مؤشرات قناة.
 *
 * **وكلها تُرجع «غير مقيس» حين لا مقام.** قناةٌ بلا إنفاق ليست «عائدها لا
 * نهائي»، وقناةٌ بلا ليدز ليست «تكلفة الليد صفر». والفرق قرارُ إنفاقٍ يُتّخذ
 * على أساسه.
 */
export function channelMetrics(row: ChannelInput): ChannelResult {
  /**
   * **و«غير منسوب» وعاءُ انتظارٍ لا قناة.**
   *
   * إنفاقُه لم يُنسب بعد، و«ليدزه» ليدزٌ لم تُسجَّل قناتُها — ولا علاقة بين
   * الطرفين. فقسمةُ أحدهما على الآخر تُنتج رقمًا بلا معنى (٦٣٢ ألفًا لليد
   * الواحد)، وهو رقمٌ يُقرأ فيُصدَّق.
   */
  if (row.channel === UNATTRIBUTED) {
    return {
      ...row,
      costPerLead: null,
      costPerWon: null,
      conversionPct: row.leads > 0 ? ratio(row.won * 100, row.leads) : null,
      roas: null,
      net: money(row.revenue - row.spend),
    };
  }

  return {
    ...row,
    /**
     * **وبلا إنفاقٍ منسوبٍ لا تكلفة — لا صفر.**
     *
     * صفرٌ يقول «جاءنا هذا الليد مجانًا»، وهو ادّعاءٌ لا يصحّ حين يكون
     * الإنفاق موجودًا في الدفتر وغيرَ منسوبٍ للقناة بعد. والفرق قرارُ
     * إنفاقٍ يُتّخذ: من يقرأ «تكلفة الليد صفر» يزيد الإنفاق على القناة.
     */
    costPerLead: row.leads > 0 && row.spend > 0 ? money(row.spend / row.leads) : null,
    costPerWon: row.won > 0 && row.spend > 0 ? money(row.spend / row.won) : null,
    conversionPct: row.leads > 0 ? ratio(row.won * 100, row.leads) : null,
    roas: row.spend > 0 ? ratio(row.revenue, row.spend) : null,
    net: money(row.revenue - row.spend),
  };
}

export type AcquisitionSummary = {
  rows: ChannelResult[];
  spend: number;
  leads: number;
  won: number;
  revenue: number;
  costPerLead: number | null;
  costPerWon: number | null;
  roas: number | null;
  net: number;
};

/**
 * الخلاصة على كل القنوات.
 *
 * **المجموع يُحسب على الأصل لا كمتوسّطٍ للمتوسّطات** — كما في الجودة تمامًا:
 * قناةٌ بليدٍ واحد لا تساوي قناةً بمئة في وزن المتوسّط.
 */
export function acquisitionSummary(rows: ChannelInput[]): AcquisitionSummary {
  const spend = sum(rows.map((r) => r.spend));
  const revenue = sum(rows.map((r) => r.revenue));
  const leads = rows.reduce((s, r) => s + r.leads, 0);
  const won = rows.reduce((s, r) => s + r.won, 0);

  return {
    rows: rows.map(channelMetrics).sort((a, b) => b.spend - a.spend || b.leads - a.leads),
    spend,
    leads,
    won,
    revenue,
    costPerLead: leads > 0 ? money(spend / leads) : null,
    costPerWon: won > 0 ? money(spend / won) : null,
    roas: spend > 0 ? ratio(revenue, spend) : null,
    net: money(revenue - spend),
  };
}
