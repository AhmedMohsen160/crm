import 'server-only';
import { db } from './db';
import {
  checkBalance,
  accountBalance,
  incomeStatement,
  monthlyDepreciation,
  fiscalMonth,
  monthRange,
  yearRange,
  round2,
  toBase,
  isOtherIncome,
  type AccountType,
  type PLResult,
} from './accounting';

/**
 * دفتر الأستاذ — الجانب الخادمي.
 *
 * **الدفاتر ملك المحاسب.** لا يُرحَّل قيد إلا بفعله، ولا يُعدَّل قيد مرحَّل،
 * ولا تُمسّ فترة مغلقة. وما يقترحه النظام من قيود تشغيلية يصل **مسوَّدةً**
 * تنتظر مراجعته — لا يدخل الدفتر من ظهره.
 */

// ── الفترات ────────────────────────────────────────────────────

export async function isPeriodClosed(period: string): Promise<boolean> {
  const row = await db.fiscalPeriod.findUnique({ where: { period } });
  return Boolean(row?.closedAt);
}

// ── الترحيل ────────────────────────────────────────────────────

export class LedgerError extends Error {}

/**
 * يرحّل قيدًا: يفحص توازنه، ويمنع الترحيل في فترة مغلقة، ثم يوقّعه.
 *
 * الفحص يقع **هنا** لا في الشاشة، لأن القيد قد يصل من استيراد أو من مقترح
 * تشغيلي، وقاعدة التوازن لا تحتمل بابًا خلفيًا.
 */
export async function postEntry(entryId: string, userId: string): Promise<void> {
  const entry = await db.journalEntry.findUnique({
    where: { id: entryId },
    include: { lines: true },
  });
  if (!entry) throw new LedgerError('القيد غير موجود');
  if (entry.status === 'posted') throw new LedgerError('القيد مرحَّل بالفعل');
  if (entry.status === 'void') throw new LedgerError('القيد ملغى — لا يُرحَّل');

  if (await isPeriodClosed(entry.period)) {
    throw new LedgerError(`فترة ${entry.period} مغلقة — لا ترحيل فيها`);
  }

  const balance = checkBalance(
    entry.lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit }))
  );
  if (!balance.balanced || balance.problems.length > 0) {
    throw new LedgerError(balance.problems.join(' · '));
  }

  // الحساب غير القابل للترحيل حساب تجميعي — القيد عليه يفسد كل تقرير
  const accounts = await db.account.findMany({
    where: { id: { in: entry.lines.map((l) => l.accountId) } },
    select: { id: true, name: true, isPostable: true, active: true },
  });
  for (const account of accounts) {
    if (!account.isPostable) {
      throw new LedgerError(`«${account.name}» حساب تجميعي — القيد يقع على حساب ختامي`);
    }
    if (!account.active) {
      throw new LedgerError(`«${account.name}» حساب معطَّل`);
    }
  }

  await db.journalEntry.update({
    where: { id: entryId },
    data: { status: 'posted', postedById: userId, postedAt: new Date() },
  });
}

/**
 * إلغاء قيد مرحَّل.
 *
 * **لا يُحذف** (§٣ بند ٥): يصير حاله `void` بسبب صريح فيخرج من كل تقرير
 * ويبقى أثره كاملًا. والفترة المغلقة تحميه من الإلغاء أيضًا.
 */
export async function voidEntry(entryId: string, userId: string, reason: string): Promise<void> {
  const entry = await db.journalEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new LedgerError('القيد غير موجود');
  if (entry.status === 'void') return;
  if (!reason?.trim()) throw new LedgerError('سبب الإلغاء مطلوب');
  if (await isPeriodClosed(entry.period)) {
    throw new LedgerError(`فترة ${entry.period} مغلقة — لا إلغاء فيها`);
  }

  await db.journalEntry.update({
    where: { id: entryId },
    data: { status: 'void', voidReason: reason.trim(), postedById: userId },
  });
}

// ── التجميع ────────────────────────────────────────────────────

export type LedgerFilter = {
  from?: Date;
  to?: Date;
  branch?: string | null;
  costCenterId?: string | null;
  salesAdminId?: string | null;
};

