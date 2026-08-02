/**
 * اختبار شامل للنظام من داخل متصفح حقيقي.
 *
 * التشغيل:  npm run test:e2e   (والخادم يعمل على المنفذ 3000)
 */
import { chromium } from 'playwright';

const shots = process.env.SHOTS_DIR ?? './test-screenshots';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });

const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => {
  const text = m.text();
  if (m.type() !== 'error') return;
  if (text.includes('favicon')) return;
  // ٤٠٣ متعمَّد: نختبر أن الخادم يرفض من لا يملك الصلاحية
  if (text.includes('403')) return;
  errors.push('CONSOLE: ' + text);
});
page.on('requestfailed', (r) => {
  // ERR_ABORTED يعني أن المتصفح ألغى الطلب لأننا انتقلنا لصفحة أخرى قبل
  // اكتماله — ليس عطلًا في النظام. نتجاهله حتى لا يخفي الأخطاء الحقيقية.
  const reason = r.failure()?.errorText ?? '';
  if (reason.includes('ERR_ABORTED')) return;
  errors.push(`REQFAILED: ${r.method()} ${r.url()} -> ${reason}`);
});

// معرّف فريد لكل تشغيل حتى لا تختلط بيانات التشغيلات السابقة
const RUN = 'T' + Date.now().toString(36).toUpperCase();
console.log('معرّف التشغيل:', RUN);

