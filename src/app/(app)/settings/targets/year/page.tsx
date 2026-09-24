import Link from '@/components/link';
import { CheckCircle2, CalendarRange, Wand2 } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { listOptions } from '@/lib/reference';
import { REVENUE_FILTER } from '@/lib/projects';
import { MONTH_NAMES, periodOfMonth, yearTotals, type YearRow } from '@/lib/targets';
import { formatMoney } from '@/lib/utils';
import { PageHeader, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'أهداف السنة' };
export const dynamic = 'force-dynamic';

/**
 * أهداف الفروع — **السنة كاملة في صفحة واحدة**.
 *
 * كان الإدخال شهرًا بشهر: ستة فروع في اثني عشر شهرًا = ٧٢ خانة تُملأ في
 * ٢٤ رحلة ذهابًا وإيابًا. وهنا الجدول كله أمام العين، ويُحفظ بضغطة واحدة.
 *
 * ومعه **موزّع الرقم السنوي**: تكتب رقم الفرع للسنة فيُقسَّم على الشهور —
 * بالتساوي أو بموسمية السنة الماضية — ثم تُعدَّل الشهور المستثناة بيدها.
 * والقسمة تُسوّى على آخر شهر فيطابق المجموع الرقم المكتوب بالضبط.
 */
export default async function YearTargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; saved?: string; spread?: string; error?: string }>;
}) {
  await requirePermission('canManageSettings');
  const sp = await searchParams;
  const year = Number(sp.year) || new Date().getFullYear();
  const periods = Array.from({ length: 12 }, (_, m) => periodOfMonth(year, m));

  const [branches, targets, achieved] = await Promise.all([
    listOptions('branch'),
    db.branchTarget.findMany({ where: { period: { in: periods } } }),
    db.project.groupBy({
      by: ['branch', 'revenueMonth'],
      where: { ...REVENUE_FILTER, revenueMonth: { in: periods } },
      _sum: { netTotal: true },
    }),
  ]);

  const targetOf = new Map(targets.map((t) => [`${t.branch}|${t.period}`, t.amount]));
  const doneOf = new Map(
    achieved.map((a) => [`${a.branch ?? ''}|${a.revenueMonth ?? ''}`, a._sum.netTotal ?? 0])
  );

  const rows: YearRow[] = branches.map((b) => {
    const months = periods.map((p) => targetOf.get(`${b.value}|${p}`) ?? 0);
    return {
      branch: b.value,
      label: b.label,
      months,
      annual: months.reduce((s, v) => s + v, 0),
    };
  });
  const totals = yearTotals(rows);
  const doneRows = branches.map((b) => periods.map((p) => doneOf.get(`${b.value}|${p}`) ?? 0));
  const doneGrand = doneRows.flat().reduce((s, v) => s + v, 0);

  const money = (n: number) => formatMoney(n, 'EGP');

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`أهداف سنة ${year}`}
        subtitle="السنة كاملة في صفحة واحدة — تُملأ وتُحفظ بضغطة"
      >
        <Link href={`/settings/targets/year?year=${year - 1}`} className="btn-secondary">
          سنة {year - 1}
        </Link>
        <Link href={`/settings/targets/year?year=${year + 1}`} className="btn-secondary">
          سنة {year + 1}
        </Link>
        <Link href="/settings/targets" className="btn-secondary">
          عرض الشهر
        </Link>
      </PageHeader>
      <ErrorAlert message={sp.error} />

      {(sp.saved || sp.spread) && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {sp.saved && `حُفظت أهداف ${year}.`}
          {sp.spread && `وُزّع الرقم السنوي على ${sp.spread} فرعًا — راجع الشهور وعدّل ما يلزم.`}
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="card card-pad text-center">
          <p className="nums text-xl font-bold text-slate-900">{money(totals.grand)}</p>
          <p className="text-xs text-slate-500">هدف السنة</p>
        </div>
        <div className="card card-pad text-center">
          <p className="nums text-xl font-bold text-emerald-700">{money(doneGrand)}</p>
          <p className="text-xs text-slate-500">المحقَّق حتى الآن</p>
        </div>
        <div className="card card-pad text-center">
          <p className="nums text-xl font-bold text-slate-900">
            {totals.grand > 0 ? `${Math.round((doneGrand / totals.grand) * 100)}٪` : '—'}
          </p>
          <p className="text-xs text-slate-500">نسبة الإنجاز</p>
        </div>
      </div>

      {/* ── موزّع الرقم السنوي ────────────────────────────── */}
      <section className="card card-pad mb-5">
        <h2 className="mb-1 flex items-center gap-2 section-title">
          <Wand2 className="h-4 w-4 text-brand-600" />
          وزّع رقمًا سنويًّا
        </h2>
        <p className="mb-4 text-xs leading-relaxed text-slate-500">
          اكتب هدف الفرع للسنة كلها فيُقسَّم على الشهور، ثم عدّل ما تشاء في الجدول تحته.
          و«بموسمية السنة الماضية» يقرأ إيراد {year - 1} الفعلي ويوزّع على نمطه — فلا
          يُساوى رمضان بسبتمبر.
        </p>
        <form
          method="post"
          action="/api/save"
          className="grid gap-3 sm:grid-cols-[1fr_10rem_12rem_auto]"
        >
          <input type="hidden" name="entity" value="targets.spread" />
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="back" value={`/settings/targets/year?year=${year}`} />

          <div>
            <label className="label" htmlFor="spreadBranch">
              الفرع
            </label>
            <select id="spreadBranch" name="branch" className="input">
              <option value="__all__">كل الفروع (بنفس الرقم)</option>
              {branches.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="spreadAmount">
              الرقم السنوي
            </label>
            <input
              id="spreadAmount"
              name="annual"
              type="number"
              min="0"
              step="1000"
              dir="ltr"
              required
              className="input text-left"
            />
          </div>
          <div>
            <label className="label" htmlFor="spreadMode">
              طريقة التقسيم
            </label>
            <select id="spreadMode" name="mode" className="input">
              <option value="even">بالتساوي على الشهور</option>
              <option value="seasonal">بموسمية سنة {year - 1}</option>
            </select>
          </div>
          <div className="flex items-end">
            <SaveButton>وزّع</SaveButton>
          </div>
        </form>
      </section>

      {/* ── جدول السنة ────────────────────────────────────── */}
      <form method="post" action="/api/save">
        <input type="hidden" name="entity" value="targets.year" />
        <input type="hidden" name="id" value="" />
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="back" value={`/settings/targets/year?year=${year}`} />

        <div className="card table-wrap mb-4">
          <table className="tbl tbl-wide">
            <thead>
              <tr>
                <th className="sticky start-0 bg-white">الفرع</th>
                {MONTH_NAMES.map((m) => (
                  <th key={m} className="whitespace-nowrap text-center">
                    {m}
                  </th>
                ))}
                <th className="whitespace-nowrap text-center">إجمالي السنة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.branch}>
                  <td className="sticky start-0 whitespace-nowrap bg-white text-sm font-medium text-slate-800">
                    {row.label}
                    <span className="block nums text-[11px] font-normal text-slate-400">
                      محقَّق {money(doneRows[index].reduce((s, v) => s + v, 0))}
                    </span>
                  </td>
                  {row.months.map((amount, m) => (
                    <td key={m} className="p-1">
                      <input
                        name={`t_${row.branch}_${periods[m]}`}
                        type="number"
                        min="0"
                        step="1000"
                        dir="ltr"
                        defaultValue={amount || ''}
                        placeholder="0"
                        aria-label={`${row.label} — ${MONTH_NAMES[m]}`}
                        className="input w-24 px-2 py-1 text-left text-sm"
                      />
                    </td>
                  ))}
                  <td className="nums whitespace-nowrap text-center text-sm font-semibold text-slate-800">
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
                {totals.byMonth.map((amount, m) => (
                  <td key={m} className="nums text-center text-xs text-slate-600">
                    {money(amount)}
                  </td>
                ))}
                <td className="nums text-center text-sm font-bold text-brand-700">
                  {money(totals.grand)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <SaveButton>
          <CalendarRange className="h-4 w-4" />
          حفظ أهداف {year}
        </SaveButton>
      </form>

      <p className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
        كل شهر سطره الخاص في القاعدة — فتعديل هدف مارس لا يمسّ فبراير، وتبقى المقارنات
        التاريخية صحيحة.
      </p>
    </div>
  );
}