function lineWhere(filter: LedgerFilter) {
  return {
    entry: {
      status: 'posted',
      ...(filter.from || filter.to
        ? {
            date: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lt: filter.to } : {}),
            },
          }
        : {}),
    },
    ...(filter.branch ? { branch: filter.branch } : {}),
    ...(filter.costCenterId ? { costCenterId: filter.costCenterId } : {}),
    ...(filter.salesAdminId ? { salesAdminId: filter.salesAdminId } : {}),
  };
}

export type AccountTotals = {
  accountId: string;
  code: string | null;
  name: string;
  type: AccountType;
  /// بند قائمة الدخل: مصروف بأنواعه الثلاثة أو إيراد خدمات أو إيراد آخر
  group: string | null;
  parentId: string | null;
  debit: number;
  credit: number;
  balance: number;
};

/** مجاميع كل حساب ختامي في المدى — الأساس الذي تُبنى عليه كل التقارير */
export async function accountTotals(filter: LedgerFilter): Promise<AccountTotals[]> {
  const grouped = await db.journalLine.groupBy({
    by: ['accountId'],
    where: lineWhere(filter),
    _sum: { debitBase: true, creditBase: true },
  });
  if (grouped.length === 0) return [];

  const accounts = await db.account.findMany({
    where: { id: { in: grouped.map((g) => g.accountId) } },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      expenseGroup: true,
      parentId: true,
    },
  });
  const byId = new Map(accounts.map((a) => [a.id, a]));

  return grouped
    .map((g) => {
      const account = byId.get(g.accountId);
      if (!account) return null;
      const debit = round2(g._sum.debitBase ?? 0);
      const credit = round2(g._sum.creditBase ?? 0);
      return {
        accountId: g.accountId,
        code: account.code,
        name: account.name,
        type: account.type as AccountType,
        group: account.expenseGroup ?? null,
        parentId: account.parentId,
        debit,
        credit,
        balance: accountBalance(account.type as AccountType, debit, credit),
      };
    })
    .filter(Boolean) as AccountTotals[];
}

/** قائمة الدخل عن مدى — بالبنود الثلاثة التي أقرّتها الإدارة */
export async function profitAndLoss(filter: LedgerFilter): Promise<PLResult> {
  const totals = await accountTotals(filter);

  const sum = (predicate: (t: AccountTotals) => boolean) =>
    round2(totals.filter(predicate).reduce((s, t) => s + t.balance, 0));

  // «إيرادات أخرى» (فروق العملة) تُعرض بعد الصافي كما في الدفاتر —
  // خلطها بإيراد الخدمات يرفع الهامش المجمل زورًا
  return incomeStatement({
    revenue: sum((t) => t.type === 'revenue' && !isOtherIncome(t.group)),
    productionOperating: sum(
      (t) => t.type === 'expense' && t.group === 'production_operating'
    ),
    sellingMarketing: sum((t) => t.type === 'expense' && t.group === 'selling_marketing'),
    generalAdmin: sum((t) => t.type === 'expense' && t.group === 'general_admin'),
    otherIncome: sum((t) => t.type === 'revenue' && isOtherIncome(t.group)),
  });
}

/** قائمة الدخل لكل فرع في المدى — صلب F-Report 1 */
export async function profitAndLossByBranch(
  filter: LedgerFilter,
  branches: string[]
): Promise<{ branch: string; pl: PLResult }[]> {
  return Promise.all(
    branches.map(async (branch) => ({
      branch,
      pl: await profitAndLoss({ ...filter, branch }),
    }))
  );
}

/** قائمة الدخل شهرًا شهرًا في سنة — صلب F-Report 3 */
export async function monthlyProfitAndLoss(
  year: number,
  filter: Omit<LedgerFilter, 'from' | 'to'> = {}
): Promise<{ month: number; pl: PLResult }[]> {
  const out: { month: number; pl: PLResult }[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const { start, end } = monthRange(`${year}-${String(month).padStart(2, '0')}`);
    out.push({ month, pl: await profitAndLoss({ ...filter, from: start, to: end }) });
  }
  return out;
}