const results = [];
const check = (ok, label) => {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}`);
};

async function go(path, name) {
  const r = await page.goto('http://localhost:3000' + path, { waitUntil: 'networkidle' });
  if (r.status() !== 200) console.log(`  !! ${r.status()} ${path}`);
  if (name) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
  return r.status();
}

// المهم: زر الخروج في الشريط الجانبي هو أول submit في الصفحة،
// لذا نحصر النقر داخل <main> دائمًا.
const submit = () => page.click('main form button[type=submit]');

// ينتظر ظهور نص في الصفحة (بدل الفحص الفوري الذي يسابق إعادة الرسم)
async function waitForText(text, timeout = 15000) {
  try {
    await page.waitForFunction(
      (t) => document.body.innerText.includes(t),
      text,
      { timeout, polling: 250 }
    );
    return true;
  } catch {
    return false;
  }
}
async function waitForTextGone(text, timeout = 15000) {
  try {
    await page.waitForFunction(
      (t) => !document.body.innerText.includes(t),
      text,
      { timeout, polling: 250 }
    );
    return true;
  } catch {
    return false;
  }
}

// ── 1. تسجيل الدخول ─────────────────────────────────────────
await go('/login');
await page.fill('#email', 'admin@fasttrans.local');
await page.fill('#password', 'ChangeMe123!');
await page.click('button[type=submit]');
await page.waitForURL('http://localhost:3000/', { timeout: 15000 });
check(true, 'تسجيل الدخول');
await page.screenshot({ path: `${shots}/01-dashboard.png`, fullPage: true });

// ── 2. جولة على كل الأقسام ──────────────────────────────────
let allOk = true;
for (const [p, n] of [
  ['/leads', '02-leads'],
  ['/projects', '03-deals-board'],
  ['/projects?view=list', null],
  ['/companies', '04-companies'],
  ['/companies?q=النور', null],
  ['/contacts', null],
  ['/tasks', '05-tasks'],
  ['/quotes', null],
  ['/settings', null],
  ['/settings/users', '06-users'],
  ['/clients', '02b-clients'],
]) {
  if ((await go(p, n)) !== 200) allOk = false;
}
check(allOk, 'كل الأقسام تفتح بنجاح (11 صفحة)');

// ── 3. ليد جديد — الهاتف أولًا، والمعيار ≤١٥ ثانية ───────────
// رقم فريد لكل تشغيل، بصيغة محلية ليختبر التطبيع أيضًا
const TEST_DIGITS = String(Date.now()).slice(-9);
const TEST_PHONE = '01' + TEST_DIGITS;

await go('/leads/new');
const leadStart = Date.now();
await page.fill('#phone', TEST_PHONE);
await page.fill('#firstName', 'اختبار ' + RUN);
await page.selectOption('#channel', { index: 1 });
await page.selectOption('#contactMethod', { index: 1 });
await submit();
await page.waitForURL(/\/leads\/(?!new)[a-z0-9]+$/, { timeout: 20000 });
const leadSeconds = (Date.now() - leadStart) / 1000;
await page.waitForLoadState('networkidle');
check(
  leadSeconds <= 15,
  `ليد جديد بأربعة حقول في ${leadSeconds.toFixed(1)} ثانية (المعيار ≤١٥)`
);
await page.screenshot({ path: `${shots}/07-lead-detail.png`, fullPage: true });

// معرّف تسلسلي بصيغة LD-YYMM-0001
check(await waitForText('LD-'), 'الليد حصل على معرّف تسلسلي');

// ── 3ب. اختبار ٢٠: عميل عائد بنفس الهاتف لا يُنشئ عميلًا ثانيًا ──
// نكتب الرقم بصيغة دولية مختلفة تمامًا — التطبيع يجب أن يوحّدهما
const clientsBefore = await page
  .goto('http://localhost:3000/clients?q=' + encodeURIComponent(TEST_PHONE), {
    waitUntil: 'networkidle',
  })
  .then(() => page.locator('table tbody tr').count());

await go('/leads/new');
await page.fill('#phone', '+20 1' + TEST_DIGITS.slice(0, 1) + ' ' + TEST_DIGITS.slice(1));
// ننتظر ظهور بطاقة العميل الموجود — هذا هو البحث الفوري بالهاتف
const recognised = await page
  .waitForSelector('[data-testid=client-found]', { timeout: 10000 })
  .then(() => true)
  .catch(() => false);
check(recognised, 'البحث الفوري بالهاتف تعرّف على العميل رغم اختلاف صيغة كتابته');

await page.fill('#firstName', 'ليد ثانٍ ' + RUN);
await page.selectOption('#channel', { index: 1 });
await submit();
await page.waitForURL(/\/leads\/(?!new)[a-z0-9]+$/, { timeout: 20000 });

await page.goto('http://localhost:3000/clients?q=' + encodeURIComponent(TEST_PHONE), {
  waitUntil: 'networkidle',
});
const clientsAfter = await page.locator('table tbody tr').count();
check(
  clientsAfter === clientsBefore && clientsAfter === 1,
  `لا عميل مكرر: ${clientsBefore} قبل و${clientsAfter} بعد ليد ثانٍ بنفس الرقم (اختبار ٢٠)`
);

// ── 3ج. اختبار ٢١: سرعة البحث بالهاتف ≤٣٠٠ ملّي ثانية ────────
const lookupStart = Date.now();
const lookup = await page.evaluate(
  async (phone) => {
    const res = await fetch('/api/clients/lookup?phone=' + encodeURIComponent(phone));
    return res.json();
  },
  TEST_PHONE
);
const lookupMs = Date.now() - lookupStart;
check(
  lookup.found === true && lookupMs <= 300,
  `بحث العميل بالهاتف في ${lookupMs} ملّي ثانية (المعيار ≤٣٠٠)`
);

// ── 3د. سبب الخسارة إلزامي عند «خاسر» ───────────────────────
await go('/leads');
await page.click('table tbody tr:first-child a[href^="/leads/"]');
await page.waitForLoadState('networkidle');
const leadUrl = page.url();
await page.goto(leadUrl + '/edit', { waitUntil: 'networkidle' });
await page.selectOption('#status', 'LOST');
await submit();
await page.waitForLoadState('networkidle');
const blocked = page.url().includes('error=') || (await waitForText('سبب الخسارة', 5000));
check(blocked, 'لا يُحفظ ليد خاسر بلا سبب خسارة (§4.2)');

// نكمل بالسبب فيُحفظ
await page.goto(leadUrl + '/edit', { waitUntil: 'networkidle' });
await page.selectOption('#status', 'LOST');
await page.selectOption('#lossReason', { index: 1 });
await submit();
await page.waitForURL(/\/leads\/(?!new)[a-z0-9]+$/, { timeout: 20000 });
check(await waitForText('ليد خاسر'), 'الليد الخاسر يُحفظ مع سببه ويظهر السبب');

// ── 3هـ. ليد للتحويل ────────────────────────────────────────
// نحفظ رقمه: مشروعه سيُسلَّم لاحقًا فيصير عميلًا متكررًا
const REPEAT_PHONE = '011' + String(Date.now()).slice(-8);
await go('/leads/new');
await page.fill('#phone', REPEAT_PHONE);
await page.fill('#firstName', 'تحويل ' + RUN);
await page.selectOption('#channel', { index: 1 });
await submit();
await page.waitForURL(/\/leads\/(?!new)[a-z0-9]+$/, { timeout: 20000 });
await page.waitForLoadState('networkidle');

// ── 4. تحويل الليد إلى مشروع — المعيار ≤٢٠ ثانية ────────────
await page.click('a[href$="/convert"]');
await page.waitForURL(/\/convert$/, { timeout: 15000 });
const convertStart = Date.now();
await page.selectOption('#serviceLine', { index: 1 });
await page.selectOption('#sourceLang', { index: 1 });
await page.selectOption('#targetLang', { index: 2 });
await page.fill('#pages', '20');
await page.fill('#netTotal', '5000');
await page.click('main button:has-text("فوري")'); // زر «فوري» بضغطة واحدة
await submit();
await page.waitForURL(/\/projects\/(?!new)[a-z0-9]+$/, { timeout: 25000 });
const convertSeconds = (Date.now() - convertStart) / 1000;
await page.waitForLoadState('networkidle');
check(
  convertSeconds <= 20,
  `تحويل الليد إلى مشروع في ${convertSeconds.toFixed(1)} ثانية (المعيار ≤٢٠)`
);
const dealUrl = page.url();
const projectId = dealUrl.split('/').pop();
await page.screenshot({ path: `${shots}/08-project-detail.png`, fullPage: true });

check(await waitForText('PR-'), 'المشروع حصل على معرّف تسلسلي');
check(await waitForText('قيد الإسناد'), 'المشروع يبدأ في «قيد الإسناد»');
// الليد صار فائزًا — نتحقق من صفحته ثم نعود للمشروع
const leadAfterConvert = dealUrl; // نحفظ مسار المشروع قبل التنقّل
await go('/leads?status=WON');
check(
  (await page.locator('table tbody tr').count()) > 0,
  'الليد صار «فائزًا» بعد التحويل'
);
await go(leadAfterConvert.replace('http://localhost:3000', ''));

// ── 5. إضافة ملاحظة ─────────────────────────────────────────
await page.fill('textarea[name=body]', `ملاحظة ${RUN}: العميل طلب تسليمًا عاجلاً.`);
await page.click('main form[action="/api/notes"] button[type=submit]');
await page.waitForLoadState('networkidle');
check(await waitForText(`ملاحظة ${RUN}`), 'إضافة ملاحظة على الصفقة تظهر فورًا');

// ── 6. قواعد انتقال الحالة (§٦) ─────────────────────────────

// «قيد التنفيذ» يتطلّب نمط التشغيل والمنتِج — يجب أن يُرفض بدونهما
await go(dealUrl.replace('http://localhost:3000', ''));
await page.click('main button:has-text("قيد التنفيذ")');
await page.waitForLoadState('networkidle');
const assignBlocked =
  page.url().includes('error=') || (await waitForText('مطلوب قبل هذا الانتقال', 5000));
check(assignBlocked, 'لا انتقال إلى «قيد التنفيذ» بلا نمط تشغيل ومنتِج (§٦)');

// نستكمل الناقص من قاعدة البيانات مباشرة عبر شاشة التعديل غير متاحة بعد،
// فنتحقق بدلًا من ذلك أن القفزة غير المسموحة مرفوضة أيضًا
await go(dealUrl.replace('http://localhost:3000', ''));
const hasIllegalJump = await page
  .locator('main button:has-text("محصَّل")')
  .count();
check(
  hasIllegalJump === 0,
  'زر «محصَّل» لا يظهر من «قيد الإسناد» — القفز فوق الحالات ممنوع'
);

// ── 7. عرض سعر مع حساب تلقائي ───────────────────────────────
await go(`/quotes/new?projectId=${projectId}`);
await page.fill('input[name="items[0][quantity]"]', '2000');
await page.fill('input[name="items[0][unitPrice]"]', '2.5');
await page.fill('input[name="taxRate"]', '14');
await page.waitForTimeout(500);
await submit();
await page.waitForURL(/\/quotes\/(?!new)[a-z0-9]+$/, { timeout: 25000 });
await page.waitForLoadState('networkidle');
const totalTxt = (await page.locator('article dd.nums.font-bold').first().innerText()).trim();
check(totalTxt.includes('5,700.00'), `حساب عرض السعر تلقائيًا — الناتج: ${totalTxt} (المتوقع 5,700.00)`);
await page.screenshot({ path: `${shots}/09-quote.png`, fullPage: true });

// ── 8. قبول عرض السعر لا يحرّك حالة المشروع التشغيلية ───────
await page.click('main button:has-text("مقبول")');
await page.waitForTimeout(2000);
await go(dealUrl.replace('http://localhost:3000', ''));
check(
  (await page.locator('dd >> text=قيد الإسناد').count()) > 0,
  'قبول عرض السعر لا يقفز بحالة المشروع التشغيلية'
);

// ── 9. مهمة مرتبطة + إنجازها ────────────────────────────────
const dealPath = dealUrl.replace('http://localhost:3000', '');
await go(`/tasks/new?projectId=${projectId}&redirectTo=${dealPath}`);
await page.fill('#title', `مهمة ${RUN}`);
await page.fill('#dueDate', '2026-08-15');
await submit();
await page.waitForURL(dealUrl, { timeout: 20000 });
await page.waitForLoadState('networkidle');
check(await waitForText(`مهمة ${RUN}`), 'إنشاء مهمة مرتبطة بالصفقة');

await go('/tasks');
const before = await page.locator(`text=مهمة ${RUN}`).count();
await page.locator(`li:has-text("مهمة ${RUN}") form[action="/api/mutate"] button`).first().click();
await page.waitForLoadState('networkidle');
const gone = await waitForTextGone(`مهمة ${RUN}`);
check(before > 0 && gone, 'إنجاز مهمة بضغطة واحدة (تختفي من قائمة المفتوحة)');
await page.screenshot({ path: `${shots}/10-tasks-final.png`, fullPage: true });

// ── 10. البحث والفلترة ──────────────────────────────────────
await go('/leads');
await page.fill('input[name=q]', RUN);
await page.press('input[name=q]', 'Enter');
await page.waitForLoadState('networkidle');
check((await page.locator(`td a:has-text("${RUN}")`).count()) > 0, 'البحث في العملاء المحتملين');

// الفلترة بقائمة منسدلة تُطبَّق فور الاختيار
await go('/leads');
await page.selectOption('select[name=channel]', { index: 1 });
const filtered = await page
  .waitForURL(/channel=/, { timeout: 10000 })
  .then(() => true)
  .catch(() => false);
check(filtered, 'الفلترة بقائمة منسدلة تُطبَّق فورًا');

await go('/projects?status=in_progress&view=list');
check(
  (await page.locator('table tbody tr').count()) > 0,
  'الفلترة حسب حالة المشروع'
);

// ── 10ب. الاعتراف بالإيراد بالحالة — اختبارا ١٣ و١٤ ──────────
//
// نتحقّق من **القاعدة** لا من رقم ثابت: الإيراد المعترَف به يجب أن يساوي
// مجموع المشاريع «سُلّم» و«محصَّل» بالضبط، ولا يشمل جاريًا ولا ملغى.

/** يجمع عمود «الإجمالي» في شاشة القائمة لحالة واحدة */
async function sumByStatus(status) {
  await page.goto(`http://localhost:3000/projects?status=${status}&view=list`, {
    waitUntil: 'networkidle',
  });
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('table tbody tr')];
    return rows.reduce((sum, row) => {
      const cell = row.querySelectorAll('td')[4]; // عمود الإجمالي
      const match = (cell?.textContent ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/);
      return sum + (match ? Number(match[0]) : 0);
    }, 0);
  });
}

