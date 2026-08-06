/**
 * اختبار قياس الجودة.
 *
 * **رقمٌ يُقاس به إنسان يُختبر بأرقامه الحرفية.** درجةُ جودةٍ محسوبةٌ خطأً
 * تظلم مترجمًا في شاشةٍ يفتحها مديرُه كل شهر.
 *
 * التشغيل:  npm run test:quality
 */
import {
  DEFAULT_TARGET_DENSITY,
  DEFAULT_PENALTY_PER_ERROR,
  errorDensity,
  qualityScore,
  qualityBand,
  reworkRate,
  qualitySummary,
  QUALITY_BANDS,
} from '../src/lib/quality.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}

console.log('\n── ١ · كثافة الأخطاء ────────────────────────────────\n');

check(
  errorDensity(5, 5000) === 1,
  '★ **المعيار الصناعي: الخطأ يُنسب إلى حجمه** — ٥ أخطاء في ٥٠٠٠ كلمة = ١ في الألف'
);
check(errorDensity(0, 5000) === 0, 'وبلا خطأ واحد الكثافة صفر — وهو قياسٌ لا غياب');
check(
  errorDensity(5, 0) === null,
  '★ **وبلا حجمٍ مقيس لا كثافة** — «لم يُقَس» لا «صفر أخطاء»'
);
check(errorDensity(3, 1500) === 2, '٣ أخطاء في ١٥٠٠ كلمة = ٢ في الألف');

console.log('\n── ٢ · الدرجة ───────────────────────────────────────\n');

check(DEFAULT_TARGET_DENSITY === 1, 'الهدف خطأٌ واحد لكل ألف كلمة — حدّ الترجمة المعتمدة');
check(DEFAULT_PENALTY_PER_ERROR === 10, 'وكل خطأ في الألف يخصم عشر درجات');
check(qualityScore(0) === 100, 'بلا خطأ: ١٠٠');
check(qualityScore(1) === 90, 'وخطأٌ في الألف: ٩٠');
check(qualityScore(3) === 70, 'وثلاثة: ٧٠');
check(qualityScore(10) === 0, 'وعشرة: صفر');
check(
  qualityScore(40) === 0,
  '★ **والصفر قاعُ المقياس** — أربعون خطأً في الألف لا تُنتج درجةً سالبة'
);
check(qualityScore(null) === null, 'وغيرُ المقيس يبقى غير مقيس');
check(qualityScore(2, 5) === 90, 'والعقوبة إعدادٌ يضبطه المكتب — بخمسٍ تصير ٩٠');

console.log('\n── ٣ · الشرائح ──────────────────────────────────────\n');

check(qualityBand(100).key === 'excellent', '١٠٠ ممتاز');
check(qualityBand(95).key === 'excellent', '★ وبلوغُ الحدّ يكفي — ٩٥ ممتاز لا جيد');
check(qualityBand(94.9).key === 'good', 'و٩٤٫٩ جيد');
check(qualityBand(70).key === 'fair', 'و٧٠ مقبول');
check(qualityBand(69).key === 'poor', 'و٦٩ دون المستوى');
check(qualityBand(0).key === 'poor', 'والصفر دون المستوى');
check(qualityBand(null) === null, '★ و«غير مقيس» ليست شريحة — لا تُلوَّن ولا تُصنَّف');
check(
  QUALITY_BANDS.every((b) => b.label && b.tone),
  'وكل شريحة لها اسمٌ عربي وحكم'
);

console.log('\n── ٤ · نسبة الإعادة ─────────────────────────────────\n');

check(reworkRate(2, 10) === 20, 'مشروعان من عشرة رجعا = ٢٠٪');
check(reworkRate(0, 10) === 0, 'وبلا إعادة صفر');
check(
  reworkRate(1, 0) === null,
  'وبلا تسليمٍ لا نسبة'
);

console.log('\n── ٥ · الخلاصة ──────────────────────────────────────\n');

const rows = [
  { qaIssues: 2, pages: 40, words: null, isRework: false }, // ١٠٬٠٠٠ كلمة
  { qaIssues: 0, pages: 8, words: null, isRework: false }, // ٢٬٠٠٠ كلمة
  { qaIssues: 1, pages: 2, words: null, isRework: true }, // ٥٠٠ كلمة
];
const sum = qualitySummary(rows, { wordsPerPage: 250 });

check(sum.words === 12_500 && sum.issues === 3, 'الكلمات ١٢٬٥٠٠ والملاحظات ٣');
check(
  sum.density === 0.2,
  `★ **الكثافة على المجموع لا كمتوسّطٍ للمتوسّطات** — ${sum.density} في الألف`
);

// لو حُسبت متوسّطًا للمتوسّطات لكانت (0.2 + 0 + 2) ÷ 3 = 0.73 — أي أربعة
// أضعاف الحقيقة، لأن مستندًا من صفحتين يساوي مشروعًا من أربعين
const naive = (0.2 + 0 + 2) / 3;
check(
  Math.abs(naive - 0.73) < 0.01 && sum.density < naive,
  `ومتوسّط المتوسّطات كان سيقول ${naive.toFixed(2)} — يكفي خطأٌ في مستندٍ صغير ليهبط تقييم شهر`
);

check(sum.score === 98, `والدرجة ٩٨ — جاءت ${sum.score}`);
check(sum.band.key === 'excellent', 'والشريحة ممتاز');
check(sum.reworked === 1 && sum.reworkPct === 33.3, 'ونسبة الإعادة ٣٣٫٣٪ من ثلاثة');
check(
  sum.cleanPct === 33.3,
  `ونسبة ما سُلّم بلا ملاحظة واحدة ٣٣٫٣٪ — جاءت ${sum.cleanPct}`
);

// الكلمات المسجَّلة صراحةً تسبق المشتقّة من الصفحات
const explicit = qualitySummary([{ qaIssues: 1, pages: 4, words: 5000, isRework: false }], {
  wordsPerPage: 250,
});
check(
  explicit.words === 5000,
  '★ والكلمات المسجَّلة تسبق المشتقّة من الصفحات — القياس أولى من التقدير'
);

const empty = qualitySummary([]);
check(
  empty.density === null && empty.score === null && empty.reworkPct === null,
  'وبلا مشاريع لا رقم يُخترع'
);

const noPages = qualitySummary([{ qaIssues: 3, pages: 0, words: null, isRework: false }]);
check(
  noPages.density === null && noPages.measured === 0,
  'ومشروعٌ بلا صفحات مسجّلة يخرج من القياس ولا يُحسب صفرًا'
);

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
