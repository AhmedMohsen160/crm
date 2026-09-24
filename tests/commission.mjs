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
  attributeShares,
  commissionableAmount,
  rankBy,
  medal,
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

// ═══════════════════════════════════════════════════════════════
//  عتبة الاستحقاق — المرحلة ١٤
//
//  «محمد الصاوي في الإسكندرية له ٣٪ بعد تحقيق رقم معين. فإذا تجاوز هذا
//   الرقم (التارجت) ياخد ٣٪ ومديره أحمد مجلي ٢٪ فيكون الإجمالي ٥٪.
//   ومحمد بكري في مدينة نصر — بلا أدمن تحته ولا مدير فوقه — ياخد ٥٪
//   من مبيعاته كاملة.»
// ═══════════════════════════════════════════════════════════════

console.log('\nعتبة الاستحقاق والملكية المزدوجة\n');

// خطة الإدارة كما وصفها أحمد: نسبة واحدة على المبلغ كله فوق العتبة
const FLAT = [{ fromAmount: 0, toAmount: null, adminRate: 0.03, managerRate: 0.02 }];

const belowTarget = computeCommission({
  total: 250_000,
  tiers: FLAT,
  mode: 'whole',
  hasManager: true,
  target: 300_000,
});
near(belowTarget.adminAmount, 0, 'دون العتبة: لا شيء للأدمن');
near(belowTarget.managerAmount, 0, 'دون العتبة: ولا شيء لمديره — العتبة تُسقط النصيبين');
check(belowTarget.targetMet === false, 'دون العتبة: targetMet = false');
near(belowTarget.remainingToTarget, 50_000, 'دون العتبة: يتبقى ٥٠ ألفًا');
near(belowTarget.currentAdminRate, 0.03, 'دون العتبة: النسبة تبقى ظاهرة ليعرف ما ينتظره');

const sawy = computeCommission({
  total: 400_000,
  tiers: FLAT,
  mode: 'whole',
  hasManager: true,
  target: 300_000,
});
near(sawy.adminAmount, 12_000, 'الصاوي فوق العتبة: ٣٪ من ٤٠٠ ألف');
near(sawy.managerAmount, 8_000, 'ومجلي مديره: ٢٪');
near(sawy.adminAmount + sawy.managerAmount, 20_000, 'الإجمالي ٥٪ لا أكثر');
check(sawy.targetMet === true, 'فوق العتبة: targetMet = true');
check(sawy.remainingToTarget === null, 'فوق العتبة: لا متبقٍّ للعتبة');

const bakri = computeCommission({
  total: 400_000,
  tiers: FLAT,
  mode: 'whole',
  hasManager: false,
  target: 300_000,
});
near(bakri.adminAmount, 20_000, 'بكري بلا مدير فوقه: يأخذ الخمسة كاملة');
near(bakri.managerAmount, 0, 'ولا حصة مدير معلَّقة بلا مستحقّ');

// العتبة عند المساواة بالضبط: **بلوغها استحقاق** لا تجاوزها
const exactly = computeCommission({
  total: 300_000,
  tiers: FLAT,
  mode: 'whole',
  hasManager: true,
  target: 300_000,
});
near(exactly.adminAmount, 9_000, 'بلوغ العتبة تمامًا يستحق — لا يُشترط تجاوزها');

// بلا عتبة: السلوك السابق للمرحلة ١٤ كما هو تمامًا
const noTarget = computeCommission({
  total: 100_000,
  tiers: TIERS,
  mode: 'progressive',
  hasManager: true,
});
near(noTarget.adminAmount, 3_000, 'بلا عتبة: الشرائح وحدها تحكم كما كانت');
check(noTarget.targetMet === true, 'بلا عتبة: targetMet = true دائمًا');

// عتبة صفر أو سالبة = بلا عتبة، لا عتبة يستحيل بلوغها
near(
  computeCommission({ total: 100_000, tiers: TIERS, mode: 'progressive', hasManager: true, target: 0 })
    .adminAmount,
  3_000,
  'عتبة صفر تُقرأ «بلا عتبة»'
);

// ── توزيع الحصص بالصفقة — الملكية المزدوجة ───────────────────

