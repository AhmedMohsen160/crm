import Link from '@/components/link';
import { CheckCircle2, Circle, TrendingUp, Wallet, AlertTriangle, Shield } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { loadPlan } from '@/lib/budget-engine';
import {
  BUDGET_STEPS,
  COST_BEHAVIOURS,
  CONTINGENCY_PRESETS,
  isMaterial,
  quarterlyReview,
  type CostBehaviour,
} from '@/lib/budget';
import { monthName } from '@/lib/accounting';
import { formatMoney } from '@/lib/utils';
import { PageHeader, ErrorAlert, FormField, SelectField } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'بناء الموازنة السنوية' };
export const dynamic = 'force-dynamic';

/**
 * بناء الموازنة على سبع خطوات — كما أقرّتها الإدارة.
 *
 * الفرق بين هذه الشاشة وشاشة «الموازنة» القائمة: تلك تُدخِل رقمًا في خانة،
 * وهذه **تبني الرقم**: من تاريخ الشركة، وبفرضية نمو معلنة، وبشكل موسميّ
 * حقيقي، ثم تختبره بالتدفق النقدي قبل أن يُعتمد.
 */
export default async function BudgetPlanPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    error?: string;
    filled?: string;
    skipped?: string;
    classified?: string;
    saved?: string;
  }>;
}) {
  await requirePermission('canManageAccounting');
  const sp = await searchParams;
  const year = Number(sp.year) || new Date().getFullYear();
  const plan = await loadPlan(year);

  const stepState = new Map(plan.steps.map((s) => [s.key, s]));
  const currency = 'EGP';
  const money = (n: number) => formatMoney(n, currency);
  const pct = (n: number | null) => (n === null ? '—' : `${(n * 100).toFixed(1)}%`);

  // الخطوة السابعة: مقارنة الإجماليات بالربع
  const revenueBudgetMonths = Array.from({ length: 12 }, (_, m) =>
    plan.revenue.reduce((s, r) => s + (r.budget[m] ?? 0), 0)
  );
  const revenueActualMonths = Array.from({ length: 12 }, (_, m) =>
    plan.revenue.reduce((s, r) => s + (r.actual[m] ?? 0), 0)
  );
  const expenseBudgetMonths = Array.from({ length: 12 }, (_, m) =>
    plan.expenses.reduce((s, r) => s + (r.budget[m] ?? 0), 0)
  );
  const expenseActualMonths = Array.from({ length: 12 }, (_, m) =>
    plan.expenses.reduce((s, r) => s + (r.actual[m] ?? 0), 0)
  );
  const revenueQuarters = quarterlyReview(revenueBudgetMonths, revenueActualMonths, true);
  const expenseQuarters = quarterlyReview(expenseBudgetMonths, expenseActualMonths, false);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="بناء الموازنة السنوية"
        subtitle={`سنة ${year} — سبع خطوات، كل خطوة رقمها مشتقّ لا مقدَّر`}
      >
        <Link href={`/finance/budget?year=${year}`} className="btn-secondary">
          جدول الموازنة
        </Link>
        <Link href="/finance" className="btn-secondary">
          لوحة الماليات
        </Link>
      </PageHeader>

      <ErrorAlert message={sp.error} />
      {sp.filled && (
        <p className="mb-4 rounded-lg border border-lime-300 bg-lime-50 px-4 py-3 text-sm text-lime-900">
          مُلئ {sp.filled} حسابًا من فعليّ {year - 1}
          {Number(sp.skipped) > 0 && ` · تُرك ${sp.skipped} حسابًا مضبوطًا يدويًا كما هو`}.
        </p>
      )}
      {sp.classified && (
        <p className="mb-4 rounded-lg border border-lime-300 bg-lime-50 px-4 py-3 text-sm text-lime-900">
          صُنِّف {sp.classified} حسابًا.
        </p>
      )}

      {/* ── شريط الخطوات ─────────────────────────────────── */}
      <ol className="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {BUDGET_STEPS.map((step) => {
          const state = stepState.get(step.key);
          const done = state?.done ?? false;
          return (
            <li
              key={step.key}
              className={`card px-3 py-2.5 ${done ? 'border-lime-300 bg-lime-50/50' : ''}`}
            >
              <div className="flex items-start gap-2">
                {done ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-lime-600" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-700">
                    {step.order} · {step.title}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                    {state?.note ?? step.done}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* ── ١ و٢ · التاريخ والملء ───────────────────────── */}
      <section className="card card-pad mb-5">
        <h2 className="mb-1 flex items-center gap-2 section-title">
          <TrendingUp className="h-4 w-4 text-brand-600" />
          الخطوتان ١ و٢ · من تاريخ الشركة إلى موازنة السنة
        </h2>
        <p className="mb-4 text-xs leading-relaxed text-slate-500">
          يُقرأ فعليّ {year - 1} لكل حساب ويُسقَط على {year} بنسبة نمو —
          <b> بشكله الموسمي لا بالقسمة على اثني عشر</b>. مكتب الترجمة له موسم،
          وموازنة مسطّحة تُنتج انحرافًا شهريًا لا يدلّ على شيء.
        </p>

        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <Stat label={`إيراد ${year - 1} الفعلي`} value={money(plan.totals.revenueLastYear)} />
          <Stat label={`مصروف ${year - 1} الفعلي`} value={money(plan.totals.expenseLastYear)} />
          <Stat label={`إيراد ${year} المخطَّط`} value={money(plan.totals.revenueBudget)} />
          <Stat
            label="نسبة التكلفة المتغيّرة العام الماضي"
            value={pct(plan.variableRatioLastYear)}
            hint="أساس تقدير الخطوة الرابعة"
          />
        </div>

        <form
          method="post"
          action="/api/save"
          className="flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-3"
        >
          <input type="hidden" name="entity" value="budget.fill" />
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="back" value={`/finance/budget/plan?year=${year}`} />
          <FormField
            label="نسبة النمو المفترضة %"
            name="growthPct"
            type="number"
            step="0.5"
            dir="ltr"
            defaultValue={plan.budget?.growthPct ?? 0}
            className="w-44"
          />
          <label className="flex items-center gap-2 pb-2.5 text-sm text-slate-700">
            <input type="checkbox" name="overwrite" className="h-4 w-4 rounded border-slate-300" />
            اكتب فوق ما ضُبط يدويًا
          </label>
          <button type="submit" className="btn-primary mb-0.5">
            املأ من {year - 1}
          </button>
        </form>
      </section>

      {/* ── ٣ و٤ · التصنيف ──────────────────────────────── */}
      <section className="card card-pad mb-5">
        <h2 className="mb-1 section-title">
          الخطوتان ٣ و٤ · التكاليف الثابتة والمتغيّرة
        </h2>
        <p className="mb-4 text-xs leading-relaxed text-slate-500">
          الثابت لا يتغيّر بحجم الإنتاج (إيجار · رواتب · اشتراكات)، والمتغيّر يتحرّك
          معه (أتعاب فريلانسرز · عمولات · إعلانات). التصنيف يُغيّر <b>نقطة التعادل</b>،
          فغير المصنَّف يُحسب مع الثابت تحفّظًا.
        </p>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Stat label="ثابتة" value={money(plan.totals.fixed)} />
          <Stat label="متغيّرة" value={money(plan.totals.variable)} />
          <Stat
            label="بلا تصنيف"
            value={money(plan.totals.unclassified)}
            danger={plan.totals.unclassified > 0}
            hint={plan.totals.unclassified > 0 ? 'تُحسب مع الثابت حتى تُصنَّف' : undefined}
          />
        </div>

        <form method="post" action="/api/save">
          <input type="hidden" name="entity" value="budget.behaviour" />
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="back" value={`/finance/budget/plan?year=${year}`} />

          <div className="table-wrap max-h-96 overflow-y-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>حساب المصروف</th>
                  <th>فعليّ {year - 1}</th>
                  <th>موازنة {year}</th>
                  <th>السلوك</th>
                </tr>
              </thead>
              <tbody>
                {plan.expenses.map((row) => (
                  <tr key={row.id}>
                    <td className="text-sm text-slate-700">{row.name}</td>
                    <td className="nums text-sm">{money(row.lastYearTotal)}</td>
                    <td className="nums text-sm font-medium">{money(row.budgetTotal)}</td>
                    <td>
                      <select
                        name={`behaviour[${row.id}]`}
                        defaultValue={row.behaviour ?? ''}
                        className="input py-1 text-sm"
                      >
                        <option value="">
                          {row.suggestedBehaviour
                            ? `— بلا تصنيف (المقترح: ${COST_BEHAVIOURS[row.suggestedBehaviour as CostBehaviour]}) —`
                            : '— بلا تصنيف —'}
                        </option>
                        {Object.entries(COST_BEHAVIOURS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                {plan.expenses.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-sm text-slate-400">
                      لا حسابات مصروف قابلة للترحيل بعد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3">
            <SaveButton>حفظ التصنيف</SaveButton>
          </div>
        </form>
      </section>

      {/* ── ٥ · الهامش والتدفق ──────────────────────────── */}
      <section className="card card-pad mb-5">
        <h2 className="mb-1 flex items-center gap-2 section-title">
          <Wallet className="h-4 w-4 text-brand-600" />
          الخطوة ٥ · هامش الربح والتدفق النقدي
        </h2>
        <p className="mb-4 text-xs leading-relaxed text-slate-500">
          الشهر السالب وحده لا يقلق — <b>والرصيد التراكمي السالب يقلق</b>: هو اللحظة
          التي لا يجد فيها المكتب ما يدفع به الرواتب.
        </p>

        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <Stat label="الإيراد المخطَّط" value={money(plan.margin.revenue)} />
          <Stat label="إجمالي التكلفة" value={money(plan.margin.totalCost)} />
          <Stat
            label="الهامش المخطَّط"
            value={money(plan.margin.grossMargin)}
            danger={plan.margin.grossMargin < 0}
            hint={pct(plan.margin.marginPct)}
          />
          <Stat
            label="نقطة التعادل"
            value={plan.margin.breakEven === null ? 'لا تتعادل' : money(plan.margin.breakEven)}
            danger={plan.margin.breakEven === null}
            hint={
              plan.margin.breakEven === null
                ? 'التكلفة المتغيّرة تبلغ الإيراد — المشكلة في السعر لا في الحجم'
                : 'الإيراد الذي يتعادل عنده الربح'
            }
          />
        </div>

        {plan.shortfall && (
          <p className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              الرصيد التراكمي يصير سالبًا في <b>{monthName(plan.shortfall.month)}</b> بمقدار{' '}
              <span className="nums">{money(Math.abs(plan.shortfall.running))}</span> — راجع
              توزيع الإيراد على الشهور أو أجّل مصروفًا.
            </span>
          </p>
        )}

        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>الشهر</th>
                <th>الإيراد</th>
                <th>المصروف</th>
                <th>الصافي</th>
                <th>الرصيد التراكمي</th>
              </tr>
            </thead>
            <tbody>
              {plan.cashflow.map((row) => (
                <tr key={row.month}>
                  <td className="text-sm text-slate-600">{monthName(row.month)}</td>
                  <td className="nums text-sm">{money(row.revenue)}</td>
                  <td className="nums text-sm">{money(row.expense)}</td>
                  <td className={`nums text-sm ${row.net < 0 ? 'text-amber-700' : ''}`}>
                    {money(row.net)}
                  </td>
                  <td
                    className={`nums text-sm font-medium ${
                      row.running < 0 ? 'text-rose-700' : 'text-lime-700'
                    }`}
                  >
                    {money(row.running)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── ٦ · الطوارئ ─────────────────────────────────── */}
      <section className="card card-pad mb-5">
        <h2 className="mb-1 flex items-center gap-2 section-title">
          <Shield className="h-4 w-4 text-brand-600" />
          الخطوة ٦ · صندوق الطوارئ
        </h2>
        <p className="mb-4 text-xs leading-relaxed text-slate-500">
          نسبة من المصروفات تُحجز لما لم يكن في الحسبان. الشائع {CONTINGENCY_PRESETS.join('٪ أو ')}
          ٪ — وتدخل في إجمالي التكلفة وفي التدفق النقدي أعلاه.
        </p>

        <form method="post" action="/api/save" className="grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="entity" value="budget.plan" />
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="back" value={`/finance/budget/plan?year=${year}`} />

          <FormField
            label="نسبة الطوارئ %"
            name="contingencyPct"
            type="number"
            step="0.5"
            min="0"
            max="100"
            dir="ltr"
            defaultValue={plan.budget?.contingencyPct ?? 0}
          />
          <SelectField
            label="منهج بناء الموازنة"
            name="method"
            defaultValue={plan.budget?.method}
            placeholder="— اختر —"
            options={[
              { value: 'last_year_plus', label: 'من العام الماضي + نمو' },
              { value: 'zero_based', label: 'من الصفر (تُبرَّر كل بند)' },
              { value: 'manual', label: 'يدوي بالكامل' },
            ]}
          />
          <div className="flex items-end">
            <div>
              <p className="label">المبلغ المحجوز</p>
              <p className="nums pb-2 text-lg font-bold text-slate-800">
                {money(plan.margin.contingency)}
              </p>
            </div>
          </div>
          <div className="sm:col-span-3">
            <label className="label" htmlFor="planNotes">
              فرضيات الموازنة
            </label>
            <textarea
              id="planNotes"
              name="planNotes"
              rows={3}
              className="input"
              defaultValue={plan.budget?.planNotes ?? ''}
              placeholder="مثال: النمو مبنيّ على عقد ترايستار المتوقّع في الربع الثاني، وافتتاح فرع بريدة في يوليو."
            />
            <p className="mt-1 text-xs text-slate-400">
              الفرضية المكتوبة هي ما يُراجَع آخر السنة — لا الرقم وحده.
            </p>
          </div>
          <div className="sm:col-span-3">
            <SaveButton>حفظ</SaveButton>
          </div>
        </form>
      </section>

      {/* ── ٧ · المراجعة الربعية ────────────────────────── */}
      <section className="card card-pad">
        <h2 className="mb-1 section-title">الخطوة ٧ · المراجعة الربعية</h2>
        <p className="mb-4 text-xs leading-relaxed text-slate-500">
          <b>الأخضر دائمًا في صالح الشركة:</b> تجاوز الإيراد موازنته مكسب، وتوفير
          المصروف عنها مكسب كذلك. والانحراف فوق ١٠٪ يستحق سببًا مكتوبًا.
        </p>

        <div className="grid gap-6 lg:grid-cols-2">
          <QuarterTable title="الإيرادات" rows={revenueQuarters} money={money} />
          <QuarterTable title="المصروفات" rows={expenseQuarters} money={money} />
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`nums text-lg font-bold ${danger ? 'text-rose-700' : 'text-slate-800'}`}>
        {value}
      </p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function QuarterTable({
  title,
  rows,
  money,
}: {
  title: string;
  rows: ReturnType<typeof quarterlyReview>;
  money: (n: number) => string;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold text-slate-700">{title}</h3>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>الربع</th>
              <th>الموازنة</th>
              <th>الفعلي</th>
              <th>الانحراف</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.quarter}>
                <td className="text-sm text-slate-600">{row.label}</td>
                <td className="nums text-sm">{money(row.budget)}</td>
                <td className="nums text-sm">{money(row.actual)}</td>
                <td
                  className={`nums text-sm font-medium ${
                    row.variance >= 0 ? 'text-lime-700' : 'text-rose-700'
                  }`}
                >
                  {money(row.variance)}
                  {isMaterial(row.variancePct) && (
                    <span className="mr-1 text-[11px]">
                      ({((row.variancePct ?? 0) * 100).toFixed(0)}%)
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
