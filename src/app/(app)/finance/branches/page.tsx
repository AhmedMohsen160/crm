import Link from '@/components/link';
import { AlertTriangle, Lock, Settings2, Gauge, TrendingUp, ShieldAlert } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { periodReport } from '@/lib/branch-engine';
import {
  BRANCH_STATUSES,
  COST_CENTER_KINDS,
  INDICATORS,
  MATURITY_STAGES,
  recoveryLabel,
  reconciles,
  type BranchStatus,
  type CostCenterKind,
  type MaturityStage,
} from '@/lib/branch-economics';
import { fiscalMonth } from '@/lib/accounting';
import { formatMoney } from '@/lib/utils';
import { PageHeader, ErrorAlert, Badge } from '@/components/ui';

export const metadata = { title: 'محاسبة الفروع' };
export const dynamic = 'force-dynamic';

/**
 * لوحة محاسبة الفروع.
 *
 * **القاعدة ٥ مفروضة هنا في الشاشة لا في التوثيق**: كل فرع يعرض هامش
 * المساهمة **و** الصافي المحمَّل معًا، ولا يُعرض الثاني منفردًا أبدًا — لأن
 * قارئه سيبني عليه قرار إغلاق، وذاك أول خطوة في «دوامة الإغلاق».
 */
export default async function BranchAccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; error?: string; closed?: string }>;
}) {
  await requirePermission('canManageAccounting');
  const sp = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? '') ? sp.period! : fiscalMonth(new Date());

  const report = await periodReport(period);
  const money = (n: number) => formatMoney(n, 'EGP');
  const pct = (n: number | null) => (n === null ? '—' : `${(n * 100).toFixed(1)}%`);
  const balanced = reconciles(report.company);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="محاسبة الفروع"
        subtitle={`${period} — المساهمة والصافي المحمَّل، ومعهما فرق الاسترداد`}
      >
        <Link href={`/finance/branches/capacity?period=${period}`} className="btn-secondary">
          <Gauge className="h-4 w-4" />
          الطاقة
        </Link>
        <Link href="/finance/branches/allocation" className="btn-secondary">
          <TrendingUp className="h-4 w-4" />
          المعدل المعياري
        </Link>
        <Link href="/finance/branches/settings" className="btn-secondary">
          <Settings2 className="h-4 w-4" />
          الإعداد
        </Link>
      </PageHeader>

      <ErrorAlert message={sp.error} />
      {sp.closed && (
        <p className="mb-4 rounded-lg border border-lime-300 bg-lime-50 px-4 py-3 text-sm text-lime-900">
          أُقفل الشهر وحُفظت نتائجه — تقريرٌ صدر في حينه يبقى كما قُرئ.
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
      </form>

      {/* ── حواجز قبل القراءة ───────────────────────────── */}
      {report.standardRate <= 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            لم يُثبَّت المعدل المعياري لسنة {period.slice(0, 4)} — فالتحميل صفر وكل فرع يبدو
            رابحًا.{' '}
            <Link href="/finance/branches/allocation" className="link">
              ثبّته أولًا
            </Link>
            .
          </span>
        </p>
      )}

      {report.misclassified.length > 0 && (
        <section className="card card-pad mb-5 border-rose-200 bg-rose-50/40">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-rose-800">
            <ShieldAlert className="h-4 w-4" />
            {report.misclassified.length} بندًا خارج التصنيف — لا يدخل أي معادلة
          </h2>
          <p className="mb-3 text-xs leading-relaxed text-rose-700">
            كل جنيه مصروف يقع في <b>واحدة</b> من ثلاث فئات ولا يقع في اثنتين. والبند
            المخالف <b>يُعرض ولا يُصنَّف بالتخمين</b> — تخمينه يُفسد رقمين لا واحدًا.
          </p>
          <div className="table-wrap max-h-60 overflow-y-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>القيد</th>
                  <th>الحساب</th>
                  <th>المبلغ</th>
                  <th>السبب</th>
                </tr>
              </thead>
              <tbody>
                {report.misclassified.slice(0, 40).map((m, i) => (
                  <tr key={i}>
                    <td className="text-xs text-slate-500" dir="ltr">
                      {m.entry}
                    </td>
                    <td className="text-sm text-slate-700">{m.account}</td>
                    <td className="nums text-sm">{money(m.amount)}</td>
                    <td className="text-xs text-rose-700">{m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── لوحة الشركة ─────────────────────────────────── */}
      <section className="card card-pad mb-5">
        <h2 className="mb-3 section-title">لوحة الشركة</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="إيراد الشركة" value={money(report.company.revenue)} />
          <Stat
            label="مجموع هوامش المساهمة"
            value={money(report.company.totalContribution)}
            hint="ما تغطّى به التكلفة المركزية"
          />
          <Stat
            label="الكتلة المشتركة الفعلية"
            value={money(report.company.sharedMass)}
            hint="ثابتة — لا تتحرّك بحجم المبيعات"
          />
          <Stat
            label="صافي الشركة"
            value={money(report.company.companyNet)}
            hint={`${pct(report.company.companyNetPct)} — الرقم الحقيقي الوحيد`}
            danger={report.company.companyNet < 0}
          />
          <Stat label="المحمَّل على الفروع" value={money(report.company.totalAllocated)} />
          <Stat
            label="فرق الاسترداد"
            value={money(report.company.recoveryVariance)}
            hint={recoveryLabel(report.company.recoveryVariance)}
            danger={report.company.recoveryVariance < 0}
          />
          <Stat
            label="إيراد الاسترداد الكامل"
            value={
              report.company.fullRecoveryRevenue === null
                ? '—'
                : money(report.company.fullRecoveryRevenue)
            }
            hint={
              report.company.distanceToFullRecovery === null
                ? 'يلزم معدَّل مثبَّت'
                : report.company.distanceToFullRecovery <= 0
                  ? `تجاوزناه بـ${money(-report.company.distanceToFullRecovery)}`
                  : `يبعد ${money(report.company.distanceToFullRecovery)}`
            }
          />
          <Stat
            label="هامش الأمان"
            value={pct(report.safetyMargin)}
            hint={
              report.companyBreakEven === null
                ? 'لا تعادل بهذه النسب'
                : `تعادل الشركة ${money(report.companyBreakEven)}`
            }
            danger={(report.safetyMargin ?? 0) < 0}
          />
        </div>

        <div
          className={`mt-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
            balanced
              ? 'border-lime-300 bg-lime-50 text-lime-900'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>معادلة التحقّق:</b> مجموع الأصفية المحمَّلة + فرق الاسترداد − صافي الشركة ={' '}
            <span className="nums">{report.company.reconciliation}</span>.{' '}
            {balanced
              ? 'المساران المستقلّان متطابقان — وهو الضمانة الوحيدة لصحة التصنيف.'
              : 'أي فرق غير الصفر خطأ في تصنيف بند أو في الإدخال، لا انحراف مقبول — والإقفال مرفوض.'}
          </span>
        </div>

        {report.sharedByKind.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {report.sharedByKind.map((k) => (
              <span
                key={k.kind}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600"
              >
                {COST_CENTER_KINDS[k.kind as CostCenterKind] ?? k.kind}:{' '}
                <span className="nums font-medium">{money(k.amount)}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ── قاعدة المؤشرين ──────────────────────────────── */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        {Object.values(INDICATORS).map((ind) => (
          <div key={ind.key} className="card card-pad bg-slate-50/60">
            <p className="text-sm font-bold text-slate-800">{ind.label}</p>
            <p className="mt-0.5 text-xs text-slate-500">{ind.formula}</p>
            <p className="mt-2 text-xs text-slate-600">
              <b>يُستخدم في:</b> {ind.usedFor}
            </p>
            <p className="mt-1 text-xs text-rose-700">
              <b>ولا يُستخدم في:</b> {ind.notUsedFor}
            </p>
          </div>
        ))}
      </div>

      {/* ── جدول الفروع — المؤشران معًا إلزامًا ──────────── */}
      <div className="card table-wrap mb-5">
        <table className="tbl">
          <thead>
            <tr>
              <th>الفرع</th>
              <th>المرحلة</th>
              <th>الإيراد</th>
              <th>الذاتية</th>
              <th>العمولة</th>
              <th className="bg-lime-50">هامش المساهمة</th>
              <th>التحميل</th>
              <th className="bg-brand-50">الصافي المحمَّل</th>
              <th>التعادل المحمَّل</th>
              <th>المستهدف</th>
              <th>التحقيق</th>
            </tr>
          </thead>
          <tbody>
            {report.branches.map((b) => (
              <tr key={b.code}>
                <td>
                  <Link href={`/finance/branches/${b.code}?period=${period}`} className="link font-medium">
                    {b.name}
                  </Link>
                  <span className="block text-xs text-slate-400">
                    {BRANCH_STATUSES[b.status as BranchStatus] ?? b.status}
                  </span>
                </td>
                <td>
                  <Badge
                    className={
                      b.maturityStage === 'mature'
                        ? 'border-slate-200 bg-slate-50 text-slate-600'
                        : 'border-lime-300 bg-lime-50 text-lime-800'
                    }
                  >
                    {MATURITY_STAGES[b.maturityStage as MaturityStage] ?? b.maturityStage}
                  </Badge>
                  <span className="block text-[11px] text-slate-400">{pct(b.appliedRate)}</span>
                </td>
                <td className="nums text-sm">{money(b.revenue)}</td>
                <td className="nums text-sm">{money(b.directExpenses)}</td>
                <td className="nums text-sm">{money(b.commissions)}</td>
                <td
                  className={`nums bg-lime-50/50 text-sm font-bold ${
                    b.contribution < 0 ? 'text-rose-700' : 'text-lime-800'
                  }`}
                >
                  {money(b.contribution)}
                  <span className="block text-[11px] font-normal text-slate-400">
                    {pct(b.contributionPct)}
                  </span>
                </td>
                <td className="nums text-sm text-slate-500">{money(b.allocated)}</td>
                <td
                  className={`nums bg-brand-50/50 text-sm font-bold ${
                    b.loadedNet < 0 ? 'text-rose-700' : 'text-brand-700'
                  }`}
                >
                  {money(b.loadedNet)}
                  <span className="block text-[11px] font-normal text-slate-400">
                    {pct(b.loadedNetPct)}
                  </span>
                </td>
                <td className="nums text-sm">
                  {b.breakEven.loaded === null ? (
                    <span className="text-rose-600">لا يتعادل</span>
                  ) : (
                    money(b.breakEven.loaded)
                  )}
                </td>
                <td className="nums text-sm">
                  {b.targets.target === null ? '—' : money(b.targets.target)}
                </td>
                <td className="nums text-sm font-medium">
                  {b.achievement === null ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <span className={b.achievement >= 1 ? 'text-lime-700' : 'text-amber-700'}>
                      {pct(b.achievement)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {report.branches.length === 0 && (
              <tr>
                <td colSpan={11} className="py-8 text-center text-sm text-slate-400">
                  لا فروع مسجَّلة —{' '}
                  <Link href="/finance/branches/settings" className="link">
                    ازرعها من القائمة بضغطة
                  </Link>
                  .
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── تحذيرات الإغلاق ─────────────────────────────── */}
      {report.branches.some((b) => b.advice.severity !== 'ok') && (
        <section className="card card-pad mb-5">
          <h2 className="mb-3 section-title">قراءة قرار البقاء — على المساهمة حصرًا</h2>
          <div className="space-y-2">
            {report.branches
              .filter((b) => b.advice.severity !== 'ok')
              .map((b) => (
                <div
                  key={b.code}
                  className={`rounded-lg border px-4 py-3 text-sm ${
                    b.advice.severity === 'danger'
                      ? 'border-rose-200 bg-rose-50 text-rose-800'
                      : 'border-amber-200 bg-amber-50 text-amber-900'
                  }`}
                >
                  <p className="font-bold">
                    {b.name} — {b.advice.headline}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed">{b.advice.detail}</p>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* ── الإقفال ─────────────────────────────────────── */}
      <section className="card card-pad">
        <h2 className="mb-2 section-title">إقفال الشهر</h2>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          الإقفال يُجمّد نتائج الشهر فيبقى التقرير كما قُرئ. و<b>يُرفض</b> إن اختلّت
          معادلة التحقّق أو بقي بندٌ خارج التصنيف.
        </p>
        <form method="post" action="/api/save" className="inline">
          <input type="hidden" name="entity" value="branch.close" />
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="back" value={`/finance/branches?period=${period}`} />
          <button
            type="submit"
            className="btn-primary"
            disabled={!balanced || report.misclassified.length > 0 || report.standardRate <= 0}
          >
            <Lock className="h-4 w-4" />
            أقفل {period}
          </button>
        </form>
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
      {hint && <p className="text-[11px] leading-relaxed text-slate-400">{hint}</p>}
    </div>
  );
}
