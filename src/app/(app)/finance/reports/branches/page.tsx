import Link from '@/components/link';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { listOptions } from '@/lib/reference';
import { accountTotals, profitAndLoss } from '@/lib/ledger';
import { fiscalMonth, fiscalMonthLabel, monthRange, shiftMonth } from '@/lib/accounting';
import { REVENUE_FILTER } from '@/lib/projects';
import { formatMoney } from '@/lib/utils';
import { PageHeader } from '@/components/ui';

export const metadata = { title: 'كشف الفروع' };
export const dynamic = 'force-dynamic';

/**
 * كشف الفرع (F-Report 2) — **الجسر بين الدفاتر والتشغيل**.
 *
 * لكل فرع، على ثلاثة أشهر: المبيعات المفوترة · المحصَّل فعلًا · عدد الطلبات ·
 * الإيجار · رواتب الفرع · الإعلانات · **العمولات المستحقة**.
 *
 * المبيعات وعدد الطلبات من المشاريع، والمصاريف من الدفاتر، والعمولات من
 * محرّك النسب. ثلاثة مصادر في جدول واحد — وهذا بالضبط ما كان المحاسب
 * يجمعه يدويًا كل شهر.
 */
export default async function BranchReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requirePermission('canManageAccounting');
  const { period: requested } = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(requested ?? '') ? requested! : fiscalMonth(new Date());

  // ثلاثة أشهر: الحالي واللذان قبله — كما في كشف المحاسب
  const periods = [shiftMonth(period, -2), shiftMonth(period, -1), period];
  const branchList = await listOptions('branch');

  const data = await Promise.all(
    branchList.map(async (branch) => {
      const months = await Promise.all(
        periods.map(async (p) => {
          const { start, end } = monthRange(p);

          const [pl, totals, projects, collected, commissions] = await Promise.all([
            profitAndLoss({ from: start, to: end, branch: branch.value }),
            accountTotals({ from: start, to: end, branch: branch.value }),
            db.project.aggregate({
              where: { branch: branch.value, deliveredAt: { gte: start, lt: end }, ...REVENUE_FILTER },
              _sum: { netTotal: true },
              _count: true,
            }),
            db.project.aggregate({
              where: { branch: branch.value, collectedAt: { gte: start, lt: end }, status: 'collected' },
              _sum: { deposit: true, collectedAmount: true },
            }),
            db.commissionEntry.aggregate({
              where: { period: p, user: { branch: branch.value } },
              _sum: { amount: true },
            }),
          ]);

          const named = (needle: string) =>
            totals
              .filter((t) => t.name.includes(needle))
              .reduce((s, t) => s + t.balance, 0);

          return {
            period: p,
            invoiced: projects._sum.netTotal ?? 0,
            orders: projects._count,
            collected: (collected._sum.deposit ?? 0) + (collected._sum.collectedAmount ?? 0),
            rent: named('إيجار'),
            salaries: named('رواتب'),
            ads: named('إعلانات'),
            commissions: commissions._sum.amount ?? 0,
            expenses: pl.totalOperatingExpenses,
            net: pl.netProfit,
          };
        })
      );
      return { branch, months };
    })
  );

  const ROWS = [
    { key: 'invoiced' as const, label: 'إجمالي المبيعات المفوترة' },
    { key: 'collected' as const, label: 'إجمالي المحصَّل فعليًا' },
    { key: 'orders' as const, label: 'عدد الطلبات', plain: true },
    { key: 'rent' as const, label: 'الإيجار' },
    { key: 'salaries' as const, label: 'رواتب موظفي الفرع' },
    { key: 'ads' as const, label: 'مصروف الإعلانات' },
    { key: 'commissions' as const, label: 'العمولات المستحقة' },
    { key: 'expenses' as const, label: 'إجمالي المصروف' },
    { key: 'net' as const, label: 'صافي الفرع', strong: true },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="كشف الفروع"
        subtitle={`ثلاثة أشهر حتى ${fiscalMonthLabel(period)} — المبيعات من التشغيل والمصاريف من الدفاتر`}
      >
        <Link href="/finance" className="btn-secondary">
          لوحة الماليات
        </Link>
      </PageHeader>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="period">
            حتى شهر
          </label>
          <input id="period" name="period" type="month" defaultValue={period} className="input w-44" />
        </div>
        <button type="submit" className="btn-secondary">
          عرض
        </button>
      </form>

      {data.map(({ branch, months }) => {
        const empty = months.every((m) => m.invoiced === 0 && m.expenses === 0 && m.orders === 0);
        if (empty) return null;

        return (
          <section key={branch.value}>
            <h2 className="mb-3 section-title">فرع {branch.label}</h2>
            <div className="card table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>البيان</th>
                    {months.map((m) => (
                      <th key={m.period}>{fiscalMonthLabel(m.period)}</th>
                    ))}
                    <th>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row) => {
                    const total = months.reduce((s, m) => s + (m[row.key] as number), 0);
                    return (
                      <tr key={row.key} className={row.strong ? 'bg-slate-50 font-semibold' : undefined}>
                        <td>{row.label}</td>
                        {months.map((m) => (
                          <td key={m.period} className="nums">
                            {row.plain
                              ? (m[row.key] as number)
                              : (m[row.key] as number) === 0
                                ? '—'
                                : formatMoney(m[row.key] as number)}
                          </td>
                        ))}
                        <td className="nums font-semibold">
                          {row.plain ? total : formatMoney(total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
        الفرع الذي لا مبيعات له ولا مصاريف لا يُعرض — الصفوف الفارغة تُخفي الفروق
        الحقيقية بدل أن تُظهرها. ومصاريف الفرع تُقرأ من <b>بُعد الفرع على سطر
        القيد</b>، فما لم يُنسب لفرع لا يظهر هنا.
      </p>
    </div>
  );
}