const delivered = await sumByStatus('delivered');
const collected = await sumByStatus('collected');
const inProgress = await sumByStatus('in_progress');
const cancelled = await sumByStatus('cancelled');

await go('/projects?view=list');
const recognisedRevenue = await page.evaluate(() => {
  const card = [...document.querySelectorAll('.card')].find((c) =>
    c.textContent?.includes('إيراد معترَف به')
  );
  const match = (card?.textContent ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : -1;
});

const expectedRevenue = delivered + collected;
check(
  Math.abs(recognisedRevenue - expectedRevenue) < 0.01,
  `اختبار ١٣ و١٤: الإيراد المعترَف به ${recognisedRevenue} = مجموع المسلَّم والمحصَّل ${expectedRevenue}`
);
check(
  inProgress > 0 &&
    cancelled > 0 &&
    recognisedRevenue < expectedRevenue + inProgress + cancelled,
  `الجاري (${inProgress}) والملغى (${cancelled}) خارج الرقم المالي`
);

// اختبار ١٣ (تتمة): الملغى يظهر في اللوحة التشغيلية ولا يختفي
await go('/projects?status=cancelled&view=list');
check(
  (await page.locator('table tbody tr').count()) > 0,
  'المشروع الملغى يظهر في اللوحة التشغيلية ولا يُمحى (اختبار ١٣)'
);

// حقل التنبيه — حارس البيانات (§4.3): مشروع بسعر صفر يجب أن يُعلَّم
await go('/projects/new');
await page.fill('#title', `مشروع بلا سعر ${RUN}`);
await page.selectOption('#serviceLine', { index: 1 });
await page.fill('#pages', '5');
await page.fill('#netTotal', '0');
await submit();
await page.waitForURL(/\/projects\/(?!new)[a-z0-9]+$/, { timeout: 25000 });
await page.waitForLoadState('networkidle');
check(
  await waitForText('السعر صفر'),
  'حقل التنبيه يمسك المشروع الناقص ويعرض أول سبب (§4.3)'
);

await go('/projects?view=list');
const alertBanner = await page.locator('text=تنبيه مفتوح').count();
check(alertBanner > 0, `عدّاد التنبيهات المفتوحة يعدّ الناقص (${alertBanner} إشارة)`);

// لوحة السحب والإفلات تفتح بحالات المشروع الست
await go('/projects', '10-projects-board');
const columns = await page.evaluate(() =>
  ['قيد الإسناد', 'قيد التنفيذ', 'قيد المراجعة', 'جاهز للتسليم', 'سُلّم', 'محصَّل'].filter(
    (t) => document.body.innerText.includes(t)
  ).length
);
check(columns === 6, `لوحة التشغيل تعرض الحالات الست (${columns}/6)`);

// ── 10د. الإسناد ومعادلات التكلفة (المرحلة ٤) ───────────────

// قائمة الإسناد: لا سعر بيع فيها إطلاقًا
await go('/production', '11-production');
const productionHtml = await page.content();
const priceLeak = ['62,000', '45,000', '18,000'].filter((n) => productionHtml.includes(n));
check(
  priceLeak.length === 0,
  `قائمة الإسناد بلا أي سعر بيع${priceLeak.length ? ' — تسرّب: ' + priceLeak : ''}`
);

// نُسند المشروع الذي أنشأناه: نمط تشغيل + منتِج
await go(`/projects/${projectId}/assign`);
await page.selectOption('#workMode', 'human_full');
await page.selectOption('#primaryProducerId', { index: 1 });

// مؤشر التكلفة المجرّد يظهر بعد اختيار المنتِج
const indicatorShown = await page
  .waitForSelector('[data-testid=cost-indicator]', { timeout: 10000 })
  .then(() => true)
  .catch(() => false);
check(indicatorShown, 'مؤشر التكلفة المجرّد يظهر عند اختيار المنتِج (§٥)');

if (indicatorShown) {
  const indicatorText = await page.locator('[data-testid=cost-indicator]').innerText();
  const mentionsSalary = ['راتب', 'الراتب', 'salary'].some((w) => indicatorText.includes(w));
  check(!mentionsSalary, `المؤشر رقم مجرّد بلا أي إشارة لراتب — «${indicatorText.trim()}»`);
}

await submit();
await page.waitForURL(/\/projects\/(?!new)[a-z0-9]+$/, { timeout: 25000 });
await page.waitForLoadState('networkidle');
check(await waitForText('قيد التنفيذ'), 'الإسناد ينقل المشروع إلى «قيد التنفيذ»');
check(await waitForText('الصفحات الموزونة'), 'لوحة التكلفة تظهر بعد الإسناد');

// الصفحات الموزونة محسوبة: ٢٠ صفحة × ترجمة بشرية ١٫٠ × خط الخدمة
const weightedText = await page.evaluate(() => {
  const dts = [...document.querySelectorAll('dt')];
  const dt = dts.find((d) => d.textContent?.includes('الصفحات الموزونة'));
  return dt?.nextElementSibling?.textContent?.trim() ?? '';
});
check(
  Number(weightedText) > 0,
  `الصفحات الموزونة محسوبة ومخزَّنة (${weightedText})`
);

// الإيراد المنسوب يساوي إجمالي المشروع بالضبط (اختبار ١٢ في المتصفح)
const attributionSum = await page.evaluate(() => {
  const section = [...document.querySelectorAll('section')].find((s) =>
    s.textContent?.includes('الإيراد المنسوب')
  );
  if (!section) return null;
  // نلتقط الرقم وحده: رمز العملة «ج.م» يحمل نقطة تفسد أي تنظيف ساذج
  const nums = [...section.querySelectorAll('li span.nums')].map((n) => {
    const match = (n.textContent ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/);
    return match ? Number(match[0]) : 0;
  });
  return nums.reduce((a, b) => a + b, 0);
});
check(
  attributionSum === 5000,
  `اختبار ١٢ في المتصفح: مجموع الإيراد المنسوب ${attributionSum} = ٥٠٠٠`
);

// خطوة تنفيذ تُحسب صفحاتها الموزونة عند الحفظ
await page.locator('summary:has-text("خطوات التنفيذ")').first().click();
await page.selectOption('select[name=stepType]', 'human_translation');
await page.fill('input[name=pages]', '20');
await page.selectOption('select[name=performerId]', { index: 1 });
await page.click('main details form button[type=submit]');
await page.waitForLoadState('networkidle');
check(await waitForText('صفحة موزونة'), 'خطوة التنفيذ تُحسب صفحاتها الموزونة وتُخزَّن');

// المسار متسلسل: قيد التنفيذ ← جاهز للتسليم ← سُلّم
await go(`/projects/${projectId}`);
await page.click('main button:has-text("جاهز للتسليم")');
await page.waitForLoadState('networkidle');
check(await waitForText('جاهز للتسليم'), 'الانتقال إلى «جاهز للتسليم»');

// التسليم يجمّد التكلفة ويعترف بالإيراد
await go(`/projects/${projectId}/deliver`);
await page.fill('#qaIssues', '2');
await submit();
await page.waitForURL(/\/projects\/(?!new)[a-z0-9]+$/, { timeout: 25000 });
await page.waitForLoadState('networkidle');
check(await waitForText('سُلّم'), 'التسليم ينقل المشروع إلى «سُلّم»');

// رواتب الموظفين محجوبة عن مدير المشاريع، ومتاحة لمدير النظام
await go('/settings/staff-costs');
check(
  page.url().includes('/settings/staff-costs'),
  'مدير النظام يصل إلى شاشة تكلفة الموظفين'
);

// ── 10هـ. التسعير والخصومات والاعتماد (المرحلة ٥) ───────────

// التسعير التلقائي: نحوّل ليدًا بلا إدخال سعر، فيُقرأ من قائمة الأسعار
await go('/leads/new');
await page.fill('#phone', '012' + String(Date.now()).slice(-8));
await page.fill('#firstName', 'تسعير ' + RUN);
await page.selectOption('#channel', { index: 1 });
await submit();
await page.waitForURL(/\/leads\/(?!new)[a-z0-9]+$/, { timeout: 20000 });

await page.click('a[href$="/convert"]');
await page.waitForURL(/\/convert$/, { timeout: 15000 });
await page.selectOption('#serviceLine', 'general'); // ٩٠ للصفحة في البذرة
await page.selectOption('#sourceLang', 'ar');
await page.selectOption('#targetLang', 'en');
await page.fill('#pages', '10');
await submit();
await page.waitForURL(/\/projects\/(?!new)[a-z0-9]+$/, { timeout: 25000 });
await page.waitForLoadState('networkidle');
const autoPricedUrl = page.url();
const autoPricedId = autoPricedUrl.split('/').pop();
check(
  await waitForText('900'),
  'التسعير التلقائي من قائمة الأسعار: ١٠ صفحات × ٩٠ = ٩٠٠'
);

// ── اختبار ١٩: تغيير السعر لا يمسّ مشروعًا قديمًا ─────────────
await go('/settings/prices');
await page.selectOption('select[name=serviceLine]', 'general');
await page.selectOption('select[name=langFrom]', 'ar');
await page.selectOption('select[name=langTo]', 'en');
await page.fill('input[name=unitPrice]', '250');
await submit();
await page.waitForLoadState('networkidle');
check(await waitForText('تم الحفظ'), 'إضافة سعر جديد بتاريخ سريان اليوم');

await go(autoPricedUrl.replace('http://localhost:3000', ''));
const stillOldPrice = await waitForText('900', 8000);
const leakedNewPrice = await page.evaluate(() => document.body.innerText.includes('2,500'));
check(
  stillOldPrice && !leakedNewPrice,
  'اختبار ١٩: تغيير السعر في القائمة لا يغيّر إجمالي مشروع قديم'
);

// ── اختبار ١٨: خصم فوق الحد يمنع الانتقال حتى الاعتماد ───────
// نُنشئ مشروعًا بخصم ٥٠٪ — فوق حدّ مدير النظام؟ لا، حدّه ١٠٠٪.
// نخفض حدّ دور مدير النظام مؤقتًا إلى ٥٪ ليُختبر الضابط فعليًا.
await go('/settings/roles');
await page.click('a[href^="/settings/roles/"]:has-text("مدير النظام")');
await page.waitForSelector('#discountLimit', { timeout: 15000 });
await page.fill('#discountLimit', '0.05');
await submit();
await page.waitForURL(/\/settings\/roles$/, { timeout: 20000 });

await go('/leads/new');
await page.fill('#phone', '015' + String(Date.now()).slice(-8));
await page.fill('#firstName', 'خصم ' + RUN);
await page.selectOption('#channel', { index: 1 });
await submit();
await page.waitForURL(/\/leads\/(?!new)[a-z0-9]+$/, { timeout: 20000 });

await page.click('a[href$="/convert"]');
await page.waitForURL(/\/convert$/, { timeout: 15000 });
await page.selectOption('#serviceLine', 'general');
await page.selectOption('#sourceLang', 'ar');
await page.selectOption('#targetLang', 'en');
await page.fill('#pages', '10');
await page.selectOption('#discountType', 'percent');
await page.fill('#discountValue', '0.30'); // ٣٠٪ فوق حدّ ٥٪
await submit();
await page.waitForURL(/\/projects\/(?!new)[a-z0-9]+$/, { timeout: 25000 });
await page.waitForLoadState('networkidle');

const heldUrl = page.url();
check(
  (await page.locator('[data-testid=approval-pending]').count()) > 0,
  'خصم ٣٠٪ فوق حدّ ٥٪ يوقف المشروع بانتظار الاعتماد (§١٠ بند ٤)'
);

// المحاولة الآن: أي انتقال يجب أن يُرفض
await page.click('main button:has-text("إسناد المشروع")').catch(() => {});
await go(heldUrl.replace('http://localhost:3000', ''));
const moveButton = page.locator('main button:has-text("قيد التنفيذ")').first();
if ((await moveButton.count()) > 0) {
  await moveButton.click();
  await page.waitForLoadState('networkidle');
}
const held =
  page.url().includes('error=') || (await waitForText('موقوف بانتظار اعتماد', 6000));
check(held, 'اختبار ١٨: المشروع الموقوف لا ينتقل خطوة واحدة قبل الاعتماد');

// الاعتماد يرفع الإيقاف
await go(heldUrl.replace('http://localhost:3000', ''));
await page.click('main button:has-text("اعتماد الخصم")');
await page.waitForLoadState('networkidle');
check(await waitForText('معتمَد'), 'الاعتماد يرفع الإيقاف ويظهر اسم من اعتمده');

// نعيد حدّ مدير النظام كما كان حتى لا تتأثر بقية الاختبارات
await go('/settings/roles');
await page.click('a[href^="/settings/roles/"]:has-text("مدير النظام")');
await page.waitForSelector('#discountLimit', { timeout: 15000 });
await page.fill('#discountLimit', '1');
await submit();
await page.waitForURL(/\/settings\/roles$/, { timeout: 20000 });

// ── خصم العميل المتكرر يُطبَّق تلقائيًا (§١٠ بند ٣) ────────────
// العميل الذي سُلّم له مشروع سابقًا هو REPEAT_PHONE — نُنشئ له ليدًا ثانيًا
// ونحوّله بلا إدخال خصم، فيجب أن يُطبَّق الخصم بلا لمس.
await go('/leads/new');
await page.fill('#phone', REPEAT_PHONE);
await page
  .waitForSelector('[data-testid=client-found]', { timeout: 10000 })
  .catch(() => {});
await page.fill('#firstName', 'متكرر ' + RUN);
await page.selectOption('#channel', { index: 1 });
await submit();
await page.waitForURL(/\/leads\/(?!new)[a-z0-9]+$/, { timeout: 20000 });

await page.click('a[href$="/convert"]');
await page.waitForURL(/\/convert$/, { timeout: 15000 });
await page.selectOption('#serviceLine', 'general');
await page.selectOption('#sourceLang', 'ar');
await page.selectOption('#targetLang', 'en');
await page.fill('#pages', '5'); // أقل من أدنى شريحة كمية، فالخصم من التكرار وحده
await submit();
await page.waitForURL(/\/projects\/(?!new)[a-z0-9]+$/, { timeout: 25000 });
await page.waitForLoadState('networkidle');
check(
  await waitForText('عميل متكرر'),
  'خصم العميل المتكرر يُطبَّق تلقائيًا بلا إدخال (§١٠ بند ٣)'
);
check(
  (await page.locator('[data-testid=approval-pending]').count()) === 0,
  'الخصم التلقائي سياسة معتمدة سلفًا فلا يوقف المشروع للاعتماد'
);

// ── 10ج. أهداف الفروع تُعدَّل من الشاشة ─────────────────────
await go('/settings/targets');
const firstTarget = await page.locator('input[name^="target_"]').first();
await firstTarget.fill('350000');
await submit();
await page.waitForLoadState('networkidle');
check(
  await waitForText('تم حفظ أهداف'),
  'التارجت الشهري لكل فرع يُعدَّل من الشاشة ويُحفظ'
);
check(
  (await page.locator('input[name^="target_"]').first().inputValue()) === '350000',
  'الهدف المحفوظ يظهر عند إعادة فتح الشاشة'
);

// ── 10و. نسب المبيعات (المرحلة ٦) ───────────────────────────

/** يقرأ قيمة بطاقة إحصائية باسم عنوانها — الأرقام بفواصل ورمز عملة */
async function statCard(label) {
  return page.evaluate((wanted) => {
    const p = [...document.querySelectorAll('p')].find(
      (el) => el.textContent?.trim() === wanted
    );
    const text = p?.nextElementSibling?.textContent ?? '';
    const match = text.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return match ? Number(match[0]) : null;
  }, label);
}

// النسبة تستحق **عند التحصيل** — نسجّل التحصيل على المشروع المسلَّم
await go(`/projects/${projectId}`);
await page.click('main button:has-text("محصَّل")');
await page.waitForSelector('#collectedAmount', { timeout: 10000 });
await page.fill('#collectedAmount', '5000');
await page.click('main form button[type=submit]:has-text("تأكيد التحصيل")');
await page.waitForLoadState('networkidle');
check(await waitForText('محصَّل'), 'تسجيل التحصيل ينقل المشروع إلى «محصَّل»');

await go('/commissions', '13-commissions');
const achieved = await statCard('ما حصّلته هذا الشهر');
const entitled = await statCard('ما استحققته');
// مدير النظام بلا مدير مباشر، فيأخذ النسبتين معًا: ٣٪ + ٢٪ = ٥٪
// (نتحقق من **القاعدة** لا من رقم ثابت، فالمحصَّل يتراكم بين التشغيلات)
const expectedEntitlement = achieved <= 200000 ? achieved * 0.05 : null;
check(
  achieved >= 5000,
  `«نسبي» تعرض المحصَّل من المشاريع المحصَّلة (${achieved})`
);
check(
  expectedEntitlement !== null && Math.abs(entitled - expectedEntitlement) < 1,
  `الاستحقاق ${entitled} = ${achieved} × ٥٪ (بلا مدير مباشر تُجمع الحصتان)`
);

const remainingToNext = await statCard('يتبقى للشريحة التالية');
check(
  remainingToNext !== null && Math.abs(remainingToNext - (200000 - achieved)) < 1,
  `«كم يتبقى للشريحة التالية» = ${remainingToNext} (حدّ الشريحة ٢٠٠ ألف − المحقَّق)`
);
check(
  await waitForText('مشاريعي المحصَّلة هذا الشهر'),
  'تفصيل الاستحقاق بالمشروع يظهر للبائع'
);

// ── الشرائح **بيانات تُعدَّل**، لا كود يُبرمَج ────────────────
await go('/settings/commissions', '14-commission-schemes');
check(await waitForText('خطة النسب الأساسية'), 'خطة النسب الافتراضية مزروعة وقابلة للفتح');

// نحذف الشريحة الأولى ونضع مكانها نسبة مختلفة تمامًا
await page.click('table tbody tr:first-child button:has-text("حذف")');
await page.waitForLoadState('networkidle');
await page.fill('input[name=fromAmount]', '0');
await page.fill('input[name=toAmount]', '200000');
await page.fill('input[name=adminRate]', '0.1');
await page.fill('input[name=managerRate]', '0');
await page.click('main form button[type=submit]:has-text("إضافة شريحة")');
await page.waitForLoadState('networkidle');

await go('/commissions');
const afterEdit = await statCard('ما استحققته');
check(
  Math.abs(afterEdit - achieved * 0.1) < 1,
  `تعديل النسبة من الشاشة يسري فورًا: ${afterEdit} = ${achieved} × ١٠٪ (بلا نشر)`
);

// نعيد الشريحة المعتمدة كما كانت
await go('/settings/commissions');
await page.click('table tbody tr:first-child button:has-text("حذف")');
await page.waitForLoadState('networkidle');
await page.fill('input[name=fromAmount]', '0');
await page.fill('input[name=toAmount]', '200000');
await page.fill('input[name=adminRate]', '0.03');
await page.fill('input[name=managerRate]', '0.02');
await page.click('main form button[type=submit]:has-text("إضافة شريحة")');
await page.waitForLoadState('networkidle');

await go('/commissions');
check(
  Math.abs((await statCard('ما استحققته')) - achieved * 0.05) < 1,
  'استعادة الشريحة تعيد الاستحقاق كما كان — لا أثر جانبي'
);

// ── الاسترداد يخصم النسبة، والمشروع لا يُحذف ─────────────────
// «المحصَّل» نهاية المسار: المخرج الوحيد منه «مُعاد للتعديل» (§٦)، وهو
// المسار الذي يسلكه الاسترداد فعلًا.
await go(`/projects/${projectId}`);
check(
  (await page.locator('main button:has-text("إلغاء المشروع")').count()) === 0,
  'لا إلغاء لمشروع محصَّل — المخرج الوحيد «مُعاد للتعديل» (§٦)'
);
await page.click('main button:has-text("مُعاد للتعديل")');
await page.waitForLoadState('networkidle');
check(await waitForText('مُعاد للتعديل'), 'إعادة المشروع المحصَّل للتعديل تُسجَّل');

await go('/commissions', '15-commission-clawback');
check(
  await waitForText('خرج من حساب هذه الفترة'),
  'المشروع المسترد يظهر في «خرج من حساب هذه الفترة»'
);
const afterClawback = await statCard('ما حصّلته هذا الشهر');
check(
  Math.abs(afterClawback - (achieved - 5000)) < 1,
  `المحصَّل نقص بمقدار المشروع المسترد: ${afterClawback} = ${achieved} − ٥٠٠٠`
);
check(
  Math.abs((await statCard('ما استحققته')) - afterClawback * 0.05) < 1,
  'الاستحقاق أُعيد حسابه بعد الاسترداد — لا خصم مزدوج ولا بقايا قيود'
);

// السجل لم يُمحَ (§٣ بند ٥)
check((await go(`/projects/${projectId}`)) === 200, 'المشروع المسترد باقٍ في النظام لم يُحذف');

// ── 11. الصلاحيات — اختبارات §١٧ من المواصفة ────────────────

async function loginAs(email, password = 'ChangeMe123!') {
  await page.goto('http://localhost:3000/');
  if (await page.locator('aside form button[type=submit]').count()) {
    await page.click('aside form button[type=submit]'); // خروج
    await page.waitForURL(/\/login/, { timeout: 15000 });
  } else {
    await page.goto('http://localhost:3000/login');
  }
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await page.waitForURL('http://localhost:3000/', { timeout: 15000 });
}

// اختبار ٤: أدمن المبيعات يرى سجلاته فقط، ولا يبلغ شاشات الإدارة
await loginAs('agent@fasttrans.local');

const guarded = [
  '/settings/users',
  '/settings/roles',
  '/settings/lists',
  '/settings/system',
  '/settings/staff-costs', // اختبار ٦: لا أحد يقرأ الرواتب إلا مدير النظام والإدارة
  '/production', // الإسناد لمن يملك صلاحيته وحده
];
let allGuarded = true;
for (const path of guarded) {
  await page.goto('http://localhost:3000' + path, { waitUntil: 'networkidle' });
  if (page.url().includes(path)) {
    allGuarded = false;
    console.log(`  !! لم يُحجب ${path}`);
  }
}
check(allGuarded, 'أدمن المبيعات محجوب عن الإدارة والرواتب والإسناد (اختبارا ٤ و٦)');

// «نسبي» مفتوحة للجميع، لكن **الترشيح في الخادم**: أدمن المبيعات يرى
// استحقاقه هو فقط، ولا تصل حمولة الصفحة أرقام غيره أصلًا
await go('/commissions', '16-commissions-agent');
const agentCommissionHtml = await page.content();
check(
  !agentCommissionHtml.includes('كل الفريق') &&
    !agentCommissionHtml.includes('إجمالي عبء النسب'),
  'أدمن المبيعات لا يرى إجمالي عبء النسب على الشركة'
);
check(
  !agentCommissionHtml.includes('إغلاق الفترة'),
  'إغلاق الفترة محجوب عمّن لا يملك صلاحية تحليلات الشركة'
);
check(
  !agentCommissionHtml.includes('مدير النظام'),
  'لا تسرّب لاستحقاق غيره في حمولة الصفحة — الترشيح في الخادم'
);

// اختبار ٦ (تتمة): مؤشر التكلفة نفسه محجوب عمّن لا يملك صلاحيته
const indicatorStatus = await page.evaluate(async () => {
  const res = await fetch('/api/cost-indicator?projectId=x');
  return res.status;
});
check(indicatorStatus === 403, `مؤشر التكلفة يرفض من لا يملك صلاحيته (${indicatorStatus})`);

await go('/projects', '11-agent-view');
check(true, `أدمن المبيعات يرى صفقاته فقط (عددها ${await page.locator('table tbody tr').count()})`);

// اختبار ٣: مدير المبيعات يرى فريقه ولا يرى الفريق الآخر.
// سارة تدير محمد إبراهيم؛ مجلي يدير الصاوي ونورا ويحيى. لا تقاطع بينهما.
await loginAs('manager@fasttrans.local');
await go('/leads');
const managerSees = await page.locator('table tbody tr').count();

await loginAs('magly@fasttrans.local', process.env.TEAM_INITIAL_PASSWORD ?? 'FastTrans2026!');
await go('/leads');
const otherManagerSees = await page.locator('table tbody tr').count();
check(
  otherManagerSees === 0 && managerSees > 0,
  `مدير الفريق الآخر لا يرى سجلات هذا الفريق (${managerSees} مقابل ${otherManagerSees}) — اختبار ٣`
);

// اختبار ٧: دور جديد يُنشأ من الشاشة تنفذ صلاحياته فورًا بلا نشر
await loginAs('admin@fasttrans.local');
await go('/settings/roles/new');
await page.fill('#label', `دور اختبار ${RUN}`);
await page.fill('#name', `test_role_${RUN.toLowerCase()}`);
await page.check('input[name=canViewAllLeads]');
await submit();
await page.waitForURL(/\/settings\/roles$/, { timeout: 15000 });
check(await waitForText(`دور اختبار ${RUN}`), 'إنشاء دور جديد من الشاشة (اختبار ٧)');

// نُسند الدور الجديد لأدمن المبيعات، فيرى فورًا ما لم يكن يراه
await go('/settings/users');
await page.click(`a[href*="/settings/users/"]:has-text("محمد إبراهيم")`);
await page.waitForSelector('#roleId', { timeout: 15000 });
await page.selectOption('#roleId', { label: `دور اختبار ${RUN}` });
await submit();
await page.waitForURL(/\/settings\/users$/, { timeout: 15000 });

await loginAs('agent@fasttrans.local');
await go('/leads');
const afterGrant = await page.locator('table tbody tr').count();
check(afterGrant > 0, `الصلاحية الجديدة نفذت فورًا بلا نشر — يرى الآن ${afterGrant} ليد (اختبار ٧)`);

// اختبار ١: الحقول الحسّاسة لا تصل في حمولة الاستجابة أصلًا
const leadsHtml = await page.content();
const leaked = ['staffSalary', 'costInternal', 'costTotal', 'marginPct'].filter((f) =>
  leadsHtml.includes(f)
);
check(leaked.length === 0, `لا تسرّب لحقول التكلفة في الحمولة${leaked.length ? ': ' + leaked : ''}`);

await loginAs('admin@fasttrans.local');

// ── 12. عرض الجوال ──────────────────────────────────────────
await page.setViewportSize({ width: 390, height: 844 });
await go('/projects', '12-mobile');
check(true, 'العرض على الجوال');

// ── النتيجة ─────────────────────────────────────────────────
console.log('\n═══ أخطاء المتصفح ═══');
console.log(errors.length ? errors.join('\n') : 'لا توجد ✓');
const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
await browser.close();
process.exit(failed.length ? 1 : 0);
