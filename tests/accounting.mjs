/**
 * اختبار المحاسبة — بالأرقام الحرفية من دفاتر فاست ترانس
 * (`docs/FINANCE-SPEC.md` §٦).
 *
 * هذه أرقام قوائم مالية تُقدَّم للإدارة، فالخطأ فيها يُكتشف هنا لا في اجتماع.
 *
 * التشغيل:  npm run test:accounting
 */
import {
  checkBalance,
  accountBalance,
  trialBalance,
  incomeStatement,
  budgetVariance,
  spreadAnnual,
  monthlyDepreciation,
  bookValue,
  monthsBetween,
  cac,
  roas,
  yoyGrowth,
  fiscalMonth,
  fiscalQuarter,
  monthRange,
  toBase,
  round2,
} from '../src/lib/accounting.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}
function eq(actual, expected, label) {
  check(actual === expected, label, `نتج ${JSON.stringify(actual)} والمتوقع ${JSON.stringify(expected)}`);
}
function near(actual, expected, label, tol = 0.01) {
  check(Math.abs(actual - expected) < tol, label, `نتج ${actual} والمتوقع ${expected}`);
}

console.log('\n── توازن القيد: القاعدة التي لا يقوم بدونها دفتر ──────');

const good = checkBalance([
  { accountId: 'cash', debit: 1000, credit: 0 },
  { accountId: 'revenue', debit: 0, credit: 1000 },
]);
check(good.balanced, 'قيد متوازن يُقبل');
eq(good.problems.length, 0, 'وبلا ملاحظات');
eq(good.totalDebit, 1000, 'ومجموع المدين صحيح');

const unbalanced = checkBalance([
  { accountId: 'cash', debit: 1000, credit: 0 },
  { accountId: 'revenue', debit: 0, credit: 900 },
]);
check(!unbalanced.balanced, 'قيد غير متوازن يُرفض');
eq(unbalanced.difference, 100, 'والفرق يُحسب ويُعرض ليُصحَّح');

const bothSides = checkBalance([
  { accountId: 'a', debit: 500, credit: 500 },
  { accountId: 'b', debit: 500, credit: 500 },
]);
check(
  bothSides.problems.some((p) => p.includes('لا يجتمع مدين ودائن')),
  'سطر يحمل مدينًا ودائنًا معًا يُرفض — يوهم بالتوازن وهو خطأ إدخال'
);

const negative = checkBalance([
  { accountId: 'a', debit: -100, credit: 0 },
  { accountId: 'b', debit: 0, credit: -100 },
]);
check(
  negative.problems.some((p) => p.includes('سالبة')),
  'المبالغ السالبة تُرفض — العكس بتبديل العمودين لا بإشارة'
);

const empty = checkBalance([
  { accountId: 'a', debit: 0, credit: 0 },
  { accountId: 'b', debit: 0, credit: 0 },
]);
check(empty.problems.some((p) => p.includes('بلا مبلغ')), 'السطر الفارغ يُرفض');

const single = checkBalance([{ accountId: 'a', debit: 100, credit: 0 }]);
check(
  single.problems.some((p) => p.includes('سطرين على الأقل')),
  'القيد بسطر واحد يُرفض — القيد المزدوج يحتاج طرفين'
);

const noAccount = checkBalance([
  { accountId: '', debit: 100, credit: 0 },
  { accountId: 'b', debit: 0, credit: 100 },
]);
check(noAccount.problems.some((p) => p.includes('بلا حساب')), 'سطر بلا حساب يُرفض');

// قيد بأربعة أطراف — الشائع في الواقع
const multi = checkBalance([
  { accountId: 'cash', debit: 800, credit: 0 },
  { accountId: 'wht', debit: 50, credit: 0 },
  { accountId: 'discount', debit: 150, credit: 0 },
  { accountId: 'client', debit: 0, credit: 1000 },
]);
check(multi.balanced, 'قيد بأربعة أطراف متوازن يُقبل');

// كسور القروش لا تُسقط قيدًا صحيحًا
const cents = checkBalance([
  { accountId: 'a', debit: 33.33, credit: 0 },
  { accountId: 'b', debit: 33.33, credit: 0 },
  { accountId: 'c', debit: 33.34, credit: 0 },
  { accountId: 'd', debit: 0, credit: 100 },
]);
check(cents.balanced, 'قسمة ١٠٠ على ثلاثة تظل متوازنة — لا تُرفض بفرق قرش');

