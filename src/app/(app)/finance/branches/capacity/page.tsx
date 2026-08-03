import Link from '@/components/link';
import { Gauge, AlertTriangle, UserPlus } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { capacityReport } from '@/lib/branch-engine';
import { fiscalMonth } from '@/lib/accounting';
import { formatMoney } from '@/lib/utils';
import { PageHeader } from '@/components/ui';

export const metadata = { title: 'الطاقة الإنتاجية' };
export const dynamic = 'force-dynamic';

/**
 * الطاقة الإنتاجية — الحلقة المفقودة.
 *
 * الموديول المالي وحده لا يكفي: **القيد الحقيقي على التوسّع ليس النقد بل
 * الطاقة**. والوحدتان منفصلتان عمدًا — دمجهما يُخفي القيد، لأن الطاقة تتوقّف
 * عند ما تستوعبه المراجعة البشرية لا عند سرعة الترجمة.
 */
export default async function CapacityPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requirePermission('canManageAccounting');
  const sp = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? '') ? sp.period! : fiscalMonth(new Date());

  const report = await capacityReport(period);
  const s = report.snapshot;
  const money = (n: number) => formatMoney(n, 'EGP');
  const pct = (n: number | null) => (n === null ? '—' : `${(n * 100).toFixed(0)}%`);

  const bottleneckLabel =
    s.bottleneck === 'review'
      ? 'المراجعة — وهي القيد الحقيقي غالبًا'
      : s.bottleneck === 'translation'
        ? 'الترجمة'
        : 'لا حمل مقيس';

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="الطاقة الإنتاجية" subtitle={`${period} — القيد الحقيقي على التوسّع`}>
        <Link href={`/finance/branches?period=${period}`} className="btn-secondary">
          محاسبة الفروع
        </Link>
      </PageHeader>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="period">الشهر</label>
          <input id="period" name="period" type="month" defaultValue={period} dir="ltr" className="input w-44" />
        </div>
        <button type="submit" className="btn-secondary mb-0.5">عرض</button>
      </form>

      <section
        className={`card card-pad mb-5 ${
          report.alert.level === 'urgent'
            ? 'border-rose-300 bg-rose-50/50'
            : report.alert.level === 'warn'
              ? 'border-amber-300 bg-amber-50/50'
              : 'border-lime-300 bg-lime-50/40'
        }`}
      >
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-800">
          {report.alert.level === 'ok' ? (
            <Gauge className="h-4 w-4" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          مُشغِّل التعيين
        </h2>
        <p className="text-sm text-slate-700">{report.alert.message}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          التنبيه يقع <b>قبل</b> بلوغ الاستغلال ١٠٠٪، لأن مهلة وصول المنتِج الجديد إلى
          إنتاجيته الكاملة تُقاس بأسابيع. ومؤشّرا زمن التسليم والتأخير <b>يسبقان أي حساب
          وحدات</b> — هما الإنذار المبكر الحقيقي.
        </p>
      </section>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="وحدات مترجَمة" value={String(s.unitsTranslated)} />
        <Stat label="وحدات مُراجَعة" value={String(s.unitsReviewed)} hint="منفصلة عمدًا" />
        <Stat
          label="الطاقة"
          value={s.capacity ? String(s.capacity) : '—'}
          hint={s.capacity ? 'أصغر الطرفين' : 'اضبطها في الإعدادات'}
        />
        <Stat
          label="نسبة الاستغلال"
          value={pct(s.utilization)}
          danger={(s.utilization ?? 0) >= 0.85}
        />
        <Stat label="الطاقة الشاغرة" value={String(s.spare)} hint="ما يُنفَّذ به فرعٌ جديد" />
        <Stat
          label="تكلفة الوحدة"
          value={s.costPerUnit === null ? '—' : money(s.costPerUnit)}
          hint="تنخفض مع الاستغلال — وهي قياس الرفع التشغيلي"
        />
        <Stat label="القيد يقع عند" value={bottleneckLabel} />
        <Stat
          label="الكتلة الإنتاجية"
          value={money(report.productionMass)}
          hint="ثابتة لا تتحرّك بحجم المبيعات"
        />
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="مشاريع مسلَّمة" value={String(report.projects)} />
        <Stat
          label="نسبة التأخير"
          value={pct(report.lateRate)}
          danger={(report.lateRate ?? 0) >= 0.15}
          hint="إنذار مبكر يسبق حساب الوحدات"
        />
        <Stat
          label="متوسط زمن التسليم"
          value={report.avgTurnaround === null ? '—' : `${report.avgTurnaround.toFixed(1)} يومًا`}
        />
      </div>

      {report.unrecorded > 0 && (
        <p className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {report.unrecorded} مشروعًا بلا وحدات مسجَّلة — فالاستغلال يبدو <b>أقلّ مما هو</b>،
            وقد يُؤجَّل تعيينٌ واجب. الرصد مسؤولية المنتِج عند التسليم لا المدير عند المتابعة،
            لأن الرصد اللاحق يتسرّب دائمًا.
          </span>
        </p>
      )}

      {s.capacity === 0 && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          لم تُضبط الطاقة المعيارية بعد —{' '}
          <Link href="/settings/system?group=الطاقة الإنتاجية" className="link">
            اضبطها في الإعدادات
          </Link>
          . والطاقة <b>أرضية لا سقف</b>: تُقاس بها النسبة ولا تُمنع بها الطلبات.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, hint, danger }: { label: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`nums text-lg font-bold ${danger ? 'text-rose-700' : 'text-slate-800'}`}>{value}</p>
      {hint && <p className="text-[11px] leading-relaxed text-slate-400">{hint}</p>}
    </div>
  );
}
