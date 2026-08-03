/**
 * اختبار قواعد البريد — بلا خادم بريد ولا شبكة.
 *
 * أخطر ما هنا **نزع الاقتباس**: التحليل على النصّ الكامل يجعل النموذج يلخّص
 * رسالة الشهر الماضي بدل رسالة اليوم، وهو خطأ صامت لا يُكتشف إلا بعد أن
 * يُرسل موظف ردًّا على سؤال لم يُطرح.
 *
 * التشغيل:  npm run test:email
 */
import {
  normalizeSubject,
  normalizeAddress,
  parseAddress,
  parseAddressList,
  isValidAddress,
  addressDomain,
  isCorporateDomain,
  threadKey,
  counterpartyOf,
  stripQuoted,
  htmlToText,
  guessLanguage,
  guessIntent,
  guessUrgency,
  extractPhones,
  replySubject,
  buildReferences,
  withSignature,
  quoteForReply,
  canSeeMailbox,
  needsHandling,
  hoursWaiting,
  truncateForAnalysis,
  EMAIL_INTENT_KEYS,
} from '../src/lib/email.ts';

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
function deep(actual, expected, label) {
  check(
    JSON.stringify(actual) === JSON.stringify(expected),
    label,
    `نتج ${JSON.stringify(actual)} والمتوقع ${JSON.stringify(expected)}`
  );
}

console.log('\n── الموضوع ───────────────────────────────────────────');

eq(normalizeSubject('Re: عرض سعر'), 'عرض سعر', 'Re: تُنزع');
eq(normalizeSubject('RE: FW: Re: عرض سعر'), 'عرض سعر', 'وسلسلة البادئات كاملة');
eq(normalizeSubject('رد: عرض سعر'), 'عرض سعر', 'والبادئة العربية «رد:»');
eq(normalizeSubject('Re[2]: عرض'), 'عرض', 'والصيغة المرقّمة Re[2]');
eq(normalizeSubject('  عرض   سعر  '), 'عرض سعر', 'والمسافات تُوحَّد');
eq(normalizeSubject('Reminder: عرض'), 'Reminder: عرض', 'و«Reminder» ليست «Re» — لا تُبتر');
eq(replySubject('Re: Re: طلب'), 'Re: طلب', 'والرد يحمل Re واحدة مهما تراكمت');

console.log('\n── العناوين ──────────────────────────────────────────');

eq(normalizeAddress('  AHMED@Fast-Trans.NET '), 'ahmed@fast-trans.net', 'العنوان يُصغَّر ويُقلَّم');
eq(normalizeAddress('أحمد <A@B.com>'), 'a@b.com', 'ويُنتزع من الأقواس');
deep(parseAddress('"مجموعة ترايستار" <sales@tristar.sa>'), { name: 'مجموعة ترايستار', address: 'sales@tristar.sa' }, 'الاسم والعنوان يُفصلان');
deep(parseAddress('sales@tristar.sa'), { name: null, address: 'sales@tristar.sa' }, 'وبلا اسم يبقى الاسم فارغًا');
deep(
  parseAddressList('a@x.com, "شركة، وشركاه" <b@y.com>, a@x.com'),
  ['a@x.com', 'b@y.com'],
  'والقائمة لا تنقسم على فاصلة داخل اسم مقتبس، ولا تكرّر عنوانًا'
);
deep(parseAddressList(null), [], 'وقائمة فارغة لا تُسقط الدالة');
check(isValidAddress('a@b.co'), 'العنوان الصحيح يُقبل');
check(!isValidAddress('a@b'), 'وبلا نطاق أعلى يُرفض');
check(!isValidAddress('لا يوجد'), 'والنص العادي يُرفض');
eq(addressDomain('ahmed@tristar.sa'), 'tristar.sa', 'النطاق يُستخرج');
check(isCorporateDomain('tristar.sa'), 'ونطاق الشركة يُعدّ شركة');
check(!isCorporateDomain('gmail.com'), 'ونطاق جيميل لا يُعدّ شركة — وإلا صار كل عملاء جيميل شركة واحدة');
check(!isCorporateDomain(null), 'والنطاق المفقود لا يُعدّ شركة');

console.log('\n── الخيط ─────────────────────────────────────────────');

