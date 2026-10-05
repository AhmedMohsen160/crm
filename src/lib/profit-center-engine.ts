import 'server-only';
import { db } from './db';
import { rankCenters, centerTotals, type CenterResult, type CenterTotals } from './profit-centers';

/**
 * مراكز الربحية — ما يقرأ الدفتر.
 *
 * كل رقم هنا **من قيود مرحَّلة**: لا تقدير ولا رقم يُكتب في خانة. وما لم
 * يُرحَّل بعدُ لا يظهر.
 */

export type ProfitCenterReport = {
  rows: CenterResult[];
  totals: CenterTotals;
  /** إيراد أو مصروف مرحَّل بلا مركز — يُقال ولا يُوزَّع بالتخمين */
  unassigned: { revenue: number; cost: number };
};

export async function profitCenterReport(from: Date, to: Date): Promise<ProfitCenterReport> {
  const [centers, lines] = await Promise.all([
    db.costCenter.findMany({
      where: { active: true },
      select: { id: true, name: true, project: true },
      orderBy: { name: 'asc' },
    }),
    db.journalLine.findMany({
      where: {
        entry: { status: 'posted', date: { gte: from, lte: to } },
        account: { type: { in: ['revenue', 'expense'] } },
      },
      select: {
        costCenterId: true,
        debitBase: true,
        creditBase: true,
        account: { select: { type: true } },
      },
    }),
  ]);

  const revenueOf = new Map<string, number>();
  const costOf = new Map<string, number>();
  const unassigned = { revenue: 0, cost: 0 };

  for (const line of lines) {
    // الإيراد دائن، والمصروف مدين — وكلٌّ صافيًا حتى تُطرح القيود العكسية
    const isRevenue = line.account.type === 'revenue';
    const value = isRevenue
      ? line.creditBase - line.debitBase
      : line.debitBase - line.creditBase;
    if (value === 0) continue;

    if (!line.costCenterId) {
      if (isRevenue) unassigned.revenue += value;
      else unassigned.cost += value;
      continue;
    }
    const map = isRevenue ? revenueOf : costOf;
    map.set(line.costCenterId, (map.get(line.costCenterId) ?? 0) + value);
  }

  /**
   * **المركز الذي لم يتحرّك لا يُعرض.** شاشةٌ فيها مئة مركز صامت وخمسةٌ
   * تعمل تُخفي الخمسة — والمحاسب يفتحها ليرى ما يتحرّك.
   */
  const active = centers.filter((c) => revenueOf.has(c.id) || costOf.has(c.id));

  const rows = rankCenters(
    active.map((c) => ({
      id: c.id,
      name: c.name,
      project: c.project,
      revenue: revenueOf.get(c.id) ?? 0,
      cost: costOf.get(c.id) ?? 0,
    }))
  );

  return {
    rows,
    totals: centerTotals(rows),
    unassigned: {
      revenue: Math.round(unassigned.revenue * 100) / 100,
      cost: Math.round(unassigned.cost * 100) / 100,
    },
  };
}
