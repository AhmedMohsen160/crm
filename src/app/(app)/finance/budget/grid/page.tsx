import Link from '@/components/link';
import { CheckCircle2, Grid3x3, Info } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { monthName, ACCOUNT_TYPES } from '@/lib/accounting';
import { formatMoney } from '@/lib/utils';
import { PageHeader, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'جدول الموازنة' };
export const dynamic = 'force-dynamic';

/**
 * الموازنة — **كل الحسابات في صفحة واحدة**.
 *
 * كانت الشاشة تفتح حسابًا واحدًا: تختاره، وتملأ شهوره، وتحفظ، ثم ترجع
 * لتختار غيره. ومئةُ حساب = مئةُ رحلة.
 *
 * **وكان فيها مصيدة**: قائمةُ اختيار الحساب في نموذج، وخاناتُ الشهور في
 * نموذج آخر تحته. فمن غيّر الحساب في القائمة ثم ضغط «حفظ» كتب أرقامًا
 * جديدةً **فوق الحساب القديم** — لأن الحفظ يقرأ الحساب من حقل مخفيّ لم
 * يتغيّر. وهنا لا اختيار أصلًا: كل حساب سطرُه، ومعرّفه في اسم خانته.
 *
 * وفي آخر كل سطر خانةُ «سنويّ» تُوزَّع على الشهور — وتعلو عليها إن مُلئت.
 */
export default async function BudgetGridPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    type?: string;
    saved?: string;
    error?: string;
  }>;
}) {
  await requirePermission('canManageAccounting');
  const sp = await searchParams;
  const year = Number(sp.year) || new Date().getFullYear();
  const type = sp.type === 'revenue' || sp.type === 'expense' ? sp.type : 'expense';

  const [budget, accounts] = await Promise.all([
    db.budget.findUnique({ where: { year } }),
    db.account.findMany({
      where: { isPostable: true, active: true, type },
      select: { id: true, code: true, name: true, expenseGroup: true },
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
    }),
  ]);

  const lines = budget
    ? await db.budgetLine.findMany({
        where: { budgetId: budget.id, branch: null },
        select: { accountId: true, month: true, amount: true },
      })
    : [];
  const amountOf = new Map(lines.map((l) => [`${l.accountId}|${l.month}`, l.amount]));

  const rows = accounts.map((a) => {
    const months = Array.from({ length: 12 }, (_, i) => amountOf.get(`${a.id}|${i + 1}`) ?? 0);
    return { ...a, months, annual: months.reduce((s, v) => s + v, 0) };
  });
  const byMonth = Array.from({ length: 12 }, (_, i) =>
    rows.reduce((s, r) => s + r.months[i], 0)
  );
  const grand = byMonth.reduce((s, v) => s + v, 0);

  const money = (n: number) => formatMoney(n, 'EGP');
  const locked = budget?.status === 'approved';

  return (
    <div className="mx-auto max-w-full">
      <PageHeader
        title={`جدول الموازنة ${year}`}
        subtitle={`${ACCOUNT_TYPES[type as keyof typeof ACCOUNT_TYPES]} — كل الحسابات في صفحة واحدة`}
      >
        <Link
          href={`/finance/budget/grid?year=${year}&type=${type === 'expense' ? 'revenue' : 'expense'}`}
          className="btn-secondary"
        >
          {type === 'expense' ? 'الإيرادات' : 'المصروفات'}
        </Link>
        <Link href={`/finance/budget/grid?year=${year - 1}&type=${type}`} className="btn-secondary">
          سنة {year - 1}
        </Link>
        <Link href={`/finance/budget?year=${year}`} className="btn-secondary">
          الانحراف
        </Link>
      </PageHeader>
      <ErrorAlert message={sp.error} />

      {sp.saved && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          حُفظ {sp.saved} حسابًا.
        </div>
      )}

      {!budget ? (
        <p className="card card-pad text-sm text-slate-600">
          لا موازنة لسنة <b>{year}</b> بعد.{' '}
          <Link href={`/finance/budget?year=${year}`} className="link">
            أنشئها من شاشة الموازنة
          </Link>{' '}
          ثم عُد إلى هنا.
        </p>
      ) : locked ? (
        <p className="card card-pad text-sm text-slate-600">
          موازنة <b>{year}</b> معتمدة — أعِدها إلى «قيد الإعداد» من شاشة الموازنة لتعديلها.
        </p>
      ) : (
        <form method="post" action="/api/save">
          <input type="hidden" name="entity" value="budget.grid" />
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="budgetId" value={budget.id} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="back" value={`/finance/budget/grid?year=${year}&type=${type}`} />

          <p className="mb-3 flex items-start gap-2 rounded-lg bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <span>
              املأ الشهور مباشرةً، أو اكتب رقمًا في عمود <b>«سنويّ»</b> فيُقسَّم على الاثني
              عشر — والسنويّ يعلو على الشهور إن مُلئ. والصفر لا يُخزَّن: مستهدفُ صفر
              ومستهدفٌ غير مضبوط شيء واحد.
            </span>
          </p>

          <div className="card table-wrap mb-4">
            <table className="tbl tbl-wide">
              <thead>
                <tr>
                  <th className="sticky start-0 bg-white">الحساب</th>
                  <th className="text-center">سنويّ</th>
                  {Array.from({ length: 12 }, (_, i) => (
                    <th key={i} className="whitespace-nowrap text-center">
                      {monthName(i + 1)}
                    </th>
                  ))}
                  <th className="text-center">المجموع</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="sticky start-0 whitespace-nowrap bg-white text-sm text-slate-800">
                      {row.code && (
                        <span className="ml-2 text-[11px] text-slate-400">{row.code}</span>
                      )}
                      {row.name}
                    </td>
                    <td className="p-1">
                      <input
                        name={`a_${row.id}`}
                        type="number"
                        min="0"
                        step="100"
                        dir="ltr"
                        placeholder="—"
                        aria-label={`${row.name} — سنويّ`}
                        className="input w-24 px-2 py-1 text-left text-sm"
                      />
                    </td>
                    {row.months.map((amount, m) => (
                      <td key={m} className="p-1">
                        <input
                          name={`m_${row.id}_${m + 1}`}
                          type="number"
                          min="0"
                          step="100"
                          dir="ltr"
                          defaultValue={amount || ''}
                          placeholder="0"
                          aria-label={`${row.name} — ${monthName(m + 1)}`}
                          className="input w-24 px-2 py-1 text-left text-sm"
                        />
                      </td>
                    ))}
                    <td className="nums whitespace-nowrap text-center text-sm font-medium text-slate-700">
                      {money(row.annual)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td className="sticky start-0 bg-white text-sm font-semibold text-slate-700">
                    الإجمالي
                  </td>
                  <td />
                  {byMonth.map((amount, m) => (
                    <td key={m} className="nums text-center text-xs text-slate-600">
                      {money(amount)}
                    </td>
                  ))}
                  <td className="nums text-center text-sm font-bold text-brand-700">
                    {money(grand)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <SaveButton>
            <Grid3x3 className="h-4 w-4" />
            حفظ الجدول
          </SaveButton>
        </form>
      )}
    </div>
  );
}
