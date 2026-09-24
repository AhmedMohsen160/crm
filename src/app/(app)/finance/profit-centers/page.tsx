import Link from '@/components/link';
import { Target, TrendingDown, Info } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { profitCenterReport } from '@/lib/profit-center-engine';
import { yearRange, monthRange, fiscalMonth } from '@/lib/accounting';
import { formatMoney } from '@/lib/utils';
import { PageHeader, StatCard, Badge, EmptyState } from '@/components/ui';

export const metadata = { title: 'ربحية المشاريع' };
export const dynamic = 'force-dynamic';

/**
 * ربحية المشاريع — مراكز الربحية.
 *
 * **هذه هي الشاشة التي أنشأ المحاسب مراكز التكلفة من أجلها**: مشروع كبير
 * مستمرّ يُحصر وارده وتشغيله فيُعرف أرابحٌ هو أم خاسر. وكان الحقل نفسه
 * يُستعمل لتصنيف الإنفاق (مركزي أم فرعي) فاختلط بُعدان لا علاقة لأحدهما
 * بالآخر — وانتقل التصنيف إلى الحساب، وعاد المركز إلى معناه.
 *
 * **والمركز الصامت لا يُعرض**: مئة مركز لم يتحرّك تُخفي الخمسة التي تعمل.
 */
export default async function ProfitCentersPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; period?: string }>;
}) {
  await requirePermission('canManageAccounting');
  const sp = await searchParams;

  // الافتراض السنة كاملة: مشروعٌ مستمرّ لا يُحكم عليه بشهر واحد
  const monthly = /^\d{4}-\d{2}$/.test(sp.period ?? '');
  const year = Number(sp.year) || new Date().getFullYear();
  const { start, end } = monthly ? monthRange(sp.period!) : yearRange(year);
  const scopeLabel = monthly ? `شهر ${sp.period}` : `سنة ${year}`;

  const report = await profitCenterReport(start, new Date(end.getTime() - 1));
  const money = (n: number) => formatMoney(n, 'EGP');
  const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}%`);

  const thisMonth = fiscalMonth(new Date());

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="ربحية المشاريع"
        subtitle={`${scopeLabel} — كل مركز بإيراده وتكلفته وهامشه`}
      >
        <Link
          href={monthly ? `/finance/profit-centers?year=${year}` : `/finance/profit-centers?period=${thisMonth}`}
          className="btn-secondary"
        >
          {monthly ? `عرض سنة ${year}` : 'عرض الشهر الحالي'}
        </Link>
        <Link href="/finance" className="btn-secondary">
          الماليات
        </Link>
      </PageHeader>

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <StatCard label="الإيراد" value={money(report.totals.revenue)} />
        <StatCard label="التكلفة" value={money(report.totals.cost)} />
        <StatCard label="الهامش" value={money(report.totals.margin)} />
        <StatCard label="نسبة الهامش" value={pct(report.totals.marginPct)} />
      </div>

      {report.totals.losing > 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <TrendingDown className="h-4 w-4 shrink-0" />
          <span>
            <b>{report.totals.losing}</b> مشروعًا تكلفته أعلى من إيراده في {scopeLabel}
          </span>
        </p>
      )}

      {report.rows.length === 0 ? (
        <EmptyState
          icon={<Target className="h-10 w-10" />}
          title="لا مركز ربحية تحرّك في هذه الفترة"
          description="مركز الربحية مشروع أو عميل مستمرّ تُرصد عليه القيود ليُقاس هامشه وحده. يُنشأ من شاشة مراكز التكلفة، ثم يُختار في سطر القيد."
        />
      ) : (
        <div className="card table-wrap">
          <table className="tbl tbl-wide">
            <thead>
              <tr>
                <th>#</th>
                <th>المشروع</th>
                <th>الإيراد</th>
                <th>التكلفة</th>
                <th>الهامش</th>
                <th>النسبة</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.id}>
                  <td className="nums text-xs text-slate-400">{row.rank}</td>
                  <td className="text-sm font-medium text-slate-800">
                    {row.name}
                    {row.project && (
                      <span className="mr-2 text-xs text-slate-400">{row.project}</span>
                    )}
                  </td>
                  <td className="nums text-sm text-slate-600">{money(row.revenue)}</td>
                  <td className="nums text-sm text-slate-600">{money(row.cost)}</td>
                  <td className="nums text-sm font-medium">
                    <span className={row.margin < 0 ? 'text-rose-700' : 'text-slate-800'}>
                      {money(row.margin)}
                    </span>
                  </td>
                  <td>
                    <Badge
                      className={
                        row.marginPct === null
                          ? 'border-slate-200 bg-slate-50 text-slate-400'
                          : row.marginPct < 0
                            ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      }
                    >
                      {pct(row.marginPct)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(report.unassigned.revenue !== 0 || report.unassigned.cost !== 0) && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span>
            خارج المراكز في هذه الفترة: إيراد{' '}
            <b className="nums">{money(report.unassigned.revenue)}</b> ومصروف{' '}
            <b className="nums">{money(report.unassigned.cost)}</b>. وهذا طبيعي — أغلب العمل
            اليومي لا يُرصد على مشروع مستقلّ. ولا يُوزَّع بالتخمين على المراكز.
          </span>
        </p>
      )}
    </div>
  );
}
