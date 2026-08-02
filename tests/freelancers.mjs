/**
 * اختبار وحدة الفريلانسرز — بالأنماط الحرفية التي رصدتها المواصفة في
 * ملف الفريلانسرز الفعلي (§١٤ المصدر ج).
 *
 * أهمية هذه الاختبارات: الاستيراد الساذج لهذا الملف بعينه يُدخل شخصًا
 * اسمه «Name»، ويحسب أسعار الساعة كأنها أسعار صفحة، ويقرأ الصفر «مجانًا»
 * فيُنتج هامشًا ١٠٠٪ صامتًا. كل سطر هنا يمنع خطأ من هذه.
 *
 * التشغيل:  npm run test:freelancers
 */
import {
  cleanName,
  normalizeSearch,
  matchesQuery,
  resolveRate,
  freelancerStepCost,
  rankFreelancers,
  parseRateCell,
  parseRatingCell,
  isHeaderRow,
  mergeKey,
  mergeMultiValue,
} from '../src/lib/freelancers.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}
function eq(actual, expected, label) {
  check(actual === expected, label, `نتج ${JSON.stringify(actual)} والمتوقع ${JSON.stringify(expected)}`);
}
function near(actual, expected, label, tolerance = 0.01) {
  check(Math.abs(actual - expected) < tolerance, label, `نتج ${actual} والمتوقع ${expected}`);
}

console.log('\n── تنظيف الأسماء ─────────────────────────────────────');

eq(cleanName('  أحمد   محمد  '), 'أحمد محمد', 'المسافات الزائدة تُضغط');
eq(cleanName('د أحمد سمير'), 'أحمد سمير', 'اللقب «د» يُحذف من المقدمة');
eq(cleanName('Dr. Sara Ali'), 'Sara Ali', 'اللقب الإنجليزي يُحذف');
eq(cleanName('مهندس خالد'), 'خالد', 'اللقب «مهندس» يُحذف');
eq(cleanName('نورا~ حسن'), 'نورا حسن', 'الرمز ~ يُنظَّف');
eq(cleanName('علي\nحسن'), 'علي حسن', 'السطر داخل الخلية يصير مسافة');
// الحاسم: من اسمه يبدأ بحروف اللقب لا يفقد اسمه
eq(cleanName('محمد دراز'), 'محمد دراز', 'اسم يحوي حروف لقب في وسطه لا يُمسّ');
eq(cleanName('دنيا حمدان'), 'دنيا حمدان', '«دنيا» ليست لقبًا — الاسم كما هو');
eq(cleanName('د'), 'د', 'اللقب وحده لا يُفرغ الحقل');

console.log('\n── البحث الفوري ──────────────────────────────────────');

eq(normalizeSearch('أحمد'), 'احمد', 'الهمزة تُوحَّد');
eq(normalizeSearch('هبة'), 'هبه', 'التاء المربوطة تُوحَّد');
eq(normalizeSearch('مصطفى'), 'مصطفي', 'الألف المقصورة تُوحَّد');
check(matchesQuery('أحمد مجلي', 'احمد'), 'البحث بلا همزة يجد الاسم بهمزة');
check(matchesQuery('هبة الله سيد', 'هبه سيد'), 'كل كلمة في العبارة تُطابق ولو تفرّقت');
check(!matchesQuery('أحمد مجلي', 'احمد سمير'), 'كلمة غير موجودة تُسقط النتيجة');
check(matchesQuery('Donia Hamdan', 'donia'), 'البحث اللاتيني غير حسّاس لحالة الأحرف');
check(matchesQuery('أي اسم', ''), 'البحث الفارغ يُبقي الجميع');

console.log('\n── حلّ السعر: أدقّ تطابق يفوز ────────────────────────');

const fl = { defaultRate: 100, rateUnit: 'page', currency: 'EGP' };
const RATES = [
  { langFrom: 'ar', langTo: 'en', serviceLine: null, stepType: null, rate: 150, rateUnit: 'page', currency: 'EGP' },
  { langFrom: 'ar', langTo: 'en', serviceLine: 'legal', stepType: null, rate: 200, rateUnit: 'page', currency: 'EGP' },
  { langFrom: 'ar', langTo: 'en', serviceLine: 'legal', stepType: 'heavy_review', rate: 90, rateUnit: 'page', currency: 'EGP' },
  { langFrom: null, langTo: null, serviceLine: 'medical', stepType: null, rate: 250, rateUnit: 'page', currency: 'EGP' },
];

