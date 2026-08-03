/**
 * اختبار قواعد الذكاء الاصطناعي — بلا مفتاح ولا إنترنت.
 *
 * أخطر ما هنا **الأرضية الآمنة عند قراءة رد النموذج**: ردّ النموذج ليس عقدًا،
 * وسطرٌ يفترض أنه سيلتزم بالصيغة يُسقط الرسالة من النظام أول مرة يخرج فيها
 * عنها. ويليه **الحجب**: رقم يغادر النظام لا يعود.
 *
 * التشغيل:  npm run test:ai
 */
import {
  AI_MODELS,
  DEFAULT_MODEL,
  runCost,
  redact,
  extractJson,
  parseAnalysis,
  cleanText,
  analysisPrompt,
  replyPrompt,
  assistantSystem,
  withinBudget,
  SYSTEM_RULES,
  MAX_OUTPUT_TOKENS,
} from '../src/lib/ai.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}
function eq(actual, expected, label) {
  check(
    actual === expected,
    label,
    `نتج ${JSON.stringify(actual)} والمتوقع ${JSON.stringify(expected)}`
  );
}
function near(actual, expected, label, tol = 1e-9) {
  check(Math.abs(actual - expected) < tol, label, `نتج ${actual} والمتوقع ${expected}`);
}

console.log('\n── التكلفة ───────────────────────────────────────────');

check(DEFAULT_MODEL in AI_MODELS, 'النموذج الافتراضي من القائمة المعتمدة');
near(runCost('claude-sonnet-4-5', 1e6, 0), 3, 'مليون رمز دخل بثلاثة دولارات');
near(runCost('claude-sonnet-4-5', 0, 1e6), 15, 'ومليون رمز خرج بخمسة عشر');
near(runCost('claude-sonnet-4-5', 500_000, 100_000), 3, 'والمجموع يُحسب من الطرفين');
eq(runCost('نموذج-غير-معروف', 1e6, 1e6), 0, 'ونموذج مجهول لا يُخترع له سعر');
eq(runCost('claude-sonnet-4-5', 0, 0), 0, 'ونداء بلا رموز بلا تكلفة');

check(withinBudget(2, 5), 'الإنفاق دون الحد يمرّ');
check(!withinBudget(5, 5), 'وبلوغ الحد يوقف — لا يتجاوزه');
check(!withinBudget(9, 5), 'وما فوقه يوقف');
check(withinBudget(1000, 0), 'وصفرٌ يعني بلا حد');

console.log('\n── الحجب ─────────────────────────────────────────────');

check(!redact('اتصل على 01001234567').includes('01001234567'), 'الهاتف يُحجب');
check(redact('اتصل على 01001234567').includes('[رقم]'), 'ويُستبدل برمز يُبقي المعنى');
check(
  !redact('الآيبان SA0380000000608010167519 للتحويل').includes('SA0380000000608010167519'),
  'والآيبان يُحجب'
);
eq(redact('نحتاج ترجمة 20 صفحة'), 'نحتاج ترجمة 20 صفحة', 'والعدد الصغير يبقى — حجبه يُفقد المعنى');
eq(redact(''), '', 'والنص الفارغ لا يُسقط الدالة');

console.log('\n── قراءة JSON ────────────────────────────────────────');

eq(extractJson('{"a":1}').a, 1, 'الـJSON الصريح يُقرأ');
eq(extractJson('```json\n{"a":2}\n```').a, 2, 'والمُسيَّج بـ```json');
eq(extractJson('إليك التحليل:\n{"a":3}\nأتمنى أن يفيدك').a, 3, 'والمحفوف بكلام تمهيدي');
eq(extractJson('{"a":{"b":4}} وكلام بعده').a.b, 4, 'والمتداخل يُقرأ لآخر قوسه لا لأول قوس يمرّ');
eq(extractJson('{"a":"قوس } داخل نص"}').a, 'قوس } داخل نص', 'وقوسٌ داخل نصّ لا يُنهي الكائن');
eq(extractJson('لا يوجد كائن هنا'), null, 'وبلا كائن يُعاد فارغًا لا يُرمى استثناء');
eq(extractJson(''), null, 'والرد الفارغ كذلك');
eq(extractJson('{"a":'), null, 'والكائن المبتور كذلك');

console.log('\n── قراءة التحليل ─────────────────────────────────────');

const INTENTS = ['inquiry', 'quote_request', 'complaint', 'spam'];
const fallback = { intent: 'inquiry', urgency: 'normal', language: 'ar' };

