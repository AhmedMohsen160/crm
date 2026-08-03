/**
 * اختبار محاسبة الفروع وتوزيع التكلفة المركزية.
 *
 * ثلاثة أخطاء تنصّ عليها المواصفة بأنها **قاتلة**، وكلٌّ منها له اختبار
 * صريح هنا يُثبّت الصواب ويُثبّت الخطأ إلى جانبه:
 *
 *   ١) **دوامة الإغلاق** — إغلاق فرع بناءً على الصافي المحمَّل. المركز ثابت
 *      لا يزول بإغلاقه، فتُخسر مساهمته وتُوزَّع الكتلة على فروع أقل حتى
 *      انهيار الشركة.
 *   ٢) **الضرب بدل القسمة في التعادل** — يُنتج تعادلًا أقلّ من الحقيقي
 *      دائمًا، أي تارجتًا أدنى وعمولةً تُصرف قبل أوانها.
 *   ٣) **توزيع فرق الاسترداد** — يُخفي تكلفة الطاقة العاطلة، وهي أهم مؤشر
 *      لقرار التوسّع.
 *
 * التشغيل:  npm run test:branch-economics
 */
import {
  COST_CENTER_KIND_KEYS,
  SHARED_KINDS,
  isShared,
  checkClassification,
  deriveStandardRate,
  appliedRate,
  branchPL,
  companyRollup,
  reconciles,
  recoveryLabel,
  RECONCILIATION_TOLERANCE,
  INDICATORS,
  closureAdvice,
  commissionRate,
  commissionAmount,
  nextTier,
  overrideAmount,
  withinCollectionDeadline,
  breakEven,
  deriveTargets,
  thresholdImpact,
  companyBreakEven,
  safetyMargin,
  achievement,
  preOpenCheck,
  capacitySnapshot,
  capacityAlert,
  adTrend,
  VALIDATION_RULES,
  MATURITY_STAGE_KEYS,
  REJECTED_BASIS,
  round2,
} from '../src/lib/branch-economics.ts';

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
function near(actual, expected, label, tol = 0.02) {
  check(Math.abs(actual - expected) < tol, label, `نتج ${actual} والمتوقع ${expected}`);
}

console.log('\n── ١ · التصنيف ───────────────────────────────────────');

eq(COST_CENTER_KIND_KEYS.length, 4, 'أربع فئات لمراكز التكلفة');
eq(SHARED_KINDS.length, 3, 'ثلاث منها هي الكتلة المشتركة');
check(isShared('production'), 'الإنتاج مشترك');
check(isShared('central_marketing'), 'والتسويق المؤسسي');
check(isShared('general_admin'), 'والإدارة العامة');
check(!isShared('branch_direct'), 'ومصاريف الفرع ليست مشتركة');
check(!isShared(null), 'وبلا فئة ليست مشتركة');

const cls = (kind, branch, isExpense = true) => checkClassification({ kind, branch, isExpense });

check(cls('branch_direct', 'mokattam').ok, 'بند ذاتيّ بفرعه يمرّ');
check(cls('production', null).ok, 'وبند مشترك بلا فرع يمرّ');
check(!cls(null, 'mokattam').ok, '**وبند مصروف بلا مركز تكلفة يُرفض** (القاعدة ١)');
check(!cls('نوع مخترَع', null).ok, 'وفئة غير معروفة تُرفض');

const sharedWithBranch = cls('production', 'mokattam');
check(
  !sharedWithBranch.ok,
  '**وبند مشترك يحمل فرعًا يُرفض** — وإلا صارت الكتلة تخصّ فرعًا (القاعدة ٢)'
);
check(
  sharedWithBranch.error.includes('مصاريف الفرع الذاتية'),
  'والرسالة تدلّه على التصنيف الصحيح لا تقول «خطأ» فقط'
);

const directNoBranch = cls('branch_direct', null);
check(
  !directNoBranch.ok,
  '**وبند ذاتيّ بلا فرع يُرفض** — وإلا دخل الكتلة فتحمّلته الفروع كلها'
);
check(cls(null, null, false).ok, 'وما ليس مصروفًا لا يخضع للقاعدة');

console.log('\n── ٢ · المعدل المعياري ───────────────────────────────');

