import Link from '@/components/link';
import { Network, Users, Wallet, Gauge } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { employees, departmentTree } from '@/lib/hr-engine';
import { payrollTotals, periodOf, PAYROLL_STATUSES } from '@/lib/hr';
import { formatMoney } from '@/lib/utils';
import { PageHeader, StatCard, Badge } from '@/components/ui';

export const metadata = { title: 'الموارد البشرية' };
export const dynamic = 'force-dynamic';

/**
 * لوحة الموارد البشرية.
 *
 * الرقم المعروض هنا هو **كلفة الشهر المحمَّلة** لا مجموع الرواتب الأساسية:
 * البدلات والحوافز جزء من تكلفة الموظف، وإخفاؤها يُظهر عائدًا أعلى مما هو.
 */
export default async function HrPage() {
  await requirePermission('canManageHr');

  const period = periodOf(new Date());
  const [rows, tree, runs] = await Promise.all([
    employees(period),
    departmentTree(),
    db.payrollRun.findMany({ orderBy: { period: 'desc' }, take: 3 }),
  ]);

  const totals = payrollTotals(rows.map((r) => r.slip));
  const producers = rows.filter((r) => r.isProducer).length;
  const noLogin = rows.filter((r) => !r.canLogin).length;
  const withoutSalary = rows.filter((r) => r.slip.gross === 0).length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="الموارد البشرية" subtitle={`كلفة شهر ${period} وهيكل الفريق`} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="الفريق" value={String(rows.length)} hint={`${producers} في الإنتاج`} />
        <StatCard
          label="كلفة الشهر المحمَّلة"
          value={formatMoney(totals.gross, 'EGP')}
          hint={`أساسي ${formatMoney(totals.basic, 'EGP')}`}
        />
        <StatCard
          label="البدلات والحوافز"
          value={formatMoney(totals.allowances + totals.incentives, 'EGP')}
        />
        <StatCard
          label="صافي المستحق"
          value={formatMoney(totals.net, 'EGP')}
          hint={`بعد استقطاع ${formatMoney(totals.deductions, 'EGP')}`}
        />
      </div>

      {withoutSalary > 0 && (
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {withoutSalary} من الفريق بلا هيكل أجر مضبوط — تكلفتهم تُحسب صفرًا في تقارير
          العائد، والصفر هنا رقمٌ ناقص لا حقيقة.
        </p>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NavCard
          href="/hr/employees"
          icon={<Users className="h-5 w-5" />}
          title="الموظفون وهياكل الأجر"
          body={`${rows.length} سجلًا · ${noLogin} منفِّذًا بلا دخول`}
        />
        <NavCard
          href="/hr/departments"
          icon={<Network className="h-5 w-5" />}
          title="الشجرة التنظيمية"
          body={`${tree.flat.length} قسمًا${tree.unassigned ? ` · ${tree.unassigned} بلا قسم` : ''}`}
        />
        <NavCard
          href="/hr/payroll"
          icon={<Wallet className="h-5 w-5" />}
          title="كشوف الرواتب"
          body={
            runs[0]
              ? `آخرها ${runs[0].period} — ${PAYROLL_STATUSES[runs[0].status as keyof typeof PAYROLL_STATUSES] ?? runs[0].status}`
              : 'لم يُبنَ كشف بعد'
          }
        />
        <NavCard
          href="/hr/performance"
          icon={<Gauge className="h-5 w-5" />}
          title="الأداء والعائد"
          body="عائد كل موظف على تكلفته والتزامه بالمواعيد"
        />
      </div>

      {runs.length > 0 && (
        <section className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>الشهر</th>
                <th>الأساسي</th>
                <th>البدلات</th>
                <th>الحوافز</th>
                <th>الاستقطاع</th>
                <th>الصافي</th>
                <th>الحال</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    <Link href={`/hr/payroll?period=${run.period}`} className="link font-medium">
                      {run.period}
                    </Link>
                  </td>
                  <td className="nums text-sm">{formatMoney(run.totalBasic, 'EGP')}</td>
                  <td className="nums text-sm">{formatMoney(run.totalAllowances, 'EGP')}</td>
                  <td className="nums text-sm">{formatMoney(run.totalIncentives, 'EGP')}</td>
                  <td className="nums text-sm text-rose-700">
                    {formatMoney(run.totalDeductions, 'EGP')}
                  </td>
                  <td className="nums text-sm font-bold">{formatMoney(run.totalNet, 'EGP')}</td>
                  <td>
                    <Badge
                      className={
                        run.status === 'paid'
                          ? 'border-lime-300 bg-lime-50 text-lime-800'
                          : run.status === 'approved'
                            ? 'border-brand-200 bg-brand-50 text-brand-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                      }
                    >
                      {PAYROLL_STATUSES[run.status as keyof typeof PAYROLL_STATUSES] ?? run.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function NavCard({
  href,
  icon,
  title,
  body,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Link href={href} className="card card-pad transition-colors hover:border-brand-300">
      <span className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        {icon}
      </span>
      <p className="font-semibold text-slate-800">{title}</p>
      <p className="mt-0.5 text-xs text-slate-500">{body}</p>
    </Link>
  );
}
