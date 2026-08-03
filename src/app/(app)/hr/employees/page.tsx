import Link from '@/components/link';
import { requirePermission } from '@/lib/auth';
import { employees } from '@/lib/hr-engine';
import { EMPLOYMENT_TYPES, periodOf, tenureLabel, payrollTotals } from '@/lib/hr';
import { formatMoney } from '@/lib/utils';
import { PageHeader, Badge } from '@/components/ui';

export const metadata = { title: 'الموظفون' };
export const dynamic = 'force-dynamic';

export default async function HrEmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; all?: string }>;
}) {
  await requirePermission('canManageHr');
  const sp = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? '') ? sp.period! : periodOf(new Date());

  const rows = await employees(period, sp.all === '1');
  const totals = payrollTotals(rows.map((r) => r.slip));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="الموظفون وهياكل الأجر" subtitle={`أجور شهر ${period}`}>
        <Link href={sp.all === '1' ? '/hr/employees' : '/hr/employees?all=1'} className="btn-secondary">
          {sp.all === '1' ? 'النشطون فقط' : 'أظهر الموقوفين'}
        </Link>
        <Link href="/hr" className="btn-secondary">
          لوحة الموارد البشرية
        </Link>
      </PageHeader>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        {sp.all === '1' && <input type="hidden" name="all" value="1" />}
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
      </form>

      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>الموظف</th>
              <th>القسم</th>
              <th>التعاقد</th>
              <th>مدة الخدمة</th>
              <th>الأساسي</th>
              <th>البدلات</th>
              <th>الحوافز</th>
              <th>الاستقطاع</th>
              <th>الصافي</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.active ? '' : 'opacity-50'}>
                <td>
                  <Link href={`/hr/employees/${row.id}`} className="link font-medium">
                    {row.name}
                  </Link>
                  <span className="block text-xs text-slate-400">
                    {row.jobTitle ?? '—'}
                    {!row.canLogin && (
                      <Badge className="mr-2 border-lime-300 bg-lime-50 text-lime-800">
                        منفِّذ داخلي
                      </Badge>
                    )}
                  </span>
                </td>
                <td className="text-sm text-slate-600">{row.department ?? '—'}</td>
                <td className="text-sm text-slate-600">
                  {EMPLOYMENT_TYPES[row.employmentType as keyof typeof EMPLOYMENT_TYPES] ?? '—'}
                </td>
                <td className="text-sm text-slate-500">{tenureLabel(row.tenure)}</td>
                <td className="nums text-sm">{formatMoney(row.slip.basic, 'EGP')}</td>
                <td className="nums text-sm">{formatMoney(row.slip.allowances, 'EGP')}</td>
                <td className="nums text-sm">{formatMoney(row.slip.incentives, 'EGP')}</td>
                <td className="nums text-sm text-rose-700">
                  {row.slip.deductions ? formatMoney(row.slip.deductions, 'EGP') : '—'}
                </td>
                <td className="nums text-sm font-bold">{formatMoney(row.slip.net, 'EGP')}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 font-bold">
              <td colSpan={4}>الإجمالي</td>
              <td className="nums">{formatMoney(totals.basic, 'EGP')}</td>
              <td className="nums">{formatMoney(totals.allowances, 'EGP')}</td>
              <td className="nums">{formatMoney(totals.incentives, 'EGP')}</td>
              <td className="nums text-rose-700">{formatMoney(totals.deductions, 'EGP')}</td>
              <td className="nums">{formatMoney(totals.net, 'EGP')}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