near(deriveStandardRate(450000, 1000000), 0.45, 'المعدل = الكتلة ÷ الإيراد');
eq(deriveStandardRate(450000, 0), null, '**وبلا إيراد لا معدَّل** — لا صفر: صفرٌ يعني «لا تكلفة مركزية»');
eq(deriveStandardRate(0, 1000000), 0, 'وبلا كتلة معدَّل صفر — وهو صحيح');

near(appliedRate(0.45, 1), 0.45, 'الفرع الناضج يُحمَّل كاملًا');
near(appliedRate(0.45, 0), 0, 'وفرع التأسيس لا يُحمَّل شيئًا');
near(appliedRate(0.45, 0.5), 0.225, 'والنمو يُحمَّل جزئيًا');
near(appliedRate(0.45, 5), 0.45, 'ومعامل فوق الواحد يُقيَّد — لا تحميل مضاعف');
near(appliedRate(0.45, -1), 0, 'ومعامل سالب يُقيَّد بصفر');
eq(MATURITY_STAGE_KEYS.length, 4, 'وأربع مراحل نضج');
eq(REJECTED_BASIS, 'orders', 'وعدد الطلبات أساسٌ مرفوض — قيمة الطلب تتفاوت أضعافًا');

console.log('\n── ٣ · طبقات قائمة دخل الفرع ─────────────────────────');

const branch = branchPL({
  code: 'mokattam',
  name: 'المقطم',
  revenue: 200000,
  directExpenses: 60000,
  depreciation: 5000,
  commissions: 10000,
  appliedRate: 0.45,
  maturityStage: 'mature',
  orders: 400,
  adSpend: 12000,
});
eq(branch.contribution, 130000, 'المساهمة = الإيراد − الذاتية − العمولة');
eq(branch.allocated, 90000, 'والتحميل = الإيراد × النسبة');
eq(branch.loadedNet, 40000, 'والصافي المحمَّل = المساهمة − التحميل');
near(branch.contributionPct, 0.65, 'ونسبة المساهمة');
near(branch.adRatio, 0.06, 'ونسبة الإعلان من الإيراد');
eq(branch.avgOrderValue, 500, 'ومتوسط قيمة الطلب');

const noRevenue = branchPL({
  code: 'x', name: 'x', revenue: 0, directExpenses: 5000, depreciation: 0,
  commissions: 0, appliedRate: 0.45, maturityStage: 'foundation',
});
eq(noRevenue.contributionPct, null, 'وبلا إيراد لا نسبة — لا صفر');
eq(noRevenue.allocated, 0, 'ولا تحميل على فرع بلا إيراد');
eq(noRevenue.contribution, -5000, 'ومساهمته سالبة بمقدار مصاريفه');

console.log('\n── ٤ · خلاصة الشركة وفرق الاسترداد ───────────────────');

const branches = [
  branchPL({ code: 'a', name: 'أ', revenue: 200000, directExpenses: 60000, depreciation: 5000, commissions: 10000, appliedRate: 0.45, maturityStage: 'mature' }),
  branchPL({ code: 'b', name: 'ب', revenue: 100000, directExpenses: 40000, depreciation: 2000, commissions: 5000, appliedRate: 0.45, maturityStage: 'mature' }),
  branchPL({ code: 'c', name: 'ج', revenue: 30000, directExpenses: 25000, depreciation: 1000, commissions: 1500, appliedRate: 0, maturityStage: 'foundation' }),
];
const company = companyRollup({ branches, sharedMass: 140000, standardRate: 0.45 });

eq(company.revenue, 330000, 'إيراد الشركة');
eq(company.totalContribution, 188500, 'ومجموع المساهمات — ١٣٠ألفًا و٥٥ألفًا و٣٬٥٠٠');
eq(company.companyNet, 48500, 'وصافي الشركة = المساهمات − الكتلة الفعلية');
eq(company.totalAllocated, 135000, 'والمحمَّل على الفروع');
eq(company.recoveryVariance, -5000, 'وفرق الاسترداد = المحمَّل − الكتلة');
check(
  company.recoveryVariance < 0,
  'وهو سالب هنا لأن فرع التأسيس معفى — **عجز استرداد باستثمار متعمَّد**'
);
check(recoveryLabel(-5000).includes('عجز'), 'والوصف يشرح المعنى الإداري');
check(recoveryLabel(5000).includes('فائض'), 'والفائض كذلك');