eq(
  resolveRate(fl, RATES, { langFrom: 'ar', langTo: 'en' }).rate,
  150,
  'زوج اللغة وحده يطابق البند الأعمّ'
);
eq(
  resolveRate(fl, RATES, { langFrom: 'ar', langTo: 'en', serviceLine: 'legal' }).rate,
  200,
  'إضافة خط الخدمة تنقل إلى البند الأدقّ'
);
eq(
  resolveRate(fl, RATES, { langFrom: 'ar', langTo: 'en', serviceLine: 'legal', stepType: 'heavy_review' }).rate,
  90,
  'أدقّ بند (لغتان + خط خدمة + نوع خطوة) يفوز على الجميع'
);
eq(
  resolveRate(fl, RATES, { serviceLine: 'medical' }).rate,
  250,
  'البند الذي يترك اللغة فارغة يعني «أي لغة» فيطابق'
);
eq(
  resolveRate(fl, RATES, { langFrom: 'fr', langTo: 'de' }).rate,
  100,
  'بلا بند مطابق ← السعر الافتراضي'
);
eq(
  resolveRate(fl, RATES, { langFrom: 'fr', langTo: 'de' }).source,
  'default',
  'ويُعلن أن مصدره الافتراضي لا استثناء'
);

// **الأهم**: الصفر يعني «لم يُتفق» لا «مجاني» (§١٧ بند ١٦)
eq(
  resolveRate({ defaultRate: 0, rateUnit: 'page', currency: 'EGP' }, [], {}).rate,
  null,
  'سعر افتراضي صفر ← null لا صفر (الصفر «لم يُتفق» لا «مجاني»)'
);
eq(
  resolveRate({ defaultRate: null, rateUnit: 'page', currency: 'EGP' }, [], {}).source,
  'none',
  'بلا سعر إطلاقًا ← المصدر «لا شيء» ليُرفع التنبيه'
);
eq(
  resolveRate({ defaultRate: 0, rateUnit: 'page', currency: 'EGP' }, RATES, { serviceLine: 'medical' }).rate,
  250,
  'الاستثناء يُنقذ من ليس له سعر افتراضي'
);

console.log('\n── تكلفة الخطوة بوحدة الأجر ──────────────────────────');

near(freelancerStepCost({ rate: 100, rateUnit: 'page', pages: 20, wordsPerPage: 250 }), 2000, 'بالصفحة: ٢٠ × ١٠٠');
near(
  freelancerStepCost({ rate: 0.5, rateUnit: 'word', pages: 10, wordsPerPage: 250 }),
  1250,
  'بالكلمة: ١٠ صفحات × ٢٥٠ كلمة × ٠٫٥'
);
near(
  freelancerStepCost({ rate: 250, rateUnit: 'word_250', pages: 10, wordsPerPage: 250 }),
  2500,
  'بـ٢٥٠ كلمة: عشر وحدات × ٢٥٠'
);
// الحاسم: أجر الساعة لا يُضرب في الصفحات
near(
  freelancerStepCost({ rate: 300, rateUnit: 'hour', pages: 40, wordsPerPage: 250, units: 3 }),
  900,
  'بالساعة: ٣ ساعات × ٣٠٠ — والصفحات لا تدخل الحساب إطلاقًا'
);
near(
  freelancerStepCost({ rate: 5000, rateUnit: 'project', pages: 80, wordsPerPage: 250 }),
  5000,
  'بالمشروع: مبلغ مقطوع مهما بلغت الصفحات'
);
near(
  freelancerStepCost({ rate: null, rateUnit: 'page', pages: 20, wordsPerPage: 250 }),
  0,
  'بلا سعر ← صفر (ويرافقه تنبيه مفتوح في المشروع)'
);

console.log('\n── الترتيب الخماسي ───────────────────────────────────');

