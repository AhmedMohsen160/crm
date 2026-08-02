import Link from '@/components/link';
import { Scale, AlertTriangle } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { accountTotals } from '@/lib/ledger';
import { ACCOUNT_TYPES, trialBalance, fiscalMonth, monthRange } from '@/lib/accounting';
import { formatMoney } from '@/lib/utils';
import { PageHeader, Badge } from '@/components/ui';

export const metadata = { title: 'ميزان المراجعة' };
export const dynamic = 'force-dynamic';

/**
 * ميزان المراجعة — **الفحص الأول لسلامة الدفتر**.
 *
 * مجموعا العمودين يجب أن يتساويا. وإن لم يتساويا فالخلل في الترحيل لا في
 * التقرير، فنقولها في أعلى الشاشة بدل إخفائها خلف رقم أنيق.
 */
export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; mode?: string }>;
}) {
  await requirePermission('canManageAccounting');
  const { period: requested, mode } = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(requested ?? '') ? requested! : fiscalMonth(new Date());
  const cumulative = mode !== 'month';

  const { start, end } = monthRange(period);
  // التراكمي: من البداية حتى نهاية الشهر — وهو ما يُطابَق بالميزانية
  const totals = await accountTotals(cumulative ? { to: end } : { from: start, to: end });

  const trial = trialBalance(
    totals.map((t) => ({ accountId: t.accountId, type: t.type, debit: t.debit, credit: t.credit }))
  );
  const byId = new Map(totals.map((t) => [t.accountId, t]));

  const rows = trial.rows
    .filter((r) => r.balance !== 0)
    .sort((a, b) => {
      const ta = byId.get(a.accountId);
      const tb = byId.get(b.accountId);
      return (ta?.type ?? '').localeCompare(tb?.type ?? '') || b.balance - a.balance;
    });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="ميزان المراجعة"
        subtitle={cumulative ? `تراكمي حتى نهاية ${period}` : `حركة ${period} وحدها`}
      >
        <Link
          href={`/finance/reports/trial?period=${period}&mode=${cumulative ? 'month' : 'cumulative'}`}
          className="btn-secondary"
        >
          {cumulative ? 'حركة الشهر وحدها' : 'تراكمي حتى الشهر'}
        </Link>
        <Link href="/finance" className="btn-secondary">
          لوحة الماليات
        </Link>
      </PageHeader>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="mode" value={cumulative ? 'cumulative' : 'month'} />
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

      <div
        data-testid="trial-status"
        className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
          trial.balanced
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border-rose-200 bg-rose-50 text-rose-800'
        }`}
      >
        {trial.balanced ? <Scale className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
        <span>
          {trial.balanced ? (
            <>
              الميزان <b>متوازن</b>: المدين {formatMoney(trial.totalDebit)} = الدائن{' '}
              {formatMoney(trial.totalCredit)}
            </>
          ) : (
            <>
              الميزان <b>غير متوازن</b> بفرق{' '}
              {formatMoney(trial.totalDebit - trial.totalCredit)} — الخلل في الترحيل
              لا في التقرير.
            </>
          )}
        </span>
      </div>

      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>الحساب</th>
              <th>النوع</th>
              <th>مدين</th>
              <th>دائن</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-slate-400">
                  لا أرصدة — لم يُرحَّل قيد بعد في هذا المدى
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const account = byId.get(row.accountId);
              return (
                <tr key={row.accountId}>
                  <td className="text-sm">
                    {account?.code && (
                      <span className="ml-1 text-xs text-slate-400" dir="ltr">
                        {account.code}
                      </span>
                    )}
                    {account?.name ?? row.accountId}
                  </td>
                  <td>
                    <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                      {ACCOUNT_TYPES[row.type] ?? row.type}
                    </Badge>
                  </td>
                  <td className="nums">{row.side === 'debit' ? formatMoney(row.balance) : '—'}</td>
                  <td className="nums">{row.side === 'credit' ? formatMoney(row.balance) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 font-semibold">
              <td colSpan={2}>الإجمالي</td>
              <td className="nums">{formatMoney(trial.totalDebit)}</td>
              <td className="nums">{formatMoney(trial.totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
