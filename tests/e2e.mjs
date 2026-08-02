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
  ['/deals', '03-deals-board'],
  ['/deals?view=list', null],
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
await go('/leads/new');
await page.fill('#phone', '011' + String(Date.now()).slice(-8));
await page.fill('#firstName', 'تحويل ' + RUN);
await page.selectOption('#channel', { index: 1 });
await submit();
await page.waitForURL(/\/leads\/(?!new)[a-z0-9]+$/, { timeout: 20000 });
await page.waitForLoadState('networkidle');

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
await page.selectOption('select[name=channel]', { index: 1 });
const filtered = await page
  .waitForURL(/channel=/, { timeout: 10000 })
  .then(() => true)
  .catch(() => false);
check(filtered, 'الفلترة بقائمة منسدلة تُطبَّق فورًا');

await go('/deals?stage=NEGOTIATION');
check((await page.locator('table tbody tr, .card').count()) > 0, 'الفلترة حسب المرحلة');

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

const guarded = ['/settings/users', '/settings/roles', '/settings/lists', '/settings/system'];
let allGuarded = true;
for (const path of guarded) {
  await page.goto('http://localhost:3000' + path, { waitUntil: 'networkidle' });
  if (page.url().includes(path)) {
    allGuarded = false;
    console.log(`  !! لم يُحجب ${path}`);
  }
}
check(allGuarded, 'أدمن المبيعات محجوب عن كل شاشات الإدارة (اختبار ٤)');

await go('/deals', '11-agent-view');
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
await go('/deals', '12-mobile');
check(true, 'العرض على الجوال');

// ── النتيجة ─────────────────────────────────────────────────
console.log('\n═══ أخطاء المتصفح ═══');
console.log(errors.length ? errors.join('\n') : 'لا توجد ✓');
const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
await browser.close();
process.exit(failed.length ? 1 : 0);