const POOL = [
  { id: 'a', name: 'الأرخص المخزون', tier: 'bench', effectiveRate: 50, rating: 10, projectsCount: 99, lastUsedAt: '2026-07-01' },
  { id: 'b', name: 'معتمد غالٍ', tier: 'approved', effectiveRate: 300, rating: 5, projectsCount: 1, lastUsedAt: null },
  { id: 'c', name: 'معتمد أرخص', tier: 'approved', effectiveRate: 100, rating: 5, projectsCount: 1, lastUsedAt: null },
  { id: 'd', name: 'معتمد بنفس السعر أعلى تقييمًا', tier: 'approved', effectiveRate: 100, rating: 9, projectsCount: 1, lastUsedAt: null },
  { id: 'e', name: 'معتمد بلا سعر', tier: 'approved', effectiveRate: null, rating: 10, projectsCount: 50, lastUsedAt: '2026-07-30' },
];

const ranked = rankFreelancers(POOL).map((f) => f.id);
eq(ranked[0], 'd', 'المعتمد الأرخص الأعلى تقييمًا أولًا');
eq(ranked[1], 'c', 'ثم المعتمد الأرخص بتقييم أقل');
eq(ranked[2], 'b', 'ثم المعتمد الأغلى');
eq(ranked[3], 'e', 'من بلا سعر يذهب لآخر شريحته — سعر مجهول ليس رخيصًا');
eq(ranked[4], 'a', 'والمخزون بعد المعتمدين مهما كان أرخص وأعلى تقييمًا');

const tieA = [
  { id: 'y', name: 'ياسر', tier: 'approved', effectiveRate: 100, rating: 5, projectsCount: 2, lastUsedAt: null },
  { id: 'x', name: 'أحمد', tier: 'approved', effectiveRate: 100, rating: 5, projectsCount: 2, lastUsedAt: null },
];
eq(
  rankFreelancers(tieA)[0].id,
  'x',
  'التعادل في الخمسة يُحسم بالاسم — فلا تتراقص القائمة بين فتحتين'
);

const byProjects = [
  { id: 'few', name: 'أ', tier: 'approved', effectiveRate: 100, rating: 8, projectsCount: 3, lastUsedAt: null },
  { id: 'many', name: 'ب', tier: 'approved', effectiveRate: 100, rating: 8, projectsCount: 40, lastUsedAt: null },
];
eq(rankFreelancers(byProjects)[0].id, 'many', 'عند تساوي السعر والتقييم: الأكثر عملًا معنا أولًا');

const byRecency = [
  { id: 'old', name: 'أ', tier: 'approved', effectiveRate: 100, rating: 8, projectsCount: 5, lastUsedAt: '2025-01-01' },
  { id: 'new', name: 'ب', tier: 'approved', effectiveRate: 100, rating: 8, projectsCount: 5, lastUsedAt: '2026-07-01' },
];
eq(rankFreelancers(byRecency)[0].id, 'new', 'وأخيرًا: الأحدث تعاملًا');

eq(rankFreelancers([]).length, 0, 'قائمة فارغة لا تُسقط الترتيب');

console.log('\n── تفكيك خلايا الأسعار من الملف ──────────────────────');

eq(parseRateCell('350').length, 1, 'رقم صريح ← بند واحد');
eq(parseRateCell('350')[0].rate, 350, 'وقيمته كما هي');

// **الأخطر**: الصفر ليس مجانًا
eq(parseRateCell('0').length, 0, 'الصفر «لم يُتفق» ← لا بند إطلاقًا (٣٨ خلية في المصدر)');

const trRe = parseRateCell('350 Tr - 250 Re');
eq(trRe.length, 2, '«350 Tr - 250 Re» ← بندان');
eq(trRe[0].rate, 350, 'الترجمة ٣٥٠');
eq(trRe[0].stepType, 'human_translation', 'ووسمها ترجمة بشرية');
eq(trRe[1].rate, 250, 'والمراجعة ٢٥٠');
eq(trRe[1].stepType, 'heavy_review', 'ووسمها مراجعة');

const pairs = parseRateCell('70 Sp-Ar \\\\ 80 Sp-En');
eq(pairs.length, 2, '«70 Sp-Ar \\\\ 80 Sp-En» ← بندان');
eq(pairs[0].langFrom, 'es', 'الاتجاه الأول: من الإسبانية');
eq(pairs[0].langTo, 'ar', 'إلى العربية');
eq(pairs[1].langTo, 'en', 'والثاني إلى الإنجليزية');