const good = parseAnalysis(
  JSON.stringify({
    intent: 'quote_request',
    urgency: 'high',
    sentiment: 'neutral',
    language: 'ar',
    summary: 'يطلب تسعير عشرين صفحة',
    needsHuman: true,
    suggestedReply: 'شكرًا لتواصلكم…',
  }),
  fallback,
  INTENTS
);
eq(good.intent, 'quote_request', 'النية تُقرأ');
eq(good.urgency, 'high', 'والإلحاحية');
eq(good.suggestedReply, 'شكرًا لتواصلكم…', 'ومسوّدة الرد');

const invented = parseAnalysis(
  JSON.stringify({ intent: 'نية_اخترعها_النموذج', urgency: 'عاجل جدًا', summary: 'ملخص' }),
  fallback,
  INTENTS
);
eq(invented.intent, 'inquiry', 'ونيةٌ خارج القائمة تُردّ للتخمين النصّي لا تُخزَّن كما هي');
eq(invented.urgency, 'normal', 'وكذلك إلحاحية غير معتمدة');

const empty = parseAnalysis('رد لا يحمل JSON أصلًا', fallback, INTENTS);
eq(empty.intent, 'inquiry', 'وردٌّ بلا JSON يسقط للأرضية بلا استثناء');
check(empty.summary.length > 0, 'ويبقى للرسالة ملخّص ولو كان اعتذارًا');
eq(empty.suggestedReply, null, 'وبلا مسوّدة رد يبقى الحقل فارغًا لا نصًّا مخترعًا');

const noFlag = parseAnalysis(JSON.stringify({ summary: 'ملخص' }), fallback, INTENTS);
check(
  noFlag.needsHuman === true,
  'وغياب needsHuman يعني **نعم** — الافتراض الآمن أن يقرأها إنسان'
);
eq(
  parseAnalysis(JSON.stringify({ needsHuman: false, summary: 'x' }), fallback, INTENTS).needsHuman,
  false,
  'ونفيها الصريح وحده يُسقط الحاجة'
);

console.log('\n── تنظيف النص ────────────────────────────────────────');

eq(cleanText('```\nنص الرد\n```'), 'نص الرد', 'السياج يُنزع');
eq(cleanText('  نص الرد  '), 'نص الرد', 'والمسافات تُقلَّم');
eq(cleanText('سطر\n\n\n\nسطر'), 'سطر\n\nسطر', 'والفراغات المتراكمة تُوحَّد');
eq(cleanText(''), '', 'والفارغ يبقى فارغًا');

console.log('\n── الأوامر ───────────────────────────────────────────');

const prompt = analysisPrompt({
  subject: 'طلب عرض',
  from: 'a@x.com',
  body: 'رقمي 01001234567 وأحتاج تسعير',
  intents: INTENTS,
});
check(!prompt.includes('01001234567'), 'أمر التحليل لا يحمل هاتف العميل خارج النظام');
check(prompt.includes('quote_request'), 'ويحصر النية في قائمة معتمدة');
check(prompt.includes('JSON'), 'ويطلب صيغة تُقرأ آليًّا');

const reply = replyPrompt({
  subject: 'طلب عرض',
  from: 'a@x.com',
  body: 'كم السعر؟',
  tone: 'formal',
  instruction: 'اذكر أننا نحتاج الملف',
  context: 'العميل مسجَّل لدينا',
});
check(reply.includes('اذكر أننا نحتاج الملف'), 'وتوجيه الموظف يصل النموذج');
check(reply.includes('العميل مسجَّل لدينا'), 'وسياق النظام كذلك');
check(reply.includes('بلا عنوان'), 'ويُمنع من كتابة عنوان أو توقيع — التوقيع يُضاف آليًّا');

check(SYSTEM_RULES.includes('لا تخترع سعرًا'), 'وقاعدة «لا تخترع سعرًا» منصوصة لا متروكة للفهم');
check(SYSTEM_RULES.includes('لا تَعِد'), 'وكذلك «لا تَعِد نيابة عن المكتب» — الوعد في بريد صادر التزام');

const system = assistantSystem({
  userName: 'أحمد',
  roleLabel: 'مدير مشاريع',
  permissions: ['إسناد الإنتاج'],
  today: '2026-08-03',
});
check(system.includes('مدير مشاريع'), 'وسياق المساعد يحمل دور السائل');
check(system.includes('إسناد الإنتاج'), 'وصلاحياته — فلا يجيب عمّا حُجب عنه');
check(system.includes('غير متاح'), 'ويُلزَم بقول «غير متاح» بدل التخمين');

check(MAX_OUTPUT_TOKENS.analyze > 0 && MAX_OUTPUT_TOKENS.assistant > 0, 'ولكل غرض سقف رموز — لا توليد مفتوح');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