console.log('\n── الأرصدة وطبيعة الحساب ─────────────────────────────');

eq(accountBalance('asset', 1000, 200), 800, 'الأصل: مدين ناقص دائن');
eq(accountBalance('expense', 500, 0), 500, 'المصروف مدين بطبيعته');
// الحاسم: الإيراد لا يظهر سالبًا
eq(accountBalance('revenue', 200, 1000), 800, 'الإيراد: دائن ناقص مدين — موجب لا سالب');
eq(accountBalance('liability', 300, 1000), 700, 'الالتزام دائن بطبيعته');
eq(accountBalance('equity', 0, 5000), 5000, 'حقوق الملكية دائنة');
eq(accountBalance('asset', 200, 1000), -800, 'الأصل الدائن يظهر سالبًا — إشارة لخلل يُراجَع');

const tb = trialBalance([
  { accountId: 'cash', type: 'asset', debit: 5000, credit: 1000 },
  { accountId: 'client', type: 'asset', debit: 3000, credit: 0 },
  { accountId: 'revenue', type: 'revenue', debit: 0, credit: 9000 },
  { accountId: 'rent', type: 'expense', debit: 2000, credit: 0 },
]);
eq(tb.totalDebit, 9000, 'ميزان المراجعة: مجموع المدين');
eq(tb.totalCredit, 9000, 'ومجموع الدائن');
check(tb.balanced, 'والميزان متوازن');

const tbOff = trialBalance([
  { accountId: 'cash', type: 'asset', debit: 5000, credit: 0 },
  { accountId: 'revenue', type: 'revenue', debit: 0, credit: 4000 },
]);
check(!tbOff.balanced, 'وميزان غير متوازن يُعلن عن نفسه لا يُخفى');

console.log('\n── قائمة الدخل: أرقام ٢٠٢٣ و٢٠٢٤ و٢٠٢٥ الحقيقية ─────');

const y2023 = incomeStatement({
  revenue: 3234373,
  productionOperating: 1366712,
  sellingMarketing: 473630,
  generalAdmin: 547155,
  otherIncome: 136364,
});
eq(y2023.grossProfit, 1867661, '٢٠٢٣: مجمل الربح ١٬٨٦٧٬٦٦١');
near(y2023.grossMarginPct, 0.5774, '٢٠٢٣: هامش مجمل ٥٧٫٧٤٪', 0.0001);
eq(y2023.netProfit, 846876, '٢٠٢٣: صافي الربح ٨٤٦٬٨٧٦');
near(y2023.netMarginPct, 0.2618, '٢٠٢٣: هامش صافٍ ٢٦٫١٨٪', 0.0001);
eq(y2023.finalNetProfit, 983240, '٢٠٢٣: الصافي النهائي بعد فروق العملة ٩٨٣٬٢٤٠');

const y2024 = incomeStatement({
  revenue: 5449160,
  productionOperating: 2670808,
  sellingMarketing: 933927,
  generalAdmin: 953235,
});
eq(y2024.grossProfit, 2778352, '٢٠٢٤: مجمل الربح ٢٬٧٧٨٬٣٥٢');
near(y2024.grossMarginPct, 0.5099, '٢٠٢٤: هامش مجمل ٥٠٫٩٩٪', 0.0001);
eq(y2024.netProfit, 891190, '٢٠٢٤: صافي الربح ٨٩١٬١٩٠');

const y2025 = incomeStatement({
  revenue: 4719646,
  productionOperating: 2416514,
  sellingMarketing: 975234,
  generalAdmin: 1154970,
});
eq(y2025.grossProfit, 2303132, '٢٠٢٥: مجمل الربح ٢٬٣٠٣٬١٣٢');
eq(y2025.netProfit, 172928, '٢٠٢٥: صافي الربح ١٧٢٬٩٢٨ — سنة الانضغاط');
near(y2025.netMarginPct, 0.0366, '٢٠٢٥: هامش صافٍ ٣٫٦٦٪', 0.0001);