eq(
  threadKey('Re: عرض سعر', 'A@B.com'),
  threadKey('عرض سعر', 'a@b.com'),
  'الرد والأصل في خيط واحد رغم اختلاف الحروف والبادئة'
);
check(
  threadKey('عرض سعر', 'a@b.com') !== threadKey('عرض سعر', 'c@d.com'),
  'وموضوعان متطابقان من جهتين مختلفتين خيطان لا خيط'
);
eq(
  counterpartyOf({ direction: 'in', fromAddress: 'X@Y.com', toAddresses: ['us@ft.sa'] }),
  'x@y.com',
  'الطرف الآخر في الوارد هو المرسِل'
);
eq(
  counterpartyOf({ direction: 'out', fromAddress: 'us@ft.sa', toAddresses: ['x@y.com'] }),
  'x@y.com',
  'وفي الصادر هو المستقبِل'
);

console.log('\n── نزع الاقتباس والتوقيع ─────────────────────────────');

const englishThread = `Thanks, that works for us.

On Mon, 3 Aug 2026 at 10:00, Fast Trans <info@ft.sa> wrote:
> Dear client,
> Please find attached our quotation.`;
eq(stripQuoted(englishThread), 'Thanks, that works for us.', 'الاقتباس الإنجليزي يُنزع كاملًا');

const arabicThread = `شكرًا، نعتمد العرض.

في 3 أغسطس 2026، كتب فاست ترانس:
> نرفق لكم عرض السعر`;
eq(stripQuoted(arabicThread), 'شكرًا، نعتمد العرض.', 'والاقتباس العربي كذلك');

const forwarded = `نرجو التسعير.

---- Original Message ----
From: someone@x.com
كلام قديم`;
eq(stripQuoted(forwarded), 'نرجو التسعير.', 'وفاصل إعادة التوجيه');

const withSig = `نرجو موافاتنا بالعرض في أقرب وقت ممكن، مع خالص الشكر لتعاونكم الدائم معنا.

مع تحيات
أحمد محسن
مدير المشتريات`;
check(
  !stripQuoted(withSig).includes('مدير المشتريات'),
  'والتوقيع العربي يُنزع'
);
check(stripQuoted(withSig).startsWith('نرجو موافاتنا'), 'ويبقى نصّ الطلب');

eq(
  stripQuoted('تحياتي، نحتاج ترجمة عشرين صفحة قبل الخميس إن أمكن ذلك.'),
  'تحياتي، نحتاج ترجمة عشرين صفحة قبل الخميس إن أمكن ذلك.',
  '«تحياتي» في أول الرسالة تحيّةٌ لا توقيع — لا تُبتر الرسالة كلها'
);
eq(stripQuoted(''), '', 'والنص الفارغ لا يُسقط الدالة');

console.log('\n── HTML ──────────────────────────────────────────────');

eq(
  htmlToText('<p>مرحبًا</p><p>نحتاج <b>عرض سعر</b></p>'),
  'مرحبًا\nنحتاج عرض سعر',
  'الوسوم تُنزع والفقرات تصير أسطرًا'
);
eq(htmlToText('<style>p{color:red}</style><p>نص</p>'), 'نص', 'والأنماط لا تظهر في النص');
eq(htmlToText('a &amp; b &lt;c&gt;'), 'a & b <c>', 'والرموز المُرمَّزة تُفكّ');

console.log('\n── اللغة والنية ──────────────────────────────────────');

eq(guessLanguage('نحتاج ترجمة معتمدة'), 'ar', 'العربية تُعرف');
eq(guessLanguage('We need a certified translation'), 'en', 'والإنجليزية');
eq(guessLanguage('نحتاج certified translation للعقد المرفق hereby attached'), 'mixed', 'والمختلطة');
eq(guessLanguage(''), 'ar', 'والفارغ يُعامل عربيًا — لغة المكتب');

eq(guessIntent('طلب عرض سعر', 'كم تكلفة ترجمة ٢٠ صفحة؟'), 'quote_request', 'طلب التسعير');
eq(guessIntent('Quotation request', 'Please send your pricing'), 'quote_request', 'وبالإنجليزية');
eq(guessIntent('شكوى', 'يوجد خطأ في الترجمة المسلَّمة'), 'complaint', 'والشكوى');
eq(guessIntent('فاتورة', 'نرفق إشعار التحويل البنكي'), 'invoice', 'والفاتورة');
eq(guessIntent('طلب عمل', 'أرفق سيرتي الذاتية كمترجم حر'), 'vendor', 'وعرض الفريلانسر');
eq(guessIntent('متابعة', 'أين وصل الطلب؟'), 'followup', 'والمتابعة');
eq(guessIntent('استفسار', 'هل تقدمون ترجمة معتمدة؟'), 'inquiry', 'وما عداها استفسار');
check(EMAIL_INTENT_KEYS.includes(guessIntent('أي شيء', 'أي شيء')), 'والنية المُخمَّنة دائمًا من القائمة المعتمدة');