near(company.fullRecoveryRevenue, 311111.11, 'إيراد الاسترداد الكامل = الكتلة ÷ المعدل');
check(
  company.distanceToFullRecovery < 0,
  'والشركة تجاوزته — فبدأت تولّد فائضًا هيكليًا'
);

console.log('\n── ٥ · معادلة التحقّق (§٨) ───────────────────────────');

eq(company.reconciliation, 0, '**مجموع الأصفية + فرق الاسترداد = صافي الشركة بالضبط**');
check(reconciles(company), 'والمعادلة متّزنة');
check(
  reconciles({ ...company, reconciliation: 0.005 }),
  'وفرق أقلّ من قرش يُحتمل كتقريب عشري'
);
check(
  !reconciles({ ...company, reconciliation: 1 }),
  '**وفرق جنيه واحد لا يُحتمل** — خطأ تصنيف لا انحراف مقبول'
);
near(RECONCILIATION_TOLERANCE, 0.01, 'والحدّ قرش واحد');

// المسار المستقلّ: تُحسب من الطرف الآخر فتُطابق
const independentNet = round2(
  branches.reduce((s, b) => s + b.loadedNet, 0) + company.recoveryVariance
);
eq(independentNet, company.companyNet, 'والمساران المستقلّان يتطابقان — وهو الضمانة الوحيدة');

console.log('\n── ٦ · المؤشران ومنع دوامة الإغلاق ───────────────────');

eq(INDICATORS.contribution.notUsedFor, 'التارجت', 'المساهمة لا تُستخدم في التارجت');
eq(INDICATORS.loadedNet.notUsedFor, 'قرار الإغلاق', 'والصافي المحمَّل لا يُستخدم في الإغلاق');

// ★ الحالة القاتلة: مساهمة موجبة وصافي محمَّل سالب
const trap = branchPL({
  code: 'trap', name: 'فخّ', revenue: 100000, directExpenses: 45000, depreciation: 3000,
  commissions: 5000, appliedRate: 0.45, maturityStage: 'mature',
});
eq(trap.contribution, 50000, 'الفرع يساهم بخمسين ألفًا في تغطية المركز');
eq(trap.loadedNet, 5000, 'وصافيه المحمَّل موجب هنا');

const spiral = branchPL({
  code: 'spiral', name: 'دوامة', revenue: 100000, directExpenses: 55000, depreciation: 3000,
  commissions: 5000, appliedRate: 0.45, maturityStage: 'mature',
});
eq(spiral.contribution, 40000, '**مساهمته موجبة: أربعون ألفًا تغطّي بها المركز**');
eq(spiral.loadedNet, -5000, 'وصافيه المحمَّل سالب');

const advice = closureAdvice(spiral);
check(
  !advice.safeToClose,
  '★ **والنظام يرفض إغلاقه** — هذه بالضبط دوامة الإغلاق التي تُهلك الشركة'
);
eq(advice.severity, 'danger', 'ويرفع الإشارة الحمراء على القرار لا على الفرع');
check(
  advice.detail.includes('ثابتة ولا تزول'),
  'ويشرح السبب: التكلفة المركزية لا تزول بإغلاق الفرع'
);

const trulyBad = branchPL({
  code: 'bad', name: 'خاسر', revenue: 30000, directExpenses: 40000, depreciation: 1000,
  commissions: 1500, appliedRate: 0.45, maturityStage: 'mature',
});
check(trulyBad.contribution < 0, 'وفرعٌ لا يغطّي مصاريفه الذاتية مساهمته سالبة');
check(
  closureAdvice(trulyBad).safeToClose,
  '**وهنا وحده يصحّ بحث الإغلاق** — حين تكون المساهمة نفسها غير موجبة'
);

const healthy = closureAdvice(
  branchPL({ code: 'h', name: 'ح', revenue: 200000, directExpenses: 50000, depreciation: 0, commissions: 10000, appliedRate: 0.45, maturityStage: 'mature' })
);
eq(healthy.severity, 'ok', 'والرابح بالمؤشرين لا تحذير عليه');

