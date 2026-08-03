/**
 * اختبار تصميم العرض بالذكاء الاصطناعي — وأهمّه **التعقيم**.
 *
 * نحن نعرض HTML كتبه نموذج داخل شاشة موظف مسجَّل الدخول. سطرُ سكربت واحد
 * يمرّ يعني تنفيذ كود في جلسته بصلاحياته. فكل حالة هنا هجوم محتمَل، لا
 * حالة تنسيق.
 *
 * التشغيل:  npm run test:quote-design
 */
import {
  normalizeUrl,
  extractColors,
  extractTitle,
  extractDescription,
  pageText,
  briefFromHtml,
  briefToText,
  sanitizeHtml,
  looksLikeDocument,
  designSystemPrompt,
  designUserPrompt,
  methodologyBlock,
  PROMPT_PRESETS,
  FAST_TRANS_BRAND,
} from '../src/lib/quote-design.ts';

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
/** لا يُقبل أن يبقى النص في المخرَج */
function gone(html, needle, label) {
  const out = sanitizeHtml(html);
  check(!out.includes(needle), label, `بقي «${needle}» في: ${out.slice(0, 120)}`);
}

console.log('\n── الروابط ───────────────────────────────────────────');

eq(normalizeUrl('fasttrans.net'), 'https://fasttrans.net/', 'النطاق بلا بروتوكول يُكمَّل بـhttps');
eq(normalizeUrl('https://a.com/x'), 'https://a.com/x', 'والرابط الكامل يمرّ');
eq(normalizeUrl('http://a.com/'), 'http://a.com/', 'وhttp مقبول');
eq(normalizeUrl('javascript:alert(1)'), null, '**وjavascript: مرفوض** — لا يُجلب من الخادم');
eq(normalizeUrl('file:///etc/passwd'), null, 'وfile: مرفوض');
eq(normalizeUrl('localhost'), null, 'وما لا نقطة فيه ليس نطاقًا');
eq(normalizeUrl(''), null, 'والفارغ');
eq(normalizeUrl(null), null, 'والمعدوم');

console.log('\n── قراءة الصفحة ──────────────────────────────────────');

const page = `<!DOCTYPE html><html><head>
<title>شركة ترايستار للمقاولات</title>
<meta name="description" content="مقاولات عامة في السعودية">
<style>.a{color:#1a3d7c}.b{background:#1a3d7c}.c{border:1px solid #b9d716}</style>
</head><body><h1>من نحن</h1><p>نعمل منذ 1998</p>
<script>alert('x')</script></body></html>`;

eq(extractTitle(page), 'شركة ترايستار للمقاولات', 'العنوان يُقرأ');
eq(extractDescription(page), 'مقاولات عامة في السعودية', 'والوصف');
eq(extractColors(page)[0], '#1a3d7c', 'واللون الأكثر تكرارًا أولًا');
check(!extractColors('#ffffff #ffffff #000000').length, 'والأبيض والأسود ليسا هوية — يظهران في كل موقع');
eq(extractColors('#abc')[0], '#aabbcc', 'والصيغة الثلاثية تُمدّ');

const text = pageText(page);
check(text.includes('من نحن'), 'ونصّ الصفحة يُستخرج');
check(!text.includes('alert'), '**والسكربت لا يدخل النصّ المقروء**');
check(!text.includes('color'), 'ولا الأنماط');

const brief = briefFromHtml('https://a.com', page);
const briefText = briefToText(brief);
check(briefText.includes('ترايستار'), 'والموجز يحمل اسم الشركة');
check(briefText.includes('#1a3d7c'), 'وألوان هويتها');

console.log('\n── التعقيم: التنفيذ ──────────────────────────────────');

gone('<div>نص</div><script>steal()</script>', 'steal', 'السكربت يُحذف بمحتواه');
gone('<script src="https://evil.com/x.js"></script><p>ب</p>', 'evil.com', 'والسكربت الخارجي');
gone('<div onclick="steal()">اضغط</div>', 'onclick', 'ومعالج الحدث بعلامتَي تنصيص');
gone("<div onmouseover='steal()'>مرّر</div>", 'onmouseover', 'وبعلامة واحدة');
gone('<div onerror=steal()>x</div>', 'onerror', 'وبلا علامات أصلًا');
gone('<img src=x onerror="steal()">', 'onerror', 'وعلى الصورة');
gone('<iframe src="https://evil.com"></iframe><p>ب</p>', 'iframe', 'والإطار المضمَّن');
gone('<object data="x.swf"></object><p>ب</p>', 'object', 'والكائن');
gone('<embed src="x">', 'embed', 'والمضمَّن');
gone('<form action="https://evil.com"><input name="a"></form>', 'form', 'والنموذج — لا يُسرَّب منه شيء');

console.log('\n── التعقيم: الروابط ──────────────────────────────────');

