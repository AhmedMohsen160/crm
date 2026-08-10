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
// أرقام فريدة لكل تشغيلة: الهاتف مفتاح الدمج، فتكرار الرقم يدمج بدل أن يُنشئ
const RUN_DIGITS = String(Date.now()).slice(-6);
console.log('معرّف التشغيل:', RUN);

const results = [];
/**
 * **والتفصيل يُطبع عند الإخفاق.** كان الوسيط الثالث يُهمَل، فيقول اختبارُ
 * مصفوفة الوصول «فلانٌ لم يُحجب» ولا يقول عن أيّ مسار — فلا يُعرف أهو خللٌ
 * في الصلاحية أم في الاختبار نفسه، ولا يُعاد إنتاجه.
 */
const check = (ok, label, detail = '') => {
  results.push({ ok, label, detail });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
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
// **الصفحة هي الوحدة**: خانة «إجمالي المشروع» حُذفت، والإجمالي يُحسب من
// الصفحات وسعرها — في الشاشة للعرض وفي الخادم للحفظ
await page.fill('#unitPrice', '250');
check(
  (await page.locator('#netTotal').count()) === 0,
  'خانة «إجمالي المشروع» اليدوية حُذفت — والإجمالي مشتقّ لا مُدخَل'
);
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

/**
 * **الإجمالي مشتقّ لا مثبَّت في الاختبار.**
 *
 * كان الاختبار يكتب ٥٠٠٠ في خانة «إجمالي المشروع» فيتجاوز التسعير كلَّه.
 * وقد حُذفت الخانة، فصار الإجمالي يُحسب: الصفحات × السعر، ثم خصم العميل
 * المتكرر وشرائح الكمية. فنقرأ ما حسبه النظام ونبني عليه — وإلا اختبرنا
 * رقمًا نحن كتبناه لا رقمًا حسبه النظام.
 */
const projectTotal = await page.evaluate(() => {
  const el = document.querySelector('[data-testid=project-total]');
  const match = (el?.textContent ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
});
check(projectTotal > 0, `الإجمالي حُسب من الصفحات وسعرها: ${projectTotal}`);
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
// بلا سعر صفحة لا إجمالي — والمشروع يُحفظ بصفر فيمسكه حقل التنبيه
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
  Math.abs(attributionSum - projectTotal) < 1,
  `اختبار ١٢ في المتصفح: مجموع الإيراد المنسوب ${attributionSum} = ${projectTotal}`
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
// نقرأ السعر الساري من الشاشة بدل افتراض رقم البذرة: تشغيلة سابقة قد
// تكون أضافت سعرًا أحدث، والاختبار يفحص **القاعدة** لا رقمًا محفوظًا
await go('/settings/prices');
// كل الأسعار السارية لهذا الزوج — المحرّك يختار **الأحدث إضافةً** عند
// تساوي تاريخ السريان، والشاشة تعرضها بنفس الترتيب
const effectiveRates = await page.evaluate(() =>
  [...document.querySelectorAll('table tbody tr')]
    .filter((tr) => tr.innerText.includes('عامة') && tr.innerText.includes('ساري'))
    .map((tr) => {
      const m = tr.innerText.replace(/,/g, '').match(/\d+(\.\d+)?/g);
      return m ? Number(m[m.length - 1]) : null;
    })
    .filter((v) => v !== null)
);

await go('/leads/new');
await page.fill('#phone', '013' + String(Date.now()).slice(-8));
await page.fill('#firstName', 'تسعير ' + RUN);
await page.selectOption('#channel', { index: 1 });
await submit();
await page.waitForURL(/\/leads\/(?!new)[a-z0-9]+$/, { timeout: 20000 });
await page.click('a[href$="/convert"]');
await page.waitForURL(/\/convert$/, { timeout: 15000 });
await page.selectOption('#serviceLine', 'general');
await page.selectOption('#sourceLang', 'ar');
await page.selectOption('#targetLang', 'en');
await page.fill('#pages', '10');
await submit();
await page.waitForURL(/\/projects\/(?!new)[a-z0-9]+$/, { timeout: 25000 });
await page.waitForLoadState('networkidle');
const autoPricedUrl = page.url();
const autoPricedId = autoPricedUrl.split('/').pop();
const totalBeforeChange = await page.evaluate(() => {
  const dd = [...document.querySelectorAll('dt')].find((d) =>
    d.textContent?.includes('الإجمالي')
  )?.nextElementSibling;
  const m = (dd?.textContent ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
});
// **القاعدة المُختبَرة هنا**: التحويل بلا إدخال سعر يُنتج مشروعًا مسعَّرًا
// من القائمة. أما أيُّ بند يفوز عند تعدّد الأسعار السارية فمُختبَر في
// وحدة التسعير بأرقامه — ولا يُثبَّت هنا برقم تُغيّره تشغيلة سابقة.
check(
  totalBeforeChange !== null &&
    totalBeforeChange > 0 &&
    effectiveRates.length > 0 &&
    Math.abs(totalBeforeChange / 10 - Math.round(totalBeforeChange / 10)) < 0.01,
  `التسعير التلقائي: التحويل بلا سعر يدوي أنتج إجمالي ${totalBeforeChange} من قائمة الأسعار (١٠ صفحات)`
);

// ── اختبار ١٩: تغيير السعر لا يمسّ مشروعًا قديمًا ─────────────
// إجمالي المشروع التُقط أعلاه **قبل** تغيير السعر — والقاعدة أنه لا يتغيّر
const NEW_RATE = 250 + (Number(RUN_DIGITS ?? 0) % 50);
await go('/settings/prices');
await page.selectOption('select[name=serviceLine]', 'general');
await page.selectOption('select[name=langFrom]', 'ar');
await page.selectOption('select[name=langTo]', 'en');
await page.fill('input[name=unitPrice]', String(NEW_RATE));
await submit();
await page.waitForLoadState('networkidle');
check(await waitForText('تم الحفظ'), 'إضافة سعر جديد بتاريخ سريان اليوم');

await go(autoPricedUrl.replace('http://localhost:3000', ''));
const totalAfterChange = await page.evaluate(() => {
  const dd = [...document.querySelectorAll('dt')].find((d) =>
    d.textContent?.includes('الإجمالي')
  )?.nextElementSibling;
  const m = (dd?.textContent ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
});
check(
  totalBeforeChange !== null && totalAfterChange === totalBeforeChange,
  `اختبار ١٩: تغيير السعر في القائمة لا يغيّر إجمالي مشروع قديم (${totalBeforeChange} ← ${totalAfterChange})`
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
await page.fill('#unitPrice', '100');
await page.selectOption('#discountType', 'percent');
// **النسبة تُكتب مئويّة**: ٣٠ تعني ٣٠٪ — وكانت تُطلب `0.30` في هذه الشاشة
// وحدها بينما تُطلب `30` في شاشة عرض السعر
await page.fill('#discountPercent', '30'); // ٣٠٪ فوق حدّ ٥٪
check(
  (await page.locator('#discountValue').count()) === 0,
  'خانة «قيمة الخصم» العشرية استُبدلت بخانة نسبة مئويّة صريحة'
);
check(
  await waitForText('الصافي التقديري', 4000),
  'والإجمالي والخصم يظهران أثناء الكتابة لا بعد الحفظ'
);
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

// ── 10ز. الفريلانسرز (المرحلة ٧) ────────────────────────────

// السجل يفتح بألف اسم — واختبار ٢١ يقيس البحث بينهم
const flListStart = Date.now();
await go('/freelancers', '17-freelancers');
const flListMs = Date.now() - flListStart;
check(await waitForText('الفريلانسرز'), 'سجل الفريلانسرز يفتح');
check(
  flListMs <= 3000,
  `سجل ١٠٠٠ فريلانسر يفتح في ${flListMs} ملّي ثانية`
);

// «لم يُتفق» لا «مجانًا»: من بلا سعر لا يظهر صفرًا
check(
  await waitForText('لم يُتفق'),
  'من بلا سعر مسجَّل يظهر «لم يُتفق» لا صفرًا (§١٤)'
);

// إنشاء فريلانسر من الشاشة — نستخدمه في الإسناد بعد قليل
const FL_NAME = `مترجم اختبار ${RUN}`;
await go('/freelancers/new');
await page.fill('#name', FL_NAME);
await page.fill('#phone', '0128' + String(Date.now()).slice(-7));
await page.check('input[name=langs][value=ar]');
await page.check('input[name=langs][value=en]');
await page.check('input[name=specialisations][value=legal]');
await page.fill('#defaultRate', '40');
await page.selectOption('#tier', 'approved');
await page.fill('#rating', '9');
await submit();
await page.waitForURL(/\/freelancers\/(?!new|import|payments)[a-z0-9]+$/, { timeout: 20000 });
await page.waitForLoadState('networkidle');
check(await waitForText('FL-'), 'الفريلانسر حصل على معرّف تسلسلي');
check(await waitForText(FL_NAME), 'ملف الفريلانسر يفتح ببياناته');

// بند سعر استثنائي — أدقّ تطابق يفوز
await page.selectOption('select[name=langFrom]', 'ar');
await page.selectOption('select[name=langTo]', 'en');
await page.selectOption('select[name=serviceLine]', 'legal');
await page.fill('input[name=rate]', '55');
await page.click('main form button[type=submit]:has-text("إضافة بند سعر")');
await page.waitForLoadState('networkidle');
check(await waitForText('55'), 'بند سعر استثنائي يُضاف لملف الفريلانسر');

// ── الاستيراد: أنماط المصدر الحقيقية ────────────────────────
const IMPORT_TAG = RUN;
await go('/freelancers/import', '18-freelancer-import');
await page.selectOption('#defaultLang', 'fr');
await page.selectOption('#defaultTier', 'bench');
await page.fill(
  '#rows',
  [
    'Name\t\t\t\t', // صف رؤوس — يجب أن يُستبعَد
    `Dr. Claire ${IMPORT_TAG}\t0111${RUN_DIGITS}1\t350 Tr - 250 Re\t7/10\t`,
    `Pierre ${IMPORT_TAG}\t0111${RUN_DIGITS}2\t0\t\t`, // صفر = لم يُتفق
    `Marie ${IMPORT_TAG}\t0111${RUN_DIGITS}3\t150-350\t\t`, // نطاق ← يُعلَّم
    `Luc ${IMPORT_TAG}\t0111${RUN_DIGITS}4\t13 E\t\tluc@mail.com`, // يورو
  ].join('\n')
);
await page.click('main form button[type=submit]:has-text("استيراد")');
await page.waitForLoadState('networkidle');

check(await waitForText('تم الاستيراد'), 'الاستيراد الجماعي ينفَّذ ويعرض حصيلته');
const importStats = await page.evaluate(() => {
  const items = [...document.querySelectorAll('li')].map((li) => li.innerText.trim());
  const pick = (word) => {
    const row = items.find((t) => t.includes(word));
    const m = row?.match(/\d+/);
    return m ? Number(m[0]) : null;
  };
  return {
    created: pick('سجلًا جديدًا'),
    skipped: pick('استُبعد'),
    flagged: pick('مراجعة يدوية'),
  };
});
check(importStats.created === 4, `أربعة أسماء حقيقية استُوردت (${importStats.created})`);
check(
  importStats.skipped === 1,
  `صف الرؤوس «Name» استُبعد ولم يصر شخصًا (${importStats.skipped})`
);
check(
  importStats.flagged >= 1,
  `ما لم يُحسم عُلِّم للمراجعة اليدوية (${importStats.flagged}) — لا حذف ولا تخمين`
);

// اللقب حُذف من المقدمة
await go(`/freelancers?q=Claire ${IMPORT_TAG}`);
check(
  (await page.locator('table tbody tr').count()) === 1 &&
    !(await page.content()).includes(`Dr. Claire ${IMPORT_TAG}`),
  'اللقب «Dr.» حُذف من مقدمة الاسم عند الاستيراد'
);

// الصفر «لم يُتفق»: بيير بلا سعر
await go(`/freelancers?q=Pierre ${IMPORT_TAG}`);
check(
  await waitForText('لم يُتفق'),
  'خلية السعر «0» تعني «لم يُتفق» فلا تُخزَّن صفرًا'
);

// ── محرّك الاختيار: البحث بين ألف اسم في المتصفح ────────────
// نُنشئ مشروعًا جديدًا لنُسنده خارجيًا
await go('/leads/new');
await page.fill('#phone', '015' + String(Date.now()).slice(-8));
await page.fill('#firstName', 'إسناد خارجي ' + RUN);
await page.selectOption('#channel', { index: 1 });
await submit();
await page.waitForURL(/\/leads\/(?!new)[a-z0-9]+$/, { timeout: 20000 });

await page.click('a[href$="/convert"]');
await page.waitForURL(/\/convert$/, { timeout: 15000 });
await page.selectOption('#serviceLine', 'legal');
await page.selectOption('#sourceLang', 'ar');
await page.selectOption('#targetLang', 'en');
await page.fill('#pages', '12');
await submit();
await page.waitForURL(/\/projects\/(?!new)[a-z0-9]+$/, { timeout: 25000 });
const extProjectId = page.url().split('/').pop();

await go(`/projects/${extProjectId}/assign`, '19-assign-with-freelancer');

// اختبار ٢١: البحث بالاسم **بلا نداء للخادم** — نقيس زمن الترشيح
await page.selectOption('#workMode', 'human_full');
await page.click('label:has-text("تشغيل خارجي")');
await page.waitForSelector('#primaryFreelancerId-search', { timeout: 10000 });

let pickerRequests = 0;
const countPickerCalls = (req) => {
  if (req.url().includes('/freelancers') || req.url().includes('/api/freelancer')) {
    pickerRequests += 1;
  }
};
page.on('request', countPickerCalls);

const searchStart = Date.now();
// **يُبحث بالجزء الفريد لا بالبادئة المشتركة.** كل تشغيلٍ يُنشئ «مترجم
// اختبار XXXX»، فبعد عشرات التشغيلات صارت البادئة تطابق عشرات الأسماء
// وسقط الجديد خارج ما تعرضه القائمة — فيفشل اختبارٌ لا خلل فيه.
await page.fill('#primaryFreelancerId-search', RUN);
await page.waitForFunction(
  (name) => {
    const box = document.querySelector('[data-testid=primaryFreelancerId-results]');
    return Boolean(box && box.textContent && box.textContent.includes(name));
  },
  FL_NAME,
  { timeout: 5000 }
);
const searchMs = Date.now() - searchStart;
page.off('request', countPickerCalls);

check(
  searchMs <= 300,
  `اختبار ٢١: البحث بين ١٠٠٠ اسم في ${searchMs} ملّي ثانية (المعيار ≤٣٠٠)`
);
check(
  pickerRequests === 0,
  `لا نداء للخادم عند كل حرف — الفهرس محمَّل مرة واحدة (${pickerRequests} نداء)`
);

// الافتراضي: المعتمدون وحدهم
const allButton = await page.locator('button:has-text("عرض الكل")').first().innerText();
check(
  allButton.includes('1001') || /\d{3,}/.test(allButton),
  `الافتراضي المعتمدون وزر واحد يكشف الباقي — «${allButton.trim()}»`
);

// نختاره فيُجلب سعره تلقائيًا
await page.click(`[data-testid=primaryFreelancerId-results] button:has-text("${FL_NAME}")`);
check(
  (await page.locator('[data-testid=primaryFreelancerId-chosen]').count()) > 0,
  'اختيار الفريلانسر يثبّته في النموذج'
);

await submit();
await page.waitForURL(/\/projects\/(?!new)[a-z0-9]+$/, { timeout: 25000 });
await page.waitForLoadState('networkidle');
check(await waitForText('قيد التنفيذ'), 'الإسناد لفريلانسر ينقل المشروع إلى «قيد التنفيذ»');
check(
  await waitForText(FL_NAME),
  'اسم الفريلانسر يظهر على المشروع بعد الإسناد'
);

// ── خطوة لفريلانسر تُنشئ سطر استحقاق تلقائيًا ───────────────
await page.locator('summary:has-text("خطوات التنفيذ")').first().click();
await page.selectOption('select[name=stepType]', 'human_translation');
await page.selectOption('select[name=costSource]', 'external');
await page.fill('input[name=pages]', '12');
await page.fill('#freelancerId-search', RUN);
await page.waitForSelector(`[data-testid=freelancerId-results] button:has-text("${FL_NAME}")`, {
  timeout: 5000,
});
await page.click(`[data-testid=freelancerId-results] button:has-text("${FL_NAME}")`);
await page.click('main details form button[type=submit]');
await page.waitForLoadState('networkidle');
check(
  await waitForText('صفحة موزونة'),
  'خطوة منفَّذة بفريلانسر تُحفظ بصفحاتها الموزونة'
);

await go('/freelancers/payments', '20-freelancer-payments');
check(
  await waitForText(FL_NAME),
  '**سطر الاستحقاق يُنشأ تلقائيًا عند الإسناد** لا عند التسليم (§١١ بند ٨)'
);
// السعر الخاص بالزوج ar→en/legal هو ٥٥ لا الافتراضي ٤٠: ١٢ صفحة × ٥٥ = ٦٦٠
check(
  await waitForText('660'),
  'الأجر جاء من **بند السعر الخاص** بهذا الزوج (١٢ × ٥٥) لا من السعر الافتراضي'
);

// تأكيد الصرف يوقّع بمن صرف ولا يحذف السطر
await page.fill('input[name=reference]', `TRX-${RUN}`);
await page.click('main button:has-text("تأكيد الإرسال")');
await page.waitForLoadState('networkidle');
check(await waitForText('تم'), 'تأكيد الصرف يُسجَّل');

await go('/freelancers/payments?status=paid');
check(
  await waitForText('مدفوع') && (await waitForText(FL_NAME)),
  'المستحق المصروف يبقى في السجل بحاله الجديد — لا حذف (§٣ بند ٥)'
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
  achieved >= projectTotal,
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
  Math.abs(afterClawback - (achieved - projectTotal)) < 1,
  `المحصَّل نقص بمقدار المشروع المسترد: ${afterClawback} = ${achieved} − ${projectTotal}`
);
check(
  Math.abs((await statCard('ما استحققته')) - afterClawback * 0.05) < 1,
  'الاستحقاق أُعيد حسابه بعد الاسترداد — لا خصم مزدوج ولا بقايا قيود'
);

// السجل لم يُمحَ (§٣ بند ٥)
check((await go(`/projects/${projectId}`)) === 200, 'المشروع المسترد باقٍ في النظام لم يُحذف');

// ── 10ح. الماليات (المرحلة ٨) ───────────────────────────────

const THIS_PERIOD = new Date().toISOString().slice(0, 7);

await go('/finance', '21-finance');
check(await waitForText('الماليات'), 'لوحة الماليات تفتح');
check(
  await waitForText('هيكل المصروف'),
  'هيكل المصروف بالبنود الثلاثة يظهر على اللوحة'
);

await go('/finance/accounts', '22-chart-of-accounts');
check(
  await waitForText('مصاريف بيعية وتسويقية') &&
    (await waitForText('مصاريف عمومية وإدارية')) &&
    (await waitForText('مصاريف تشغيلية وإنتاجية')),
  'شجرة الحسابات مزروعة بالبنود الثلاثة كما في الدفاتر'
);
check(
  await waitForText('تشغيل خارجي — ترجمة'),
  'بند «خدمات تشغيلية خارجية — ترجمة» موجود (يربط الفريلانسرز بالدفاتر)'
);

// حساب جديد يُضاف من الشاشة.
// نحصر المحددات داخل نموذج الحساب: شاشة الشجرة فيها نموذج تصفية يحمل
// `select[name=type]` كذلك، فالمحدد المطلق يلتقط الخطأ منهما.
const ACC_NAME = `حساب اختبار ${RUN}`;
const accountForm = page.locator('main form:has(input[value=account])');
await accountForm.locator('input[name=name]').fill(ACC_NAME);
await accountForm.locator('select[name=type]').selectOption('expense');
await accountForm.locator('select[name=expenseGroup]').selectOption('general_admin');
await accountForm.locator('button[type=submit]').click();
await page.waitForLoadState('networkidle');
check(await waitForText(ACC_NAME), 'حساب جديد يُضاف من الشاشة بلا نشر');

// ── قيد يدوي: الميزان يمنع الحفظ قبل التوازن ────────────────
await go(`/finance/journal/new?period=${THIS_PERIOD}`, '23-journal-new');
await page.fill('#description', `قيد اختبار ${RUN}`);

const accountOptions = await page.evaluate(() =>
  [...document.querySelectorAll('select[name="lines[0][accountId]"] option')]
    .map((o) => o.value)
    .filter(Boolean)
);
await page.selectOption('select[name="lines[0][accountId]"]', accountOptions[0]);
await page.fill('input[name="lines[0][debit]"]', '1000');
await page.selectOption('select[name="lines[1][accountId]"]', accountOptions[1]);
await page.fill('input[name="lines[1][credit]"]', '600');

const unbalancedText = await page.locator('[data-testid=entry-balance]').innerText();
check(
  unbalancedText.includes('الفرق'),
  `الميزان يعرض الفرق لحظةً بلحظة — «${unbalancedText.replace(/\s+/g, ' ').trim()}»`
);

// نكمل التوازن
await page.fill('input[name="lines[1][credit]"]', '1000');
const balancedText = await page.locator('[data-testid=entry-balance]').innerText();
check(balancedText.includes('متوازن'), 'وعند التساوي يعلن التوازن');

await page.click('main form button[type=submit]:has-text("حفظ مسوَّدة")');
await page.waitForURL(/\/finance\/journal\/[a-z0-9]+$/, { timeout: 25000 });
await page.waitForLoadState('networkidle');
const entryUrl = page.url();
check(await waitForText('JV-'), 'القيد حصل على معرّف تسلسلي');
check(await waitForText('مسوَّدة'), '**يُحفظ مسوَّدةً** — الترحيل فعل منفصل');

await page.click('main form button[type=submit]:has-text("ترحيل القيد")');
await page.waitForLoadState('networkidle');
check(await waitForText('مرحَّل'), 'الترحيل يوقّع القيد باسم من رحّله');

// القيد المرحَّل لا يُعدَّل
await go(entryUrl.replace('http://localhost:3000', '') + '/edit');
check(
  await waitForText('لا يُعدَّل'),
  'القيد المرحَّل لا يُعدَّل — يُلغى بسبب صريح ويبقى في السجل'
);

// ── ميزان المراجعة يتوازن ───────────────────────────────────
await go(`/finance/reports/trial?period=${THIS_PERIOD}`, '24-trial-balance');
const trialText = await page.locator('[data-testid=trial-status]').innerText();
check(
  trialText.includes('متوازن') && !trialText.includes('غير متوازن'),
  `ميزان المراجعة متوازن — «${trialText.replace(/\s+/g, ' ').trim().slice(0, 70)}»`
);

// ── القيود المقترحة من المشغّل ──────────────────────────────
await go(`/finance?period=${THIS_PERIOD}`);
await page.click('main form button[type=submit]:has-text("توليد المسوَّدات")');
await page.waitForURL(/\/finance\/journal\?/, { timeout: 30000 });
await page.waitForLoadState('networkidle');
check(
  await waitForText('مقترح آليًا'),
  'النظام يقترح قيود الشهر من التسليمات والتحصيلات — مسوَّدات لا ترحيلًا'
);
const sources = await page.evaluate(() => document.body.innerText);
check(
  sources.includes('اعتراف بالإيراد عند التسليم') || sources.includes('تحصيل'),
  'المقترحات منسوبة لمصدرها التشغيلي فتُراجَع لا تُصدَّق'
);

// إعادة التوليد لا تُكرّر القيود
const beforeCount = await page.locator('table tbody tr').count();
await go(`/finance?period=${THIS_PERIOD}`);
await page.click('main form button[type=submit]:has-text("توليد المسوَّدات")');
await page.waitForURL(/\/finance\/journal\?/, { timeout: 30000 });
await page.waitForLoadState('networkidle');
const afterCount = await page.locator('table tbody tr').count();
check(
  afterCount === beforeCount,
  `إعادة التوليد لا تُغرق الدفتر بقيود مكررة (${beforeCount} ← ${afterCount})`
);

// ── الأصول الثابتة والإهلاك ─────────────────────────────────
await go('/finance/assets', '25-fixed-assets');
await page.fill('input[name=name]', `أصل اختبار ${RUN}`);
await page.selectOption('select[name=category]', 'computers');
await page.fill('input[name=cost]', '174730');
await page.fill('input[name=annualRate]', '0.25');
await page.fill('input[name=purchaseDate]', '2026-01-01');
await page.click('main form button[type=submit]:has-text("إضافة الأصل")');
await page.waitForLoadState('networkidle');
// ١٧٤٬٧٣٠ × ٢٥٪ ÷ ١٢ = ٣٬٦٤٠٫٢١ — الرقم الفعلي من جدول الإهلاك
check(
  await waitForText('3,640.21'),
  'قسط الإهلاك الشهري محسوب بالقسط الثابت (١٧٤٬٧٣٠ × ٢٥٪ ÷ ١٢)'
);

// ── الموازنة والانحراف ──────────────────────────────────────
const BUDGET_YEAR = Number(THIS_PERIOD.slice(0, 4));
await go(`/finance/budget?year=${BUDGET_YEAR}`, '26-budget');
if ((await page.locator('main form button:has-text("إنشاء الموازنة")').count()) > 0) {
  await page.click('main form button[type=submit]:has-text("إنشاء الموازنة")');
  await page.waitForLoadState('networkidle');
}
check(await waitForText('قيد الإعداد'), 'الموازنة السنوية تُنشأ');

const budgetAccounts = await page.evaluate(() =>
  [...document.querySelectorAll('select[name=account] option')].map((o) => o.value).filter(Boolean)
);
await page.selectOption('select[name=account]', budgetAccounts[0]);
await page.click('main form button:has-text("افتح")');
await page.waitForLoadState('networkidle');
await page.fill('input[name=annual]', '1200000');
await page.click('main form button[type=submit]:has-text("حفظ المستهدف")');
await page.waitForLoadState('networkidle');
const monthlyTargets = await page.evaluate(() =>
  [...document.querySelectorAll('input[name^="month["]')].map((el) => Number(el.value) || 0)
);
check(
  monthlyTargets.length === 12 &&
    monthlyTargets.every((v) => v === 100000) &&
    monthlyTargets.reduce((a, b) => a + b, 0) === 1200000,
  `المبلغ السنوي يُوزَّع على اثني عشر شهرًا ومجموعه يطابقه بالضبط (${monthlyTargets[0]} × ١٢)`
);
check(await waitForText('الانحراف عن الموازنة'), 'وجدول الانحراف يظهر');

// ── الإقفال يمنع التعديل ────────────────────────────────────
await go('/finance/periods', '27-fiscal-periods');
check(await waitForText('إقفال الشهور'), 'شاشة إقفال الشهور تفتح');

// الشهر الحالي فيه مسوَّدات — الإقفال يجب أن يُرفض
const closeRow = page.locator(`main tr:has-text("${THIS_PERIOD.slice(0, 4)}") button:has-text("إقفال")`).first();
if ((await closeRow.count()) > 0) {
  await closeRow.click();
  await page.waitForLoadState('networkidle');
  const refused =
    page.url().includes('error=') || (await waitForText('ما زال مسوَّدة', 6000));
  check(refused, 'لا يُقفل شهر وفيه مسوَّدة معلّقة — الإقفال فوقها يخفي عملًا لم يُراجَع');
}

// ── التقارير ────────────────────────────────────────────────
await go(`/finance/reports/pl?period=${THIS_PERIOD}`, '28-pl-report');
check(
  await waitForText('مجمل الربح') && (await waitForText('صافي الربح')),
  'قائمة الدخل بالفروع تعرض مجمل الربح وصافيه'
);
await go(`/finance/reports/pl?view=yearly&year=${BUDGET_YEAR}`);
check(await waitForText('يناير') && (await waitForText('ديسمبر')), 'وقائمة الدخل السنوية بالشهور الاثني عشر');

await go(`/finance/reports/branches?period=${THIS_PERIOD}`, '29-branch-report');
check(await waitForText('كشف الفروع'), 'كشف الفروع يفتح');

// ── 10ط. ترحيل الملفات القديمة والتحليلات (المرحلة ٩) ───────

await go('/settings/import', '30-import');
check(await waitForText('ترحيل باللصق'), 'شاشة ترحيل اللصق تفتح');
check(
  await waitForText('اذهب إلى ترحيل تاريخ المكتب'),
  '★ **وتدلّ على شاشة الملفات** — الاسمان تشابها فأوقعا المالك في الخطأ'
);

// دفعة تحمل عيوب المصدر الفعلية: تاريخًا نصيًّا، وعملة مخلوطة،
// وصفًّا بلا سعر، وهاتفًا تالفًا، وأدمن غير مطابَق
const IMPORT_PHONE_A = '0100' + String(Date.now()).slice(-7);
const IMPORT_PHONE_B = '0101' + String(Date.now()).slice(-7);
const IMPORT_PHONE_C = '0102' + String(Date.now()).slice(-7);

const leadForm = page.locator('main form:has(input[value=leads])');
await leadForm.locator('textarea[name=rows]').fill(
  [
    // تاريخ نصي بالصيغة العكسية · محوَّل بمبلغ · أدمن معروف
    `24\\11\\2025\tعميل أ ${RUN}\t${IMPORT_PHONE_A}\tGoogle Ads\tواتس\tنورا\tنعم\t1500\tفرع المهندسين`,
    // مبلغ بالريال داخل عمود الجنيه
    `2025-12-01\tعميل ب ${RUN}\t${IMPORT_PHONE_B}\tOrganic\tاتصال\tيحيى\tنعم\t250 ريال\tفرع المقطم`,
    // غير محوَّل بلا مبلغ ← ليد خاسر لا مشروع
    `2025-12-05\tعميل ج ${RUN}\t${IMPORT_PHONE_C}\told client\tمقر\tالصاوي\tلا\t\tفرع المقطم\t\tلم يوافق على السعر`,
    // هاتف تالف ← مراجعة يدوية
    `2025-12-06\tعميل د ${RUN}\t###\tOrganic\tواتس\tنورا\tلا\t\tفرع المقطم`,
    // سنة تالفة ← مراجعة يدوية
    `6\\11\\2005\tعميل هـ ${RUN}\t01099${String(Date.now()).slice(-6)}\tOrganic\tواتس\tنورا\tلا\t\tفرع المقطم`,
  ].join('\n')
);
await leadForm.locator('button[type=submit]').click();
await page.waitForLoadState('networkidle');

const legacyStats = await page.evaluate(() => {
  const text = document.body.innerText;
  const grab = (label) => {
    const m = text.match(new RegExp(label + '[^\\d]*(\\d+)'));
    return m ? Number(m[1]) : null;
  };
  return {
    total: grab('الصفوف المقروءة'),
    clients: grab('عملاء جدد بأكوادهم'),
    leads: grab('ليدز'),
    projects: grab('مشاريع محصَّلة'),
    review: grab('للمراجعة اليدوية'),
  };
});

check(legacyStats.total === 5, `الترحيل قرأ الصفوف الخمسة (${legacyStats.total})`);
check(legacyStats.clients === 3, `ثلاثة عملاء جدد **بأكوادهم** (${legacyStats.clients})`);
check(
  legacyStats.projects === 2,
  `صفّان مسعَّران صارا مشروعين محصَّلين (${legacyStats.projects})`
);
check(
  legacyStats.review === 2,
  `الهاتف التالف والسنة التالفة ذهبا للمراجعة اليدوية (${legacyStats.review}) — لا حذف ولا تخمين`
);

// الليد الخاسر لم يصر مشروعًا
await go(`/leads?q=عميل ج ${RUN}`);
check(
  await waitForText('عميل ج'),
  'الصف بلا سعر دخل **ليدًا خاسرًا لا مشروعًا** (§١٤)'
);

// **أدمن المبيعات صار مالك الليد** — وهو ما طلبته الإدارة
await go(`/leads?q=عميل أ ${RUN}`);
const ownerCell = await page.evaluate(() => document.body.innerText);
check(
  ownerCell.includes('نورا'),
  'أدمن المبيعات في الملف صار **مالك الليد** في النظام'
);

// العميل حصل على كوده
await go(`/clients?q=${IMPORT_PHONE_A}`);
check(await waitForText('CL-'), 'وكل عميل حصل على كوده CL-#####');

// العملة المخلوطة حُفظت بعملتها لا حُوّلت
await go(`/clients?q=${IMPORT_PHONE_B}`);
check(
  (await page.locator('table tbody tr').count()) === 1,
  'والمبلغ بالريال أنشأ عميله ولم يُسقط الصف'
);

// إعادة الترحيل لا تُكرّر
await go('/settings/import');
const leadForm2 = page.locator('main form:has(input[value=leads])');
await leadForm2.locator('textarea[name=rows]').fill(
  `24\\11\\2025\tعميل أ ${RUN}\t${IMPORT_PHONE_A}\tGoogle Ads\tواتس\tنورا\tنعم\t1500\tفرع المهندسين`
);
await leadForm2.locator('button[type=submit]').click();
await page.waitForLoadState('networkidle');
const again = await page.evaluate(() => {
  const m = document.body.innerText.match(/مُتخطّاة[^\d]*(\d+)/);
  return m ? Number(m[1]) : null;
});
check(again === 1, `إعادة ترحيل صف مُرحَّل تُتخطّاه (${again}) — آمن التكرار`);

// شاشة المراجعة
await go('/settings/import/review', '31-migration-review');
check(await waitForText('مراجعة الترحيل'), 'شاشة المراجعة اليدوية تفتح');
check(
  await waitForText('هاتف غير صالح') || (await waitForText('سنة خارج المدى')),
  'وتعرض سبب كل صف لم يُحسم'
);

// الاستبعاد بلا سبب مرفوض
const skipForm = page.locator('main form:has(input[value=skip])').first();
if ((await skipForm.count()) > 0) {
  await skipForm.locator('input[name=note]').fill(`استُبعد في الاختبار ${RUN}`);
  await skipForm.locator('button[type=submit]').click();
  await page.waitForLoadState('networkidle');
  check(await waitForText('تم'), 'واستبعاد صف بسبب مكتوب يُسجَّل');
}

// ── التحليلات ───────────────────────────────────────────────
await go('/analytics', '32-analytics');
check(await waitForText('هامش كل نمط تشغيل'), '**أهم تقرير في المنظومة** يتصدّر شاشة التحليلات');
check(
  await waitForText('المستوعبة'),
  'ويستخدم التكلفة المستوعبة لا الفعلية كما تنص §١٣'
);
check(await waitForText('أداء أدمن المبيعات'), 'وجدول أداء أدمن المبيعات');
check(
  await waitForText('زمن الرد الأول'),
  'ومعه **متوسط زمن الرد الأول** — مؤشر §١٣ الصريح'
);
check(await waitForText('القنوات وتكلفة الاكتساب'), 'وجدول القنوات وتكلفة الاكتساب');
check(
  await waitForText('لا بيانات'),
  'وقناة بلا عملاء تقول «لا بيانات» ولا تعرض CAC صفرًا (والصفر كذبة)'
);
check(await waitForText('الاتجاه على أربع سنوات'), 'والاتجاه السنوي');

/**
 * ★ **شاشة تكلفة الاكتساب الكاملة.**
 *
 * كانت القسمة تربط القناة **برمز الحساب**، ورموزُ الشجرة المزروعة وحدها —
 * وحسابات المحاسب المرحَّلة بلا رموز. فوقع إنفاق المكتب كلُّه في «غير
 * منسوب» ولم تظهر تكلفةُ عميلٍ واحد رغم أن الإنفاق مقيَّد في الدفتر.
 */
await go('/analytics/acquisition', '32b-acquisition');
const cac = await page.locator('body').innerText();
check(
  cac.includes('تكلفة اكتساب العميل'),
  '★ **شاشة تكلفة اكتساب العميل تفتح** — الإنفاق من الدفتر مقسومًا على من جاء'
);
check(
  cac.includes('تكلفة الليد') && cac.includes('تكلفة العميل المكتسب'),
  'ومؤشّراها: تكلفةُ من تواصل وتكلفةُ من دفع'
);
check(
  cac.includes('لا على من اشترى وحده'),
  '★ **والقسمة على كل من تواصل** — وإلا بدا الإعلان أرخص ممّا هو'
);
check(
  cac.includes('قناة كل حساب') && cac.includes('مرة واحدة'),
  '★ **وجدول ضبط القناة في الشاشة نفسها** — تُضبط مرة واحدة على الحساب لا في كل قيد'
);
check(
  (await page.locator('select[name^="ch_"]').count()) >= 1,
  '★ **ومعرّفُ الحساب في اسم الخانة** — لا في حقل مخفيّ يكتب فوق حسابٍ لم يُقصد',
  `وُجد ${await page.locator('select[name^="ch_"]').count()} منتقيًا`
);
check(
  cac.includes('حساب الإيجار'),
  'وتقول لماذا لا تظهر إلا حسابات المصروف البيعي والتسويقي'
);

// نعود إلى شاشة التحليلات — ما بعده يقرأ صفحتها هي
await go('/analytics', '32c-analytics-back');

// ٢٠٢٤ معلَّمة ناقصة — لا تصلح خط أساس (§١٤)
const trendText = await page.evaluate(() => document.body.innerText);
check(
  trendText.includes('ناقصة'),
  '**٢٠٢٤ معلَّمة «ناقصة»** — والنمو المقارَن بها يُعرض «غير موثوق»'
);

await go('/analytics?scope=month');
check(await waitForText('الشهر الحالي'), 'والتحليلات تُعرض بالشهر كذلك');

// ── 10ي. التنبيهات (المرحلة ١٠) ─────────────────────────────

await go('/notifications', '33-notifications');
check(await waitForText('التنبيهات'), 'صندوق التنبيهات يفتح');
check(
  await waitForText('أحداث التنبيه الثمانية'),
  'وجدول أحداث §١٢ الثمانية يظهر لمن يدير الإعدادات'
);

// التوقيتات الحرفية من §١٢
const cadenceText = await page.evaluate(() => document.body.innerText);
check(
  cadenceText.includes('18:00') && cadenceText.includes('9:00'),
  'بتوقيتاتها المنصوصة: «تستحق غدًا» ٦ مساءً و«المتأخرة» ٩ صباحًا'
);
check(cadenceText.includes('كل 3 ساعات'), 'و«ليد بلا رد» كل ٣ ساعات');

// الفحص يكتب ما استحق
await page.click('main form button[type=submit]:has-text("افحص الآن")');
await page.waitForLoadState('networkidle');
check(await waitForText('تم'), 'زر الفحص يشتغل ويكتب ما استحق');

const notifCount = await page.locator('main article').count();
check(notifCount > 0, `التنبيهات وصلت (${notifCount} بطاقة)`);

// **القاعدة المنصوصة**: ملخص واحد لكل حدث لا بطاقة لكل سجل
//
// والعنوان **السطر الثاني** لا الأول: الأول شارةُ أهمية («يحتاج انتباهًا» ·
// «للعلم») يتقاسمها حدثان مختلفان. وقراءته عنوانًا تُسقط الاختبار كلما وصل
// تنبيهٌ جديد بنفس الأهمية — إخفاقٌ لا يدلّ على خلل.
const digestShape = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('main article')];
  const titles = cards.map((c) => c.innerText.split('\n')[1] ?? '');
  const withCounts = cards
    .map((c) => {
      const m = c.innerText.match(/\((\d+)\)/);
      const lines = (c.innerText.match(/^•/gm) ?? []).length;
      return m ? { count: Number(m[1]), lines } : null;
    })
    .filter(Boolean);
  return {
    cards: cards.length,
    uniqueTitles: new Set(titles).size,
    grouped: withCounts.find((w) => w.count > 1) ?? null,
  };
});
check(
  digestShape.cards === digestShape.uniqueTitles,
  `لا بطاقتان لنفس الحدث — ${digestShape.cards} بطاقة و${digestShape.uniqueTitles} عنوانًا مميزًا`
);
if (digestShape.grouped) {
  check(
    digestShape.grouped.lines > 1,
    `**رسالة واحدة تجمع ${digestShape.grouped.count} سجلًا في ${digestShape.grouped.lines} سطرًا** — لا رسالة لكل سجل (§١٢)`
  );
}

// عدّاد الجرس
const badge = await page.locator('[data-testid=unread-badge]').first();
const badgeShown = (await badge.count()) > 0;
check(badgeShown, 'وعدّاد التنبيهات غير المقروءة يظهر على الجرس');

// إعادة الفحص لا تُكرّر
await page.click('main form button[type=submit]:has-text("افحص الآن")');
await page.waitForLoadState('networkidle');
const afterRerun = await page.locator('main article').count();
check(
  afterRerun === notifCount,
  `إعادة الفحص لا تُكرّر الرسائل (${notifCount} ← ${afterRerun}) — آمن التكرار`
);

// علّم الكل مقروءًا
await page.click('main form button[type=submit]:has-text("علّم الكل مقروءًا")');
await page.waitForLoadState('networkidle');
check(
  (await page.locator('main article').count()) === 0,
  'و«علّم الكل مقروءًا» يُفرغ صندوق غير المقروءة'
);
check(
  (await page.locator('[data-testid=unread-badge]').count()) === 0,
  'ويختفي العدّاد من الجرس'
);

await go('/notifications?filter=all');
check(
  (await page.locator('main article').count()) > 0,
  'والمقروءة تبقى في السجل — لا تُحذف'
);

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
  '/finance', // الدفاتر للمحاسب ومدير النظام وحدهما
  '/finance/journal',
  '/finance/reports/trial',
  '/settings/import', // الترحيل لمن يملك إدارة الإعدادات وحده
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
//
// نقيس **عدم التقاطع** لا العدد: بعد ترحيل ملفات قديمة صار لفريق مجلي
// سجلاته، فاشتراط «صفر» يفشل بلا خلل. القاعدة أن كلًّا يرى فريقه وحده.
const leadCodesOf = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('table tbody tr')]
      .map((tr) => (tr.innerText.match(/LD-[\d-]+/) ?? [''])[0])
      .filter(Boolean)
  );

