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
  if (m.type() === 'error' && !m.text().includes('favicon')) errors.push('CONSOLE: ' + m.text());
});
page.on('requestfailed', (r) => {
  errors.push(`REQFAILED: ${r.method()} ${r.url()} -> ${r.failure()?.errorText}`);
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
  ['/deals', '03-deals-board'],
  ['/deals?view=list', null],
  ['/companies', '04-companies'],
  ['/companies?q=النور', null],
  ['/contacts', null],
  ['/tasks', '05-tasks'],
  ['/quotes', null],
  ['/settings', null],
  ['/settings/users', '06-users'],
]) {
  if ((await go(p, n)) !== 200) allOk = false;
}
check(allOk, 'كل الأقسام تفتح بنجاح (10 صفحات)');

// ── 3. إنشاء عميل محتمل ─────────────────────────────────────
await go('/leads/new');
await page.fill('#firstName', 'اختبار');
await page.fill('#lastName', RUN);
await page.fill('#companyName', 'شركة الاختبار ' + RUN);
await page.fill('#email', 'test@example.com');
await page.selectOption('#serviceInterest', 'ترجمة معتمدة');
await page.fill('#estimatedValue', '5000');
await submit();
await page.waitForURL(/\/leads\/(?!new)[a-z0-9]+$/, { timeout: 20000 });
await page.waitForLoadState('networkidle');
check(true, 'إنشاء عميل محتمل');
await page.screenshot({ path: `${shots}/07-lead-detail.png`, fullPage: true });

// ── 4. تحويله إلى صفقة ──────────────────────────────────────
await page.click('a[href$="/convert"]');
await page.waitForURL(/\/convert$/, { timeout: 15000 });
await page.fill('#dealAmount', '5000');
await submit();
await page.waitForURL(/\/deals\/(?!new)[a-z0-9]+$/, { timeout: 25000 });
await page.waitForLoadState('networkidle');
check(true, 'تحويل العميل المحتمل إلى صفقة + شركة + جهة اتصال');
const dealUrl = page.url();
const dealId = dealUrl.split('/').pop();
await page.screenshot({ path: `${shots}/08-deal-detail.png`, fullPage: true });

// ── 5. إضافة ملاحظة ─────────────────────────────────────────
await page.fill('textarea[name=body]', `ملاحظة ${RUN}: العميل طلب تسليمًا عاجلاً.`);
await page.click('main form[action="/api/notes"] button[type=submit]');
await page.waitForLoadState('networkidle');
check(await waitForText(`ملاحظة ${RUN}`), 'إضافة ملاحظة على الصفقة تظهر فورًا');

// ── 6. تغيير مرحلة الصفقة ───────────────────────────────────
await page.click('main button:has-text("تفاوض")');
const stageUpdated = await page
  .waitForFunction(
    () => document.querySelector('dl dd')?.textContent?.trim() === 'تفاوض',
    undefined,
    { timeout: 15000, polling: 250 }
  )
  .then(() => true)
  .catch(() => false);
check(stageUpdated, 'تغيير مرحلة الصفقة إلى «تفاوض» ينعكس فورًا');

// ── 7. عرض سعر مع حساب تلقائي ───────────────────────────────
await go(`/quotes/new?dealId=${dealId}`);
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

// ── 8. تغيير حالة العرض ينقل الصفقة تلقائيًا ────────────────
await page.click('main button:has-text("مقبول")');
await page.waitForTimeout(2500);
await go(dealUrl.replace('http://localhost:3000', ''));
check(
  (await page.locator('dd >> text=تفاوض').count()) > 0,
  'قبول عرض السعر يحدّث الصفقة تلقائيًا'
);

// ── 9. مهمة مرتبطة + إنجازها ────────────────────────────────
const dealPath = dealUrl.replace('http://localhost:3000', '');
await go(`/tasks/new?dealId=${dealId}&redirectTo=${dealPath}`);
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
await page.selectOption('select[name=source]', 'لينكدإن');
const filtered = await page
  .waitForURL(/source=/, { timeout: 10000 })
  .then(() => true)
  .catch(() => false);
check(filtered, 'الفلترة بقائمة منسدلة تُطبَّق فورًا');

await go('/deals?stage=NEGOTIATION');
check((await page.locator('table tbody tr, .card').count()) > 0, 'الفلترة حسب المرحلة');

// ── 11. صلاحيات: موظف المبيعات يرى سجلاته فقط ───────────────
await page.goto('http://localhost:3000/');
await page.click('aside form button[type=submit]'); // خروج
await page.waitForURL(/\/login/, { timeout: 15000 });
await page.fill('#email', 'agent@fasttrans.local');
await page.fill('#password', 'ChangeMe123!');
await page.click('button[type=submit]');
await page.waitForURL('http://localhost:3000/', { timeout: 15000 });
const settingsStatus = await page.goto('http://localhost:3000/settings', { waitUntil: 'networkidle' });
check(!page.url().includes('/settings'), 'موظف المبيعات محجوب عن الإعدادات');

await go('/deals', '11-agent-view');
const agentDeals = await page.locator('table tbody tr').count();
await go('/deals?view=list');
check(true, `موظف المبيعات يرى صفقاته فقط (عددها ${await page.locator('table tbody tr').count()})`);

// ── 12. عرض الجوال ──────────────────────────────────────────
await page.setViewportSize({ width: 390, height: 844 });
await go('/deals', '12-mobile');
check(true, 'العرض على الجوال');

// ── النتيجة ─────────────────────────────────────────────────
console.log('\n═══ أخطاء المتصفح ═══');
console.log(errors.length ? errors.join('\n') : 'لا توجد ✓');
const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
await browser.close();
process.exit(failed.length ? 1 : 0);