console.log('\n── ٧ · العمولات القافزة ──────────────────────────────');

const tiers = [
  { fromAmount: 0, rate: 0.02 },
  { fromAmount: 100000, rate: 0.035 },
  { fromAmount: 200000, rate: 0.05 },
];

near(commissionRate(tiers, 50000), 0.02, 'دون العتبة الأولى');
near(commissionRate(tiers, 150000), 0.035, 'وبين العتبتين');
near(commissionRate(tiers, 250000), 0.05, 'وفوق الثانية');

eq(
  commissionAmount(tiers, 150000, 'cliff'),
  5250,
  '★ **القافزة: النسبة على الكل** — ٣٫٥٪ × ١٥٠٬٠٠٠ = ٥٬٢٥٠'
);
eq(
  commissionAmount(tiers, 150000, 'marginal'),
  3750,
  '★ **والتراكمية على الأجزاء** — ٢٬٠٠٠ + ١٬٧٥٠ = ٣٬٧٥٠، والفرق ١٬٥٠٠'
);
check(
  commissionAmount(tiers, 150000, 'cliff') > commissionAmount(tiers, 150000, 'marginal'),
  'والقافزة أعلى دائمًا — وهي المختارة عمدًا: العمولة تعويضٌ عن راتب منخفض'
);
eq(commissionAmount(tiers, 0), 0, 'وبلا إيراد لا عمولة');
eq(commissionAmount([], 100000), 0, 'وبلا شرائح لا عمولة');

const next = nextTier(tiers, 90000);
eq(next.at, 100000, 'العتبة التالية');
eq(next.remaining, 10000, 'وكم يتبقّى لها');
check(next.gain > 0, '**والمكسب من بلوغها** — وهو ما يجعل القفزة قوة جذب');
eq(nextTier(tiers, 500000), null, 'وفوق آخر شريحة لا عتبة تالية');

console.log('\n── ٧ب · أوفررايد الإدارة ─────────────────────────────');

const perBranch = overrideAmount(tiers, [80000, 80000, 80000], 'per_branch');
const aggregate = overrideAmount(tiers, [80000, 80000, 80000], 'aggregate');
eq(perBranch, 4800, 'على كل فرع منفردًا: ثلاثة × ٢٪ من ٨٠٬٠٠٠');
eq(aggregate, 12000, 'وعلى المجموع: ٥٪ من ٢٤٠٬٠٠٠');
check(
  aggregate !== perBranch,
  '★ **والفرق جوهري** — المجموع يبلغ شريحةً لا يبلغها أيّ فرع وحده'
);

console.log('\n── ٧ج · قواعد الاستحقاق ──────────────────────────────');

const day = (n) => new Date(2026, 0, n);
check(withinCollectionDeadline(day(1), day(20), 30), 'التحصيل داخل المهلة يستحق');
check(!withinCollectionDeadline(day(1), day(45), 30), 'وما تجاوزها يسقط استحقاقه');
check(!withinCollectionDeadline(day(1), null, 30), '**وبلا تحصيل لا عمولة** — الأساس المحصَّل لا المفوتر');
check(withinCollectionDeadline(day(1), day(90), 0), 'وبلا مهلة معرَّفة لا يسقط شيء');

console.log('\n── ٨ · التعادل — ومصيدة الضرب بدل القسمة ─────────────');

const be = breakEven({
  directExpenses: 60000,
  depreciation: 5000,
  appliedRate: 0.45,
  commissionRate: 0.05,
});
near(be.relativeMargin, 0.5, 'الهامش النسبي = ١ − ٠٫٤٥ − ٠٫٠٥');
eq(be.loaded, 120000, '★ **التعادل المحمَّل = ٦٠٬٠٠٠ ÷ ٠٫٥ = ١٢٠٬٠٠٠**');

// المصيدة: الضرب في (١ + النسبة) بدل القسمة على (١ − النسبة)
const wrong = round2(60000 * (1 + 0.45 + 0.05));
eq(wrong, 90000, 'والطريقة الخاطئة (ضرب) تعطي ٩٠٬٠٠٠');
check(
  wrong < be.loaded,
  '★ **والخطأ يُنتج تعادلًا أقلّ من الحقيقي دائمًا** — تارجت أدنى وعمولة تُصرف قبل أوانها'
);

