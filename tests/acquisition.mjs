/**
 * اختبار تكلفة اكتساب العميل.
 *
 * **المصروف التسويقي مُدخَلٌ مرة واحدة: في الدفتر.** وهذه الاختبارات تحرس
 * المعادلات التي يُبنى عليها قرارُ أين يوضع المال الإعلاني.
 *
 * التشغيل:  npm run test:acquisition
 */
import {
  ACCOUNT_CHANNEL,
  UNATTRIBUTED,
  UNATTRIBUTED_LABEL,
  adChannelOfMemo,
  channelOfAccount,
  channelMetrics,
  acquisitionSummary,
} from '../src/lib/acquisition.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}

console.log('\n── ١ · ربط الحساب بالقناة ───────────────────────────\n');

check(channelOfAccount('exp_ads_facebook') === 'meta_ads', 'حساب فيسبوك يُنسب إلى Meta');
check(channelOfAccount('exp_ads_google') === 'google_ads', 'وجوجل إلى Google Ads');
check(
  channelOfAccount('exp_rent') === UNATTRIBUTED,
  '★ **وما لا رمز له لا يُنسب لقناة** — النسبة الخاطئة أسوأ من عدم النسبة'
);
check(channelOfAccount(null) === UNATTRIBUTED, 'وحسابٌ بلا رمز كذلك');
check(
  Object.values(ACCOUNT_CHANNEL).every((c) => typeof c === 'string' && c.length > 0),
  'وكل ربط يشير إلى قناة'
);

console.log('\n── ٢ · مؤشرات القناة ────────────────────────────────\n');

const meta = channelMetrics({
  channel: 'meta_ads',
  label: 'Meta',
  spend: 10_000,
  leads: 200,
  won: 40,
  revenue: 60_000,
});

check(meta.costPerLead === 50, `تكلفة الليد ٥٠ ج — جاءت ${meta.costPerLead}`);
check(meta.costPerWon === 250, `وتكلفة العميل المكتسب ٢٥٠ ج — جاءت ${meta.costPerWon}`);
check(meta.conversionPct === 20, 'ونسبة التحويل ٢٠٪');
check(meta.roas === 6, '★ وعائد الإنفاق ٦ أضعاف — كل جنيه إعلان عاد بستة');
check(meta.net === 50_000, 'والربح بعد الإعلان ٥٠٬٠٠٠');

const spent = channelMetrics({
  channel: 'x',
  label: 'x',
  spend: 5_000,
  leads: 0,
  won: 0,
  revenue: 0,
});
check(
  spent.costPerLead === null && spent.costPerWon === null,
  '★ **وقناةٌ أنفقت ولم تأتِ بليد: «غير مقيس» لا صفر** — والصفر يعني «مجّانًا»'
);
check(spent.roas === 0, 'وعائدها صفر — وهو قياسٌ لا غياب: أنفقت ولم تُعِد شيئًا');
check(spent.net === -5_000, 'وخسارتها تظهر سالبة');

const free = channelMetrics({
  channel: 'organic',
  label: 'Organic',
  spend: 0,
  leads: 50,
  won: 10,
  revenue: 20_000,
});
/**
 * ★ **انقلب هذا الاختبار إلى ضدّه — ومعه سببُه.**
 *
 * كان يؤكّد أن قناةً بلا إنفاق تكلفةُ ليدها **صفر**، بحجّة أنه «قياسٌ صحيح».
 * وهو خطأ: الصفر يقول «جاءنا هذا الليد مجانًا»، والحقيقة في دفتر ٢٠٢٦ أن
 * الإنفاق موجودٌ (٩٠٩ آلاف) وغيرُ منسوبٍ للقناة بعد. ومن يقرأ «تكلفة الليد
 * صفر» يزيد الإنفاق على القناة — قرارٌ يُبنى على رقمٍ كاذب.
 */
check(
  free.costPerLead === null,
  '★ **وقناةٌ بلا إنفاقٍ منسوب: «غير مقيس» لا صفر** — الصفر يقول «جاءنا مجانًا»'
);
check(
  free.roas === null,
  '★ **وبلا إنفاق لا عائد إنفاق** — لا عائدٌ لا نهائي'
);

console.log('\n── ٣ · الخلاصة ──────────────────────────────────────\n');

const summary = acquisitionSummary([
  { channel: 'a', label: 'أ', spend: 1_000, leads: 1, won: 1, revenue: 2_000 },
  { channel: 'b', label: 'ب', spend: 9_000, leads: 299, won: 39, revenue: 58_000 },
]);

check(summary.spend === 10_000 && summary.leads === 300, 'المجموع يجمع الإنفاق والليدز');
check(
  summary.costPerLead === 33.33,
  `★ **والمتوسّط على الأصل لا متوسّطُ المتوسّطات** — ٣٣٫٣٣ لا ٥٠٥ (${summary.costPerLead})`
);
check(summary.costPerWon === 250, 'وتكلفة العميل المكتسب ٢٥٠');
check(summary.roas === 6, 'وعائد الإنفاق الإجمالي ٦');
check(summary.rows[0].channel === 'b', 'والصفوف مرتَّبة بالأكثر إنفاقًا');
check(summary.net === 50_000, 'والصافي بعد كل الإعلان');

