/**
 * اختبار التنبيهات (§١٢).
 *
 * أهمّ ما يُختبَر هنا **قاعدة واحدة منصوصة حرفيًا**: «اجمع التنبيهات في
 * رسالة واحدة لكل شخص لكل حدث — لا رسالة لكل سجل». مخالفتها لا تُسقط
 * النظام، لكنها تُفقد التنبيهَ معناه: من يتلقى ثلاثين رسالة يُغلقها بلا
 * قراءة، ومن يتلقى واحدة يقرأها.
 *
 * التشغيل:  npm run test:notifications
 */
import {
  NOTIFICATION_EVENTS,
  eventByKey,
  isDue,
  buildDigests,
  periodKeyOf,
  dayKey,
  weekKey,
  daysLate,
  hoursWaiting,
} from '../src/lib/notifications.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}
function eq(actual, expected, label) {
  check(actual === expected, label, `نتج ${JSON.stringify(actual)} والمتوقع ${JSON.stringify(expected)}`);
}

console.log('\n── الأحداث الثمانية كما نصّت §١٢ ──────────────────────');

eq(NOTIFICATION_EVENTS.length, 8, 'ثمانية أحداث لا أقل ولا أكثر');

const EXPECTED = [
  ['project_awaiting_assignment', 'immediate'],
  ['project_delivered', 'immediate'],
  ['discount_needs_approval', 'immediate'],
  ['due_tomorrow', 'daily'],
  ['overdue', 'daily'],
  ['delivered_uncollected', 'weekly'],
  ['lead_no_reply', 'interval'],
  ['freelancer_payment_late', 'weekly'],
];
for (const [key, kind] of EXPECTED) {
  const event = eventByKey(key);
  check(Boolean(event), `الحدث «${key}» معرَّف`);
  eq(event?.cadence.kind, kind, `  وتوقيته ${kind}`);
}

// التوقيتات الحرفية من الجدول
eq(eventByKey('due_tomorrow')?.cadence.hour, 18, 'ملخص «تستحق غدًا» الساعة ٦ مساءً');
eq(eventByKey('overdue')?.cadence.hour, 9, 'وملخص «المتأخرة» الساعة ٩ صباحًا');
eq(eventByKey('lead_no_reply')?.cadence.hours, 3, 'وليد بلا رد كل ٣ ساعات');

// المستقبِل قاعدة لا اسمًا ولا دورًا
eq(
  eventByKey('discount_needs_approval')?.recipient.permission,
  'canApproveDiscount',
  'مستقبِل الخصم يُحدَّد بالصلاحية لا بالدور (نفحص الصلاحية لا الدور)'
);
eq(
  eventByKey('project_delivered')?.recipient.kind,
  'record_owner',
  'ومستقبِل «سُلّم» هو **أدمن المبيعات صاحبه** لا كل المبيعات'
);
eq(
  eventByKey('lead_no_reply')?.recipient.kind,
  'owner_and_manager',
  'وليد بلا رد يصل صاحبه **ومديره** معًا'
);

console.log('\n── متى يحين الملخص ───────────────────────────────────');

const at = (h, day = 3) => new Date(2026, 7, 2 + (day - 3), h, 0, 0);

check(isDue({ kind: 'immediate' }, null, at(3)).due, 'الفوري يُرسَل في أي ساعة');
check(
  isDue({ kind: 'immediate' }, new Date(2026, 7, 2, 2), at(3)).due,
  'ويُرسَل ولو أُرسل قبله — التكرار يمنعه المفتاح لا الساعة'
);

