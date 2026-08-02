/**
 * اختبار حساب نسب المبيعات — بالأمثلة الحرفية التي أقرّتها الإدارة
 * في `COMMISSION-SPEC.md`.
 *
 * تعمل بلا متصفح ولا قاعدة بيانات: هذه أرقام رواتب الفريق، فالخطأ فيها
 * يُكتشف هنا لا في كشف الحساب.
 *
 * التشغيل:  npm run test:commission
 */
import {
  computeCommission,
  splitByProject,
  sortTiers,
  targetProgress,
  periodOf,
  shiftPeriod,
  periodRange,
} from '../src/lib/commission.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}
function near(actual, expected, label, tolerance = 0.01) {
  const ok = Math.abs(actual - expected) < tolerance;
  check(ok, label, `نتج ${actual} والمتوقع ${expected}`);
}

// الشرائح المعتمدة عند التأسيس — **بيانات تُعدَّل من الشاشة**، وهنا نسخة
// منها لاختبار المعادلة عليها
const TIERS = [
  { fromAmount: 0, toAmount: 200000, adminRate: 0.03, managerRate: 0.02 },
  { fromAmount: 200000, toAmount: 500000, adminRate: 0.035, managerRate: 0.025 },
  { fromAmount: 500000, toAmount: null, adminRate: 0.04, managerRate: 0.03 },
];

console.log('نسب المبيعات — الأمثلة المعتمدة\n');

// ── المثال الأول في المواصفة: ١٠٠ ألف في الشريحة الأولى ──────
let r = computeCommission({
  total: 100000,
  tiers: TIERS,
  mode: 'progressive',
  hasManager: true,
});
near(r.adminAmount, 3000, 'الشريحة الأولى: الأدمن ٣٪ من ١٠٠ ألف = ٣٬٠٠٠');
near(r.managerAmount, 2000, 'الشريحة الأولى: المدير ٢٪ = ٢٬٠٠٠');
near(r.adminAmount + r.managerAmount, 5000, 'إجمالي عبء النسب ٥٬٠٠٠');
check(r.tierIndex === 0, `الشريحة المحققة هي الأولى (${r.tierIndex})`);
near(r.remainingToNext, 100000, 'يتبقى ١٠٠ ألف لبلوغ الشريحة الثانية');

// ── قاعدة «من لا مدير له يأخذ النسبة كاملة» — محمد بكري ───────
r = computeCommission({
  total: 100000,
  tiers: TIERS,
  mode: 'progressive',
  hasManager: false,
});
near(r.adminAmount, 5000, 'المستقل بلا مدير يستحق ٥٪ كاملة = ٥٬٠٠٠');
near(r.managerAmount, 0, 'ولا حصة لمدير غير موجود');

// ── المثال الحاسم: ٣٠٠ ألف بالطريقتين ────────────────────────
r = computeCommission({
  total: 300000,
  tiers: TIERS,
  mode: 'progressive',
  hasManager: true,
});
near(
  r.adminAmount,
  9500,
  'تصاعدية جزئية: ٢٠٠ألف×٣٪ + ١٠٠ألف×٣٫٥٪ = ٩٬٥٠٠ للأدمن'
);
near(r.managerAmount, 6500, 'تصاعدية جزئية: ٦٬٥٠٠ للمدير');

r = computeCommission({
  total: 300000,
  tiers: TIERS,
  mode: 'whole',
  hasManager: true,
});
near(r.adminAmount, 10500, 'الشريحة تبتلع الكل: ٣٠٠ألف×٣٫٥٪ = ١٠٬٥٠٠ للأدمن');
near(r.managerAmount, 7500, 'الشريحة تبتلع الكل: ٧٬٥٠٠ للمدير');

// ── الشريحة الثالثة ──────────────────────────────────────────
r = computeCommission({
  total: 600000,
  tiers: TIERS,
  mode: 'progressive',
  hasManager: true,
});
// 200,000×3% + 300,000×3.5% + 100,000×4% = 6,000 + 10,500 + 4,000
near(r.adminAmount, 20500, 'الشريحة الثالثة تصاعديًا: ٢٠٬٥٠٠ للأدمن');
// 200,000×2% + 300,000×2.5% + 100,000×3% = 4,000 + 7,500 + 3,000
near(r.managerAmount, 14500, 'الشريحة الثالثة تصاعديًا: ١٤٬٥٠٠ للمدير');
check(r.tierIndex === 2, `بلغ الشريحة الثالثة (${r.tierIndex})`);
check(r.nextTierAt === null, 'لا شريحة بعدها');
check(r.remainingToNext === null, 'ولا متبقٍ يُعرض');