const bothManaged = attributeShares({
  sellerId: 'nora',
  adminAmount: 300,
  managerAmount: 200,
  projects: [
    { projectId: 'p1', collected: 600, managerId: 'magly' },
    { projectId: 'p2', collected: 400, managerId: 'magly' },
  ],
});
near(
  bothManaged.filter((r) => r.userId === 'nora').reduce((s, r) => s + r.amount, 0),
  300,
  'نورا تأخذ حصة الأدمن كاملة'
);
near(
  bothManaged.filter((r) => r.userId === 'magly').reduce((s, r) => s + r.amount, 0),
  200,
  'ومجلي حصة المدير كاملة'
);
near(
  bothManaged.find((r) => r.userId === 'magly' && r.projectId === 'p1').amount,
  120,
  'وحصة المدير موزّعة بنسبة تحصيل كل صفقة'
);

// صفقةٌ لها مستحقٌّ للحصة الثانية وأخرى بلا — القاعدة تنزل لمستوى الصفقة
const mixed = attributeShares({
  sellerId: 'nora',
  adminAmount: 300,
  managerAmount: 200,
  projects: [
    { projectId: 'p1', collected: 600, managerId: 'magly' },
    { projectId: 'p2', collected: 400, managerId: null },
  ],
});
near(
  mixed.filter((r) => r.userId === 'magly').reduce((s, r) => s + r.amount, 0),
  120,
  'المدير يستحق عن صفقته هو فقط'
);
near(
  mixed.filter((r) => r.userId === 'nora').reduce((s, r) => s + r.amount, 0),
  380,
  'وصفقةٌ بلا مستحقٍّ للحصة الثانية تعود حصتُها للبائع'
);
near(
  mixed.reduce((s, r) => s + r.amount, 0),
  500,
  'المجموع محفوظ: لا جنيه يضيع ولا يُخلق'
);
check(
  mixed.filter((r) => r.userId === 'nora' && r.projectId === 'p2').length === 1,
  'الحصتان تُدمجان في سطر واحد للصفقة الواحدة لا سطرين متكرّرين'
);

// كل الصفقات بلا مستحقٍّ ثانٍ — كأن لا مدير أصلًا
near(
  attributeShares({
    sellerId: 'bakri',
    adminAmount: 500,
    managerAmount: 0,
    projects: [{ projectId: 'p1', collected: 1000, managerId: null }],
  }).reduce((s, r) => s + r.amount, 0),
  500,
  'المستقل يأخذ كل شيء في سطر واحد'
);

// ── لوحة الترتيب ─────────────────────────────────────────────

const ranked = rankBy(
  [
    { name: 'أ', achieved: 100 },
    { name: 'ب', achieved: 300 },
    { name: 'ج', achieved: 300 },
    { name: 'د', achieved: 50 },
  ],
  (r) => r.achieved
);
check(ranked[0].rank === 1 && ranked[1].rank === 1, 'المتساويان يشتركان في المركز الأول');
check(ranked[2].rank === 3, 'والتالي يقفز إلى الثالث لا الثاني');
check(ranked[3].rank === 4, 'ثم يستمر الترقيم من موقعه الفعلي');
check(ranked[0].achieved === 300, 'الترتيب تنازلي بالمحقَّق');
check(rankBy([], (r) => r.achieved).length === 0, 'قائمة فارغة لا تنكسر');
check(medal(1) === '🥇' && medal(3) === '🥉', 'أوسمة المراكز الثلاثة');
check(medal(4) === null, 'وما بعد الثالث بلا وسام — لا وسام مشاركة');

// ── لا نسبة على ما نسبه النظام ولم يبعه أحد ────────────────────
near(
  commissionableAmount({ amount: 5000, importTag: 'sales-2025', preSettleTotal: null }),
  5000,
  'ما لم تمسّه التسوية يُحسب كاملًا'
);
near(
  commissionableAmount({ amount: 12000, importTag: 'sales-2025', preSettleTotal: 5000 }),
  5000,
  'والموسَّع يُحسب على رقمه المرصود قبل التوسيع لا بعده'
);
near(
  commissionableAmount({ amount: 276567, importTag: 'settle-2024', preSettleTotal: null }),
  0,
  'ومشروعٌ أنشأته التسوية لا بائع له فلا نسبة عليه'
);
near(
  commissionableAmount({ amount: 900 }),
  900,
  'ومشروعٌ عاديّ بلا وسمٍ ولا تسوية يمرّ كما هو'
);

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
