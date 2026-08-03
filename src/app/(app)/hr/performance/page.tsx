import Link from '@/components/link';
import { requirePermission } from '@/lib/auth';
import { performance } from '@/lib/hr-engine';
import { periodOf, periodRange } from '@/lib/hr';
import { formatMoney } from '@/lib/utils';
import { PageHeader } from '@/components/ui';

export const metadata = { title: 'الأداء والعائد' };
export const dynamic = 'force-dynamic';

/**
 * أداء الموظفين وعوائدهم.
 *
 * قاعدتان تحكمان كل عمود هنا:
 *   ١) **الإيراد منسوبٌ لا كليّ** — المشروع الذي له مراجع يُنسب نصفه للمنفِّذ،
 *      وإلا صار مجموع «إيراد الموظفين» أضعاف إيراد الشركة.
 *   ٢) **ما لا يُقاس يُعرض «—» لا صفرًا** — موظف بلا مشاريع في الشهر غير
 *      مقيس، لا «أداؤه صفر». والفرق بينهما قرارٌ يُتّخذ في حق إنسان.
 */
export default async function HrPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requirePermission('canManageHr');
  const sp = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? '') ? sp.period! : periodOf(new Date());
  const { start, end } = periodRange(period);

  const rows = await performance({ from: start, to: end, period });
  const measured = rows.filter((r) => r.projects > 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="الأداء والعائد" subtitle={`شهر ${period}`}>
        <Link href="/hr" className="btn-secondary">
          لوحة الموارد البشرية
        </Link>
      </PageHeader>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="period">
            الشهر
          </label>
          <input
            id="period"
            name="period"
            type="month"
            defaultValue={period}
            dir="ltr"
            className="input w-44"
          />
        </div>
        <button type="submit" className="btn-secondary mb-0.5">
          عرض
        </button>
        <span className="mb-2 text-xs text-slate-400">
          {measured.length} من {rows.length} لهم إنتاج مقيس في هذا الشهر
        </span>
      </form>

      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>الموظف</th>
              <th>القسم</th>
              <th>التكلفة المحمَّلة</th>
              <th>تكلفة الساعة</th>
              <th>الإيراد المنسوب</th>
              <th>العائد</th>
              <th>صفحات موزونة</th>
              <th>الالتزام بالمواعيد</th>
              <th>ملاحظات/١٠٠ صفحة</th>
              <th>التقييم</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/hr/employees/${row.id}`} className="link font-medium">
                    {row.name}
                  </Link>
                  <span className="block text-xs text-slate-400">{row.projects} مشروعًا</span>
                </td>
                <td className="text-sm text-slate-600">{row.department ?? '—'}</td>
                <td className="nums text-sm">
                  {row.cost ? formatMoney(row.cost, 'EGP') : <Missing />}
                </td>
                <td className="nums text-sm text-slate-500">
                  {row.hourlyCost === null ? <Missing /> : formatMoney(row.hourlyCost, 'EGP')}
                </td>
                <td className="nums text-sm">{formatMoney(row.revenue, 'EGP')}</td>
                <td
                  className={`nums text-sm font-medium ${
                    row.roi === null ? '' : row.roi >= 0 ? 'text-lime-700' : 'text-rose-700'
                  }`}
                >
                  {row.roi === null ? <Missing /> : `${(row.roi * 100).toFixed(0)}%`}
                </td>
                <td className="nums text-sm">{row.weightedPages || <Missing />}</td>
                <td className="nums text-sm">
                  {row.onTimePct === null ? (
                    <span className="text-slate-400">لا مواعيد</span>
                  ) : (
                    `${(row.onTimePct * 100).toFixed(0)}%`
                  )}
                </td>
                <td className="nums text-sm">
                  {row.qaPer100 === null ? <Missing /> : row.qaPer100.toFixed(1)}
                </td>
                <td className="nums text-sm font-bold">
                  {row.score === null ? <Missing /> : `${(row.score * 100).toFixed(0)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        <b>«—» تعني «غير مقيس» لا «صفر».</b> التكلفة المحمَّلة هي الأساسي والبدلات
        والحوافز معًا. والعائد = (الإيراد المنسوب − التكلفة) ÷ التكلفة، فمن لا تكلفة
        مسجَّلة له لا عائد له — رقمٌ ناقص لا عائد لانهائي.
      </p>
    </div>
  );
}

function Missing() {
  return <span className="text-slate-300">—</span>;
}