/** الأرصدة الافتتاحية + حركة المدى = رصيد الميزانية */
export async function balanceSheetTotals(asOf: Date) {
  const totals = await accountTotals({ to: asOf });
  const of = (type: AccountType) =>
    round2(totals.filter((t) => t.type === type).reduce((s, t) => s + t.balance, 0));

  const assets = of('asset');
  const liabilities = of('liability');
  const equity = of('equity');
  // الأرباح المحتجزة من الفترة نفسها تُقفل ضمن حقوق الملكية
  const profit = round2(of('revenue') - of('expense'));

  return {
    assets,
    liabilities,
    equity,
    profit,
    equityTotal: round2(equity + profit),
    difference: round2(assets - (liabilities + equity + profit)),
    balanced: Math.abs(round2(assets - (liabilities + equity + profit))) < 0.01,
    rows: totals,
  };
}

// ── القيود المقترحة من المشغّل ─────────────────────────────────

/** حساب نظامي يربط حدثًا تشغيليًا بحساب في الشجرة */
async function systemAccount(key: string) {
  return db.account.findUnique({ where: { systemKey: key } });
}

type DraftLine = {
  accountId: string;
  debit: number;
  credit: number;
  memo?: string;
  branch?: string | null;
  salesAdminId?: string | null;
  trafficSource?: string | null;
  translationType?: string | null;
};

/**
 * ينشئ قيدًا **مسوَّدةً** من حدث تشغيلي.
 *
 * ولا يُنشئ الثاني لنفس الحدث: `sourceType + sourceId` مفتاح تفرّد عملي،
 * فتكرار التسليم أو إعادة الحساب لا تُغرق الدفتر بقيود مكررة.
 */
async function draftFromSource(params: {
  sourceType: string;
  sourceId: string;
  date: Date;
  description: string;
  lines: DraftLine[];
  projectId?: string | null;
  docType?: string;
  docNumber?: string | null;
}): Promise<string | null> {
  const { sourceType, sourceId, lines } = params;
  if (lines.length < 2) return null;

  const existing = await db.journalEntry.findFirst({
    where: { sourceType, sourceId, status: { not: 'void' } },
  });
  if (existing) return existing.id;

  const balance = checkBalance(lines);
  if (!balance.balanced) return null;

  const period = fiscalMonth(params.date);
  if (await isPeriodClosed(period)) return null;

  const entry = await db.journalEntry.create({
    data: {
      date: params.date,
      period,
      docType: params.docType ?? 'journal',
      docNumber: params.docNumber ?? null,
      description: params.description,
      status: 'draft',
      sourceType,
      sourceId,
      projectId: params.projectId ?? null,
      lines: {
        create: lines.map((l, i) => ({
          accountId: l.accountId,
          debit: round2(l.debit),
          credit: round2(l.credit),
          debitBase: round2(l.debit),
          creditBase: round2(l.credit),
          memo: l.memo ?? null,
          branch: l.branch ?? null,
          salesAdminId: l.salesAdminId ?? null,
          trafficSource: l.trafficSource ?? null,
          translationType: l.translationType ?? null,
          sortOrder: i,
        })),
      },
    },
  });
  return entry.id;
}

/**
 * الاعتراف بالإيراد عند التسليم (§٣ بند ٤ من المواصفة الأصلية).
 *
 * ```
 * من ح/ العملاء            (مدين)
 *     إلى ح/ إيراد الترجمة (دائن)
 * ```
 */
export async function draftRevenueOnDelivery(projectId: string): Promise<string | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, code: true, title: true, netTotal: true, deliveredAt: true,
      branch: true, ownerId: true, serviceLine: true, clientId: true,
      client: { select: { name: true } },
    },
  });
  if (!project || !project.netTotal || project.netTotal <= 0) return null;

  const [receivable, revenue] = await Promise.all([
    systemAccount('ar_clients'),
    systemAccount('rev_written_translation'),
  ]);
  if (!receivable || !revenue) return null;

  return draftFromSource({
    sourceType: 'project.delivered',
    sourceId: project.id,
    date: project.deliveredAt ?? new Date(),
    description: `إيراد مشروع ${project.code ?? ''} — ${project.title}`,
    projectId: project.id,
    docType: 'e_invoice',
    docNumber: project.code,
    lines: [
      {
        accountId: receivable.id,
        debit: project.netTotal,
        credit: 0,
        memo: project.client?.name ?? undefined,
        branch: project.branch,
        salesAdminId: project.ownerId,
      },
      {
        accountId: revenue.id,
        debit: 0,
        credit: project.netTotal,
        branch: project.branch,
        salesAdminId: project.ownerId,
      },
    ],
  });
}