// اليومي
check(!isDue({ kind: 'daily', hour: 18 }, null, at(17)).due, 'اليومي لا يُرسَل قبل ساعته');
check(isDue({ kind: 'daily', hour: 18 }, null, at(18)).due, 'ويُرسَل عندها');
check(isDue({ kind: 'daily', hour: 18 }, null, at(23)).due, 'وبعدها');
check(
  !isDue({ kind: 'daily', hour: 18 }, new Date(2026, 7, 2, 18), at(20)).due,
  'ولا يُرسَل مرتين في اليوم نفسه'
);
check(
  isDue({ kind: 'daily', hour: 18 }, new Date(2026, 7, 1, 18), at(18)).due,
  'ويُرسَل في اليوم التالي'
);
// **الحاسم**: التشغيل المتأخر لا يُسقط الملخص
check(
  isDue({ kind: 'daily', hour: 9 }, new Date(2026, 7, 1, 9), at(23)).due,
  'وتشغيل متأخر بعد ساعته يُرسِله — الملخص المتأخر أنفع من المفقود'
);

// الأسبوعي — الأحد
const sunday = new Date(2026, 7, 2, 9); // الثاني من أغسطس ٢٠٢٦ أحد
eq(sunday.getDay(), 0, 'يوم المرجع أحد');
check(isDue({ kind: 'weekly', weekday: 0, hour: 9 }, null, sunday).due, 'الأسبوعي يُرسَل في يومه');
check(
  !isDue({ kind: 'weekly', weekday: 0, hour: 9 }, null, new Date(2026, 7, 3, 9)).due,
  'ولا يُرسَل في غير يومه'
);
check(
  !isDue({ kind: 'weekly', weekday: 0, hour: 9 }, null, new Date(2026, 7, 2, 8)).due,
  'ولا قبل ساعته'
);
check(
  !isDue({ kind: 'weekly', weekday: 0, hour: 9 }, new Date(2026, 7, 2, 9), new Date(2026, 7, 2, 14))
    .due,
  'ولا مرتين في الأسبوع نفسه'
);
check(
  isDue({ kind: 'weekly', weekday: 0, hour: 9 }, new Date(2026, 6, 26, 9), sunday).due,
  'ويُرسَل في الأسبوع التالي'
);

// الدوري
check(isDue({ kind: 'interval', hours: 3 }, null, at(5)).due, 'الدوري يُرسَل في أول تشغيل');
check(
  !isDue({ kind: 'interval', hours: 3 }, new Date(2026, 7, 2, 4), at(6)).due,
  'ولا يُرسَل قبل انقضاء فاصله'
);
check(
  isDue({ kind: 'interval', hours: 3 }, new Date(2026, 7, 2, 3), at(6)).due,
  'ويُرسَل عند انقضائه'
);

console.log('\n── القاعدة المنصوصة: رسالة واحدة لكل شخص ─────────────');

const many = Array.from({ length: 30 }, (_, i) => ({
  userId: i < 20 ? 'u1' : 'u2',
  recordId: `p${i}`,
  recordLabel: `مشروع ${i}`,
  link: `/projects/p${i}`,
  detail: 'متأخر يومين',
}));

const digests = buildDigests('overdue', 'مشاريع متأخرة', many, {
  periodKey: '2026-08-02',
  listUrl: '/projects',
});

eq(digests.length, 2, 'ثلاثون سجلًا لشخصين ← **رسالتان لا ثلاثون**');
eq(digests[0].count, 20, 'والرسالة الأولى تحمل عشرين سجلًا');
check(digests[0].title.includes('(20)'), 'والعدد في عنوانها');

// الحدّ العشري مع ذكر الباقي
const lines = digests[0].body.split('\n');
eq(lines.length, 11, 'المتن عشرة أسطر وسطر «الباقي»');
check(lines[10].includes('10'), `وسطر الباقي يذكر عددها — «${lines[10]}»`);
check(
  digests[0].recordIds.length === 20,
  'ومعرّفات السجلات كلها محفوظة — العرض يُختصر والبيانات لا'
);

eq(buildDigests('x', 'y', [], { periodKey: 'k', listUrl: '/' }).length, 0, 'وبلا نتائج ← لا رسائل');

const single = buildDigests(
  'project_delivered',
  'مشروع سُلّم',
  [{ userId: 'u1', recordId: 'p1', recordLabel: 'مشروع واحد', link: '/projects/p1' }],
  { periodKey: 'rec:p1', listUrl: '/projects' }
);
eq(single.length, 1, 'وسجل واحد ← رسالة واحدة');
eq(single[0].body, '• مشروع واحد', 'بمتن سطر واحد بلا «الباقي»');

