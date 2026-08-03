/**
 * اختبار رفع الملفات — الفحص قبل الحفظ.
 *
 * أخطر ما هنا **اسم الملف**: اسمٌ فيه مسار أو محرف سطر جديد يكسر ترويسة
 * التنزيل، واسمٌ عربي لا يمرّ في `filename=` اللاتينية فيصل مشوَّهًا.
 *
 * التشغيل:  npm run test:files
 */
import {
  MAX_FILE_BYTES,
  CV_MIME_TYPES,
  safeFileName,
  checkUpload,
  mimeFromName,
  extensionList,
  acceptAttribute,
  formatBytes,
  contentDisposition,
} from '../src/lib/files.ts';

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

const file = (name, type, size) => ({ name, type, size });

console.log('\n── اسم الملف ─────────────────────────────────────────');

eq(safeFileName('cv.pdf'), 'cv.pdf', 'الاسم البسيط يمرّ');
eq(safeFileName('../../etc/passwd'), 'passwd', '**والمسار يُقطع** — لا يخرج الاسم من مكانه');
eq(safeFileName('C:\\Users\\a\\cv.pdf'), 'cv.pdf', 'ومسار ويندوز كذلك');
eq(safeFileName('سيرة دعاء.pdf'), 'سيرة دعاء.pdf', 'والاسم العربي يبقى كما هو');
eq(safeFileName(''), 'ملف', 'والفارغ يأخذ اسمًا افتراضيًا');
check(safeFileName('a'.repeat(200) + '.pdf').length <= 120, 'والطويل يُقصّ');

console.log('\n── فحص الرفع ─────────────────────────────────────────');

const ok = checkUpload(file('cv.pdf', 'application/pdf', 1000));
check(ok.ok, 'ملف PDF صالح يُقبل');
eq(ok.mimeType, 'application/pdf', 'ونوعه يُقرأ');

check(checkUpload(file('cv.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1000)).ok, 'وWord');
check(checkUpload(file('cv.jpg', 'image/jpeg', 1000)).ok, 'وصورة');

const tooBig = checkUpload(file('cv.pdf', 'application/pdf', MAX_FILE_BYTES + 1));
check(!tooBig.ok, 'وما تجاوز الحدّ يُرفض');
check(tooBig.error.includes('م.ب'), 'والرسالة تقول الحجم بوحدة يفهمها الموظف');

const badType = checkUpload(file('x.exe', 'application/x-msdownload', 1000));
check(!badType.ok, '**والملف التنفيذي يُرفض** — نحن نعيده للتنزيل، لا نستضيف برامج');

const html = checkUpload(file('x.html', 'text/html', 1000));
check(!html.ok, 'وصفحة HTML تُرفض — تُفتح في متصفّح موظف');

const zip = checkUpload(file('x.zip', 'application/zip', 1000));
check(!zip.ok, 'والأرشيف المضغوط');

check(!checkUpload(null).ok, 'والمعدوم');
check(!checkUpload(file('cv.pdf', 'application/pdf', 0)).ok, 'والفارغ الحجم');

// المتصفّح قد يرسل نوعًا فارغًا — نستدلّ بالامتداد
const noType = checkUpload(file('cv.pdf', '', 1000));
check(noType.ok, 'ونوعٌ فارغ من المتصفّح يُستدلّ عليه بالامتداد');
eq(noType.mimeType, 'application/pdf', 'ويُخزَّن النوع الصحيح');

const noTypeBad = checkUpload(file('x.exe', '', 1000));
check(!noTypeBad.ok, 'ولا يُقبل امتدادٌ ممنوع بحجّة غياب النوع');

console.log('\n── الاستدلال بالامتداد ───────────────────────────────');

eq(mimeFromName('a.pdf'), 'application/pdf', 'pdf');
eq(mimeFromName('a.JPG'), 'image/jpeg', 'والامتداد بحروف كبيرة');
eq(mimeFromName('a.jpeg'), 'image/jpeg', 'وjpeg تُعامَل jpg');
eq(mimeFromName('a.exe'), null, 'وغير المسموح يعيد فارغًا');
eq(mimeFromName('بلا امتداد'), null, 'وبلا امتداد');

console.log('\n── العرض ─────────────────────────────────────────────');

check(extensionList().includes('.pdf'), 'قائمة الامتدادات تذكر pdf');
check(acceptAttribute().includes('application/pdf'), 'وسمة accept تحمل الأنواع');
check(acceptAttribute().includes('.pdf'), 'والامتدادات معًا — بعض المتصفّحات تحتاج الاثنين');
check(Object.keys(CV_MIME_TYPES).length >= 6, 'وستة أنواع مقبولة على الأقل');

eq(formatBytes(500), '500 بايت', 'البايت');
eq(formatBytes(2048), '2 ك.ب', 'والكيلوبايت');
eq(formatBytes(5 * 1024 * 1024), '5.0 م.ب', 'والميجابايت');
eq(formatBytes(-1), '—', 'والسالب لا معنى له');

console.log('\n── ترويسة التنزيل ────────────────────────────────────');

const cd = contentDisposition('سيرة دعاء.pdf');
check(cd.startsWith('attachment;'), 'الافتراضي تنزيل لا عرض');
check(
  cd.includes("filename*=UTF-8''"),
  '**والاسم العربي يمرّ في filename\\* المرمَّزة** — filename اللاتينية تشوّهه'
);
check(cd.includes('filename="'), 'ويبقى بديلٌ لاتيني للمتصفّحات القديمة');
check(!cd.includes('سيرة دعاء.pdf"'), 'ولا يُكتب العربي داخل filename اللاتينية');

check(contentDisposition('a.pdf', true).startsWith('inline;'), 'وinline حين يُطلب العرض');

const nasty = contentDisposition('bad"name\nhere.pdf');
check(!nasty.includes('\n'), 'واسمٌ فيه سطر جديد لا يكسر الترويسة');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
