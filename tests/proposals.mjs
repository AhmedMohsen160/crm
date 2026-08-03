/**
 * اختبار عروض الأسعار — بالأرقام الحرفية من عرض «Tristar Group KSA».
 *
 * أخطر ما هنا **قاعدة الشريحة بأثر رجعي**: هي عكس شرائح النسب في §٦ تمامًا،
 * والخلط بينهما يغيّر الفاتورة بآلاف الريالات في الاتجاه الخطأ.
 *
 * التشغيل:  npm run test:proposals
 */
import {
  WORDS_PER_STANDARD_PAGE,
  wordsToPages,
  pagesToWords,
  ratePerWord,
  tierFor,
  volumeRow,
  volumeTable,
  quoteBatch,
  turnaroundFor,
  commercialTerms,
  DEFAULT_TIERS,
} from '../src/lib/proposals.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}
function eq(actual, expected, label) {
  check(actual === expected, label, `نتج ${JSON.stringify(actual)} والمتوقع ${JSON.stringify(expected)}`);
}
function near(actual, expected, label, tol = 0.01) {
  check(Math.abs(actual - expected) < tol, label, `نتج ${actual} والمتوقع ${expected}`);
}

console.log('\n── الصفحة القياسية ───────────────────────────────────');

eq(WORDS_PER_STANDARD_PAGE, 250, 'الصفحة القياسية ٢٥٠ كلمة مصدر');
eq(wordsToPages(250), 1, '٢٥٠ كلمة ← صفحة');
eq(wordsToPages(100000), 400, 'و١٠٠ ألف كلمة ← ٤٠٠ صفحة');
// الالتزام المكتوب: صفحة ممسوحة بستين كلمة تُحاسَب بستين لا بصفحة كاملة
near(wordsToPages(60), 0.24, 'وصفحة ممسوحة بستين كلمة ← ٠٫٢٤ صفحة لا صفحة كاملة');
eq(wordsToPages(0), 0, 'وصفر ← صفر');
eq(wordsToPages(-100), 0, 'وسالب ← صفر لا سالب');
eq(pagesToWords(4), 1000, 'والعكس: ٤ صفحات ← ١٠٠٠ كلمة');
near(ratePerWord(20), 0.08, 'سعر الكلمة مشتق من سعر الصفحة: ٢٠ ÷ ٢٥٠ = ٠٫٠٨');

console.log('\n── الشرائح الأربع من عرض Tristar ─────────────────────');

eq(tierFor(DEFAULT_TIERS, 50_000)?.ratePerPage, 20, '٥٠ ألف كلمة ← السعر القياسي ٢٠ ريالًا');
eq(tierFor(DEFAULT_TIERS, 100_000)?.ratePerPage, 20, 'و١٠٠ ألف بالضبط ما زالت قياسية');
eq(tierFor(DEFAULT_TIERS, 100_001)?.ratePerPage, 18, 'و١٠٠٬٠٠١ تدخل الشريحة الكمّية ١٨');
eq(tierFor(DEFAULT_TIERS, 250_000)?.ratePerPage, 18, 'و٢٥٠ ألفًا آخر الكمّية');
eq(tierFor(DEFAULT_TIERS, 250_001)?.ratePerPage, 16, 'و٢٥٠٬٠٠١ تدخل المؤسسية ١٦');
eq(tierFor(DEFAULT_TIERS, 999_999)?.ratePerPage, 16, 'و٩٩٩٬٩٩٩ آخر المؤسسية');
eq(tierFor(DEFAULT_TIERS, 1_000_000)?.ratePerPage, 15, 'والمليون تدخل الشريك الاستراتيجي ١٥');
eq(tierFor(DEFAULT_TIERS, 5_000_000)?.ratePerPage, 15, 'وما فوقها يبقى ١٥ — «فما فوق»');
eq(tierFor(DEFAULT_TIERS, 0)?.ratePerPage, 20, 'وصفر ← القياسي لا انهيار');
eq(tierFor([], 500_000), null, 'وبلا شرائح ← null لا تخمين');

console.log('\n── **بأثر رجعي على كل حجم الشهر** ────────────────────');

// ٢٠٠ ألف كلمة = ٨٠٠ صفحة. بالأثر الرجعي: ٨٠٠ × ١٨ = ١٤٬٤٠٠
const retro = volumeRow(DEFAULT_TIERS, 200_000, 0.15);
eq(retro.pages, 800, '٢٠٠ ألف كلمة = ٨٠٠ صفحة');
eq(retro.ratePerPage, 18, 'وسعرها ١٨');
eq(retro.total, 14400, '**والإجمالي ٨٠٠ × ١٨ = ١٤٬٤٠٠ — كل الحجم بالسعر المخفَّض**');

