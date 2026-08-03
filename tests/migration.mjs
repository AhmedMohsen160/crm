/**
 * اختبار ترحيل البيانات القديمة — **بالقيم التالفة الموجودة فعلًا** في
 * ملفَّي الليدز والمبيعات (§١٤).
 *
 * كل سطر هنا يمنع فسادًا حقيقيًا: تاريخًا يُقرأ مقلوبًا فيوزّع مبيعات مارس
 * على تسعة أشهر، أو مبلغًا بالريال يُحسب جنيهًا، أو ليدًا يُسنَد لمالك خطأ.
 *
 * التشغيل:  npm run test:migration
 */
import {
  parseSheetDate,
  fixMarch2026Flip,
  parseSheetAmount,
  mapChannel,
  mapContactMethod,
  mapBranch,
  matchAdmin,
  isLostInquiry,
  isConverted,
  isIncompleteYear,
  mergeNotes,
} from '../src/lib/migration.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}
function eq(actual, expected, label) {
  check(actual === expected, label, `نتج ${JSON.stringify(actual)} والمتوقع ${JSON.stringify(expected)}`);
}
const iso = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null);

const TODAY = new Date(2026, 7, 2);

console.log('\n── التواريخ النصية في المصدر ─────────────────────────');

eq(iso(parseSheetDate('24\\11\\2025', { today: TODAY }).date), '2025-11-24', '«24\\11\\2025» ← ٢٤ نوفمبر ٢٠٢٥');
eq(iso(parseSheetDate('26/07/2026', { today: TODAY }).date), '2026-07-26', '«26/07/2026» بالشرطة المائلة');
eq(iso(parseSheetDate('23-5-2026', { today: TODAY }).date), '2026-05-23', '«23-5-2026» بالشرطة');
eq(iso(parseSheetDate(' 29\\1\\2026 ', { today: TODAY }).date), '2026-01-29', 'والمسافات الزائدة لا تُسقط الصف');

// **الحاسم**: الترتيب يوم/شهر لا شهر/يوم
eq(iso(parseSheetDate('1\\12\\2025', { today: TODAY }).date), '2025-12-01', '«1\\12\\2025» يوم ثم شهر — لا ١٢ يناير');
eq(iso(parseSheetDate('11\\2\\2026', { today: TODAY }).date), '2026-02-11', 'و«11\\2\\2026» ← ١١ فبراير لا ٢ نوفمبر');

// القيم التالفة الثلاث المذكورة بعينها في §١٤
// §١٤ يصنّفها «تُصلَح يدويًا» — فلا نخمّن المقصود ولو بدا واضحًا
const corrupt2005 = parseSheetDate('6\\11\\2005', { today: TODAY });
check(corrupt2005.date === null, '«6\\11\\2005» سنة تالفة ← مراجعة يدوية لا تخمين');
check(Boolean(corrupt2005.problem), 'بسبب واضح يقرأه المراجع');
// `24\11\2026` والمقصود ٢٠٢٥ — يُعلَّم مستقبليًا **ولا يُرفض هنا**:
// صف مارس المقلوب يبدو مستقبليًا حتى يُقلب، فالحكم بعد التصحيح لا قبله
const future = parseSheetDate('24\\11\\2026', { today: TODAY });
check(future.future === true, '«24\\11\\2026» يُعلَّم تاريخًا مستقبليًا');
check(future.date !== null, 'ولا يُرفض في القراءة — الحكم بعد تصحيح انقلاب مارس');
// وصف مارس المقلوب: ٣ أكتوبر يبدو مستقبليًا، ويصير ١٠ مارس بعد التصحيح
const flipped = parseSheetDate('3\\10\\2026', { today: TODAY });
check(flipped.future === true, 'و«3\\10\\2026» يبدو مستقبليًا قبل التصحيح');
eq(
  iso(fixMarch2026Flip(flipped.date, { enabled: true }).date),
  '2026-03-10',
  'وبعد تصحيح الانقلاب يصير ١٠ مارس — تاريخًا ماضيًا صحيحًا'
);

const glued = parseSheetDate('5\\112025', { today: TODAY });
eq(iso(glued.date), '2025-11-05', '«5\\112025» بشهر وسنة ملتصقين ← ٥ نوفمبر ٢٠٢٥');
check(Boolean(glued.corrected), 'ومعلَّم كذلك');

const badYear = parseSheetDate('01/07/0205', { today: TODAY });
check(badYear.date === null, '«01/07/0205» سنة لا تُحسم ← يذهب للمراجعة اليدوية');
check(Boolean(badYear.problem), 'بسبب واضح');