// من بلا مستقبِل لا يُنتج رسالة يتيمة
const orphan = buildDigests(
  'overdue',
  'متأخرة',
  [{ userId: '', recordId: 'p1', recordLabel: 'بلا مالك', link: '/x' }],
  { periodKey: 'k', listUrl: '/' }
);
eq(orphan.length, 0, 'وسجل بلا مستقبِل لا يُنتج رسالة يتيمة');

console.log('\n── مفاتيح منع التكرار ────────────────────────────────');

const now = new Date(2026, 7, 2, 10);

// الفوري يُفرَّق بمجموعة السجلات لا بالوقت
eq(
  periodKeyOf({ kind: 'immediate' }, now, 'p1'),
  'rec:p1',
  'الفوري يُفرَّق بمجموعة السجلات'
);
eq(
  periodKeyOf({ kind: 'immediate' }, now, 'p1'),
  periodKeyOf({ kind: 'immediate' }, new Date(2026, 7, 5), 'p1'),
  'ونفس المجموعة لا تُنتج رسالتين مهما تكرّر التشغيل'
);
check(
  periodKeyOf({ kind: 'immediate' }, now, 'p1') !== periodKeyOf({ kind: 'immediate' }, now, 'p1,p2'),
  'ودخول سجل جديد يغيّر المفتاح فتُحدَّث البطاقة'
);

eq(periodKeyOf({ kind: 'daily', hour: 9 }, now), '2026-08-02', 'واليومي يُفرَّق باليوم');
eq(
  periodKeyOf({ kind: 'daily', hour: 9 }, now),
  periodKeyOf({ kind: 'daily', hour: 9 }, new Date(2026, 7, 2, 23)),
  'فتشغيلان في اليوم نفسه لا يُنتجان رسالتين'
);
check(
  periodKeyOf({ kind: 'weekly', weekday: 0, hour: 9 }, new Date(2026, 7, 2)) ===
    periodKeyOf({ kind: 'weekly', weekday: 0, hour: 9 }, new Date(2026, 7, 5)),
  'والأسبوعي يجمع أيام الأسبوع الواحد'
);
check(
  periodKeyOf({ kind: 'interval', hours: 3 }, new Date(2026, 7, 2, 10)) !==
    periodKeyOf({ kind: 'interval', hours: 3 }, new Date(2026, 7, 2, 14)),
  'والدوري يفتح نافذة جديدة بعد فاصله'
);

eq(dayKey(new Date(2026, 0, 5)), '2026-01-05', 'مفتاح اليوم بصيغة موحّدة');
eq(weekKey(new Date(2026, 7, 5)), 'w:2026-08-02', 'ومفتاح الأسبوع يبدأ بالأحد');

console.log('\n── صياغة الأرقام بالعربية ────────────────────────────');

eq(daysLate(0), 'اليوم', 'صفر يوم');
eq(daysLate(1), 'متأخر يومًا', 'المفرد');
eq(daysLate(2), 'متأخر يومين', 'والمثنى — العربية تعدّ بثلاث صيغ لا صيغتين');
eq(daysLate(5), 'متأخر 5 أيام', 'وجمع القلة');
eq(daysLate(15), 'متأخر 15 يومًا', 'وجمع الكثرة');

eq(hoursWaiting(0.5), 'أقل من ساعة', 'أقل من ساعة');
eq(hoursWaiting(1), 'منذ ساعة', 'وساعة');
eq(hoursWaiting(2), 'منذ ساعتين', 'وساعتان');
eq(hoursWaiting(4), 'منذ 4 ساعات', 'وأربع');
eq(hoursWaiting(20), 'منذ 20 ساعة', 'وعشرون');
eq(hoursWaiting(50), 'منذ 2 يومًا', 'وما تجاوز اليومين يُقال بالأيام');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