eq(guessUrgency('عاجل', 'نحتاجها اليوم'), 'high', 'العاجل يُرفع');
eq(guessUrgency('شكوى', 'تأخر التسليم'), 'high', 'والشكوى عاجلة بطبعها');
eq(guessUrgency('نشرة', 'unsubscribe here'), 'low', 'والدعاية غير عاجلة');
eq(guessUrgency('استفسار', 'كم السعر'), 'normal', 'وما عداها عادي');

console.log('\n── الهواتف ───────────────────────────────────────────');

deep(extractPhones('اتصل على 01001234567 أو +966501234567'), ['01001234567', '966501234567'], 'الأرقام تُستخرج مطبَّعة');
deep(extractPhones('المبلغ 1500 ريال'), [], 'والمبلغ القصير ليس هاتفًا');
deep(extractPhones('0100 123 4567'), ['01001234567'], 'والمسافات داخل الرقم تُزال');

console.log('\n── الرد ──────────────────────────────────────────────');

eq(buildReferences(null, '<a@x>'), '<a@x>', 'المرجع الأول');
eq(buildReferences('<a@x>', '<b@x>'), '<a@x> <b@x>', 'وتتراكم بالترتيب');
eq(buildReferences('<a@x>', '<a@x>'), '<a@x>', 'ولا تتكرّر');
eq(buildReferences(null, null), null, 'وبلا شيء تبقى فارغة');

eq(withSignature('نص الرد', 'فاست ترانس'), 'نص الرد\n\n--\nفاست ترانس', 'التوقيع يُذيَّل');
eq(withSignature('نص الرد', null), 'نص الرد', 'وبلا توقيع لا يُضاف شيء');
eq(
  withSignature('نص الرد\n\n--\nفاست ترانس', 'فاست ترانس'),
  'نص الرد\n\n--\nفاست ترانس',
  'ولا يتكرّر إن كان مكتوبًا سلفًا'
);

const quoted = quoteForReply({
  fromName: 'أحمد',
  fromAddress: 'a@x.com',
  sentAt: new Date('2026-08-03T09:30:00Z'),
  bodyText: 'سطر أول\nسطر ثانٍ',
});
check(quoted.includes('> سطر أول'), 'الاقتباس يسبق كل سطر بـ«>»');
check(quoted.includes('2026-08-03 09:30'), 'ويحمل تاريخ الأصل');
check(quoted.includes('أحمد <a@x.com>'), 'واسم المرسِل وعنوانه');

console.log('\n── الرؤية والمعالجة ──────────────────────────────────');

check(
  canSeeMailbox({ mailboxOwnerId: null, userId: 'u1', canViewAll: false }),
  'الصندوق المشترك يراه الجميع'
);
check(
  canSeeMailbox({ mailboxOwnerId: 'u1', userId: 'u1', canViewAll: false }),
  'والشخصي يراه صاحبه'
);
check(
  !canSeeMailbox({ mailboxOwnerId: 'u1', userId: 'u2', canViewAll: false }),
  'ولا يراه زميله'
);
check(
  canSeeMailbox({ mailboxOwnerId: 'u1', userId: 'u2', canViewAll: true }),
  'ويراه من يملك رؤية كل السجلات'
);

check(needsHandling({ direction: 'in', handledAt: null, intent: 'inquiry' }), 'الوارد غير المعالَج ينتظر');
check(!needsHandling({ direction: 'out', handledAt: null, intent: 'inquiry' }), 'والصادر لا ينتظر ردًّا منّا');
check(!needsHandling({ direction: 'in', handledAt: new Date(), intent: 'inquiry' }), 'والمعالَج لا يُعاد');
check(!needsHandling({ direction: 'in', handledAt: null, intent: 'spam' }), 'والدعاية لا تُحسب متأخرة');

eq(hoursWaiting(new Date('2026-08-03T08:00:00Z'), new Date('2026-08-03T14:00:00Z')), 6, 'ست ساعات انتظار');
eq(hoursWaiting(new Date('2026-08-03T14:00:00Z'), new Date('2026-08-03T08:00:00Z')), 0, 'ولا انتظار سالب');

console.log('\n── حدود التحليل ──────────────────────────────────────');

eq(truncateForAnalysis('نص قصير', 100), 'نص قصير', 'القصير يمرّ كما هو');
const long = truncateForAnalysis('ا'.repeat(500), 100);
check(long.length < 200, 'والطويل يُقتطع');
check(long.includes('اقتُطع'), 'ويُعلَم بأنه اقتُطع — فلا يُظنّ أن العميل بتر كلامه');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
