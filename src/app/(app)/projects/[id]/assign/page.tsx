import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requirePermission, can } from '@/lib/auth';
import { listOptionsMany, listLabel } from '@/lib/reference';
import { SOURCING_TYPES } from '@/lib/projects';
import { freelancerIndex, filterForProject } from '@/lib/freelancer-engine';
import { PageHeader, ErrorAlert } from '@/components/ui';
import AssignForm from '@/components/assign-form';

export const metadata = { title: 'إسناد مشروع' };
export const dynamic = 'force-dynamic';

/**
 * شاشة الإسناد (§٧.٢) — **معيار القبول ≤١٥ ثانية**.
 *
 * ثلاثة قرارات: من يدير · من ينفّذ · من يراجع. لا سعر بيع فيها إطلاقًا؛
 * ما يظهر بدله هو **مؤشر التكلفة المجرّد** لمن يملك صلاحيته.
 *
 * فهرس الفريلانسرز يُحمَّل هنا **مرة واحدة** ويُرشَّح مسبقًا بزوج اللغة وخط
 * الخدمة، فيبحث المتصفح محليًا بلا نداء لكل حرف (§١١ بند ٤).
 */
export default async function AssignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await requirePermission('canAssignProduction');

  const project = await db.project.findUnique({
    where: { id },
    // لا حقول مالية — قرار الإسناد لا يُبنى على قيمة الطلب
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      pages: true,
      serviceLine: true,
      sourceLang: true,
      targetLang: true,
      deadline: true,
      workMode: true,
      sourcing: true,
      projectManagerId: true,
      primaryProducerId: true,
      primaryFreelancerId: true,
      reviewerId: true,
      reviewerFreelancerId: true,
      reviewerRate: true,
      externalName: true,
      externalRate: true,
    },
  });
  if (!project) notFound();

  const showRates = can(user, 'canViewFreelancerCost');

  const [lists, producers, managers, index, serviceName, sourceName, targetName] =
    await Promise.all([
      listOptionsMany('work_mode'),
      db.user.findMany({
        where: { active: true, isProducer: true },
        select: { id: true, name: true, jobTitle: true },
        orderBy: { name: 'asc' },
      }),
      // من يصلح مديرًا للمشروع: من يملك صلاحية الإسناد
      db.user.findMany({
        where: { active: true, roleRef: { canAssignProduction: true } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      // **الترشيح في الخادم**: من لا يملك صلاحية رؤية الأجر لا يصله رقم
      freelancerIndex({ includeRates: showRates }),
      listLabel('service_line', project.serviceLine),
      listLabel('language', project.sourceLang),
      listLabel('language', project.targetLang),
    ]);

  const candidates = filterForProject(index, {
    langFrom: project.sourceLang,
    langTo: project.targetLang,
    serviceLine: project.serviceLine,
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="إسناد مشروع" subtitle={`${project.code ?? ''} · ${project.title}`} />
      <ErrorAlert message={error} />

      <div className="mb-6 grid gap-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-700 sm:grid-cols-3">
        <span>
          <b>{project.pages ?? '—'}</b> صفحة
        </span>
        <span>{serviceName}</span>
        <span>
          {sourceName} ← {targetName}
        </span>
      </div>

      <AssignForm
        projectId={id}
        workModes={lists.work_mode.map((m) => ({ value: m.value, label: m.label }))}
        producers={producers}
        managers={managers}
        freelancers={candidates}
        sourcingTypes={Object.entries(SOURCING_TYPES).map(([value, label]) => ({
          value,
          label,
        }))}
        current={{
          workMode: project.workMode,
          sourcing: project.sourcing,
          projectManagerId: project.projectManagerId,
          primaryProducerId: project.primaryProducerId,
          primaryFreelancerId: project.primaryFreelancerId,
          reviewerId: project.reviewerId,
          reviewerFreelancerId: project.reviewerFreelancerId,
          externalName: project.externalName,
          externalRate: project.externalRate,
          reviewerRate: project.reviewerRate,
        }}
        showCostIndicator={can(user, 'canViewCostIndicator')}
        showRates={showRates}
        canPickFreelancer={candidates.length > 0}
      />

      <div className="mt-4">
        <Link href={`/projects/${id}`} className="btn-secondary">
          رجوع للمشروع
        </Link>
      </div>
    </div>
  );
}
