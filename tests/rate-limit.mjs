/**
 * اختبار تحديد محاولات الدخول.
 *
 * **بابٌ بلا حدٍّ لمحاولات الفتح مفتوحٌ لمن يملك الوقت.** وهذا الاختبار يحرس
 * العدد والنافذة، لأن خطأً في أحدهما إمّا يفتح الباب أو يحبس صاحب الحساب.
 *
 * التشغيل:  npm run test:rate-limit
 */
import { lockState, lockMessage, MAX_FAILURES, WINDOW_MS } from '../src/lib/rate-limit.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}

const NOW = new Date('2026-08-05T12:00:00Z');
const minutesAgo = (n) => new Date(NOW.getTime() - n * 60_000);
const times = (n, at) => Array.from({ length: n }, () => at);

console.log('\n── ١ · الحدّ ────────────────────────────────────────\n');

check(MAX_FAILURES === 10, 'عشر محاولات مسموحة');
check(WINDOW_MS === 900_000, 'في نافذة ربع ساعة');

check(lockState([], NOW).locked === false, 'بلا إخفاق: مفتوح');
check(
  lockState(times(9, minutesAgo(1)), NOW).locked === false,
  'وتسع محاولات لا توقف'
);
check(
  lockState(times(9, minutesAgo(1)), NOW).remaining === 1,
  'ويُقال له إن بقيت واحدة'
);
check(
  lockState(times(10, minutesAgo(1)), NOW).locked === true,
  '★ **والحدّ يُبلَغ لا يُتجاوَز** — العاشرة توقف ولا ننتظر الحادية عشرة'
);

console.log('\n── ٢ · النافذة ──────────────────────────────────────\n');

check(
  lockState(times(20, minutesAgo(16)), NOW).locked === false,
  '★ **وما خرج من النافذة لا يُحتسب** — عشرون إخفاقًا قبل ١٦ دقيقة لا تحبس أحدًا'
);
check(
  lockState([...times(9, minutesAgo(20)), ...times(5, minutesAgo(2))], NOW).locked === false,
  'وخمسٌ حديثة مع تسعٍ قديمة: مفتوح — العدّ داخل النافذة وحدها'
);
check(
  lockState(times(10, minutesAgo(14)), NOW).locked === true,
  'وعشرٌ قبل ١٤ دقيقة ما زالت داخل النافذة'
);

console.log('\n── ٣ · متى يُفتح ────────────────────────────────────\n');

const locked = lockState(times(10, minutesAgo(5)), NOW);
check(
  locked.retryAfterSeconds === 600,
  `★ **والانتظار يُحسب من أقدم إخفاق** — بقي ${locked.retryAfterSeconds} ثانية من ٦٠٠`
);
const nearlyOver = lockState(times(10, minutesAgo(14.99)), NOW);
check(
  nearlyOver.retryAfterSeconds >= 1,
  'ولا يُقال له «صفر ثانية» ثم يُرفض — الحدّ الأدنى ثانية'
);

// أقدم إخفاق هو الذي يحكم، لا آخرها
const mixed = lockState([minutesAgo(14), ...times(9, minutesAgo(1))], NOW);
check(
  mixed.locked && mixed.retryAfterSeconds <= 60,
  'وأقدمُها يحكم: إخفاقٌ قبل ١٤ دقيقة يُنهي الحبس بعد دقيقة'
);

console.log('\n── ٤ · الرسالة ──────────────────────────────────────\n');

check(lockMessage(600).includes('10'), 'الرسالة بالدقائق لا بالثواني — «١٠ دقيقة»');
check(lockMessage(30).includes('دقيقة'), 'وأقل من دقيقة تُقال «دقيقة» لا «٠٫٥»');
check(
  !lockMessage(600).includes('البريد') && !lockMessage(600).includes('كلمة المرور'),
  '★ ولا تكشف الرسالةُ أصحيحٌ البريدُ أم لا — الإيقاف على المحاولات لا على الحساب'
);

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