eq(be.cash, round2(55000 / 0.95), 'والتعادل النقدي: بلا تحميل وبلا إهلاك');
check(be.cash < be.loaded, 'وهو أدنى من المحمَّل — وهو الحدّ الذي تحته يستنزف الفرع نقدًا');

const impossible = breakEven({
  directExpenses: 60000, depreciation: 0, appliedRate: 0.7, commissionRate: 0.35,
});
check(impossible.relativeMargin <= 0, 'ومجموع النسب فوق الواحد يُصفّر الهامش');
eq(
  impossible.loaded,
  null,
  '★ **ولا يوجد حجم مبيعات يُحقّق التعادل** — المشكلة في النسب لا في الحجم'
);

console.log('\n── ٩ · اشتقاق التارجت ────────────────────────────────');

const targets = deriveTargets(120000, 1.25, 1.6);
eq(targets.floor, 120000, 'الحدّ الأدنى = التعادل — ولا عمولة تحته');
eq(targets.target, 150000, 'والمستهدف = التعادل × معامل المستهدف');
eq(targets.stretch, 192000, 'والطموح × معامل الطموح');
eq(deriveTargets(null, 1.25, 1.6).target, null, 'وبلا تعادل لا تارجت — لا يُخترع رقم');
eq(deriveTargets(120000, 0.5, 1.6).target, 120000, 'ومعامل دون الواحد لا يُنزل التارجت تحت التعادل');

eq(
  thresholdImpact(10000, 0.5),
  20000,
  '★ **تكلفة ثابتة جديدة ترفع العتبة بمقدار التكلفة ÷ الهامش النسبي**'
);
check(
  thresholdImpact(10000, 0.5) > 10000,
  'وترفعها بأكثر من التكلفة نفسها — وإلا صار فرعٌ أكبر بربح أقلّ وعمولة أعلى'
);
eq(thresholdImpact(10000, 0), null, 'وبهامش صفر لا عتبة');

near(companyBreakEven({ sharedMass: 140000, totalDirect: 125000, avgCommissionRate: 0.05 }), 278947.37, 'تعادل الشركة');
eq(companyBreakEven({ sharedMass: 1, totalDirect: 1, avgCommissionRate: 1 }), null, 'وعمولة ١٠٠٪ لا تعادل معها');

near(safetyMargin(330000, 278947.37), 0.1547, 'هامش الأمان');
check(safetyMargin(200000, 278947.37) < 0, 'ويصير سالبًا تحت التعادل');
eq(safetyMargin(330000, null), null, 'وبلا تعادل لا هامش أمان');

near(achievement(150000, 150000), 1, 'تحقيق المستهدف كاملًا');
eq(achievement(150000, null), null, 'وبلا مستهدف لا نسبة تحقيق — لا صفر');
eq(achievement(150000, 0), null, 'ومستهدف صفر ليس مستهدفًا');

console.log('\n── ١٠ · قيود ما قبل فتح فرع ──────────────────────────');

const pre = preOpenCheck({
  setupCost: 150000,
  monthlyDeficit: 20000,
  monthsToBreakEven: 6,
  relativeMargin: 0.5,
  expectedMonthlyRevenue: 80000,
  spareCapacityUnits: 2000,
  unitsPerRevenue: 0.02,
  cashReserve: 200000,
});
eq(pre.cashBurn, 270000, 'الاستنزاف = التجهيز + (العجز الشهري × شهور التعادل)');
eq(pre.breakEvenImpact, 40000, 'وأثره على تعادل الشركة');
check(pre.capacityCovers, 'والطاقة الشاغرة تغطّي مستهدفه');
check(
  pre.warnings.some((w) => w.includes('الاحتياطي')),
  '**والاستنزاف يتجاوز الاحتياطي — فيُحذَّر قبل الفتح لا بعده**'
);