// هيكل المصروف — ما يُقارَن سنة بسنة
near(y2025.structure.totalPct, 0.9634, '٢٠٢٥: المصروف ٩٦٫٣٤٪ من الإيراد', 0.0001);
near(y2023.structure.totalPct, 0.7382, '٢٠٢٣: المصروف ٧٣٫٨٢٪ من الإيراد', 0.0001);

// **الحاسم**: الإداري والتسويقي لا يدخلان مجمل الربح
const isolation = incomeStatement({
  revenue: 1000,
  productionOperating: 400,
  sellingMarketing: 300,
  generalAdmin: 200,
});
eq(isolation.grossProfit, 600, 'مجمل الربح لا يُخصم منه إداري ولا تسويقي');
eq(isolation.netProfit, 100, 'وصافي الربح يخصمهما');

const zero = incomeStatement({
  revenue: 0,
  productionOperating: 5000,
  sellingMarketing: 0,
  generalAdmin: 0,
});
eq(zero.grossMarginPct, 0, 'شهر بلا إيراد لا يقسم على صفر');
eq(zero.netProfit, -5000, 'ويظهر خسارته كاملة');

console.log('\n── الموازنة والانحراف ────────────────────────────────');

const revenueOver = budgetVariance('revenue', 100000, 120000);
eq(revenueOver.variance, 20000, 'تجاوز الإيراد موازنته: انحراف موجب');
check(revenueOver.favourable, 'وهو في صالح الشركة');

const expenseOver = budgetVariance('expense', 50000, 65000);
eq(expenseOver.variance, -15000, 'تجاوز المصروف موازنته: انحراف سالب');
check(!expenseOver.favourable, 'وهو ضد الشركة — الإشارة تتبع المعنى لا الطرح');

const expenseUnder = budgetVariance('expense', 50000, 40000);
eq(expenseUnder.variance, 10000, 'وتوفير المصروف انحراف موجب');
check(expenseUnder.favourable, 'في صالح الشركة');
near(expenseUnder.variancePct, 0.2, 'ونسبته ٢٠٪ من الموازنة');

eq(budgetVariance('revenue', 0, 5000).variancePct, 0, 'موازنة صفر لا تقسم على صفر');

const spread = spreadAnnual(1200000);
eq(spread.length, 12, 'التوزيع السنوي اثنا عشر شهرًا');
eq(spread[0], 100000, 'بالتساوي عند غياب الأوزان');
eq(round2(spread.reduce((a, b) => a + b, 0)), 1200000, 'ومجموعها يطابق السنوي بالضبط');

const odd = spreadAnnual(100000);
eq(round2(odd.reduce((a, b) => a + b, 0)), 100000, 'ومبلغ لا يقبل القسمة يظل مجموعه مطابقًا');