gone('<a href="javascript:steal()">اضغط</a>', 'javascript:', 'رابط javascript: يُنزع');
gone('<a href="data:text/html,<script>x</script>">اضغط</a>', 'data:text/html', 'وdata:text/html');
gone('<a href="//evil.com/x">اضغط</a>', '//evil.com', 'والرابط بلا بروتوكول');
check(
  sanitizeHtml('<a href="https://ok.com">حسن</a>').includes('https://ok.com'),
  'ورابط https يبقى'
);
check(sanitizeHtml('<a href="#s1">قسم</a>').includes('#s1'), 'والمرساة الداخلية');
check(
  sanitizeHtml('<a href="mailto:a@b.com">راسلنا</a>').includes('mailto:'),
  'والبريد'
);
check(
  sanitizeHtml('<img src="data:image/png;base64,iVBOR">').includes('data:image/png'),
  'والصورة المضمَّنة base64 تبقى'
);

console.log('\n── التعقيم: الأنماط ──────────────────────────────────');

gone('<style>@import url(https://evil.com/x.css);p{color:red}</style>', '@import', 'الاستيراد الخارجي');
gone(
  '<style>body{background:url(https://evil.com/track.png)}</style>',
  'evil.com',
  'وجلب صورة تتبُّع من نمط'
);
gone('<style>width:expression(steal())</style>', 'expression(', 'وexpression القديمة');
check(
  sanitizeHtml('<style>p{color:#242e5b}</style>').includes('#242e5b'),
  'والنمط النظيف يبقى كما هو'
);

console.log('\n── التعقيم: السلامة العامة ───────────────────────────');

const fenced = sanitizeHtml('```html\n<div>مستند</div>\n```');
eq(fenced, '<div>مستند</div>', 'السياج ```html يُنزع');
eq(sanitizeHtml(''), '', 'والفارغ يبقى فارغًا');
eq(sanitizeHtml(null), '', 'والمعدوم لا يُسقط الدالة');
check(
  sanitizeHtml('<h1>عرض سعر</h1><p>مرحبًا</p>').includes('<h1>عرض سعر</h1>'),
  'والمحتوى السليم لا يُمسّ'
);
check(sanitizeHtml('<table><tr><td>١٠٠</td></tr></table>').includes('<td>'), 'والجداول تبقى');

console.log('\n── فحص المستند ───────────────────────────────────────');

check(!looksLikeDocument('<div>قصير</div>'), 'ردٌّ قصير ليس مستندًا');
check(!looksLikeDocument('اعتذر، لا أستطيع'), 'واعتذارُ النموذج ليس مستندًا');
check(
  looksLikeDocument('<html><body>' + 'محتوى '.repeat(60) + '</body></html>'),
  'والمستند الكامل يُقبل'
);
check(!looksLikeDocument(''), 'والفارغ يُرفض');

console.log('\n── الأوامر ───────────────────────────────────────────');

const system = designSystemPrompt();
check(system.includes(FAST_TRANS_BRAND.navy), 'أمر النظام يحمل كحلي الهوية');
check(system.includes(FAST_TRANS_BRAND.lime), 'وليمونيّها');
check(system.includes('لا تستعمل <script>'), 'ويمنع السكربت صراحةً');
check(system.includes('dir="rtl"'), 'ويلزم بالاتجاه العربي');
check(system.includes('A4'), 'ويصمّم للطباعة');
check(
  system.includes('لا تغيّر رقمًا واحدًا'),
  '**ويمنع تغيير الأرقام** — التصميم ينقل السعر ولا يخترعه'
);

const prompt = designUserPrompt({
  number: 'QT-2026-0001',
  title: 'ترجمة عقود',
  currency: 'SAR',
  clientName: 'ترايستار',
  contactName: null,
  validUntil: '2026-09-01',
  items: [
    {
      description: 'ترجمة قانونية',
      serviceType: 'legal',
      sourceLang: 'العربية',
      targetLang: 'الإنجليزية',
      unit: 'صفحة (٢٥٠ كلمة)',
      quantity: 400,
      unitPrice: 20,
      lineTotal: 8000,
    },
  ],
  subtotal: 8000,
  discount: 800,
  discountLabel: '10%',
  taxRate: 15,
  taxAmount: 1080,
  total: 8280,
  terms: 'شروطنا',
  notes: null,
  ownerName: 'أحمد',
  ownerEmail: 'a@b.com',
  brief: 'شركة مقاولات',
  instruction: 'نبرة رسمية',
});
check(prompt.includes('QT-2026-0001'), 'أمر المستخدم يحمل رقم العرض');
check(prompt.includes('ترايستار'), 'واسم الجهة');
check(prompt.includes('8,280.00 SAR'), 'والإجمالي بعملته');
check(prompt.includes('10%'), 'ونسبة الخصم حين يكون نسبيًا');
check(prompt.includes('نبرة رسمية'), 'وتوجيه الموظف');
check(prompt.includes('شركة مقاولات'), 'وموجز موقع العميل');
check(prompt.includes('آلية التشغيل'), '**وآلية التشغيل في فاست ترانس تُحقن في كل عرض**');

const method = methodologyBlock();
check(method.includes('دورة حياة الطلب'), 'وآلية التشغيل تشمل دورة حياة الطلب');
check(method.includes('ما يشمله السعر'), 'ونطاق السعر');

check(PROMPT_PRESETS.length >= 4, 'وأربع نقاط بدء على الأقل للموظف');
check(
  PROMPT_PRESETS.every((p) => p.prompt.length > 50),
  'وكلٌّ منها مكتوبة لا عنوانًا فارغًا'
);

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
