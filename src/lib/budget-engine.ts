import 'server-only';
import { db } from './db';
import {
  annualOf,
  cashflow,
  firstShortfall,
  fromLastYear,
  guessBehaviour,
  marginPlan,
  quarterlyReview,
  seasonalWeights,
  splitByBehaviour,
  stepStates,
  variableRatio,
  round2,
} from './budget';

/**
 * بناء الموازنة من دفاتر الشركة نفسها.
 *
 * كل رقم هنا **مشتقّ من قيود مرحَّلة**: لا تقدير بالعين ولا رقم يُكتب في
 * خانة بلا سند. وما لم يُرحَّل بعدُ لا يظهر — الموازنة تُبنى على ما حدث فعلًا.
 */

/** فعليّ سنة موزَّعًا على شهورها لكل حساب — من القيود المرحَّلة وحدها */
export async function actualsByAccount(year: number): Promise<Map<string, number[]>> {
  const lines = await db.journalLine.findMany({
    where: {
      entry: { status: 'posted', date: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } },
    },
    select: { accountId: true, debit: true, credit: true, entry: { select: { date: true } } },
  });

  const out = new Map<string, number[]>();
  const accounts = await db.account.findMany({
    where: { id: { in: [...new Set(lines.map((l) => l.accountId))] } },
    select: { id: true, type: true },
  });
  const typeOf = new Map(accounts.map((a) => [a.id, a.type]));

  for (const line of lines) {
    const months = out.get(line.accountId) ?? Array(12).fill(0);
    // المصروف يزيد مدينًا والإيراد يزيد دائنًا — والصافي هو ما يدخل الموازنة
    const type = typeOf.get(line.accountId);
    const value = type === 'revenue' ? line.credit - line.debit : line.debit - line.credit;
    months[line.entry.date.getMonth()] += value;
    out.set(line.accountId, months);
  }

  for (const [id, months] of out) out.set(id, months.map(round2));
  return out;
}

export type PlanAccount = {
  id: string;
  name: string;
  type: string;
  group: string | null;
  behaviour: string | null;
  suggestedBehaviour: string | null;
  lastYear: number[];
  lastYearTotal: number;
  budget: number[];
  budgetTotal: number;
  actual: number[];
  actualTotal: number;
};

export type BudgetPlan = {
  year: number;
  budget: { id: string; status: string; contingencyPct: number; growthPct: number; method: string | null; planNotes: string | null } | null;
  accounts: PlanAccount[];
  revenue: PlanAccount[];
  expenses: PlanAccount[];
  totals: {
    revenueBudget: number;
    revenueLastYear: number;
    fixed: number;
    variable: number;
    unclassified: number;
    expenseLastYear: number;
  };
  margin: ReturnType<typeof marginPlan>;
  cashflow: ReturnType<typeof cashflow>;
  shortfall: ReturnType<typeof firstShortfall>;
  variableRatioLastYear: number | null;
  steps: ReturnType<typeof stepStates>;
};

/** كل ما تحتاجه شاشة بناء الموازنة في نداء واحد */
export async function loadPlan(year: number): Promise<BudgetPlan> {
  const [budget, accounts, lastYear, thisYear] = await Promise.all([
    db.budget.findUnique({ where: { year } }),
    db.account.findMany({
      where: { isPostable: true, active: true, type: { in: ['revenue', 'expense'] } },
      select: { id: true, name: true, type: true, expenseGroup: true, costBehavior: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    }),
    actualsByAccount(year - 1),
    actualsByAccount(year),
  ]);

  const lines = budget
    ? await db.budgetLine.findMany({
        where: { budgetId: budget.id },
        select: { accountId: true, month: true, amount: true },
      })
    : [];

  const budgetByAccount = new Map<string, number[]>();
  for (const line of lines) {
    const months = budgetByAccount.get(line.accountId) ?? Array(12).fill(0);
    if (line.month >= 1 && line.month <= 12) months[line.month - 1] = line.amount;
    budgetByAccount.set(line.accountId, months);
  }

  const rows: PlanAccount[] = accounts.map((a) => {
    const ly = lastYear.get(a.id) ?? Array(12).fill(0);
    const bd = budgetByAccount.get(a.id) ?? Array(12).fill(0);
    const ac = thisYear.get(a.id) ?? Array(12).fill(0);
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      group: a.expenseGroup,
      behaviour: a.costBehavior,
      suggestedBehaviour: a.costBehavior ? null : guessBehaviour(a.name),
      lastYear: ly,
      lastYearTotal: annualOf(ly),
      budget: bd,
      budgetTotal: annualOf(bd),
      actual: ac,
      actualTotal: annualOf(ac),
    };
  });

  const revenue = rows.filter((r) => r.type === 'revenue');
  const expenses = rows.filter((r) => r.type === 'expense');

  const behaviourSplit = splitByBehaviour(
    expenses.map((e) => ({ amount: e.budgetTotal, behaviour: e.behaviour }))
  );
  const revenueBudget = round2(revenue.reduce((s, r) => s + r.budgetTotal, 0));
  const revenueLastYear = round2(revenue.reduce((s, r) => s + r.lastYearTotal, 0));
  const expenseLastYear = round2(expenses.reduce((s, r) => s + r.lastYearTotal, 0));

  const contingencyPct = budget?.contingencyPct ?? 0;
  const margin = marginPlan({
    revenue: revenueBudget,
    // غير المصنَّف يُحسب مع الثابت: إدراجه في المتغيّر يخفض نقطة التعادل
    // كذبًا، والتحفّظ هنا أسلم من التفاؤل
    fixed: round2(behaviourSplit.fixed + behaviourSplit.unclassified),
    variable: behaviourSplit.variable,
    contingencyPct,
  });

  const revenueMonths = Array.from({ length: 12 }, (_, m) =>
    round2(revenue.reduce((s, r) => s + (r.budget[m] ?? 0), 0))
  );
  const expenseMonthsRaw = Array.from({ length: 12 }, (_, m) =>
    round2(expenses.reduce((s, r) => s + (r.budget[m] ?? 0), 0))
  );
  // الطوارئ تُوزَّع بالتساوي: حدثٌ مفاجئ لا موسم له
  const monthlyContingency = round2(margin.contingency / 12);
  const expenseMonths = expenseMonthsRaw.map((v) => round2(v + monthlyContingency));

  const flow = cashflow(revenueMonths, expenseMonths);
  const shortfall = firstShortfall(flow);

  const lastYearVariable = round2(
    expenses.filter((e) => e.behaviour === 'variable').reduce((s, e) => s + e.lastYearTotal, 0)
  );

  return {
    year,
    budget: budget
      ? {
          id: budget.id,
          status: budget.status,
          contingencyPct: budget.contingencyPct,
          growthPct: budget.growthPct,
          method: budget.method,
          planNotes: budget.planNotes,
        }
      : null,
    accounts: rows,
    revenue,
    expenses,
    totals: {
      revenueBudget,
      revenueLastYear,
      fixed: behaviourSplit.fixed,
      variable: behaviourSplit.variable,
      unclassified: behaviourSplit.unclassified,
      expenseLastYear,
    },
    margin,
    cashflow: flow,
    shortfall,
    variableRatioLastYear: variableRatio(lastYearVariable, revenueLastYear),
    steps: stepStates({
      hasHistory: lastYear.size > 0,
      revenueBudgeted: revenueBudget,
      expenseAccounts: expenses.length,
      classifiedAccounts: expenses.filter((e) => e.behaviour).length,
      variableBudgeted: behaviourSplit.variable,
      contingencyPct,
      hasActuals: thisYear.size > 0,
      shortfallMonth: shortfall?.month ?? null,
    }),
  };
}