eq(parseSheetDate('', { today: TODAY }).date, null, 'الخلية الفارغة ← مراجعة لا تخمين');
eq(parseSheetDate('كلام', { today: TODAY }).date, null, 'والنص غير المفهوم كذلك');
eq(iso(parseSheetDate(new Date(2026, 0, 15)).date), '2026-01-15', 'وخلية التاريخ الحقيقية تمرّ كما هي');
// الصيغة العالمية لا لبس فيها: أربعة أرقام أولًا = سنة قطعًا
eq(iso(parseSheetDate('2026-02-03', { today: TODAY }).date), '2026-02-03', '«2026-02-03» تُقرأ سنة/شهر/يوم');
eq(iso(parseSheetDate('2025-12-01', { today: TODAY }).date), '2025-12-01', 'ولا تُقلب إلى ١٢ يناير');
eq(parseSheetDate('31\\2\\2026', { today: TODAY }).date, null, '٣١ فبراير لا يوجد ← مراجعة لا انزلاق لمارس');

console.log('\n── انقلاب يوم/شهر في مارس ٢٠٢٦ ───────────────────────');

// `d/3/2026` قُرئت `3/d/2026` فتوزّعت على تسعة أشهر
const flip = fixMarch2026Flip(new Date(2026, 8, 3), { enabled: true });
eq(iso(flip.date), '2026-03-09', '٣ سبتمبر ٢٠٢٦ ← ٩ مارس ٢٠٢٦');
check(Boolean(flip.corrected), 'ويُعلَّم التصحيح');

eq(
  iso(fixMarch2026Flip(new Date(2026, 11, 3), { enabled: true }).date),
  '2026-03-12',
  'و٣ ديسمبر ← ١٢ مارس'
);
eq(
  iso(fixMarch2026Flip(new Date(2026, 2, 3), { enabled: true }).date),
  '2026-03-03',
  'و٣ مارس نفسه سليم فلا يُمسّ'
);
// **الحاسم**: لا تُطبَّق بلا تفعيل، وإلا قلبت كل ثالث شهر في التاريخ
eq(
  iso(fixMarch2026Flip(new Date(2026, 8, 3), { enabled: false }).date),
  '2026-09-03',
  'وبلا تفعيل لا تُطبَّق — الثالث من كل شهر تاريخ مشروع'
);
eq(
  iso(fixMarch2026Flip(new Date(2025, 8, 3), { enabled: true }).date),
  '2025-09-03',
  'ولا تُطبَّق خارج ٢٠٢٦'
);
eq(
  iso(fixMarch2026Flip(new Date(2026, 8, 15), { enabled: true }).date),
  '2026-09-15',
  'ولا على يوم غير الثالث'
);

console.log('\n── المبالغ والعملات المخلوطة ─────────────────────────');

eq(parseSheetAmount(1500).amount, 1500, 'الرقم يمرّ كما هو');
eq(parseSheetAmount(1500).currency, 'EGP', 'بالعملة الافتراضية');

// ٨ خلايا في ملف الليدز مكتوبة «60 ريال» داخل عمود الجنيه
const sar = parseSheetAmount('60 ريال');
eq(sar.amount, 60, '«60 ريال» ← المبلغ ٦٠');
eq(sar.currency, 'SAR', 'والعملة ريال لا جنيه');
check(Boolean(sar.corrected), 'ويُعلَّم أن العملة كُتبت نصًّا في عمود آخر');
eq(parseSheetAmount('1341 ريال').amount, 1341, 'و«1341 ريال» كذلك');
eq(parseSheetAmount('5$').currency, 'USD', 'ورمز الدولار يُقرأ');
eq(parseSheetAmount('1,500').amount, 1500, 'والفاصلة الألفية لا تُسقط الرقم');
eq(parseSheetAmount('').amount, null, 'والخلية الفارغة ← لا مبلغ');
eq(parseSheetAmount('لا يوجد').amount, null, 'والنص بلا رقم ← مراجعة');

console.log('\n── مطابقة القوائم ────────────────────────────────────');

eq(mapChannel('Google Ads'), 'google_ads', 'قناة جوجل');
eq(mapChannel('ads'), 'google_ads', 'و«ads» في الملف القديم تعني جوجل');
eq(mapChannel('Meta Ads'), 'meta_ads', 'وMeta ← إعلانات ميتا');
eq(mapChannel('Website'), 'website', 'والموقع قناة مستقلة في القائمة المزروعة');
eq(mapChannel('GMB'), 'organic', 'وجوجل ماي بيزنس كذلك');
eq(mapChannel('old client'), 'returning', 'والعميل القديم ← «عائد»');
eq(mapChannel('Old Client'), 'returning', 'مهما اختلفت حالة الأحرف');
eq(mapChannel('حاجة غريبة'), null, 'وما لا يُعرف ← null لا تخمين');
// PR وOutreach ليسا مفتاحين في القائمة المزروعة — لا يُخترع لهما مفتاح
eq(mapChannel('PR'), 'other', 'و«علاقات عامة» تُصنّف «أخرى» ويُحفظ أصلها');
eq(mapContactMethod('Messenger'), null, 'و«ماسنجر» بلا مفتاح ← لا يُخمَّن واتسًا');