r = computeCommission({ total: 600000, tiers: TIERS, mode: 'whole', hasManager: true });
near(r.adminAmount, 24000, 'الشريحة الثالثة بالابتلاع: ٦٠٠ألف×٤٪ = ٢٤٬٠٠٠');

// ── الحدود الفاصلة ───────────────────────────────────────────
r = computeCommission({
  total: 200000,
  tiers: TIERS,
  mode: 'progressive',
  hasManager: true,
});
near(r.adminAmount, 6000, 'عند العتبة تمامًا (٢٠٠ ألف): ٦٬٠٠٠');
check(r.tierIndex === 1, 'المبلغ المساوي للعتبة يدخل الشريحة التالية');
near(r.remainingToNext, 300000, 'يتبقى ٣٠٠ ألف للشريحة الثالثة');

r = computeCommission({ total: 199999, tiers: TIERS, mode: 'progressive', hasManager: true });
check(r.tierIndex === 0, 'جنيه واحد أقل من العتبة يبقى في الشريحة الأولى');

// ── القيم الحدّية لا تكسر شيئًا ───────────────────────────────
r = computeCommission({ total: 0, tiers: TIERS, mode: 'progressive', hasManager: true });
near(r.adminAmount, 0, 'صفر مبيعات ← صفر استحقاق');
r = computeCommission({ total: -5000, tiers: TIERS, mode: 'progressive', hasManager: true });
near(r.adminAmount, 0, 'مبلغ سالب ← صفر لا استحقاق سالب');
r = computeCommission({ total: 100000, tiers: [], mode: 'progressive', hasManager: true });
near(r.adminAmount, 0, 'خطة بلا شرائح ← صفر لا انهيار');

// ── الشرائح غير المرتّبة تُرتَّب ──────────────────────────────
const shuffled = [TIERS[2], TIERS[0], TIERS[1]];
r = computeCommission({
  total: 300000,
  tiers: shuffled,
  mode: 'progressive',
  hasManager: true,
});
near(r.adminAmount, 9500, 'ترتيب الشرائح في الشاشة لا يغيّر النتيجة');
check(sortTiers(shuffled)[0].fromAmount === 0, 'الترتيب تصاعدي');

// ── خطة مخصّصة: نسبة واحدة بلا شرائح ────────────────────────
const flat = [{ fromAmount: 0, toAmount: null, adminRate: 0.05, managerRate: 0 }];
r = computeCommission({ total: 250000, tiers: flat, mode: 'progressive', hasManager: true });
near(r.adminAmount, 12500, 'خطة بنسبة ثابتة ٥٪ تعمل بلا شرائح');
near(r.managerAmount, 0, 'وبلا حصة مدير إن ضُبطت صفرًا');

// ── توزيع الاستحقاق على المشاريع ─────────────────────────────
let split = splitByProject(9500, [
  { projectId: 'a', collected: 100000 },
  { projectId: 'b', collected: 200000 },
]);
near(split[0].amount, 3166.67, 'التوزيع بنسبة ما حصّله كل مشروع');
near(
  split.reduce((s, x) => s + x.amount, 0),
  9500,
  'مجموع التوزيع = الاستحقاق بالضبط'
);

split = splitByProject(1000, [
  { projectId: 'a', collected: 1 },
  { projectId: 'b', collected: 1 },
  { projectId: 'c', collected: 1 },
]);
near(
  split.reduce((s, x) => s + x.amount, 0),
  1000,
  'ثلاثة أثلاث غير قابلة للقسمة — المجموع يظل مطابقًا'
);

check(splitByProject(1000, []).length === 0, 'بلا مشاريع ← لا توزيع');
check(
  splitByProject(1000, [{ projectId: 'a', collected: 0 }]).length === 0,
  'مشروع بلا تحصيل يخرج من التوزيع'
);

// ── نسبة بلوغ الهدف ──────────────────────────────────────────
near(targetProgress(150000, 300000), 0.5, 'بلغ نصف الهدف');
near(targetProgress(400000, 300000), 1, 'تجاوز الهدف ← يُعرض ١٠٠٪ لا أكثر');
near(targetProgress(100000, 0), 0, 'هدف غير مضبوط ← صفر لا قسمة على صفر');

// ── الفترات ──────────────────────────────────────────────────
check(periodOf(new Date(2026, 7, 15)) === '2026-08', 'مفتاح الفترة YYYY-MM');
check(shiftPeriod('2026-01', -1) === '2025-12', 'الشهر السابق يعبر السنة');
check(shiftPeriod('2026-12', 1) === '2027-01', 'الشهر التالي يعبر السنة');
const range = periodRange('2026-08');
check(
  range.start.getMonth() === 7 && range.end.getMonth() === 8,
  'مدى الفترة يبدأ بأول الشهر وينتهي بأول التالي'
);

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
