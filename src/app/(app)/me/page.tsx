import Link from '@/components/link';
import { Gauge, CalendarCheck, Layers, ShieldCheck } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { ownWork } from '@/lib/hr-engine';
import { periodOf, periodLabel, shiftPeriod, periodRange } from '@/lib/commission';
import { listOptions } from '@/lib/reference';
import { formatDate } from '@/lib/utils';
import { PageHeader, StatCard, EmptyState, Badge } from '@/components/ui';

export const metadata = { title: 'أدائي' };
export const dynamic = 'force-dynamic';

/**
 * «أدائي» — شاشة الشخص عن نفسه.
 *
 * **بلا صلاحية**: كل من يدخل النظام يراها عن نفسه هو، ولا يرى بها أحدًا
 * غيره. ولذلك صار دور «مترجم» بلا صلاحية واحدة: هو لا يحتاج إذنًا ليرى
 * عمله، يحتاج فقط أن يكون صاحبه.
 *
 * **وبلا رقم تكلفة**: لا أجر ولا تكلفة صفحة ولا هامش. الغرض أن يرى المترجم
 * «أداءه وتقدّمه وتطوّره والمشاريع التي عمل عليها» — لا أن يعرف بكم بيع
 * عمله. والحجب في الخادم: `ownWork` لا تُرجع حقل تكلفة أصلًا.
 */
export default async function MyPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requireUser();
  const { period: requested } = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(requested ?? '') ? requested! : periodOf(new Date());
  const { start, end } = periodRange(period);

  const [work, stepTypes] = await Promise.all([
    ownWork(user.id, start, new Date(end.getTime() - 1)),
    listOptions('step_type'),
  ]);
  const stepLabel = new Map(stepTypes.map((s) => [s.value, s.label]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="أدائي"
        subtitle={`${user.name} — ما نفّذته وما سُلّم في ${periodLabel(period)}`}
      />

      <div className="flex items-center justify-between gap-3">
        <Link href={`/me?period=${shiftPeriod(period, -1)}`} className="btn-secondary">
          → الشهر السابق
        </Link>
        <span className="font-semibold text-slate-800">{periodLabel(period)}</span>
        <Link href={`/me?period=${shiftPeriod(period, 1)}`} className="btn-secondary">
          الشهر التالي ←
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="صفحات موزونة"
          value={work.weightedPages ? work.weightedPages.toLocaleString('ar-EG') : '—'}
          hint="الموزونة تحسب صعوبة العمل لا عدد الورق"
          icon={<Layers className="h-5 w-5" />}
          accent="brand"
        />
        <StatCard
          label="مشاريع عملت فيها"
          value={String(work.projectCount || work.producedCount)}
          hint={`${work.producedCount} إنتاجًا · ${work.reviewedCount} مراجعة`}
          icon={<Gauge className="h-5 w-5" />}
          accent="violet"
        />
        <StatCard
          label="التسليم في الموعد"
          value={work.onTimePct === null ? '—' : `${Math.round(work.onTimePct * 100)}٪`}
          hint={work.onTimePct === null ? 'غير مقيس هذا الشهر' : undefined}
          icon={<CalendarCheck className="h-5 w-5" />}
          accent={work.onTimePct !== null && work.onTimePct >= 0.9 ? 'emerald' : 'amber'}
        />
        <StatCard
          label="ملاحظات الجودة"
          value={work.qaPer100 === null ? '—' : work.qaPer100.toFixed(1)}
          hint={work.qaPer100 === null ? 'غير مقيس' : 'لكل ١٠٠ صفحة موزونة — الأقل أفضل'}
          icon={<ShieldCheck className="h-5 w-5" />}
          accent={work.qaPer100 !== null && work.qaPer100 <= 2 ? 'emerald' : 'slate'}
        />
      </div>

      <section>
        <h2 className="mb-3 section-title">
          خطوات نفّذتها
          <span className="mr-2 text-xs font-normal text-slate-400">
            كما رصدها مدير المشاريع — التسليم في هذا الشهر
          </span>
        </h2>

        {work.steps.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<Layers className="h-10 w-10" />}
              title="لا خطوات مرصودة في هذا الشهر"
              description="تظهر هنا الخطوات التي أسندها إليك مدير المشاريع بعد تسليم مشاريعها."
            />
          </div>
        ) : (
          <div className="card table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الرقم</th>
                  <th>المشروع</th>
                  <th>الخطوة</th>
                  <th>الصفحات</th>
                  <th>الموزونة</th>
                  <th>تاريخ التسليم</th>
                </tr>
              </thead>
              <tbody>
                {work.steps.map((step) => (
                  <tr key={step.id}>
                    <td className="whitespace-nowrap text-xs text-slate-400" dir="ltr">
                      {step.projectCode}
                    </td>
                    <td className="text-slate-800">{step.projectTitle}</td>
                    <td>
                      <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                        {stepLabel.get(step.stepType) ?? step.stepType}
                      </Badge>
                    </td>
                    <td className="nums text-slate-600">{step.pages}</td>
                    <td className="nums font-medium">{step.weightedPages}</td>
                    <td className="text-xs text-slate-500">
                      {step.deliveredAt ? formatDate(step.deliveredAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
        هذه الشاشة عنك أنت وحدك، ولا تعرض تكلفةً ولا سعرًا ولا هامشًا. و«—» تعني
        <b> غير مقيس</b> لا صفرًا: شهرٌ بلا تسليم لا يُقاس عليه التزامٌ بمواعيد.
      </p>
    </div>
  );
}
