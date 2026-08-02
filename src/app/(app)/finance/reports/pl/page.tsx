import Link from '@/components/link';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { listOptions } from '@/lib/reference';
import { profitAndLossByBranch, monthlyProfitAndLoss, profitAndLoss } from '@/lib/ledger';
import { monthName, monthRange, yearRange, fiscalMonth } from '@/lib/accounting';
import { formatMoney } from '@/lib/utils';
import { PageHeader } from '@/components/ui';

export const metadata = { title: 'قائمة الدخل' };
export const dynamic = 'force-dynamic';

const pctText = (v: number) => `${(v * 100).toFixed(1)}٪`;

/**
 * قائمة الدخل — التقريران اللذان يعمل عليهما المحاسب فعلًا:
 *
 *   **بالفروع** (F-Report 1): شهر واحد × كل الفروع.
 *   **بالشهور** (F-Report 3): سنة كاملة × اثنا عشر شهرًا.
 *
 * والبنود الثلاثة ظاهرة في الاثنين، ومعها هيكل المصروف كنسبة من الإيراد —
 * لأن الرقم المطلق لا يقول شيئًا بلا نسبته.
 */
export default async function ProfitAndLossPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; period?: string; year?: string }>;
}) {
  await requirePermission('canManageAccounting');
  const { view, period: requestedPeriod, year: requestedYear } = await searchParams;

  const period = /^\d{4}-\d{2}$/.test(requestedPeriod ?? '')
    ? requestedPeriod!
    : fiscalMonth(new Date());
  const year = Number(requestedYear) || Number(period.slice(0, 4));
  const byMonth = view === 'yearly';

  const branchList = await listOptions('branch');
  const branches = branchList.map((b) => b.value);

  const [byBranch, months, total, yearTotal] = await Promise.all([
    byMonth
      ? Promise.resolve([])
      : profitAndLossByBranch(
          { from: monthRange(period).start, to: monthRange(period).end },
          branches
        ),
    byMonth ? monthlyProfitAndLoss(year) : Promise.resolve([]),
    byMonth
      ? Promise.resolve(null)
      : profitAndLoss({ from: monthRange(period).start, to: monthRange(period).end }),
    byMonth ? profitAndLoss({ from: yearRange(year).start, to: yearRange(year).end }) : Promise.resolve(null),
  ]);

  const branchLabel = new Map(branchList.map((b) => [b.value, b.label]));

  const ROWS = [
    { key: 'revenue' as const, label: 'الإيرادات', strong: true },
    { key: 'productionOperating' as const, label: 'مصاريف تشغيلية وإنتاجية' },
    { key: 'grossProfit' as const, label: 'مجمل الربح', strong: true },
    { key: 'sellingMarketing' as const, label: 'مصاريف بيعية وتسويقية' },
    { key: 'generalAdmin' as const, label: 'مصاريف عمومية وإدارية' },
    { key: 'netProfit' as const, label: 'صافي الربح', strong: true },
    { key: 'otherIncome' as const, label: 'إيرادات أخرى (فروق العملة)' },
    { key: 'finalNetProfit' as const, label: 'الصافي النهائي', strong: true },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="قائمة الدخل"
        subtitle={byMonth ? `سنة ${year} — شهرًا بشهر` : `${period} — بالفروع`}
      >
        <Link
          href={byMonth ? `/finance/reports/pl?period=${period}` : `/finance/reports/pl?view=yearly&year=${year}`}
          className="btn-secondary"
        >
          {byMonth ? 'اعرض بالفروع' : 'اعرض بالشهور'}
        </Link>
        <Link href="/finance" className="btn-secondary">
          لوحة الماليات
        </Link>
      </PageHeader>

      <form method="get" className="flex flex-wrap items-end gap-3">
        {byMonth ? (
          <>
            <input type="hidden" name="view" value="yearly" />
            <div>
              <label className="label" htmlFor="year">
                السنة
              </label>
              <input id="year" name="year" type="number" defaultValue={year} dir="ltr" className="input w-32" />
            </div>
          </>
        ) : (
          <div>
            <label className="label" htmlFor="period">
              الشهر
            </label>
            <input id="period" name="period" type="month" defaultValue={period} className="input w-44" />
          </div>
        )}
        <button type="submit" className="btn-secondary">
          عرض
        </button>
      </form>

      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>البيان</th>
              {byMonth
                ? months.map((m) => <th key={m.month}>{monthName(m.month)}</th>)
                : byBranch.map((b) => <th key={b.branch}>{branchLabel.get(b.branch) ?? b.branch}</th>)}
              <th>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key} className={row.strong ? 'bg-slate-50 font-semibold' : undefined}>
                <td>{row.label}</td>
                {byMonth
                  ? months.map((m) => (
                      <td key={m.month} className="nums">
                        {m.pl[row.key] === 0 ? '—' : formatMoney(m.pl[row.key])}
                      </td>
                    ))
                  : byBranch.map((b) => (
                      <td key={b.branch} className="nums">
                        {b.pl[row.key] === 0 ? '—' : formatMoney(b.pl[row.key])}
                      </td>
                    ))}
                <td className="nums font-semibold">
                  {formatMoney((byMonth ? yearTotal : total)?.[row.key] ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── الهوامش والهيكل ─────────────────────────────────── */}
      <section className="card card-pad">
        <h2 className="mb-3 section-title">الهوامش وهيكل المصروف</h2>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>المؤشر</th>
                {byMonth
                  ? months.map((m) => <th key={m.month}>{monthName(m.month)}</th>)
                  : byBranch.map((b) => <th key={b.branch}>{branchLabel.get(b.branch) ?? b.branch}</th>)}
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'هامش مجمل', pick: (pl: { grossMarginPct: number }) => pl.grossMarginPct },
                { label: 'هامش صافٍ', pick: (pl: { netMarginPct: number }) => pl.netMarginPct },
                {
                  label: 'المصروف من الإيراد',
                  pick: (pl: { structure: { totalPct: number } }) => pl.structure.totalPct,
                },
              ].map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  {byMonth
                    ? months.map((m) => (
                        <td key={m.month} className="nums text-slate-600">
                          {m.pl.revenue === 0 ? '—' : pctText(row.pick(m.pl))}
                        </td>
                      ))
                    : byBranch.map((b) => (
                        <td key={b.branch} className="nums text-slate-600">
                          {b.pl.revenue === 0 ? '—' : pctText(row.pick(b.pl))}
                        </td>
                      ))}
                  <td className="nums font-semibold">
                    {pctText(row.pick((byMonth ? yearTotal : total) ?? ({} as never)) || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          <b>مجمل الربح</b> = الإيراد − المصاريف التشغيلية والإنتاجية وحدها، لأنها
          تكلفة الخدمة المباعة. إدخال الإداري فيه يخفض الهامش ويُفقد القدرة على
          الحكم على التسعير.
        </p>
      </section>
    </div>
  );
}
