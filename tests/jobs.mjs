/**
 * اختبار المهام المجدولة.
 *
 * **المهمة التي تموت صامتة تبقى ميتة شهورًا.** وهذا الاختبار يحرس ما يجعل
 * الصمت مرئيًّا: حدُّ التأخّر، وبصمةُ النجاح، وميزانيةُ الوقت.
 *
 * التشغيل:  npm run test:jobs
 */
import {
  JOBS,
  JOB_KEYS,
  jobByKey,
  lastOkKey,
  hasBudget,
  BUDGET_MS,
  jobHealth,
  agoLabel,
  HEALTH_LABELS,
} from '../src/lib/jobs.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}

console.log('\n── ١ · الكتالوج ─────────────────────────────────────\n');

check(JOBS.length >= 2, 'مهمتان على الأقل: البريد والتنبيهات');
check(
  JOBS.every((j) => j.label && j.hint && j.schedule && j.everyMinutes > 0),
  'وكل مهمة لها اسمٌ عربي وشرحٌ وجدولٌ ودورة'
);
check(new Set(JOB_KEYS).size === JOB_KEYS.length, 'ولا مفتاح مكرَّر');
check(jobByKey('email')?.key === 'email', 'وتُطلب بمفتاحها');
check(jobByKey('لا شيء') === undefined, 'وما لا وجود له لا يُخترع');
check(lastOkKey('email') === 'job_last_ok_email', 'ولكل مهمة مفتاح بصمة خاص بها');

console.log('\n── ٢ · ميزانية الوقت ────────────────────────────────\n');

check(BUDGET_MS < 60_000, '★ **الميزانية أقلّ من مهلة الدالة** — نتوقّف قبل أن تقتلنا');
check(hasBudget(1000, 1000 + BUDGET_MS - 1), 'وقبل نفادها نمضي');
check(!hasBudget(1000, 1000 + BUDGET_MS), 'وعند بلوغها نتوقّف — والحدّ يُبلَغ لا يُتجاوَز');

console.log('\n── ٣ · حال المهمة ───────────────────────────────────\n');

const NOW = new Date('2026-08-06T12:00:00Z');
const minutesAgo = (n) => new Date(NOW.getTime() - n * 60_000);

check(jobHealth(null, 60, NOW).state === 'never', 'بلا بصمة: «لم تعمل بعد» لا «متأخّرة»');
check(jobHealth(minutesAgo(10), 60, NOW).state === 'ok', 'وقبل دورتها: تعمل');
check(
  jobHealth(minutesAgo(120), 60, NOW).state === 'ok',
  '★ **وتأخّرٌ بدورتين ليس عطلًا** — ولو لُوّنت حمراء عند أول تأخّر لفقد اللون معناه'
);
check(
  jobHealth(minutesAgo(181), 60, NOW).state === 'late',
  'وبعد ثلاثة أضعاف دورتها: متأخّرة'
);
check(jobHealth(minutesAgo(45), 60, NOW).minutesAgo === 45, 'ويُقال كم مضى بالدقائق');
check(
  Object.values(HEALTH_LABELS).every((l) => l.length > 0),
  'ولكل حال اسمٌ عربي — لا مفتاح إنجليزي في شاشة'
);

console.log('\n── ٤ · «منذ كم» ─────────────────────────────────────\n');

check(agoLabel(null) === '—', 'وغير المقيس شرطة لا صفر');
check(agoLabel(0) === 'الآن', 'وأقل من دقيقة: الآن');
check(agoLabel(45).includes('45') && agoLabel(45).includes('دقيقة'), 'و٤٥ دقيقة');
check(agoLabel(180).includes('3') && agoLabel(180).includes('ساعة'), 'و١٨٠ دقيقة = ٣ ساعات');
check(agoLabel(2880).includes('2') && agoLabel(2880).includes('يوم'), 'ويومان يُقالان يومين لا ٢٨٨٠ دقيقة');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