const onsite = parseRateCell('1500 on site / 1000 Online');
eq(onsite.length, 2, '«1500 on site / 1000 Online» ← بندان');
eq(onsite[0].rate, 1500, 'الحضوري ١٥٠٠');
eq(onsite[1].rate, 1000, 'وعن بُعد ١٠٠٠');
check(onsite[0].needsReview === true, 'وكلاهما مُعلَّم للمراجعة — لا تخمين لنوع الخدمة');

const range = parseRateCell('150-350');
eq(range.length, 1, 'النطاق ← بند واحد');
eq(range[0].rate, 150, 'بالحد الأدنى');
check(range[0].note?.includes('150-350'), 'والأصل محفوظ في الملاحظة');
check(range[0].needsReview === true, 'ومُعلَّم للمراجعة');

eq(parseRateCell('13 E')[0].currency, 'EUR', '«13 E» ← يورو');
eq(parseRateCell('5$ on mostaqel')[0].currency, 'USD', '«5$ on mostaqel» ← دولار');
eq(parseRateCell('100 Le')[0].currency, 'EGP', '«100 Le» ← جنيه');
eq(parseRateCell('350')[0].currency, 'EGP', 'وبلا إشارة ← العملة الافتراضية');
eq(parseRateCell('')[0], undefined, 'الخلية الفارغة ← لا بند');
eq(parseRateCell('   ').length, 0, 'والمسافات وحدها كذلك');

console.log('\n── التقييم المخزَّن كتواريخ ───────────────────────────');

eq(parseRatingCell(new Date(2025, 9, 7)).rating, 10, 'تاريخ ٧ أكتوبر ← الدرجة ١٠ (رقم الشهر)');
eq(parseRatingCell('7/10').rating, 7, '«7/10» تُقرأ درجة كما هي');
eq(parseRatingCell('7/10/2025').rating, 10, 'تاريخ نصي ← الشهر هو الدرجة');
eq(parseRatingCell('sara@mail.com').email, 'sara@mail.com', 'البريد في نفس العمود يُفصَل');
eq(parseRatingCell('sara@mail.com').rating, null, 'ولا يُقرأ درجة');
eq(parseRatingCell('').rating, null, 'الخلية الفارغة ← لا درجة');
eq(parseRatingCell('كلام').rating, null, 'والنص غير المفهوم لا يُخمَّن');
eq(parseRatingCell(new Date(2025, 10, 7)).rating, null, 'شهر ١١ خارج المدى ← لا درجة (لا نُقحم ١١/١٠)');

console.log('\n── حراسة الاستيراد والدمج ────────────────────────────');

check(isHeaderRow('Name'), 'صف الرؤوس الثاني «Name» يُرفض — لا يصير شخصًا');
check(isHeaderRow('Rate for 1hour'), 'ورأس «Rate for 1hour» كذلك');
check(isHeaderRow('  '), 'والصف الفارغ');
check(isHeaderRow('123'), 'وصف بلا حرف واحد');
check(!isHeaderRow('Donia Hamdan'), 'والاسم الحقيقي يمرّ');

// «دنيا حمدان» في ثلاثة تبويبات ← شخص واحد (§١٧ بند ٢٥)
eq(
  mergeKey('Donia Hamdan', '01000000001'),
  mergeKey('  Dr. Donia Hamdan ', '01000000001'),
  'نفس الهاتف ← نفس الشخص مهما اختلف كتابة الاسم'
);
eq(
  mergeKey('دنيا حمدان', null),
  mergeKey('  دنيا   حمدان  ', null),
  'وبلا هاتف: الاسم المطبَّع هو المفتاح'
);
check(
  mergeKey('أحمد', '0100') !== mergeKey('أحمد', '0200'),
  'واختلاف الهاتف يفصل شخصين متشابهي الاسم'
);

eq(mergeMultiValue('en', 'fr'), 'en,fr', 'لغات الصفوف المكررة تُجمع');
eq(mergeMultiValue('en,fr', 'fr'), 'en,fr', 'بلا تكرار');
eq(mergeMultiValue(null, 'de'), 'de', 'والفارغ لا يُنتج فاصلة زائدة');
eq(mergeMultiValue(null, null), '', 'وفارغان ← فراغ');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