const tightCapacity = preOpenCheck({
  setupCost: 50000, monthlyDeficit: 5000, monthsToBreakEven: 3, relativeMargin: 0.5,
  expectedMonthlyRevenue: 200000, spareCapacityUnits: 500, unitsPerRevenue: 0.02,
  cashReserve: 500000,
});
check(!tightCapacity.capacityCovers, 'وطاقة لا تكفي تُكتشف');
check(
  tightCapacity.warnings.some((w) => w.includes('الطاقة لا النقد')),
  '★ **والتحذير يقول القاعدة: القيد الحقيقي على التوسّع هو الطاقة لا النقد**'
);

console.log('\n── ١١ · الطاقة الإنتاجية ─────────────────────────────');

const cap = capacitySnapshot({
  unitsTranslated: 8000,
  unitsReviewed: 7500,
  translationCapacity: 12000,
  reviewCapacity: 9000,
  productionMass: 120000,
});
eq(cap.capacity, 9000, '**الطاقة هي أصغر الطرفين** — المراجعة هي القيد هنا');
near(cap.utilization, 0.8889, 'والاستغلال منسوبًا إليها');
eq(cap.costPerUnit, 15, 'وتكلفة الوحدة = الكتلة الإنتاجية ÷ الوحدات');
eq(cap.spare, 1000, 'والطاقة الشاغرة');
eq(cap.bottleneck, 'review', '★ **والقيد مُسمّى: المراجعة** — ودمج الوحدتين كان سيُخفيه');

const noCap = capacitySnapshot({
  unitsTranslated: 0, unitsReviewed: 0, translationCapacity: 0, reviewCapacity: 0, productionMass: 0,
});
eq(noCap.utilization, null, 'وبلا طاقة مسجَّلة لا نسبة استغلال — لا صفر');
eq(noCap.costPerUnit, null, 'ولا تكلفة وحدة');

const alertParams = {
  utilization: 0.7, utilizationThreshold: 0.85,
  lateRate: 0.05, lateThreshold: 0.15,
  avgTurnaroundDays: 2, turnaroundThreshold: 4,
};
eq(capacityAlert(alertParams).level, 'ok', 'الطاقة مرتاحة');
eq(
  capacityAlert({ ...alertParams, utilization: 0.9 }).level,
  'warn',
  '**والتنبيه يقع قبل بلوغ ١٠٠٪** — المنتِج الجديد يحتاج أسابيع'
);
eq(
  capacityAlert({ ...alertParams, lateRate: 0.2 }).level,
  'urgent',
  '★ **ونسبة التأخير تسبق حساب الوحدات** — هي الإنذار المبكر الحقيقي'
);
eq(
  capacityAlert({ ...alertParams, avgTurnaroundDays: 6 }).level,
  'urgent',
  'وكذلك زمن التسليم'
);

console.log('\n── ١٢ · المؤشر الحاكم: نسبة الإعلان ──────────────────');

const falling = adTrend([0.12, 0.11, 0.09, 0.07, 0.06]);
check(falling.falling, 'النسبة تنخفض');
check(falling.verdict.includes('يبني أصلًا'), 'والحكم: الفرع يبني أصلًا');

const flat = adTrend([0.1, 0.1, 0.11, 0.1, 0.1]);
check(!flat.falling, 'والثابتة تُكتشف');
check(
  flat.detail.includes('يستأجر إيرادًا'),
  '★ **وثباتها تعني أن الفرع يستأجر إيرادًا ولا يبني أصلًا**'
);

eq(adTrend([0.1, 0.1]).verdict, 'غير مقيس', 'وشهران لا يكفيان للحكم — «غير مقيس» لا «ثابتة»');
eq(adTrend([null, null, null]).verdict, 'غير مقيس', 'وبلا قياس لا حكم');

console.log('\n── ١٣ · القواعد الإلزامية ────────────────────────────');

eq(VALIDATION_RULES.length, 12, 'اثنتا عشرة قاعدة إلزامية');
check(
  VALIDATION_RULES.some((r) => r.n === 7 && r.rule.includes('لا يُوزَّع')),
  '★ **وفرق الاسترداد لا يُوزَّع على الفروع** — بقاؤه في المركز يُبقي تكلفة الطاقة العاطلة مرئية'
);
check(
  VALIDATION_RULES.some((r) => r.n === 6 && r.kind === 'قيد عرض'),
  'وشاشات الإغلاق قيدٌ على العرض لا توثيقٌ فقط'
);

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
