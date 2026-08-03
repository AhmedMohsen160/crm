import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { periodReport, branchTrend } from '@/lib/branch-engine';
import {
  BRANCH_STATUSES,
  BRANCH_TYPES,
  MATURITY_STAGES,
  STAGE_METRICS,
  INDICATORS,
  type BranchStatus,
  type BranchType,
  type MaturityStage,
} from '@/lib/branch-economics';
import { fiscalMonth } from '@/lib/accounting';
import { formatMoney, formatDate } from '@/lib/utils';
import { PageHeader, Badge, Field } from '@/components/ui';

export const metadata = { title: 'تقرير الفرع' };
export const dynamic = 'force-dynamic';

/**
 * تقرير الفرع الواحد.
 *
 * **القاعدتان ٥ و٦ مفروضتان في هذه الشاشة**: المؤشران معًا دائمًا، وقرار
 * البقاء مبنيّ على المساهمة حصرًا مع تحذير صريح. لأن الفرع قد يظهر بصافي
 * محمَّل سالب وهو يساهم بمبلغ موجب كبير في تغطية المركز — وإغلاقه عندها أول
 * خطوة في دوامة تنتهي بانهيار الشركة.
 */
export default async function BranchReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  await requirePermission('canManageAccounting');
  const { code } = await params;
  const sp = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? '') ? sp.period! : fiscalMonth(new Date());

  const [branch, report, trend] = await Promise.all([
    db.branch.findUnique({ where: { code } }),
    periodReport(period),
    branchTrend(code, 12),
  ]);
  if (!branch) notFound();

  const row = report.branches.find((b) => b.code === code);
  if (!row) notFound();

  const money = (n: number) => formatMoney(n, 'EGP');
  const pct = (n: number | null) => (n === null ? '—' : `${(n * 100).toFixed(1)}%`);
  const share = report.company.revenue > 0 ? row.revenue / report.company.revenue : null;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={branch.name}
        subtitle={`${period} · ${BRANCH_TYPES[branch.type as BranchType] ?? branch.type}`}
      >
        <Badge className="border-slate-200 bg-slate-50 text-slate-600">
          {BRANCH_STATUSES[branch.status as BranchStatus] ?? branch.status}
        </Badge>
        <Link href={`/finance/branches?period=${period}`} className="btn-secondary">
          كل الفروع
        </Link>
      </PageHeader>

      {/* ── قائمة الدخل بطبقاتها ────────────────────────── */}
      <section className="card card-pad mb-5">
        <h2 className="mb-1 section-title">قائمة دخل الفرع</h2>
        <p className="mb-4 text-xs text-slate-500">
          الترتيب مقصود: <b>هامش المساهمة يقع قبل التحميل</b> لأنه وحده ما يُبنى عليه قرار
          البقاء.
        </p>

        <dl className="space-y-1 text-sm">
          <Line label="الإيراد (محصَّل لا مفوتر)" value={money(row.revenue)} />
          <Line label="− مصاريف الفرع الذاتية" value={money(row.directExpenses)} negative />
          <Line label="− العمولات" value={money(row.commissions)} negative />
          <div className="rounded-lg border-2 border-lime-300 bg-lime-50 px-3 py-2">
            <Line
              label={`【 ${INDICATORS.contribution.label} 】`}
              value={money(row.contribution)}
              hint={`${pct(row.contributionPct)} — ${INDICATORS.contribution.usedFor}`}
              bold
            />
          </div>
          <Line
            label={`− التحميل المركزي (${pct(row.appliedRate)})`}
            value={money(row.allocated)}
            negative
          />
          <div className="rounded-lg border-2 border-brand-300 bg-brand-50 px-3 py-2">
            <Line
              label={`【 ${INDICATORS.loadedNet.label} 】`}
              value={money(row.loadedNet)}
              hint={`${pct(row.loadedNetPct)} — ${INDICATORS.loadedNet.usedFor}`}
              bold
            />
          </div>
        </dl>
      </section>

      {/* ── قرار البقاء — على المساهمة حصرًا ─────────────── */}
      <section
        className={`card card-pad mb-5 ${
          row.advice.severity === 'danger'
            ? 'border-rose-300 bg-rose-50/50'
            : row.advice.severity === 'watch'
              ? 'border-amber-300 bg-amber-50/50'
              : 'border-lime-300 bg-lime-50/40'
        }`}
      >
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
          <AlertTriangle className="h-4 w-4" />
          قرار البقاء أو الإغلاق — {row.advice.headline}
        </h2>
        <p className="text-xs leading-relaxed text-slate-700">{row.advice.detail}</p>
        <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
          <b>قاعدة إلزامية:</b> هذا القرار يُبنى على <b>هامش المساهمة</b> وحده. والصافي
          المحمَّل لا يُستخدم فيه أبدًا — التحميل تقدير معياري لا مصروف يزول بالإغلاق.
        </p>
      </section>

      {/* ── التعادل والتارجت ────────────────────────────── */}
      <section className="card card-pad mb-5">
        <h2 className="mb-1 section-title">التعادل والتارجت</h2>
        <p className="mb-4 text-xs text-slate-500">
          التارجت <b>يُشتقّ ولا يُخترع</b>: ثلاث طبقات فوق التعادل المحمَّل. وأي تغيّر في
          المصاريف الذاتية يعيد اشتقاقه تلقائيًا.
        </p>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="الهامش النسبي" value={pct(row.breakEven.relativeMargin)} hint="١ − التحميل − العمولة" />
          <Stat
            label="التعادل المحمَّل"
            value={row.breakEven.loaded === null ? 'لا يتعادل' : money(row.breakEven.loaded)}
            danger={row.breakEven.loaded === null}
            hint={row.breakEven.loaded === null ? 'المشكلة في النسب لا في الحجم' : 'الذاتية ÷ الهامش النسبي'}
          />
          <Stat
            label="التعادل النقدي"
            value={row.breakEven.cash === null ? '—' : money(row.breakEven.cash)}
            hint="بلا تحميل وبلا إهلاك — تحته يستنزف نقدًا"
          />
          <Stat
            label="المستهدف"
            value={row.targets.target === null ? '—' : money(row.targets.target)}
            hint={row.targets.floor === null ? '' : `الحدّ الأدنى ${money(row.targets.floor)}`}
          />
          <Stat
            label="الطموح"
            value={row.targets.stretch === null ? '—' : money(row.targets.stretch)}
            hint="يفتح شريحة عمولة أعلى"
          />
        </div>
        {row.achievement !== null && (
          <p className="mt-3 text-sm text-slate-700">
            تحقيق المستهدف: <b className="nums">{pct(row.achievement)}</b>
            {row.targets.target !== null && row.revenue < row.targets.target && (
              <span className="mr-2 text-xs text-amber-700">
                (يبعد {money(row.targets.target - row.revenue)})
              </span>
            )}
          </p>
        )}
      </section>

      {/* ── المرحلة والبوابة ────────────────────────────── */}
      <section className="card card-pad mb-5">
        <h2 className="mb-3 section-title">دورة حياة الفرع</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <dl>
            <Field label="مرحلة النضج">
              <Badge className="border-lime-300 bg-lime-50 text-lime-800">
                {MATURITY_STAGES[branch.maturityStage as MaturityStage] ?? branch.maturityStage}
              </Badge>
            </Field>
            <Field label="ما يُقاس به في هذه المرحلة">
              {STAGE_METRICS[branch.maturityStage as MaturityStage] ?? '—'}
            </Field>
            <Field label="نسبة التحميل المطبَّقة">{pct(row.appliedRate)}</Field>
            <Field label="افتُتح">{branch.openedAt ? formatDate(branch.openedAt) : null}</Field>
          </dl>
          <dl>
            <Field label="حصته من إيراد الشركة">{pct(share)}</Field>
            <Field label="عدد الطلبات">{row.orders || null}</Field>
            <Field label="متوسط قيمة الطلب">
              {row.avgOrderValue === null ? null : money(row.avgOrderValue)}
            </Field>
            <Field label="نسبة الإعلان من الإيراد">{pct(row.adRatio)}</Field>
          </dl>
        </div>

        {branch.gateCriteria && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-bold text-slate-700">
              معيار بوابة القرار — مكتوب قبل الافتتاح
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">{branch.gateCriteria}</p>
            {branch.gateAt && (
              <p className="mt-1 text-[11px] text-slate-400">موعدها {formatDate(branch.gateAt)}</p>
            )}
            {branch.gateDecision && (
              <p className="mt-1 text-xs text-brand-700">القرار: {branch.gateDecision}</p>
            )}
          </div>
        )}
      </section>

      {/* ── المؤشر الحاكم: نسبة الإعلان ─────────────────── */}
      <section className="card card-pad mb-5">
        <h2 className="mb-1 flex items-center gap-2 section-title">
          {trend.ad.falling ? (
            <TrendingDown className="h-4 w-4 text-lime-600" />
          ) : (
            <TrendingUp className="h-4 w-4 text-amber-600" />
          )}
          المؤشر الحاكم — نسبة الإعلان من الإيراد
        </h2>
        <p
          className={`mb-3 rounded-lg px-3 py-2 text-xs leading-relaxed ${
            trend.ad.falling
              ? 'bg-lime-50 text-lime-900'
              : trend.ad.verdict === 'غير مقيس'
                ? 'bg-slate-50 text-slate-600'
                : 'bg-amber-50 text-amber-900'
          }`}
        >
          <b>{trend.ad.verdict}</b> — {trend.ad.detail}
        </p>

        {trend.rows.length > 0 ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الشهر</th>
                  <th>الإيراد</th>
                  <th>المساهمة</th>
                  <th>الصافي المحمَّل</th>
                  <th>الإعلان</th>
                  <th>نسبته</th>
                </tr>
              </thead>
              <tbody>
                {trend.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="text-sm text-slate-600">{r.period}</td>
                    <td className="nums text-sm">{money(r.revenue)}</td>
                    <td className="nums text-sm text-lime-700">{money(r.contribution)}</td>
                    <td className={`nums text-sm ${r.loadedNet < 0 ? 'text-rose-700' : ''}`}>
                      {money(r.loadedNet)}
                    </td>
                    <td className="nums text-sm">{money(r.adSpend)}</td>
                    <td className="nums text-sm font-medium">
                      {r.revenue > 0 ? `${((r.adSpend / r.revenue) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            لا شهور مقفلة بعد — الاتجاه يُبنى من الإقفالات المحفوظة لا يُعاد حسابه، فلا
            يتغيّر تقريرٌ صدر في حينه.
          </p>
        )}
      </section>
    </div>
  );
}

function Line({
  label,
  value,
  hint,
  bold,
  negative,
}: {
  label: string;
  value: string;
  hint?: string;
  bold?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <dt className={`${bold ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
        {label}
        {hint && <span className="mr-2 block text-[11px] font-normal text-slate-500">{hint}</span>}
      </dt>
      <dd
        className={`nums shrink-0 ${bold ? 'text-lg font-bold' : 'font-medium'} ${
          negative ? 'text-rose-700' : 'text-slate-900'
        }`}
      >
        {value}
      </dd>
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
      <p className={`nums text-base font-bold ${danger ? 'text-rose-700' : 'text-slate-800'}`}>
        {value}
      </p>
      {hint && <p className="text-[11px] leading-relaxed text-slate-400">{hint}</p>}
    </div>
  );
}
