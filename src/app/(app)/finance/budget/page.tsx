import Link from '@/components/link';
import { Target, CheckCircle2 } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { budgetVsActual } from '@/lib/ledger';
import { budgetVariance, monthName, ACCOUNT_TYPES } from '@/lib/accounting';
import { formatMoney } from '@/lib/utils';
import { PageHeader, Badge, FormField, SelectField, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'الموازنة السنوية' };
export const dynamic = 'force-dynamic';

/**
 * الموازنة السنوية والانحراف.
 *
 * **الإشارة تتبع المعنى لا الطرح:** تجاوز الإيراد موازنته مكسب، وتجاوز
 * المصروف موازنته خسارة. فالعمود الأخضر دائمًا في صالح الشركة، ويقرأه المدير
 * بلا أن يتذكّر نوع كل حساب.
 */
export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; account?: string; saved?: string; error?: string }>;
}) {
  await requirePermission('canManageAccounting');
  const { year: requestedYear, account: focusAccount, saved, error } = await searchParams;
  const year = Number(requestedYear) || new Date().getFullYear();

  const [comparison, accounts, allBudgets] = await Promise.all([
    budgetVsActual(year),
    db.account.findMany({
      where: { isPostable: true, active: true, type: { in: ['revenue', 'expense'] } },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    }),
    db.budget.findMany({ orderBy: { year: 'desc' } }),
  ]);

  const budget = comparison?.budget ?? null;
  const rows = (comparison?.rows ?? [])
    .map((row) => ({ ...row, v: budgetVariance(row.type, row.budget, row.actual) }))
    .sort((a, b) => Math.abs(b.v.variance) - Math.abs(a.v.variance));

  const focusLines = budget && focusAccount
    ? await db.budgetLine.findMany({
        where: { budgetId: budget.id, accountId: focusAccount },
        orderBy: { month: 'asc' },
      })
    : [];
  const focusByMonth = new Map(focusLines.map((l) => [l.month, l.amount]));

  const totals = rows.reduce(
    (acc, r) => ({
      budget: acc.budget + r.budget,
      actual: acc.actual + r.actual,
    }),
    { budget: 0, actual: 0 }
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="الموازنة السنوية" subtitle={`سنة ${year} — المستهدف مقابل الفعلي`}>
        <Link href={`/finance/budget/plan?year=${year}`} className="btn-primary">
          ابنِ الموازنة بالخطوات السبع
        </Link>
        <Link href="/finance" className="btn-secondary">
          لوحة الماليات
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />

      {saved && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          تم الحفظ.
        </div>
      )}

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="year">
            السنة
          </label>
          <input id="year" name="year" type="number" defaultValue={year} dir="ltr" className="input w-32" />
        </div>
        <button type="submit" className="btn-secondary">
          عرض
        </button>
        {allBudgets.length > 0 && (
          <span className="text-xs text-slate-400">
            الموجود: {allBudgets.map((b) => b.year).join(' · ')}
          </span>
        )}
      </form>

      {!budget ? (
        <section className="card card-pad">
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-800">
            <Target className="h-4 w-4 text-brand-600" />
            لا موازنة لسنة {year} بعد
          </h2>
          <p className="mb-4 text-sm text-slate-600">
            أنشئها ثم اضبط مستهدف كل حساب: مبلغًا سنويًا يُوزَّع على الشهور، أو
            شهرًا بشهر إن كان العمل موسميًا.
          </p>
          <form method="post" action="/api/save" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="entity" value="budget" />
            <input type="hidden" name="id" value="" />
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="back" value={`/finance/budget?year=${year}`} />
            <FormField label="اسم الموازنة" name="name" defaultValue={`موازنة ${year}`} />
            <SaveButton>إنشاء الموازنة</SaveButton>
          </form>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-semibold text-slate-800">
              {budget.name}
              <Badge
                className={
                  budget.status === 'approved'
                    ? 'mr-2 border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'mr-2 border-amber-200 bg-amber-50 text-amber-700'
                }
              >
                {budget.status === 'approved' ? 'معتمدة' : 'قيد الإعداد'}
              </Badge>
            </span>
            <form method="post" action="/api/save" className="flex items-end gap-2">
              <input type="hidden" name="entity" value="budget" />
              <input type="hidden" name="id" value={budget.id} />
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="name" value={budget.name} />
              <input
                type="hidden"
                name="status"
                value={budget.status === 'approved' ? 'draft' : 'approved'}
              />
              <input type="hidden" name="back" value={`/finance/budget?year=${year}`} />
              <button type="submit" className="btn-secondary btn-sm">
                {budget.status === 'approved' ? 'إعادة للإعداد' : 'اعتماد الموازنة'}
              </button>
            </form>
          </div>

          {/* ── ضبط مستهدف حساب ──────────────────────────────── */}
          <section className="card card-pad">
            <h2 className="mb-1 font-semibold text-slate-800">اضبط مستهدف حساب</h2>
            <p className="mb-4 text-xs text-slate-500">
              اكتب مبلغًا سنويًا فيُوزَّع بالتساوي، أو املأ الشهور واحدًا واحدًا.
              <b> المستهدف صفر لا يُخزَّن</b> — فهو ومستهدف غير مضبوط شيء واحد.
            </p>

            <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
              <input type="hidden" name="year" value={year} />
              <SelectField
                label="الحساب"
                name="account"
                defaultValue={focusAccount}
                options={accounts.map((a) => ({
                  value: a.id,
                  label: `${a.name} (${ACCOUNT_TYPES[a.type as keyof typeof ACCOUNT_TYPES]})`,
                }))}
                placeholder="— اختر حسابًا —"
              />
              <button type="submit" className="btn-secondary">
                افتح
              </button>
            </form>

            {focusAccount && (
              <form method="post" action="/api/save" className="space-y-3">
                <input type="hidden" name="entity" value="budgetLines" />
                <input type="hidden" name="budgetId" value={budget.id} />
                <input type="hidden" name="accountId" value={focusAccount} />
                <input
                  type="hidden"
                  name="back"
                  value={`/finance/budget?year=${year}&account=${focusAccount}`}
                />

                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-12">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                    <div key={month}>
                      <label className="mb-1 block text-xs text-slate-500" htmlFor={`m${month}`}>
                        {monthName(month)}
                      </label>
                      <input
                        id={`m${month}`}
                        name={`month[${month}]`}
                        type="number"
                        step="0.01"
                        min="0"
                        dir="ltr"
                        defaultValue={focusByMonth.get(month) ?? ''}
                        className="input py-1 text-left text-sm"
                      />
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <FormField
                    label="أو مبلغ سنوي يُوزَّع"
                    name="annual"
                    type="number"
                    step="0.01"
                    min="0"
                    dir="ltr"
                    hint="يعلو على الشهور المكتوبة أعلاه"
                  />
                  <SaveButton>حفظ المستهدف</SaveButton>
                </div>
              </form>
            )}
          </section>

          {/* ── الانحراف ─────────────────────────────────────── */}
          <section>
            <h2 className="mb-3 section-title">
              الانحراف عن الموازنة
              <span className="mr-2 text-xs font-normal text-slate-400">
                مرتَّب بالأكبر أثرًا
              </span>
            </h2>
            <div className="card table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>الحساب</th>
                    <th>النوع</th>
                    <th>الموازنة</th>
                    <th>الفعلي</th>
                    <th>الانحراف</th>
                    <th>النسبة</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-sm text-slate-400">
                        لا مستهدفات مضبوطة بعد
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr key={row.accountId}>
                      <td className="text-sm">{row.name}</td>
                      <td className="text-xs text-slate-500">
                        {ACCOUNT_TYPES[row.type] ?? row.type}
                      </td>
                      <td className="nums">{formatMoney(row.v.budget)}</td>
                      <td className="nums">{formatMoney(row.v.actual)}</td>
                      <td
                        className={`nums font-semibold ${
                          row.v.favourable ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {formatMoney(row.v.variance)}
                      </td>
                      <td className="nums text-xs text-slate-500">
                        {row.v.budget === 0 ? '—' : `${(row.v.variancePct * 100).toFixed(1)}٪`}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-semibold">
                    <td colSpan={2}>الإجمالي</td>
                    <td className="nums">{formatMoney(totals.budget)}</td>
                    <td className="nums">{formatMoney(totals.actual)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-3 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
              <b>الأخضر دائمًا في صالح الشركة:</b> تجاوز الإيراد موازنته مكسب،
              وتوفير المصروف عنها مكسب كذلك. فلا تحتاج أن تتذكّر نوع الحساب لتقرأ
              العمود.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