// لو كانت تصاعدية جزئية (كشرائح النسب) لكان: 400×20 + 400×18 = 15,200
check(
  retro.total !== 15200,
  'وليس ١٥٬٢٠٠ التي تنتج من الشريحة التصاعدية الجزئية — القاعدتان متعاكستان'
);
eq(retro.saving, 1600, 'والوفر مقابل السعر القياسي ٨٠٠ × ٢ = ١٬٦٠٠');
near(retro.vat, 2160, 'وضريبة ١٥٪ = ٢٬١٦٠');
near(retro.totalWithVat, 16560, 'والإجمالي شاملًا الضريبة ١٦٬٥٦٠');

// حالة الشريك الاستراتيجي: مليون كلمة = ٤٠٠٠ صفحة × ١٥ = ٦٠٬٠٠٠
const strategic = volumeRow(DEFAULT_TIERS, 1_000_000, 0.15);
eq(strategic.pages, 4000, 'مليون كلمة = ٤٠٠٠ صفحة');
eq(strategic.total, 60000, 'وإجمالها ٦٠٬٠٠٠ ريال');
eq(strategic.saving, 20000, 'ووفرها ٢٠٬٠٠٠ — ٤٠٠٠ × ٥ ريالات');
eq(strategic.discountPct, 25, 'وخصمها ٢٥٪');

// الحد الأدنى: أقل من الشريحة الأولى لا يُنتج سعرًا أرخص
const small = volumeRow(DEFAULT_TIERS, 1000, 0.15);
eq(small.ratePerPage, 20, 'والحجم الصغير يظل بالسعر القياسي');
eq(small.saving, 0, 'وبلا وفر — فلا خصم يُوهَم به');

const table = volumeTable(DEFAULT_TIERS, [300_000, 50_000, 150_000], 0.15);
eq(table.length, 3, 'جدول الأمثلة يعرض ما طُلب');
eq(table[0].words, 50_000, 'مرتَّبًا تصاعديًا مهما كان ترتيب الإدخال');
eq(volumeTable(DEFAULT_TIERS, [0, -5], 0.15).length, 0, 'والأحجام غير الصالحة تُستبعد');

console.log('\n── تسعير دفعة واحدة ──────────────────────────────────');

const batch = quoteBatch({ words: 5000, ratePerPage: 20, vatRate: 0.15 });
eq(batch.pages, 20, 'خمسة آلاف كلمة = ٢٠ صفحة');
eq(batch.net, 400, 'وصافيها ٤٠٠ ريال');
near(batch.vat, 60, 'وضريبتها ٦٠');
near(batch.total, 460, 'وإجماليها ٤٦٠');

// **الحد الأدنى صفحة**: التزام مكتوب في العرض
const tiny = quoteBatch({ words: 60, ratePerPage: 20, vatRate: 0.15 });
near(tiny.pages, 0.24, 'مستند بستين كلمة = ٠٫٢٤ صفحة');
eq(tiny.billablePages, 1, 'لكن المحاسَب صفحة كاملة — الحد الأدنى المكتوب');
eq(tiny.net, 20, 'فصافيه ٢٠ لا ٤٫٨');

eq(quoteBatch({ words: 0, ratePerPage: 20, vatRate: 0.15 }).net, 20, 'ودفعة فارغة تُحاسَب الحد الأدنى');

console.log('\n── مدد التنفيذ من جدول العرض ─────────────────────────');

eq(turnaroundFor(3000), '١–٢ يوم عمل', 'حتى ٥٠٠٠ كلمة');
eq(turnaroundFor(5000), '١–٢ يوم عمل', 'و٥٠٠٠ بالضبط');
eq(turnaroundFor(5001), '٢–٤ أيام عمل', 'و٥٠٠١ تنتقل للنطاق التالي');
eq(turnaroundFor(15000), '٢–٤ أيام عمل', 'و١٥ ألفًا آخره');
eq(turnaroundFor(30000), '٥–٨ أيام عمل', 'و٣٠ ألفًا');
eq(
  turnaroundFor(80000),
  'خطة تسليم مجدولة تُتفق قبل البدء',
  'وما فوق الخمسين ألفًا **لا يُوعَد بمدة ثابتة** — الوعد بلا خطة يُخلَف'
);

console.log('\n── البنود التجارية ───────────────────────────────────');

const terms = commercialTerms({
  currency: 'ريال سعودي',
  vatPct: 15,
  validityDays: 30,
  entity: 'فاست ترانس — الرياض',
  paymentDays: 30,
});
eq(terms.length, 7, 'سبعة بنود تجارية');
check(terms.some((t) => t.value.includes('250')), 'ووحدة التسعير تذكر الصفحة القياسية ٢٥٠ كلمة');
check(terms.some((t) => t.value.includes('15')), 'والضريبة مذكورة صراحةً');
check(terms.some((t) => t.value.includes('30 يومًا')), 'ومدة الصلاحية والسداد');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