/**
 * التحصيل:
 * ```
 * من ح/ الخزينة        (مدين)
 *     إلى ح/ العملاء   (دائن)
 * ```
 */
export async function draftCollection(projectId: string): Promise<string | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, code: true, title: true, netTotal: true, deposit: true,
      collectedAmount: true, collectedAt: true, branch: true, ownerId: true,
    },
  });
  if (!project) return null;

  const amount = round2(Math.min(project.netTotal ?? 0, project.deposit + project.collectedAmount));
  if (amount <= 0) return null;

  const [cash, receivable] = await Promise.all([
    systemAccount('cash_egp'),
    systemAccount('ar_clients'),
  ]);
  if (!cash || !receivable) return null;

  return draftFromSource({
    sourceType: 'project.collected',
    sourceId: project.id,
    date: project.collectedAt ?? new Date(),
    description: `تحصيل مشروع ${project.code ?? ''} — ${project.title}`,
    projectId: project.id,
    docType: 'receipt',
    docNumber: project.code,
    lines: [
      { accountId: cash.id, debit: amount, credit: 0, branch: project.branch, salesAdminId: project.ownerId },
      { accountId: receivable.id, debit: 0, credit: amount, branch: project.branch, salesAdminId: project.ownerId },
    ],
  });
}

/**
 * صرف مستحق فريلانسر:
 * ```
 * من ح/ خدمات تشغيلية خارجية — ترجمة  (مدين)
 *     إلى ح/ الخزينة                   (دائن)
 * ```
 * وهو الربط الذي يجعل تكلفة الإنتاج في الدفاتر **مطابقة** لما دفعناه فعلًا.
 */
export async function draftFreelancerPayment(paymentId: string): Promise<string | null> {
  const payment = await db.freelancerPayment.findUnique({
    where: { id: paymentId },
    include: {
      freelancer: { select: { name: true } },
      project: { select: { id: true, code: true, branch: true } },
    },
  });
  if (!payment || payment.amount <= 0) return null;

  const [expense, cash] = await Promise.all([
    systemAccount('exp_outsourced_translation'),
    systemAccount('cash_egp'),
  ]);
  if (!expense || !cash) return null;

  return draftFromSource({
    sourceType: 'freelancerPayment.paid',
    sourceId: payment.id,
    date: payment.paidAt ?? new Date(),
    description: `صرف مستحق ${payment.freelancer.name}${
      payment.project?.code ? ` — ${payment.project.code}` : ''
    }`,
    projectId: payment.projectId,
    docType: 'payment_voucher',
    docNumber: payment.reference,
    lines: [
      {
        accountId: expense.id,
        debit: payment.amount,
        credit: 0,
        memo: payment.freelancer.name,
        branch: payment.project?.branch ?? null,
      },
      { accountId: cash.id, debit: 0, credit: payment.amount, branch: payment.project?.branch ?? null },
    ],
  });
}

/**
 * استحقاق عمولات المبيعات عن فترة:
 * ```
 * من ح/ رواتب وأجور (بيعية) — عمولات  (مدين)
 *     إلى ح/ مصروفات مستحقة            (دائن)
 * ```
 * المبلغ يأتي من محرّك النسب (المرحلة ٦) فلا يُدخَل يدويًا مرتين.
 */