/**
 * يملأ الموازنة من فعليّ العام الماضي بنسبة نمو.
 *
 * **يحترم الموسمية**: يوزّع بشكل العام الماضي لا بالقسمة على اثني عشر. مكتب
 * الترجمة له موسم، وموازنة مسطّحة تُنتج انحرافًا شهريًا لا يدلّ على شيء.
 * والحسابات التي كُتبت موازنتها يدويًا لا تُمسّ إلا بطلب صريح.
 */
export async function fillFromLastYear(params: {
  year: number;
  growthPct: number;
  overwrite: boolean;
  userId: string;
}): Promise<{ filled: number; skipped: number }> {
  const { year, growthPct, overwrite } = params;

  const budget = await db.budget.upsert({
    where: { year },
    update: { growthPct, method: 'last_year_plus' },
    create: { year, name: `موازنة ${year}`, growthPct, method: 'last_year_plus', status: 'draft' },
  });
  if (budget.status === 'approved' && !overwrite) {
    throw new Error('الموازنة معتمدة — لا تُملأ آليًّا فوق ما اعتُمد');
  }

  const [accounts, lastYear, existing] = await Promise.all([
    db.account.findMany({
      where: { isPostable: true, active: true, type: { in: ['revenue', 'expense'] } },
      select: { id: true, name: true, costBehavior: true },
    }),
    actualsByAccount(year - 1),
    db.budgetLine.findMany({ where: { budgetId: budget.id }, select: { accountId: true } }),
  ]);

  const alreadyPlanned = new Set(existing.map((l) => l.accountId));
  let filled = 0;
  let skipped = 0;

  for (const account of accounts) {
    const history = lastYear.get(account.id);
    if (!history || annualOf(history) === 0) continue;
    if (alreadyPlanned.has(account.id) && !overwrite) {
      skipped += 1;
      continue;
    }

    const months = fromLastYear(history, growthPct, true);
    await db.budgetLine.deleteMany({ where: { budgetId: budget.id, accountId: account.id } });
    await db.budgetLine.createMany({
      data: months.map((amount, i) => ({
        budgetId: budget.id,
        accountId: account.id,
        month: i + 1,
        amount,
      })),
    });
    filled += 1;

    // التصنيف المقترح يُثبَّت مرةً واحدة لتكتمل الخطوة الثالثة بلا عمل يدوي
    if (!account.costBehavior) {
      const guess = guessBehaviour(account.name);
      if (guess) await db.account.update({ where: { id: account.id }, data: { costBehavior: guess } });
    }
  }

  return { filled, skipped };
}

/** المراجعة الربعية لحساب واحد — الخطوة السابعة */
export async function quarterlyFor(year: number, accountId: string) {
  const [account, budget] = await Promise.all([
    db.account.findUnique({ where: { id: accountId }, select: { name: true, type: true } }),
    db.budget.findUnique({ where: { year }, select: { id: true } }),
  ]);
  if (!account) return null;

  const [lines, actuals] = await Promise.all([
    budget
      ? db.budgetLine.findMany({
          where: { budgetId: budget.id, accountId },
          select: { month: true, amount: true },
        })
      : Promise.resolve([]),
    actualsByAccount(year),
  ]);

  const budgetMonths = Array(12).fill(0);
  for (const line of lines) if (line.month >= 1 && line.month <= 12) budgetMonths[line.month - 1] = line.amount;

  return {
    name: account.name,
    type: account.type,
    rows: quarterlyReview(budgetMonths, actuals.get(accountId) ?? Array(12).fill(0), account.type === 'revenue'),
  };
}

export { seasonalWeights };
