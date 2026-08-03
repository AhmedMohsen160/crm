import Link from '@/components/link';
import { Play, CheckCircle2, Banknote } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { PAYROLL_STATUSES, periodOf } from '@/lib/hr';
import { formatMoney, formatDateTime } from '@/lib/utils';
import { PageHeader, Badge, ErrorAlert, StatCard } from '@/components/ui';

export const metadata = { title: 'كشوف الرواتب' };
export const dynamic = 'force-dynamic';

/**
 * كشف رواتب الشهر.
 *
 * يُبنى مسوّدةً من هيكل الأجر الساري، ويُراجَع، ثم يُعتمد فيُجمَّد. والمعتمد
 * لا يُعاد بناؤه: صار التزامًا، وإعادة بنائه تغيّر رقمًا وُعد به موظف.
 */
export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; error?: string; built?: string }>;
}) {
  await requirePermission('canManageHr');
  const sp = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? '') ? sp.period! : periodOf(new Date());

  const [run, history] = await Promise.all([
    db.payrollRun.findUnique({
      where: { period },
      include: {
        lines: {
          include: { user: { select: { name: true, jobTitle: true, canLogin: true } } },
          orderBy: { net: 'desc' },
        },
      },
    }),
    db.payrollRun.findMany({ orderBy: { period: 'desc' }, take: 12, select: { period: true, status: true } }),
  ]);

  const status = run?.status ?? 'draft';

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="كشوف الرواتب" subtitle={`شهر ${period}`}>
        <Link href="/hr" className="btn-secondary">
          لوحة الموارد البشرية
        </Link>
      </PageHeader>
      <ErrorAlert message={sp.error} />
      {sp.built && (
        <p className="mb-4 rounded-lg border border-lime-300 bg-lime-50 px-4 py-3 text-sm text-lime-900">
          بُني الكشف لـ{sp.built} موظفًا من هيكل الأجر الساري.
        </p>
      )}

      <form method="get" className="mb-5 flex flex-wrap items-end gap-3">
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
        {history.length > 0 && (
          <span className="mb-2 text-xs text-slate-400">
            كشوف سابقة: {history.map((h) => h.period).join(' · ')}
          </span>
        )}
      </form>

      <section className="card card-pad mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <Badge
            className={
              status === 'paid'
                ? 'border-lime-300 bg-lime-50 text-lime-800'
                : status === 'approved'
                  ? 'border-brand-200 bg-brand-50 text-brand-700'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
            }
          >
            {PAYROLL_STATUSES[status as keyof typeof PAYROLL_STATUSES] ?? status}
          </Badge>

          {status === 'draft' && (
            <form method="post" action="/api/save" className="inline">
              <input type="hidden" name="entity" value="payroll.run" />
              <input type="hidden" name="id" value="" />
              <input type="hidden" name="period" value={period} />
              <input type="hidden" name="back" value={`/hr/payroll?period=${period}`} />
              <button type="submit" className="btn-primary">
                <Play className="h-4 w-4" />
                {run ? 'أعد البناء' : 'ابنِ الكشف'}
              </button>
            </form>
          )}

          {run && status === 'draft' && run.totalNet > 0 && (
            <Decide id={run.id} period={period} action="approve" label="اعتماد الكشف" icon="check" />
          )}
          {run && status === 'approved' && (
            <>
              <Decide id={run.id} period={period} action="pay" label="تسجيل الصرف" icon="pay" />
              <Decide id={run.id} period={period} action="reopen" label="إعادة فتحه" />
            </>
          )}

          {run?.approvedAt && (
            <span className="text-xs text-slate-400">
              اعتُمد {formatDateTime(run.approvedAt)}
            </span>
          )}
        </div>
      </section>

      {run ? (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="الأساسي" value={formatMoney(run.totalBasic, 'EGP')} />
            <StatCard label="البدلات" value={formatMoney(run.totalAllowances, 'EGP')} />
            <StatCard label="الحوافز" value={formatMoney(run.totalIncentives, 'EGP')} />
            <StatCard label="الاستقطاع" value={formatMoney(run.totalDeductions, 'EGP')} />
            <StatCard label="الصافي" value={formatMoney(run.totalNet, 'EGP')} />
          </div>

          <div className="card table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>الأساسي</th>
                  <th>البدلات</th>
                  <th>الحوافز</th>
                  <th>الاستقطاع</th>
                  <th>الصافي</th>
                </tr>
              </thead>
              <tbody>
                {run.lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      <Link href={`/hr/employees/${line.userId}`} className="link font-medium">
                        {line.user.name}
                      </Link>
                      <span className="block text-xs text-slate-400">
                        {line.user.jobTitle ?? (line.user.canLogin ? '—' : 'منفِّذ داخلي')}
                      </span>
                    </td>
                    <td className="nums text-sm">{formatMoney(line.basic, 'EGP')}</td>
                    <td className="nums text-sm">{formatMoney(line.allowances, 'EGP')}</td>
                    <td className="nums text-sm">{formatMoney(line.incentives, 'EGP')}</td>
                    <td className="nums text-sm text-rose-700">
                      {line.deductions ? formatMoney(line.deductions, 'EGP') : '—'}
                    </td>
                    <td className="nums text-sm font-bold">{formatMoney(line.net, 'EGP')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="card card-pad text-center text-sm text-slate-500">
          لم يُبنَ كشف لهذا الشهر بعد. البناء يقرأ هيكل أجر كل موظف ويحسب بنوده السارية
          في الشهر — ولا يدخل الكشفَ من لا أجر له.
        </div>
      )}
    </div>
  );
}

function Decide({
  id,
  period,
  action,
  label,
  icon,
}: {
  id: string;
  period: string;
  action: string;
  label: string;
  icon?: 'check' | 'pay';
}) {
  return (
    <form method="post" action="/api/save" className="inline">
      <input type="hidden" name="entity" value="payroll.decide" />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="back" value={`/hr/payroll?period=${period}`} />
      <button type="submit" className={icon ? 'btn-primary' : 'btn-secondary'}>
        {icon === 'check' && <CheckCircle2 className="h-4 w-4" />}
        {icon === 'pay' && <Banknote className="h-4 w-4" />}
        {label}
      </button>
    </form>
  );
}