export async function draftCommissionAccrual(period: string): Promise<string | null> {
  const entries = await db.commissionEntry.groupBy({
    by: ['userId'],
    where: { period },
    _sum: { amount: true },
  });
  const total = round2(entries.reduce((s, e) => s + (e._sum.amount ?? 0), 0));
  if (total <= 0) return null;

  const [expense, accrued] = await Promise.all([
    systemAccount('exp_sales_commission'),
    systemAccount('ap_accrued'),
  ]);
  if (!expense || !accrued) return null;

  const { end } = monthRange(period);
  const date = new Date(end.getTime() - 86_400_000);

  return draftFromSource({
    sourceType: 'commission.period',
    sourceId: period,
    date,
    description: `استحقاق عمولات المبيعات عن ${period}`,
    lines: [
      { accountId: expense.id, debit: total, credit: 0 },
      { accountId: accrued.id, debit: 0, credit: total },
    ],
  });
}

/**
 * إهلاك الشهر — سطر مدين لكل نوع أصل ودائن مقابل في مجمّع الإهلاك.
 *
 * **لا يُرحَّل شهر مرتين:** كل أصل يحمل آخر شهر أُهلك فيه، ومن بلغه يُستبعد.
 */
export async function draftMonthlyDepreciation(period: string): Promise<string | null> {
  const assets = await db.fixedAsset.findMany({
    where: { active: true, disposedAt: null, startPeriod: { lte: period } },
  });
  if (assets.length === 0) return null;

  const due = assets.filter((a) => !a.lastPeriod || a.lastPeriod < period);
  if (due.length === 0) return null;

  const [expense, accumulated] = await Promise.all([
    systemAccount('exp_depreciation'),
    systemAccount('acc_depreciation'),
  ]);
  if (!expense || !accumulated) return null;

  let total = 0;
  const memos: string[] = [];
  for (const asset of due) {
    const amount = monthlyDepreciation({
      cost: asset.cost,
      annualRate: asset.annualRate,
      accumulated: asset.accumulated,
      salvage: asset.salvageValue,
    });
    if (amount <= 0) continue;
    total = round2(total + amount);
    memos.push(`${asset.name}: ${amount}`);
  }
  if (total <= 0) return null;

  const { end } = monthRange(period);
  const date = new Date(end.getTime() - 86_400_000);

  const entryId = await draftFromSource({
    sourceType: 'depreciation.period',
    sourceId: period,
    date,
    description: `إهلاك الأصول الثابتة عن ${period} — ${memos.length} أصلًا`,
    lines: [
      { accountId: expense.id, debit: total, credit: 0, memo: memos.join(' · ').slice(0, 500) },
      { accountId: accumulated.id, debit: 0, credit: total },
    ],
  });

  // المجمّع يزيد **مع إنشاء المسوَّدة** لا مع ترحيلها، وإلا احتُسب الشهر
  // مرتين لو أنشأ المحاسب المسوَّدة ثم أعاد إنشاءها قبل الترحيل
  if (entryId) {
    for (const asset of due) {
      const amount = monthlyDepreciation({
        cost: asset.cost,
        annualRate: asset.annualRate,
        accumulated: asset.accumulated,
        salvage: asset.salvageValue,
      });
      if (amount <= 0) continue;
      await db.fixedAsset.update({
        where: { id: asset.id },
        data: { accumulated: round2(asset.accumulated + amount), lastPeriod: period },
      });
    }
  }

  return entryId;
}

// ── الموازنة مقابل الفعلي ──────────────────────────────────────

export async function budgetVsActual(year: number, branch?: string | null) {
  const budget = await db.budget.findUnique({
    where: { year },
    include: { lines: { include: { account: true } } },
  });
  if (!budget) return null;

  const { start, end } = yearRange(year);
  const actuals = await accountTotals({ from: start, to: end, branch });
  const actualById = new Map(actuals.map((a) => [a.accountId, a.balance]));

  const byAccount = new Map<
    string,
    { accountId: string; name: string; type: AccountType; budget: number; actual: number }
  >();

  for (const line of budget.lines) {
    if (branch && line.branch && line.branch !== branch) continue;
    const row = byAccount.get(line.accountId) ?? {
      accountId: line.accountId,
      name: line.account.name,
      type: line.account.type as AccountType,
      budget: 0,
      actual: actualById.get(line.accountId) ?? 0,
    };
    row.budget = round2(row.budget + line.amount);
    byAccount.set(line.accountId, row);
  }

  return { budget, rows: [...byAccount.values()] };
}

export { toBase };
