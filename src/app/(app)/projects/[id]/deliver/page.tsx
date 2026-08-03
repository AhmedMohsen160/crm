import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { PageHeader, FormField, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'تسليم مشروع' };
export const dynamic = 'force-dynamic';

/**
 * شاشة التسليم (§٧.٢) — **معيار القبول ≤١٠ ثوانٍ**.
 *
 * حقلان فقط: ملاحظات الجودة ورابط ملف التسليم. عند الحفظ يبصم
 * `deliveredAt`، ويُعترف بالإيراد، **وتُجمَّد التكلفة نهائيًا** فلا يغيّرها
 * تعديل راتب لاحق.
 */
export default async function DeliverPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  await requirePermission('canAssignProduction');

  const project = await db.project.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      pages: true,
      qaIssues: true,
      folderUrl: true,
      deadline: true,
      unitsTranslated: true,
      unitsReviewed: true,
      reviewerId: true,
      reviewerFreelancerId: true,
    },
  });
  if (!project) notFound();

  // لا نعرض نموذجًا سيرفضه الخادم — المسار متسلسل (§٦)
  if (project.status !== 'ready') {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="تسليم المشروع" subtitle={project.code ?? undefined} />
        <div className="card card-pad space-y-3">
          <p className="text-sm text-slate-700">
            التسليم يتم من حالة <b>«جاهز للتسليم»</b> وحدها. انقل المشروع إليها أولًا
            من أزرار الانتقال.
          </p>
          <Link href={`/projects/${id}`} className="btn-secondary">
            رجوع للمشروع
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="تسليم المشروع" subtitle={`${project.code ?? ''} · ${project.title}`} />
      <ErrorAlert message={error} />

      <form method="post" action="/api/save" className="space-y-5">
        <input type="hidden" name="entity" value="project.deliver" />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="back" value={`/projects/${id}/deliver`} />

        {/* بوابة الرصد: لا يُقفل طلب دون وحداته — والرصد اللاحق يتسرّب دائمًا */}
        <section className="card card-pad space-y-4">
          <h2 className="section-title">وحدات الإنتاج</h2>
          <p className="-mt-2 text-xs leading-relaxed text-slate-500">
            الوحدتان منفصلتان لأن <b>الطاقة تتوقّف عند ما تستوعبه المراجعة</b> لا عند سرعة
            الترجمة. مملوءتان من عدد الصفحات — عدّلهما إن اختلفتا.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="وحدات مترجَمة"
              name="unitsTranslated"
              type="number"
              step="0.01"
              min="0"
              required
              dir="ltr"
              defaultValue={project.unitsTranslated ?? project.pages ?? ''}
              hint="بالصفحة القياسية"
            />
            <FormField
              label="وحدات مُراجَعة"
              name="unitsReviewed"
              type="number"
              step="0.01"
              min="0"
              dir="ltr"
              defaultValue={
                project.unitsReviewed ??
                (project.reviewerId || project.reviewerFreelancerId ? (project.pages ?? '') : 0)
              }
              hint="صفر إن لم تُراجَع"
            />
          </div>
        </section>

        <section className="card card-pad space-y-4">
          <FormField
            label="ملاحظات الجودة"
            name="qaIssues"
            type="number"
            min="0"
            defaultValue={project.qaIssues}
            hint="عدد الملاحظات المرصودة على هذا التسليم — صفر إن لم توجد"
          />
          <FormField
            label="رابط ملف التسليم"
            name="folderUrl"
            defaultValue={project.folderUrl}
            dir="ltr"
            placeholder="https://..."
          />
        </section>

        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          عند التسليم يُعترف بإيراد المشروع في تقارير هذا الشهر، و<b>تُجمَّد
          تكلفته نهائيًا</b> فلا يغيّرها تعديل راتب أو معامل لاحقًا.
        </p>

        <div className="flex items-center gap-3">
          <SaveButton>تأكيد التسليم</SaveButton>
          <Link href={`/projects/${id}`} className="btn-secondary">
            إلغاء
          </Link>
        </div>
      </form>
    </div>
  );
}