eq(mapContactMethod('واتس'), 'whatsapp', 'وسيلة التواصل بالعربية');
eq(mapContactMethod('Whatsapp'), 'whatsapp', 'وبالإنجليزية');
eq(mapContactMethod('اتصال'), 'call', 'والاتصال');
eq(mapContactMethod('مقر'), 'office', 'والحضور للمقر');

eq(mapBranch('mokattam'), 'mokattam', 'فرع المقطم');
eq(mapBranch('فرع المقطم'), 'mokattam', 'بالعربية كذلك');
eq(mapBranch('Gameat Aldwal'), 'mohandessin', '«جامعة الدول» هو فرع المهندسين');
eq(mapBranch('Alex'), 'alexandria', 'والإسكندرية باختصارها');
eq(mapBranch('فرع الرياض'), 'riyadh', 'وفرع الرياض');

console.log('\n── مطابقة أدمن المبيعات ──────────────────────────────');

const USERS = [
  { id: 'u1', name: 'أحمد مجلي' },
  { id: 'u2', name: 'الصاوي' },
  { id: 'u3', name: 'نورا' },
  { id: 'u4', name: 'يحيى' },
  { id: 'u5', name: 'محمد بكري' },
];

eq(matchAdmin('نورا', USERS)?.id, 'u3', 'الاسم العربي كما هو');
eq(matchAdmin('Nora', USERS)?.id, 'u3', 'والاسم الإنجليزي في ملف المبيعات');
eq(matchAdmin('Noura Anwer', USERS)?.id, 'u3', 'والاسم الثلاثي في دفتر الماليات');
eq(matchAdmin('Ahmad Megaly', USERS)?.id, 'u1', 'ومجلي بالإنجليزية');
eq(matchAdmin('محمد الصاوي', USERS)?.id, 'u2', 'والصاوي بالاسم الكامل');
eq(matchAdmin('Muhammad Elsawy', USERS)?.id, 'u2', 'وبالإنجليزية');
eq(matchAdmin('Yahia', USERS)?.id, 'u4', 'ويحيى');
eq(matchAdmin('يحيي', USERS)?.id, 'u4', 'ولو كُتب بياء بلا نقاط');

// **الحاسم**: لا تخمين
eq(matchAdmin('شخص لا نعرفه', USERS), null, 'ومن لا يُطابَق ← null، فالمالك الخطأ أسوأ من لا مالك');
eq(matchAdmin('', USERS), null, 'والخلية الفارغة كذلك');
eq(
  matchAdmin('محمد', [{ id: 'a', name: 'محمد بكري' }, { id: 'b', name: 'محمد الصاوي' }]),
  null,
  'والاسم الملتبس بين اثنين لا يُحسم بالتخمين'
);

console.log('\n── قواعد التصنيف ─────────────────────────────────────');

check(isLostInquiry(null), 'الصف بلا سعر استفسار خاسر لا مشروع (§١٤)');
check(isLostInquiry(0), 'والسعر صفر كذلك');
check(!isLostInquiry(900), 'والصف المسعَّر مشروع');

check(isConverted('نعم', 1500), '«نعم» مع مبلغ ← محوَّل');
check(!isConverted('لا', null), 'و«لا» بلا مبلغ ← غير محوَّل');
check(isConverted('', 900), 'والعمود الفارغ يُحسم بالسعر — المبلغ دليل البيع');
check(!isConverted('', null), 'وبلا الاثنين ← غير محوَّل');
// العمود يعلو على السعر حين يكون صريحًا
check(!isConverted('لا', 0), '«لا» صريحة تُحترم');

check(isIncompleteYear(2024), '٢٠٢٤ معلَّمة ناقصة — لا تصلح خط أساس (§١٤)');
check(!isIncompleteYear(2025), 'و٢٠٢٥ كاملة');

eq(mergeNotes('أ', null, 'ب'), 'أ · ب', 'ملاحظات التصحيح تُجمع في نص واحد');
eq(mergeNotes(null, undefined), null, 'وبلا ملاحظات ← فراغ');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