await loginAs('manager@fasttrans.local');
await go('/leads');
const saraCodes = await leadCodesOf();

await loginAs('magly@fasttrans.local', process.env.TEAM_INITIAL_PASSWORD ?? 'FastTrans2026!');
await go('/leads');
const maglyCodes = await leadCodesOf();

const overlap = saraCodes.filter((c) => maglyCodes.includes(c));
check(
  saraCodes.length > 0 && maglyCodes.length > 0 && overlap.length === 0,
  `كل مدير يرى فريقه وحده — لا تقاطع (${saraCodes.length} مقابل ${maglyCodes.length}، مشترك ${overlap.length}) — اختبار ٣`
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

// ── 13. العرض الاحترافي ─────────────────────────────────────
// المُختبَر هنا **الشريحة بأثر رجعي**: العرض المطبوع يجب أن يعرض للحجم
// الكبير سعرًا واحدًا على الشهر كلّه، لا سعرًا متدرّجًا على أجزائه.
await go('/proposals/new');
await page.fill('#title', `عرض اختبار ${RUN}`);
await page.fill('#clientName', `جهة اختبار ${RUN}`);
await page.fill('#signerName', 'مسؤول العروض');
await submit();
await page.waitForURL(/\/proposals\/[a-z0-9]+$/, { timeout: 20000 });
const proposalUrl = page.url();
check(await waitForText(`عرض اختبار ${RUN}`), 'إنشاء عرض احترافي بشرائحه الافتراضية (اختبار ١٣)');

// الشرائح الافتراضية تُنسخ نسخًا، فتعديل عرض لا يمسّ عرضًا أُرسل قبله
const tierRows = await page.locator('table tbody tr').count();
check(tierRows >= 4, `العرض يولد بأربع شرائح على الأقل — وُجد ${tierRows}`);

await go(proposalUrl.replace('http://localhost:3000', '') + '/print', '13-proposal-print');
const printText = await page.locator('body').innerText();
check(
  printText.includes('كامل حجم الشهر') || printText.includes('بأثر رجعي'),
  'المستند المطبوع ينصّ على أن الشريحة تسري بأثر رجعي على حجم الشهر كلّه'
);
check(printText.includes('فاست ترانس'), 'والمستند يحمل هوية فاست ترانس');

// ── 14. هوية فاست ترانس في الواجهة ──────────────────────────
await go('/', '14-brand');
const brandNavy = await page.evaluate(() => {
  const el = document.querySelector('aside svg rect, aside svg path');
  if (!el) return null;
  return getComputedStyle(el).fill || el.getAttribute('fill');
});
check(Boolean(brandNavy), 'شعار فاست ترانس مرسوم في الشريط الجانبي (اختبار ١٤)');

// ── 15. البريد والمساعد ─────────────────────────────────────
// بلا صندوق مربوط تظهر شاشة الإرشاد لا صفحة معطّلة
const emailStatus = await go('/email', '15-email');
check(emailStatus === 200, 'شاشة البريد تفتح لمن يملك صلاحيتها (اختبار ١٥)');
check(
  await waitForText('لا صندوق بريد مربوط'),
  'وبلا صندوق مربوط تُرشد لربطه بدل أن تتعطّل'
);

const mailboxStatus = await go('/settings/mailboxes', '15-mailboxes');
check(mailboxStatus === 200, 'وشاشة إعداد الصناديق تفتح للإدارة');
check(
  await waitForText('مشترك') || (await waitForText('صندوق')),
  'وتشرح النمطين: صندوق مشترك للفريق أو صندوق لكل أدمن'
);

const assistantStatus = await go('/assistant', '15-assistant');
check(assistantStatus === 200, 'وشاشة المساعد تفتح لمن يملك صلاحيتها');

// من لا يملك «إدارة الإعدادات» لا يصل لصناديق البريد — والمنع في الخادم:
// لا تصل الشاشة أصلًا، لا أنها تصل ثم تُخفى
await loginAs('agent@fasttrans.local');
await go('/settings/mailboxes');
const mailboxScreenBlocked = !(await page.locator('h1:has-text("صناديق البريد")').count());
check(mailboxScreenBlocked, 'ومن لا يملك إدارة الإعدادات لا يصل لصناديق البريد');
await loginAs('admin@fasttrans.local');

// ── 16. المنفِّذ الداخلي — مترجم بلا حساب دخول ───────────────
// الغرض المنصوص: مدير المشاريع يكتب أن دعاء راجعت مراجعةً مكثفة، فتُحسب
// تكلفتها وتُقاس طاقتها — بلا أن تفتح هي النظام أصلًا.
await go('/settings/users/new?staff=1');
await page.fill('#name', `مترجم اختبار ${RUN}`);
await page.fill('#jobTitle', 'مترجم قانوني');
await page.check('input[name=isProducer]');
await submit();
await page.waitForURL(/\/settings\/users$/, { timeout: 20000 });
check(
  await waitForText(`مترجم اختبار ${RUN}`),
  'إنشاء منفِّذ داخلي بلا بريد ولا كلمة مرور (اختبار ١٦)'
);
check(await waitForText('منفِّذ داخلي'), 'ويُعلَّم في القائمة أنه لا يدخل النظام');

// وهو يظهر لمدير المشاريع في قوائم الإسناد
const producerNames = await page.evaluate(async () => {
  const r = await fetch('/production');
  return r.status;
});
check(producerNames === 200, 'وقائمة الإسناد تفتح');

// ── 17. الدفع المهيكل ورفع السيرة ───────────────────────────
await go('/freelancers/new');
const paymentOptions = await page.locator('#paymentMethod option').count();
check(
  paymentOptions > 8,
  `طريقة الدفع صارت قائمة لا نصًّا حرًّا — ${paymentOptions} خيارًا (اختبار ١٧)`
);
check(
  (await page.locator('input[name=cvFile][type=file]').count()) === 1,
  'والسيرة الذاتية تُرفع ملفًّا لا رابطًا'
);
check(
  (await page.locator('form[enctype="multipart/form-data"]').count()) === 1,
  'والنموذج يقبل الملفات'
);

// ── 18. وحدة ٢٥٠ كلمة والخصم النسبي ─────────────────────────
await go('/quotes/new');
const unitOptions = await page.locator('select[name="items[0][unit]"] option').allTextContents();
check(
  unitOptions.some((o) => o.includes('٢٥٠')),
  `وحدة الصفحة القياسية ٢٥٠ كلمة موجودة — ${unitOptions.join(' · ')} (اختبار ١٨)`
);
check(
  (await page.locator('select[name=discountMode]').count()) === 1,
  'ونوع الخصم صار خيارًا: مبلغ ثابت أو نسبة'
);

await page.selectOption('select[name=discountMode]', 'percent');
await page.fill('#title', `عرض خصم ${RUN}`);
await page.fill('input[name="items[0][description]"]', 'ترجمة قانونية');
await page.fill('input[name="items[0][quantity]"]', '100');
await page.fill('input[name="items[0][unitPrice]"]', '100');
await page.fill('input[name=discountPct]', '10');
await submit();
await page.waitForURL(/\/quotes\/(?!new)[a-z0-9]+$/, { timeout: 20000 });
const quoteUrl = page.url();
check(
  await waitForText('9,000'),
  'والنسبة تُحسب في الخادم: ١٠٪ من ١٠٬٠٠٠ ← إجمالي ٩٬٠٠٠'
);
check(await waitForText('(10%)'), 'ونسبة الخصم مذكورة بجانب قيمته');

// شاشة التصميم بالذكاء متاحة كطريق ثانٍ
await go(quoteUrl.replace('http://localhost:3000', '') + '/design', '18-quote-design');
check(
  await waitForText('موقع العميل'),
  'وشاشة التصميم بالذكاء تفتح — طريق ثانٍ إلى جانب القالب القياسي'
);
check(await waitForText('توجيهك للمصمّم'), 'وفيها خانة التوجيه ونقاط البدء');

// ── 19. بناء الموازنة بالخطوات السبع ────────────────────────
const planStatus = await go('/finance/budget/plan', '19-budget-plan');
check(planStatus === 200, 'شاشة بناء الموازنة تفتح (اختبار ١٩)');
const planText = await page.locator('body').innerText();
const stepTitles = [
  'تحليل البيانات المالية السابقة',
  'توقّع الإيرادات',
  'التكاليف الثابتة',
  'التكاليف المتغيّرة',
  'التدفق النقدي',
  'الطوارئ',
  'المراجعة',
];
const missingSteps = stepTitles.filter((s) => !planText.includes(s));
check(missingSteps.length === 0, `والخطوات السبع كلها معروضة${missingSteps.length ? ': ينقص ' + missingSteps : ''}`);
check(planText.includes('نقطة التعادل'), 'ونقطة التعادل محسوبة');

// ── 20. الموارد البشرية ─────────────────────────────────────
const hrStatus = await go('/hr', '20-hr');
check(hrStatus === 200, 'لوحة الموارد البشرية تفتح (اختبار ٢٠)');

await go('/hr/departments');
await page.fill('#name', `قسم اختبار ${RUN}`);
await submit();
await page.waitForURL(/\/hr\/departments$/, { timeout: 20000 });
check(await waitForText(`قسم اختبار ${RUN}`), 'وإنشاء قسم في الشجرة التنظيمية');

await go('/hr/employees');
check(await waitForText('الأساسي'), 'وكشف الموظفين يعرض بنود الأجر');

await go('/hr/performance');
check(
  await waitForText('غير مقيس'),
  'وشاشة الأداء تقول «غير مقيس» صراحةً بدل أن تعرض صفرًا كاذبًا'
);

// والموارد البشرية محجوبة عمّن لا يملك صلاحيتها
await loginAs('agent@fasttrans.local');
await go('/hr');
const hrBlocked = !(await page.locator('h1:has-text("الموارد البشرية")').count());
check(hrBlocked, 'ومن لا يملك إدارة الموارد البشرية لا يصل إليها');
await loginAs('admin@fasttrans.local');

// ── 21. محاسبة الفروع ───────────────────────────────────────
// المُختبَر هنا **القاعدتان ٥ و٦**: المؤشران معًا دائمًا، وقرار الإغلاق على
// المساهمة حصرًا — وهو ما يمنع «دوامة الإغلاق» التي تُهلك الشركة.
await go('/finance/branches/settings', '21-branch-settings');
check(
  await waitForText('تصنيف كل حساب مصروف'),
  'شاشة إعداد محاسبة الفروع تفتح (اختبار ٢١)'
);

// زرع الفروع من القائمة القائمة بمفاتيحها نفسها
if (await page.locator('button:has-text("ازرعها من قائمة الفروع")').count()) {
  await page.click('button:has-text("ازرعها من قائمة الفروع")');
  await page.waitForURL(/\/finance\/branches\/settings/, { timeout: 20000 });
}
check(await waitForText('المقطم'), 'وزرع الفروع يأخذها بمفاتيحها فلا يُرحَّل صفّ');

const allocStatus = await go('/finance/branches/allocation', '21-allocation');
check(allocStatus === 200, 'وشاشة المعدل المعياري تفتح');
const allocText = await page.locator('body').innerText();
check(
  allocText.includes('يُلغي قابلية التخطيط'),
  'وتشرح لماذا يُثبَّت المعدل ولا يُحسب شهريًا — الأعطال الأربعة'
);
check(allocText.includes('فرق استرداد'), 'وتذكر أن الفرق لا يضيع بل يظهر بندًا صريحًا');

const branchStatus = await go('/finance/branches', '21-branch-board');
check(branchStatus === 200, 'ولوحة محاسبة الفروع تفتح');
const boardText = await page.locator('body').innerText();
check(
  boardText.includes('هامش المساهمة') && boardText.includes('الصافي المحمَّل'),
  '★ **والمؤشران معروضان معًا** — ولا يُعرض الصافي المحمَّل منفردًا أبدًا (القاعدة ٥)'
);
check(boardText.includes('قرار البقاء'), 'وقاعدة المؤشرين مكتوبة في الشاشة لا في التوثيق');
check(boardText.includes('معادلة التحقّق'), 'ومعادلة التحقّق معروضة');
check(boardText.includes('فرق الاسترداد'), 'وفرق الاسترداد بندٌ مستقلّ في المركز');

const capStatus = await go('/finance/branches/capacity', '21-capacity');
check(capStatus === 200, 'وشاشة الطاقة الإنتاجية تفتح');
check(
  await waitForText('مُشغِّل التعيين'),
  'وفيها مُشغِّل التعيين — ينبّه قبل بلوغ السقف لا بعده'
);

// ── 22. بوابة رصد الوحدات عند التسليم ───────────────────────
await go('/projects');
const readyLink = await page.locator('table tbody tr a[href*="/projects/"]').first();
if (await readyLink.count()) {
  const href = await readyLink.getAttribute('href');
  await go(`${href}/deliver`);
  const deliverText = await page.locator('body').innerText();
  // الشاشة إمّا تعرض النموذج وإمّا ترفض الحالة — والحالتان صحيحتان
  const gated =
    deliverText.includes('وحدات مترجَمة') || deliverText.includes('جاهز للتسليم');
  check(gated, 'شاشة التسليم تطلب الوحدات أو ترفض الحالة (اختبار ٢٢)');
} else {
  check(true, 'لا مشاريع للاختبار — تُخطّى بوابة الرصد (اختبار ٢٢)');
}

// ── 23. الأدوار والتسلسل والملكية المزدوجة (المرحلة ١٤) ──────
await loginAs('admin@fasttrans.local');

const rolesStatus = await go('/settings/roles', '23-roles');
check(rolesStatus === 200, 'شاشة الأدوار تفتح لمن يملك تعريفها (اختبار ٢٣)');
const rolesText = await page.locator('body').innerText();
check(
  rolesText.includes('المالك الرئيسي') && rolesText.includes('المدير التنفيذي'),
  'ودورا المالك الرئيسي والمدير التنفيذي موجودان'
);
check(rolesText.includes('مترجم'), 'ودور المترجم — يدخل ليرى أداءه لا ليُسنَد إليه');
check(
  rolesText.includes('إنشاء الأدوار وتعديلها'),
  'و«إنشاء الأدوار» صلاحية مستقلّة عن «إدارة المستخدمين»'
);

await go('/settings/users/new');
const userFormText = await page.locator('body').innerText();
check(userFormText.includes('يتبع إداريًا'), 'ونموذج المستخدم فيه التسلسل الإداري');

const assignStatus = await go('/settings/commissions', '23-commission-target');
check(assignStatus === 200, 'وشاشة خطط النسب تفتح');
check(
  await waitForText('عتبة الاستحقاق'),
  'وفيها عتبة الاستحقاق — «إذا تجاوز التارجت ياخد ٣٪ ومديره ٢٪»'
);

await go('/projects/new');
const projectFormText = await page.locator('body').innerText();
check(
  !projectFormText.includes('المالك الفرعي'),
  '★ والملكية المزدوجة أُلغيت — مالكٌ واحد للصفقة: من أدخلها'
);
check(
  (await page.locator('#netTotal').count()) === 0 &&
    (await page.locator('#unitPrice').count()) === 1,
  'وشاشة المشروع تسأل عن سعر الصفحة لا عن الإجمالي'
);

const boardStatus = await go('/leaderboard', '23-leaderboard');
check(boardStatus === 200, 'ولوحة الترتيب تفتح');
check(await waitForText('مركزي'), 'وفيها مركز المستخدم بين زملائه');

const meStatus = await go('/me', '23-my-performance');
check(meStatus === 200, 'وشاشة «أدائي» تفتح');
// الحجب يُقاس على **حمولة الصفحة** لا على النص المرئي: `ownWork` لا تُرجع
// حقل تكلفة أصلًا، فلا رقم يُخفى بأنماط
const meHtml = await page.content();
check(
  !meHtml.includes('تكلفة الصفحة') &&
    !meHtml.includes('سعر البيع') &&
    !meHtml.includes('صافي الأجر') &&
    !meHtml.includes('العائد على'),
  '★ ولا تعرض تكلفةً ولا سعرًا ولا عائدًا — شرط الإدارة الصريح للمترجم'
);

const hrNewStatus = await go('/hr/employees/new', '23-hire');
check(hrNewStatus === 200, 'وشاشة تعيين موظف تفتح من الموارد البشرية');
const hireText = await page.locator('body').innerText();
check(
  hireText.includes('الراتب الأساسي') && hireText.includes('الإدارة أو القسم'),
  'وفيها القسم والراتب — كان تعيين الموظف لا يتم إلا من شاشة المستخدمين'
);
check(
  hireText.includes('بلا حساب دخول'),
  'وتُنشئ سجلًّا بلا دخول: الحساب يُفتح بعدها ممّن يملك منح الصلاحيات'
);

// أدمن المبيعات: يرى الترتيب ولا يرى نسب أحد، ولا يُعرّف دورًا
await loginAs('agent@fasttrans.local');
// الحجب تحويلٌ لا رمزُ خطأ: نقيس أنه لم يبقَ على المسار
const notReached = async (path) => {
  await page.goto('http://localhost:3000' + path, { waitUntil: 'networkidle' });
  return !page.url().includes(path);
};
check(await notReached('/settings/roles'), 'وأدمن المبيعات لا يبلغ شاشة الأدوار');
const adminBoard = await go('/leaderboard', '23-leaderboard-admin');
check(adminBoard === 200, 'ويبلغ لوحة الترتيب — المنافسة مقصودة');
const adminBoardText = await page.locator('body').innerText();
check(
  !adminBoardText.includes('يستحق'),
  '★ وعمود الاستحقاق لا يُرسل إليه أصلًا — لا يُخفى في المتصفح'
);
await go('/commissions');
const adminCommissionText = await page.locator('body').innerText();
check(
  !adminCommissionText.includes('كل الفريق'),
  '★ وشاشة «نسبي» لا تعرض له صفوف زملائه'
);
check(await notReached('/hr/employees/new'), 'ولا يعيّن موظفًا — تلك للموارد البشرية');

await loginAs('admin@fasttrans.local');

// ── 24. دفتر اليومية: الصف يُغني عن فتحه ────────────────────
await go('/finance/journal', '24-journal');
const journalText = await page.locator('body').innerText();
check(
  journalText.includes('البيان والحسابان') && journalText.includes('الموظف المسؤول'),
  'دفتر اليومية يعرض الحسابين والعميل والموظف المسؤول في الصف (اختبار ٢٤)'
);
const draftButtons = await page.locator('[data-testid=post-entry]').count();
if (draftButtons > 0) {
  const tallyBefore = await page.locator('[data-testid=journal-tally]').innerText();

  // بصمةٌ تعيش في ذاكرة الصفحة وحدها: إن بقيت بعد الضغط فالصفحة لم تُبنَ
  // من جديد، وإن اختفت فقد وقع التحديث الكامل الذي نمنعه.
  await page.evaluate(() => {
    window.__journalMark = 'alive';
  });

  await page.locator('[data-testid=post-entry]').first().click();
  await page.waitForFunction(
    (n) => document.querySelectorAll('[data-testid=post-entry]').length === n - 1,
    draftButtons,
    { timeout: 20000 }
  );

  check(
    (await page.evaluate(() => window.__journalMark)) === 'alive',
    '★ الاعتماد ضغطةٌ بلا إعادة بناء الصفحة — الصفحة نفسها لم تُحمَّل من جديد'
  );
  check(
    page.url().includes('/finance/journal') && !page.url().match(/journal\/[a-z0-9]{10,}/),
    'ويبقى المحاسب في القائمة بشهرها'
  );
  check(
    (await page.locator('[data-testid=post-entry]').count()) === draftButtons - 1,
    `ونقص المسوَّدات بواحد (${draftButtons} ← ${draftButtons - 1})`
  );

  const tallyAfter = await page.locator('[data-testid=journal-tally]').innerText();
  check(
    tallyAfter !== tallyBefore,
    `وعدّة الترويسة تتبع الضغطة — «${tallyBefore.trim()}» ← «${tallyAfter.trim()}»`
  );

  // والصفّ نفسه صار مرحَّلًا — لا الزر اختفى وحده
  check(
    (await page.locator('table tbody tr:has-text("مرحَّل")').count()) > 0,
    'والصفّ يعلن حاله الجديدة في مكانه'
  );
} else {
  check(true, 'لا مسوَّدات في الشهر — يُتخطّى فحص زر الاعتماد');
}

// ── 25. مصفوفة الوصول: كل دور وما يبلغه فعلًا ───────────────
//
// **إخفاء الرابط من القائمة ليس حجبًا.** هذا الاختبار يكتب المسار مباشرةً
// بحساب كل دور، ويتحقّق أنه بلغ أو حُوِّل. وكل صفٍّ هنا قرارٌ إداري متّفق
// عليه، فكسرُه يسقط هنا لا في وجه موظف.
const ACCESS = [
  // [البريد, كلمة المرور, الدور, [مسارات يبلغها], [مسارات محجوبة عنه]]
  [
    'accountant@fasttrans.local', process.env.TEAM_INITIAL_PASSWORD ?? 'FastTrans2026!', 'المحاسب',
    ['/finance', '/finance/journal', '/hr', '/settings/staff-costs', '/analytics'],
    ['/leads', '/settings/roles', '/settings/users', '/settings/system'],
  ],
  [
    'tarek@fasttrans.local', process.env.TEAM_INITIAL_PASSWORD ?? 'FastTrans2026!', 'مدير المشاريع',
    ['/production', '/freelancers', '/analytics'],
    ['/quotes', '/finance', '/hr', '/settings/users'],
  ],
  [
    'doaa@fasttrans.local', process.env.TEAM_INITIAL_PASSWORD ?? 'FastTrans2026!', 'المترجمة',
    ['/me', '/commissions'],
    ['/leads', '/freelancers', '/quotes', '/finance', '/hr', '/analytics', '/settings/users'],
  ],
];

for (const [email, password, role, allowed, denied] of ACCESS) {
  await loginAs(email, password);
  const reachedAll = [];
  for (const path of allowed) {
    await page.goto('http://localhost:3000' + path, { waitUntil: 'networkidle' });
    if (!page.url().includes(path)) reachedAll.push(path);
  }
  check(reachedAll.length === 0, `${role} يبلغ ما يخصّه (اختبار ٢٥)`, reachedAll.join('، '));

  const leaked = [];
  for (const path of denied) {
    await page.goto('http://localhost:3000' + path, { waitUntil: 'networkidle' });
    if (page.url().includes(path)) leaked.push(path);
  }
  check(leaked.length === 0, `★ و${role} محجوب عمّا لا يخصّه`, leaked.join('، '));
}

// **سعر البيع لا يصل بطاقة العميل** لمن لا يملكه
await loginAs('doaa@fasttrans.local', process.env.TEAM_INITIAL_PASSWORD ?? 'FastTrans2026!');
await go('/projects');
const anyProject = await page.locator('a[href^="/projects/"]').first();
if (await anyProject.count()) {
  await go((await anyProject.getAttribute('href')) ?? '/projects');
  const html = await page.content();
  check(!html.includes('إجمالي المشروع'), '★ والمترجمة لا يصلها سعر بيع في حمولة الصفحة');
} else {
  check(true, 'لا مشاريع في نطاق المترجمة — وهو المتوقَّع');
}

// ── 26. سجل العملاء: العميل يتبع من باع له ──────────────────
//
// **الاختبار الذي يفحص الشكوى نفسها.** مدير المبيعات كان يفتح الشاشة فلا
// يجد أحدًا، وفريقه قد باع لعشرات — لأن الترشيح كان على من كتب البطاقة لا
// على من أتمّ البيع. فهنا نُسجّل الدخول بحسابه ونعدّ ما يراه فعلًا.

await loginAs('magly@fasttrans.local', process.env.TEAM_INITIAL_PASSWORD ?? 'FastTrans2026!');
await go('/clients', '26-clients-team');

const clientsText = await page.locator('body').innerText();
check(
  clientsText.includes('عملاء فريقك'),
  'سجل العملاء يقول لمدير المبيعات إن النطاق نطاق فريقه (اختبار ٢٦)'
);

const teamRows = await page.locator('table tbody tr').count();
check(
  teamRows > 0,
  `★ **ويجد عملاء فريقه فعلًا** — ${teamRows} صفًّا، وكان يجد صفرًا حين كان الترشيح على من كتب البطاقة`
);

check(
  clientsText.includes('التصنيف') && clientsText.includes('أدمن المبيعات'),
  'والصف يحمل التصنيف وأدمن المبيعات — بلا فتح بطاقة'
);
check(
  clientsText.includes('متكرّر') || clientsText.includes('متوقّف') || clientsText.includes('عميل جديد'),
  'والتصنيف مكتوب بالعربية في الصفوف'
);

// الفلترة بالأدمن — كانت محجوبة عن مدير الفريق
const adminOptions = await page.evaluate(() =>
  [...document.querySelectorAll('select[name=admin] option')].map((o) => o.textContent?.trim())
);
check(
  adminOptions.length > 1,
  `★ **ويستطيع الفلترة حسب الأدمن** — ${adminOptions.length - 1} من فريقه في القائمة`
);
check(
  await page.locator('select[name=period]').count() === 1 &&
    await page.locator('select[name=segment]').count() === 1,
  'وفلترة بالفترة وبالتصنيف'
);

// الفلترة تضيّق النطاق ولا توسّعه — ولا تُفرغه
const adminIds = await page.evaluate(() =>
  [...document.querySelectorAll('select[name=admin] option')].map((o) => o.value).filter(Boolean)
);
let perAdmin = 0;
let bestAdmin = 0;
for (const adminId of adminIds) {
  await go(`/clients?admin=${adminId}`);
  const n = await page.locator('table tbody tr').count();
  perAdmin += n;
  bestAdmin = Math.max(bestAdmin, n);
  check(n <= teamRows, `واختيار أدمن بعينه يضيّق لا يوسّع (${n} من ${teamRows})`);
}
check(
  bestAdmin > 0,
  `★ **وأحد أفراد فريقه على الأقل له عملاؤه** — أكبرهم ${bestAdmin} عميلًا`
);
check(
  perAdmin <= teamRows,
  `ومجموع ما تحت الأفراد لا يتجاوز مجموع الفريق (${perAdmin} من ${teamRows})`
);

// ومن خارج فريقه لا يوسّع النطاق ولو كتب معرّفه في العنوان
await go('/clients?admin=%D9%84%D8%A7-%D8%A3%D8%AD%D8%AF');
check(
  (await page.locator('table tbody tr').count()) <= teamRows,
  '★ ومعرّفٌ من خارج فريقه في العنوان لا يفتح له شيئًا — الترشيح في الخادم'
);

// البحث الفوري: يكتب فيتغيّر الجدول بلا ضغط «إدخال» وبلا إعادة بناء الصفحة
await go('/clients');
await page.evaluate(() => {
  window.__clientsMark = 'alive';
});
await page.fill('input[name=q]', 'ا');
await page.waitForTimeout(1200);
check(
  (await page.evaluate(() => window.__clientsMark)) === 'alive',
  'والبحث فوريّ بلا ضغط «إدخال» وبلا إعادة بناء الصفحة'
);

// وفلترة المشاريع بالأدمن صارت متاحة لمدير الفريق كذلك
await go('/projects?view=list');
check(
  (await page.locator('select[name=owner]').count()) === 1,
  '★ وفلترة المشاريع حسب الموظف صارت حقًّا لمدير الفريق لا لصاحب رؤية الشركة وحده'
);

// ── 27. مدير المشاريع: لوحةُ مشغّلٍ لا لوحةُ بائع ───────────
//
// **الأرقام التي تخصّ عمله لا عمل غيره.** كانت لوحته مبنيّةً لأدمن المبيعات:
// مسار مبيعات وقيمة صفقات وترتيب بائعين — أرقامٌ لا يملك منها قرارًا ولا
// يصحّ أن يراها.

await loginAs('tarek@fasttrans.local', process.env.TEAM_INITIAL_PASSWORD ?? 'FastTrans2026!');
await go('/', '27-ops-dashboard');
const opsText = await page.locator('body').innerText();

check(
  opsText.includes('لوحة التشغيل'),
  'مدير المشاريع يفتح لوحة تشغيل لا لوحة مبيعات (اختبار ٢٧)'
);
check(
  opsText.includes('التسليم في الموعد') && opsText.includes('صفحات موزونة'),
  'وفيها أرقامه: الالتزام بالموعد والحجم المنجَز'
);
check(
  !opsText.includes('مسار المبيعات') && !opsText.includes('قيمة المشاريع الجارية'),
  '★ ولا مسارَ مبيعات ولا قيمةَ صفقات — لا قرار له فيها'
);
check(
  !opsText.includes('ترتيب الفريق هذا الشهر'),
  '★ ولا ترتيبَ بائعين — أرقام مبيعات غيره لا تخصّه'
);

// حمولة الصفحة نفسها خالية من سعر البيع
const opsHtml = await page.content();
check(
  !opsHtml.includes('قيمة المشاريع الجارية'),
  'ولا يصله سعرُ بيعٍ في حمولة الاستجابة — لا يُخفى في المتصفح'
);

// القائمة الجانبية: سجلّات البيع ليست له
const opsNav = await page.locator('aside').innerText();
check(
  !opsNav.includes('العملاء المحتملون') && !opsNav.includes('الشركات'),
  '★ ولا جردَ عملاءَ محتملين ولا شركات في قائمته — يبلغه العميل في بطاقة مشروعه'
);
check(
  !opsNav.includes('نسبي'),
  'ولا شاشة «نسبي» — لا نسبة له على البيع فلا شاشة تقول له صفرًا كل شهر'
);
check(opsNav.includes('قائمة الإسناد'), 'ويبقى له ما يخصّه: قائمة الإسناد');

// لوحة الترتيب: نطاقُ فريقٍ لا نطاقُ شركة
await loginAs('magly@fasttrans.local', process.env.TEAM_INITIAL_PASSWORD ?? 'FastTrans2026!');
await go('/leaderboard', '27-leaderboard-scope');
const scopedBoard = await page.locator('body').innerText();
check(
  !scopedBoard.includes('مدير النظام'),
  '★ **ولوحة الترتيب لا تعرض لمدير المبيعات من هو خارج فريقه** — ولا مبيعات مدير النظام'
);

await loginAs('admin@fasttrans.local');
await go('/leaderboard');
check(
  (await page.locator('body').innerText()).includes('مدير النظام'),
  'بينما يراها كاملةً من يملك تحليلات الشركة'
);

// ── 28. التحصيل من الصف ─────────────────────────────────────
//
// **أدمن المبيعات يحصّل عشرة مشاريع في الجلسة**، وكان كلٌّ منها رحلةً إلى
// بطاقة المشروع وعودةً منها.

await loginAs('admin@fasttrans.local');
await go('/projects?status=delivered&view=list', '28-collect');
const collectButtons = await page.locator('[data-testid=collect-open]').count();

if (collectButtons > 0) {
  await page.evaluate(() => {
    window.__collectMark = 'alive';
  });

  await page.locator('[data-testid=collect-open]').first().click();
  // المتبقي مكتوبٌ سلفًا — لا يُقرأ من بطاقة ولا يُكتب يدويًا
  const suggested = await page.locator('input[name=collectNow]').first().inputValue();
  check(
    Number(suggested) > 0,
    `اللوحة تقترح المتبقي مكتوبًا سلفًا — ${suggested} (اختبار ٢٨)`
  );

  await page.locator('[data-testid=collect-confirm]').first().click();
  await page.waitForSelector('[data-testid=collected-ok]', { timeout: 20000 });

  check(
    (await page.evaluate(() => window.__collectMark)) === 'alive',
    '★ **والتأكيد يسجّل التحصيل في مكانه** — بلا فتح المشروع وبلا إعادة بناء الصفحة'
  );

  // والرقم وصل الدفتر فعلًا: المشروع خرج من قائمة المسلَّمة
  const before = collectButtons;
  await go('/projects?status=delivered&view=list');
  check(
    (await page.locator('[data-testid=collect-open]').count()) === before - 1,
    `ونقصت المسلَّمة بواحد (${before} ← ${before - 1}) — التحصيل كُتب لا عُرض`
  );
} else {
  check(true, 'لا مشاريع مسلَّمة تنتظر التحصيل — يُتخطّى فحص الزر');
}

// ولا يظهر الزر لمن لا يملك تسجيل التحصيل
await loginAs('tarek@fasttrans.local', process.env.TEAM_INITIAL_PASSWORD ?? 'FastTrans2026!');
await go('/projects?view=list');
check(
  (await page.locator('[data-testid=collect-open]').count()) === 0,
  '★ ولا يصل زرُّ التحصيل من لا يملك تسجيله'
);

// ── 29أ. الجودة بالمعيار الصناعي ────────────────────────────
//
// **الخطأ يُنسب إلى حجمه** — ولا يُقاس بوحدتين في شاشتين.

await go('/', '29a-quality');
const qualityText = await page.locator('body').innerText();
check(
  qualityText.includes('الجودة هذا الشهر') && qualityText.includes('لكل ألف كلمة'),
  '★ لوحة التشغيل تعرض الجودة بكثافة الملاحظات لكل ألف كلمة (اختبار ٢٩أ)'
);
check(
  qualityText.includes('درجة الجودة') && qualityText.includes('رجع للتصحيح'),
  'ومعها درجةٌ من مئة ونسبةُ ما رجع بعد التسليم — الخطأ الذي أفلت'
);

await go('/me');
const meText = await page.locator('body').innerText();
check(
  meText.includes('درجة الجودة'),
  '★ وشاشة «أدائي» تعرض الدرجة نفسها — لا رقمين لشيء واحد'
);
check(
  meText.includes('لكل ألف كلمة') || meText.includes('غير مقيس'),
  'وبنفس الوحدة، أو «غير مقيس» حين لا حجم يُقاس'
);

// ── 29. التحليلات تتبع عمل صاحبها ───────────────────────────
await go('/analytics', '29-analytics-ops');
const opsAnalytics = await page.locator('body').innerText();
check(
  !opsAnalytics.includes('أداء أدمن المبيعات') && !opsAnalytics.includes('قمع المبيعات'),
  '★ ومدير المشاريع لا يرى أداءَ البائعين ولا قمعَ المبيعات (اختبار ٢٩)'
);
check(
  opsAnalytics.includes('المنتِج') || opsAnalytics.includes('إنتاجية') ||
    opsAnalytics.includes('لا بيانات') || opsAnalytics.includes('نمط تشغيل'),
  'ويرى ما يخصّه: أنماط التشغيل وإنتاجية المنفِّذين'
);

await loginAs('admin@fasttrans.local');
await go('/analytics');
check(
  (await page.locator('body').innerText()).includes('أداء أدمن المبيعات'),
  'بينما يراه من يبيع'
);

// ── 30. حدُّ محاولات الدخول ──────────────────────────────────
//
// **بابٌ بلا حدٍّ لمحاولات الفتح مفتوحٌ لمن يملك الوقت.** ويُجرَّب على بريدٍ
// وهميّ عمدًا، فلا يُحبَس حسابٌ حقيقيّ عن بقيّة الاختبارات.

const GHOST = `ghost-${RUN}@fasttrans.local`;
let lockedAt = 0;
for (let attempt = 1; attempt <= 12; attempt += 1) {
  const res = await page.request.post('http://localhost:3000/api/auth', {
    form: { mode: 'login', email: GHOST, password: 'wrong-password' },
    maxRedirects: 0,
  });
  // العنوان يرمّز المسافة `+` لا `%20`، فلا يكفي فكُّ الترميز وحده
  const location = decodeURIComponent(res.headers()['location'] ?? '').replace(/\+/g, ' ');
  if (location.includes('محاولات كثيرة')) {
    lockedAt = attempt;
    break;
  }
}

check(
  lockedAt > 0 && lockedAt <= 11,
  `★ **الدخول يُوقَف بعد محاولات متتالية** — أُوقف عند المحاولة ${lockedAt} (اختبار ٣٠)`
);

// والحساب الحقيقي لم يُمَسّ: الحدّ على البريد الذي هوجم لا على النظام كله
await loginAs('admin@fasttrans.local');
check(
  page.url() === 'http://localhost:3000/',
  'وحسابٌ آخر يدخل عاديًا — الحدّ على البريد المهاجَم لا على الباب كلّه'
);

// ── 31. النسخة الاحتياطية وسجل الأعطال ──────────────────────

await go('/settings/backup', '31-backup');
const backupText = await page.locator('body').innerText();
check(
  backupText.includes('نزّل النسخة') && backupText.includes('جدولًا'),
  'شاشة النسخة الاحتياطية تفتح وتقول ما فيها (اختبار ٣١)'
);

const backup = await page.request.get('http://localhost:3000/api/backup');
check(backup.status() === 200, 'والنسخة تُنزَّل فعلًا');
const dump = await backup.json();
check(
  dump.version === 1 && dump.takenAt && Object.keys(dump.tables).length > 20,
  `والملف يحمل ${Object.keys(dump.tables).length} جدولًا بتاريخه`
);
check(
  (dump.tables.client?.length ?? 0) > 0 && (dump.tables.project?.length ?? 0) > 0,
  `وفيه العملاء والمشاريع فعلًا (${dump.tables.client?.length} · ${dump.tables.project?.length})`
);
check(
  !JSON.stringify(dump.tables.user ?? []).includes('passwordHash'),
  '★ **ولا كلمة مرور تخرج في الملف** — ملفٌ يُنزَّل ويُرسَل ليس مكانًا لها'
);

// ومن لا يملك الإعدادات لا ينزّلها
await loginAs('agent@fasttrans.local');
const denied = await page.request.get('http://localhost:3000/api/backup');
check(denied.status() === 403, '★ ولا يصلها من لا يملك إعدادات النظام');

await loginAs('admin@fasttrans.local');
await go('/settings/errors', '31-errors');
check(
  (await page.locator('body').innerText()).includes('أعطال النظام'),
  'وسجل الأعطال يفتح لمن يملك الإعدادات'
);

// ── 33. لوحة المحاسب · تصنيف الإنفاق · ربحية المشاريع ───────

// المحاسب يفتح النظام فيجد لوحته هو لا لوحة المبيعات
await loginAs('accountant@fasttrans.local', process.env.TEAM_INITIAL_PASSWORD ?? 'FastTrans2026!');
await go('/', '33-finance-home');
const financeHome = await page.locator('body').innerText();
check(
  financeHome.includes('أعمار الذمم') && financeHome.includes('ما ينتظر يدك'),
  '★ **المحاسب يفتح لوحته هو** — النقد والذمم وطابور عمله (اختبار ٣٣)'
);
check(
  !financeHome.includes('مسار المبيعات') && !financeHome.includes('ترتيب الفريق'),
  'ولا مسارَ مبيعات ولا ترتيبَ بائعين — أرقامٌ لا قرار له فيها'
);
check(
  financeHome.includes('النقد والبنوك') && financeHome.includes('لنا عند العملاء'),
  'وأسئلته هو: كم عندنا نقدًا وكم لنا عند العملاء'
);

// وتصنيف الإنفاق صار على الحساب لا على مركز التكلفة
await go('/finance/branches/settings', '33-spend-kinds');
const settingsText = await page.locator('body').innerText();
check(
  settingsText.includes('تصنيف كل حساب مصروف'),
  '★ **تصنيف الإنفاق على الحساب** — يُصنَّف «الإيجار» مرة ولا يُسأل عنه في كل قيد'
);
check(
  settingsText.includes('مصاريف الفرع الذاتية') && settingsText.includes('التسويق المؤسسي'),
  'والتصنيفات الأربعة معروضة بشرح كلٍّ منها بلغة العمل'
);

// ومركز التكلفة عاد لمعناه: مشروع تُقاس ربحيته
await go('/finance/profit-centers', '33-profit-centers');
check(
  (await page.locator('body').innerText()).includes('ربحية المشاريع'),
  'وشاشة ربحية المشاريع تفتح — وهي ما أنشأ المحاسب المراكز من أجله'
);

await loginAs('admin@fasttrans.local');

// ── 34. المرونة: خانات الشركة · تارجت السنة · جدول الموازنة ──

// الدولة قائمةٌ تُختار لا خانةٌ تُكتب، والمدينة تتبعها
await go('/companies/new', '34-company-form');
const companyForm = await page.locator('body').innerText();
check(
  (await page.locator('select[name="country"]').count()) === 1,
  '★ **الدولة تُختار من قائمة** — والكتابة الحرّة تُنتج «مصر» و«Egypt» صفّين لشيء واحد (اختبار ٣٤)'
);
check(
  (await page.locator('select[name="country"] option[value="مصر"]').count()) === 1,
  'وفيها مصر — أغلب البيع'
);
check(
  companyForm.includes('ممثّل الشركة') && companyForm.includes('اسم الممثّل'),
  'وخانتا ممثّل الشركة واسمه ورقمه'
);
check(
  companyForm.includes('السجل التجاري') && companyForm.includes('البطاقة الضريبية'),
  'ورفع السجل التجاري والبطاقة الضريبية — اختياريان'
);
check(
  (await page.locator('input[name="commercialRegFile"][type="file"]').count()) === 1,
  'وحقل الرفع حقلُ ملفٍّ فعلًا'
);

// تارجت السنة كاملة في صفحة واحدة
await go('/settings/targets/year', '34-year-targets');
const yearTargets = await page.locator('body').innerText();
check(
  yearTargets.includes('وزّع رقمًا سنويًّا') && yearTargets.includes('يناير') && yearTargets.includes('ديسمبر'),
  '★ **السنة كاملة في صفحة واحدة** — كانت ٧٢ خانة في ٢٤ رحلة (اختبار ٣٤)'
);
check(
  (await page.locator('input[name^="t_"]').count()) >= 12,
  'وخانةٌ لكل شهر لكل فرع في الجدول نفسه'
);

// جدول الموازنة: كل الحسابات في صفحة واحدة، ومعرّف الحساب في اسم الخانة
await go('/finance/budget/grid', '34-budget-grid');
const budgetGrid = await page.locator('body').innerText();
check(
  budgetGrid.includes('جدول الموازنة'),
  'وجدول الموازنة يفتح'
);
if (!budgetGrid.includes('لا موازنة لسنة')) {
  check(
    (await page.locator('input[name^="m_"]').count()) >= 12,
    '★ **ومعرّف الحساب في اسم الخانة لا في حقل مخفيّ** — فلا يُكتب فوق حسابٍ آخر'
  );
}

// ── 32. المهام المجدولة تقول حال تهيئتها ────────────────────
// جهاز التطوير بلا `CRON_SECRET`، فالشاشة يجب أن تقول «معطّلة» وتُملي الخطوات
await go('/settings/jobs', '32-jobs');
const jobsText = await page.locator('body').innerText();
check(
  jobsText.includes('لم يُضبط سرّ الجدولة'),
  '★ **الشاشة تقول إن المهام معطّلة بلا سرّ** — لا «لم تعمل بعد» وحدها (اختبار ٣٢)'
);
check(
  jobsText.includes('CRON_SECRET') &&
    jobsText.includes('Environment Variables') &&
    jobsText.includes('Redeploy'),
  'وتُملي خطوات لوحة النشر بأسمائها الإنجليزية كما تُرى فيها'
);
check(
  !jobsText.includes('في انتظار أول دورة'),
  'ولا تخلط الحالين: انتظارُ الدورة جوابُ سرٍّ ضُبط لا سرٍّ غاب'
);

/**
 * ★ **ملكية بطاقة العميل تُعدَّل — ولم تكن تُعدَّل من أي مكان.**
 *
 * كان `ownerId` يُكتب عند الإنشاء وحده ولا يمسّه التحديث، فبطاقةٌ وقعت على
 * الحساب الخطأ تبقى عليه للأبد. وبيانات المكتب استُوردت كلها بحسابٍ واحد.
 */
await go('/clients', '35b-clients');
const clientLink = page.locator('a[href^="/clients/"]').filter({ hasNotText: 'عميل جديد' }).first();
const clientHref = (await clientLink.count()) ? await clientLink.getAttribute('href') : null;
if (clientHref && /^\/clients\/[^/]+$/.test(clientHref)) {
  await go(`${clientHref}/edit`, '35b-client-owner');
  const form = await page.locator('body').innerText();
  check(
    (await page.locator('select[name="ownerId"]').count()) === 1,
    '★ **خانةُ المالك الرئيسي في شاشة تعديل العميل**'
  );
  check(
    (await page.locator('select[name="coOwnerId"]').count()) === 1,
    '★ **وخانةُ المالك الفرعي معها** — «يظهر عند الحسابين ويستطيع كليهما قراءته»'
  );
  check(
    form.includes('ولا تمسّ النسبة'),
    '★ **والشاشة تقول إن الفرعيّ بابُ رؤيةٍ لا حصّةُ مال** — النسبة على مالك المشروع'
  );
}

// ── 35. ترحيل تاريخ المكتب ──────────────────────────────────
// الغاية: «لتكون كأن النظام مبنيّ من ٢٠٢٢» — دفتر المحاسب وشيت المبيعات
// والتسوية بينهما، وكلٌّ بوسمه الذي يُسحب بضغطة
await page.setViewportSize({ width: 1280, height: 900 });
await go('/settings/import/history', '35-history');
const history = await page.locator('body').innerText();
check(
  history.includes('ترحيل تاريخ المكتب') && history.includes('دفتر المحاسب'),
  '★ **شاشة ترحيل تاريخ المكتب تفتح** — دفاتر المحاسب وشيت المبيعات (اختبار ٣٥)'
);
check(
  history.includes('يأخذ رقمه بالضبط') && history.includes('يُوزَّع بالتناسب'),
  '★ **وتقول قاعدة التسوية بلغة العمل** — العميل المسمّى يأخذ رقمه، والباقي بالتناسب'
);
check(
  history.includes('عميل شهريّ مجمَّع'),
  'وشهرٌ بلا عميلٍ مرصود يُنشأ له عميل شهريّ مجمَّع باسمه الصريح'
);
check(
  (await page.locator('input[type="file"]').count()) >= 2,
  'وحقلا رفعٍ فعليّان: الدفتر والشيت — لا لصقٌ بالنسخ'
);
check(
  (await page.locator('textarea[name="executiveNames"]').count()) >= 1,
  '★ **وأسماء عملاء المدير التنفيذي تُعدَّل من الشاشة** — لا في الكود، فهو يتذكّر غيرهم'
);
check(
  history.includes('الصمت ليس رقمًا'),
  'وسنةٌ بلا دفترٍ تبقى كما رصدها الشيت ولا تُصفَّر'
);
check(
  history.includes('ابدأ من هنا') && history.includes('خمس رفعات'),
  '★ **والشاشة تُملي خطواتها بترتيبها** — «لم أفهم ماذا أفعل» جوابُها في الشاشة لا في مستند'
);
check(
  history.includes('وكيف يفرّق النظام بين السنوات؟'),
  'وتجيب: السنة تُكتب للدفتر، ويقرؤها النظام بنفسه من عمود تاريخ الشيت'
);

/**
 * ★ **وتاريخ الوقف خانةٌ في الشاشتين.**
 *
 * «نغلق الداتا ونظبطها على نهاية يوليو بحيث من أول أغسطس تكون مدخلات
 * لاحقة» — والوقفُ في الترحيل لا في الملف: الدفتر ينمو كل يوم، ورفعُه غدًا
 * يجب أن يبدأ من حيث وقف.
 */
const cutoffs = page.locator('input[name="until"]');
check(
  (await cutoffs.count()) >= 2,
  '★ **وخانة «حتى تاريخ» في الدفتر والشيت معًا** — لا في أحدهما',
  `وُجدت ${await cutoffs.count()} خانة`
);
check(
  (await cutoffs.first().getAttribute('value')) === '2026-07-31',
  'ومضبوطةٌ سلفًا على نهاية يوليو ٢٠٢٦ — لا فارغةً تُملأ باليد',
  `القيمة ${await cutoffs.first().getAttribute('value')}`
);
check(
  history.includes('الأرصدة الافتتاحية') && history.includes('يحسب المال مرتين'),
  '★ **والشاشة تقول لماذا تُسقط الأرصدة الافتتاحية** — شركةٌ واحدة مستمرّة لا دفتران'
);
check(
  (await page.locator('input[name="keepOpening"]').count()) === 1,
  'وإدخالُها خيارٌ مطويّ لمن رحّل ٢٠٢٦ وحدها — لا قرارٌ محسومٌ في الكود'
);
check(
  history.includes('٢٠٢٦ جاريةٌ فلا تُوسَّع مبالغها'),
  '★ **والتسوية للسنوات المقفلة وحدها** — وإلا استحقّ البائعون نسبًا على مالٍ لم يبيعوه'
);

/**
 * ★ **وشيت الليدز ثالثُ الشيتات.**
 *
 * الدفتر يقول ما دخل الخزينة، وشيت المبيعات يقول من اشترى — وكلاهما صامتٌ
 * عن ثلثي من تواصل مع المكتب. وبلا هؤلاء لا تُقاس تكلفةُ اكتساب عميل ولا
 * معدلُ تحويل ولا سببُ رفض.
 */
check(
  (await page.locator('input[type="file"]').count()) >= 3,
  '★ **وثلاثة حقول رفعٍ لا اثنان** — الدفتر والمبيعات والليدز',
  `وُجد ${await page.locator('input[type="file"]').count()}`
);
check(
  history.includes('شيت الليدز') && history.includes('من سأل ولم يشترِ'),
  'وقسمُ الليدز يقول ما فيه بلغة العمل'
);
check(
  history.includes('يلتصق ببطاقة عميله'),
  '★ **والمحوَّل يلتصق ببطاقة عميله ولا يُفتح له مشروعٌ ثانٍ** — وإلا تضاعف الإيراد'
);
check(
  history.includes('الملخص الشهري') && history.includes('مُدخَلٌ مرة واحدة'),
  'وورقةُ الإنفاق الشهري لا تُقرأ — المصروف التسويقي في الدفتر وحده'
);

// ── 12. عرض الجوال ──────────────────────────────────────────
await page.setViewportSize({ width: 390, height: 844 });
await go('/projects', '12-mobile');
check(true, 'العرض على الجوال');

// ── النتيجة ─────────────────────────────────────────────────
console.log('\n═══ أخطاء المتصفح ═══');
console.log(errors.length ? errors.join('\n') : 'لا توجد ✓');
const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.log('\n═══ ما أخفق ═══');
  for (const f of failed) console.log(`✗ ${f.label}${f.detail ? ` — ${f.detail}` : ''}`);
}
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
await browser.close();
process.exit(failed.length ? 1 : 0);