const weighted = spreadAnnual(120000, [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
check(weighted[0] > weighted[1], 'الأوزان الشهرية تُحترم — الموسم أعلى');
eq(round2(weighted.reduce((a, b) => a + b, 0)), 120000, 'والمجموع يظل مطابقًا');

console.log('\n── الإهلاك: نسب الأصول الفعلية ───────────────────────');

// أجهزة حاسب ١٧٤٬٧٣٠ بنسبة ٢٥٪ ← ٣٬٦٤٠٫٢١ شهريًا
near(
  monthlyDepreciation({ cost: 174730, annualRate: 0.25, accumulated: 0 }),
  3640.21,
  'أجهزة الحاسب ٢٥٪: القسط الشهري ٣٬٦٤٠٫٢١'
);
// تكييفات ٤٥٬٧٠٠ بنسبة ٥٠٪ ← ١٬٩٠٤٫١٧
near(
  monthlyDepreciation({ cost: 45700, annualRate: 0.5, accumulated: 0 }),
  1904.17,
  'التكييفات ٥٠٪: القسط الشهري ١٬٩٠٤٫١٧'
);

// **الحاسم**: المجمّع لا يتجاوز التكلفة أبدًا
eq(
  monthlyDepreciation({ cost: 10000, annualRate: 0.25, accumulated: 10000 }),
  0,
  'الأصل المستهلَك بالكامل يتوقف قسطه'
);
eq(
  monthlyDepreciation({ cost: 10000, annualRate: 0.25, accumulated: 9900 }),
  100,
  'والقسط الأخير يُقصّ ليطابق المتبقي — لا قيمة دفترية سالبة'
);
eq(monthlyDepreciation({ cost: 0, annualRate: 0.25, accumulated: 0 }), 0, 'أصل بلا تكلفة لا يُهلَك');
eq(monthlyDepreciation({ cost: 5000, annualRate: 0, accumulated: 0 }), 0, 'ونسبة صفر لا تُهلِك');
near(
  monthlyDepreciation({ cost: 12000, annualRate: 0.25, accumulated: 0, salvage: 2000 }),
  250,
  'القيمة المتبقية تُطرح من الأساس القابل للإهلاك'
);

eq(bookValue(174730, 84248.21), 90481.79, 'القيمة الدفترية = التكلفة − المجمّع');
eq(bookValue(1000, 1500), 0, 'ولا تنزل تحت الصفر مهما بلغ المجمّع');

eq(monthsBetween(new Date(2026, 0, 1), new Date(2026, 6, 1)), 6, 'الشهور بين يناير ويوليو');
eq(monthsBetween(new Date(2025, 10, 1), new Date(2026, 1, 1)), 3, 'وعبر السنة');
eq(monthsBetween(new Date(2026, 5, 1), new Date(2026, 0, 1)), 0, 'وتاريخ سابق ← صفر لا سالب');

console.log('\n── تحليلات الاكتساب ──────────────────────────────────');

// ٢٠٢٣: إنفاق جوجل ٨٨٬٥٠٠ على ١٣٤ عميلًا ← ٦٦٠٫٤٥
near(cac(88500, 134), 660.45, 'CAC جوجل ٢٠٢٣ ≈ ٦٦٠');
// ٢٠٢٦: ٢٢١٬٨٣٢ على ٤١ عميلًا ← ٥٬٤١٠٫٥٤
near(cac(221832, 41), 5410.54, 'CAC جوجل ٢٠٢٦ ≈ ٥٬٤١٠ — قفزة تستحق قرارًا');
eq(cac(52000, 0), null, 'بلا عملاء ← «لا بيانات» لا صفر (والصفر هنا كذبة)');
eq(cac(0, 100), 0, 'وبلا إنفاق ← صفر حقيقي');

near(roas(500000, 100000), 5, 'عائد الإنفاق الإعلاني ٥ أضعاف');
eq(roas(500000, 0), null, 'وبلا إنفاق لا عائد يُحسب');

near(yoyGrowth(5449160, 3234373), 0.6848, 'نمو ٢٠٢٤ على ٢٠٢٣ ≈ ٦٨٫٥٪', 0.0001);
near(yoyGrowth(4719646, 5449160), -0.1339, 'وتراجع ٢٠٢٥ ≈ −١٣٫٤٪', 0.0001);
eq(yoyGrowth(1000, 0), null, 'ولا خط أساس ← لا نسبة نمو (لا لانهاية)');

console.log('\n── الفترات والعملات ──────────────────────────────────');

eq(fiscalMonth(new Date(2026, 6, 15)), '2026-07', 'مفتاح الشهر YYYY-MM');
eq(fiscalQuarter(new Date(2026, 6, 15)), '2026-Q3', 'ومفتاح الربع');
eq(fiscalQuarter(new Date(2026, 0, 1)), '2026-Q1', 'ويناير في الربع الأول');
eq(fiscalQuarter(new Date(2026, 11, 31)), '2026-Q4', 'وديسمبر في الرابع');

const r = monthRange('2026-02');
eq(r.start.getMonth(), 1, 'مدى فبراير يبدأ بفبراير');
eq(r.end.getMonth(), 2, 'وينتهي بأول مارس — الحد الأعلى غير شامل');

near(toBase(1000, 48.5), 48500, 'تحويل ألف دولار بسعر ٤٨٫٥');
eq(toBase(1000, 0), 1000, 'وسعر صفر لا يمحو المبلغ — يُعامَل كواحد');
eq(toBase(1000, 1), 1000, 'والعملة الأساس بلا تحويل');

const failed = results.filter((x) => !x.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
