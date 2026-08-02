import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requirePermission, can } from '@/lib/auth';
import { listOptionsMany, listLabel } from '@/lib/reference';
import { SOURCING_TYPES } from '@/lib/projects';
import { PageHeader, ErrorAlert } from '@/components/ui';
import AssignForm from '@/components/assign-form';

export const metadata = { title: 'إسناد مشروع' };
export const dynamic = 'force-dynamic';

/**
 * شاشة الإسناد (§٧.٢) — **معيار القبول ≤١٥ ثانية**.
 *
 * أربعة حقول أغلبها قوائم. لا سعر بيع فيها إطلاقًا؛ ما يظهر بدله هو
 * **مؤشر التكلفة المجرّد** لمن يملك صلاحيته.
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
      primaryProducerId: true,
      reviewerId: true,
      externalName: true,
      externalRate: true,
    },
  });
  if (!project) notFound();

  const [lists, producers, serviceName, sourceName, targetName] = await Promise.all([
    listOptionsMany('work_mode'),
    db.user.findMany({
      where: { active: true, isProducer: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    listLabel('service_line', project.serviceLine),
    listLabel('language', project.sourceLang),
    listLabel('language', project.targetLang),
  ]);

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
        sourcingTypes={Object.entries(SOURCING_TYPES).map(([value, label]) => ({
          value,
          label,
        }))}
        current={{
          workMode: project.workMode,
          sourcing: project.sourcing,
          primaryProducerId: project.primaryProducerId,
          reviewerId: project.reviewerId,
          externalName: project.externalName,
          externalRate: project.externalRate,
        }}
        showCostIndicator={can(user, 'canViewCostIndicator')}
      />

      <div className="mt-4">
        <Link href={`/projects/${id}`} className="btn-secondary">
          رجوع للمشروع
        </Link>
      </div>
    </div>
  );
}
