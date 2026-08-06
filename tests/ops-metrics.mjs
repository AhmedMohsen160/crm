/**
 * اختبار مؤشرات التشغيل.
 *
 * **لماذا تُختبر؟** لأنها الأرقام التي يُقاس بها مدير المشاريع وفريقه. رقمٌ
 * يُحسب خطأً في شاشةٍ غرضُها التقييم يظلم إنسانًا — أو يُريح من لا يستحق.
 *
 * التشغيل:  npm run test:ops-metrics
 */
import {
  onTimeRate,
  growthPct,
  operatingRatio,
  operatingRoi,
  costPerPage,
  rankProducers,
} from '../src/lib/ops-metrics.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}

const d = (s) => new Date(s);

console.log('\n── ١ · الالتزام بالموعد ─────────────────────────────\n');

const rows = [
  { deliveredAt: d('2026-08-03T10:00:00'), deadline: d('2026-08-05') }, // في الموعد
  { deliveredAt: d('2026-08-06T10:00:00'), deadline: d('2026-08-05') }, // متأخر
  { deliveredAt: d('2026-08-05T23:00:00'), deadline: d('2026-08-05') }, // في يوم الموعد
  { deliveredAt: d('2026-08-05T10:00:00'), deadline: null }, // بلا موعد
  { deliveredAt: null, deadline: d('2026-08-05') }, // لم يُسلَّم
];

const r = onTimeRate(rows);
check(r.measured === 3, 'ما لا موعد له وما لم يُسلَّم خارج القياس — ٣ مقيسة من ٥');
check(
  r.onTime === 2 && r.late === 1,
  '★ **والتسليم في يوم الموعد التزامٌ لا تأخّر** — ٢ في الموعد و١ متأخر'
);
check(r.rate === 66.7, `والنسبة ٦٦٫٧٪ — جاءت ${r.rate}`);
check(
  onTimeRate([]).rate === null,
  '★ وبلا مشروع مقيس لا نسبة — «غير مقيس» لا صفرًا'
);
check(
  onTimeRate([{ deliveredAt: null, deadline: null }]).rate === null,
  'وبلا موعد ولا تسليم لا نسبة'
);
check(
  onTimeRate([{ deliveredAt: d('2026-08-01'), deadline: d('2026-08-01') }]).rate === 100,
  'ومن سلّم كلَّ شيء في موعده ١٠٠٪'
);

console.log('\n── ٢ · التقدّم عن الشهر الماضي ──────────────────────\n');

check(growthPct(120, 100) === 20, 'من ١٠٠ إلى ١٢٠ = +٢٠٪');
check(growthPct(80, 100) === -20, 'ومن ١٠٠ إلى ٨٠ = −٢٠٪');
check(growthPct(100, 100) === 0, 'والثبات صفر — وهو قياسٌ لا غياب');
check(
  growthPct(50, 0) === null,
  '★ **والنموّ من صفرٍ لا نسبة له** — يُقال «جديد» ولا يُخترع ما لا نهاية'
);
check(growthPct(0, 50) === -100, 'والتوقّف التام −١٠٠٪');

console.log('\n── ٣ · نسبة التشغيل والعائد ─────────────────────────\n');

check(operatingRatio(30_000, 100_000) === 30, 'التشغيل يأكل ٣٠٪ من المبيعات');
check(operatingRatio(30_000, 0) === null, 'وبلا مبيعات لا نسبة');
check(operatingRoi(100_000, 25_000) === 300, 'كل جنيه تشغيل يعود بثلاثة — ٣٠٠٪');
check(
  operatingRoi(100_000, 0) === null,
  '★ **وتكلفةُ صفرٍ تعني «لم تُسجَّل» لا «مجّانًا»** — فلا عائد لا نهائي'
);
check(operatingRoi(20_000, 25_000) === -20, 'والخسارة تظهر سالبةً −٢٠٪');
check(costPerPage(2_220, 100) === 22.2, 'ومتوسط تكلفة الصفحة ٢٢٫٢');
check(costPerPage(2_220, 0) === null, 'وبلا صفحات لا متوسط');

console.log('\n── ٤ · ترتيب المنفِّذين ─────────────────────────────\n');

const producers = rankProducers([
  { userId: 'a', userName: 'طارق', pages: 40, projects: 5 },
  { userId: 'b', userName: 'دعاء', pages: 60, projects: 7 },
  { userId: 'c', userName: 'سلمى', pages: 40, projects: 3 },
  { userId: 'e', userName: 'خالد', pages: 10, projects: 1 },
]);

check(producers[0].userName === 'دعاء' && producers[0].rank === 1, 'الأكبر حجمًا أولًا');
check(
  producers[1].rank === 2 && producers[2].rank === 2,
  '★ **والمتساويان يشتركان في المركز** — الفصل بينهما بالحروف ظلمٌ في شاشة تحفيز'
);
check(producers[3].rank === 4, 'ثم يقفز التالي إلى الرابع — لا الثالث');
check(rankProducers([]).length === 0, 'وقائمةٌ فارغة لا تنكسر');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