const empty = acquisitionSummary([]);
check(
  empty.costPerLead === null && empty.roas === null && empty.spend === 0,
  'وبلا قنوات لا رقم يُخترع'
);

console.log('\n── ٤ · القناة من الحساب ومن البيان ──────────────────\n');

/**
 * ★ **الحقل المضبوط من الشاشة يعلو على الرمز المزروع.**
 *
 * كان الربط بالرمز وحده، وحسابات المحاسب المرحَّلة من دفاتره **بلا رموز** —
 * فوقع إنفاق المكتب كلُّه (٩٠٩ آلاف في ٢٠٢٦) في «غير منسوب» ولم تظهر
 * تكلفةُ عميلٍ واحد.
 */
check(
  channelOfAccount(null, 'google_ads') === 'google_ads',
  '★ **حسابٌ بلا رمز تُقرأ قناتُه من حقله** — وهذا حال كل حساب مرحَّل'
);
check(
  channelOfAccount('exp_ads_google', 'meta_ads') === 'meta_ads',
  'والحقل يعلو على الرمز حين يختلفان — الأحدث قصدُ من ضبطه'
);
check(channelOfAccount('exp_ads_google', null) === 'google_ads', 'والرمز يعمل بلا حقل');
check(channelOfAccount(null, null) === UNATTRIBUTED, 'وبلا هذا ولا ذاك: غير منسوب — ولا يُخمَّن');

/**
 * ★ **وقناةُ السطر من بيانه حين يجمع الحسابُ قناتين.**
 *
 * دفتر ٢٠٢٦ يضع جوجل وفيسبوك في `Paid Advertising via Platforms Expenses`
 * والتمييز في البيان وحده. وليست تخمينًا: المحاسب كتب اسم المنصّة صريحًا.
 */
check(
  adChannelOfMemo('Payment of Selling and Marketing Expenses | Paid Advertising via Platforms Expenses - Google Ads') === 'google_ads',
  '★ بيانٌ إنجليزيّ يذكر Google Ads'
);
check(
  adChannelOfMemo('سداد مصروفات بيعية وتسويقية | م. إشتركات في مجلات وإعلانات - جوجل') === 'google_ads',
  'وبالعربية «جوجل»'
);
check(
  adChannelOfMemo('سداد مصروفات بيعية وتسويقية | م. إشتركات في مجلات وإعلانات - سوشيال ميديا (فيسبوك)') === 'meta_ads',
  'و«سوشيال ميديا (فيسبوك)» ميتا'
);
check(
  adChannelOfMemo('سداد مصروفات بيعية وتسويقية - م.خدمات تسويقية عن طريق الغير - كتابة محتوي لموقع فاست ترانس') === 'organic',
  'و«كتابة محتوي» سيو — وهي تكلفة الأورجانيك كما قالها أحمد'
);
check(
  adChannelOfMemo('Payment of Selling and Marketing Expenses | Outsourced Marketing Services Expenses – Content Writing') === 'organic',
  'و«Content Writing» كذلك'
);
check(adChannelOfMemo('سداد مصروف الكهرباء للمقر الإداري') === null, 'وبيانٌ لا يذكر منصّةً لا يُنسب');
check(adChannelOfMemo('') === null, 'والفراغ لا قناة له');

console.log('\n── ٥ · وعاء «غير منسوب» ─────────────────────────────\n');

/**
 * ★ **«غير منسوب» وعاءُ انتظارٍ لا قناة.**
 *
 * إنفاقُه لم يُنسب بعد، و«ليدزه» ليدزٌ لم تُسجَّل قناتُها — ولا علاقة بين
 * الطرفين. وقسمةُ ٦٣٢ ألفًا على ليدٍ واحد تُنتج «تكلفة الليد ٦٣٢ ألفًا»،
 * وهو رقمٌ يُقرأ فيُصدَّق.
 */
const pending = channelMetrics({
  channel: UNATTRIBUTED,
  label: UNATTRIBUTED_LABEL,
  spend: 631_998,
  leads: 1,
  won: 0,
  revenue: 0,
});
check(
  pending.costPerLead === null && pending.costPerWon === null && pending.roas === null,
  '★ ولا يُقسَم إنفاقُه على ليدزه — لا رقم بلا معنى'
);
check(pending.spend === 631_998, 'ويبقى مبلغُه ظاهرًا ليُضبط — لا يُخفى');

/** ★ وبلا إنفاقٍ منسوب لا تكلفةَ ليد — لا صفر */
const noSpend = channelMetrics({
  channel: 'organic',
  label: 'Organic',
  spend: 0,
  leads: 533,
  won: 120,
  revenue: 90_000,
});
check(
  noSpend.costPerLead === null,
  '★ **وقناةٌ بليدز بلا إنفاقٍ منسوب: «غير مقيس» لا صفر**',
  'الصفر يقول «جاءنا مجانًا» فيُزاد الإنفاق على رقمٍ كاذب'
);
check(noSpend.conversionPct === 22.5, 'ونسبة تحويلها تبقى مقيسة — لا تحتاج إنفاقًا');


const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
