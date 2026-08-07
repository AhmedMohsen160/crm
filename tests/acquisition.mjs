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
check(free.costPerLead === 0, 'وقناةٌ بلا إنفاق تكلفة ليدها صفر — وهو صحيح لا مخترع');
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

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
