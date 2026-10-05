import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser, can, visibleUserIds } from '@/lib/auth';
import { listOptionsMany } from '@/lib/reference';
import { DISCOUNT_TYPES, canOpenProject } from '@/lib/projects';
import { discountLimitOf, activePriceList } from '@/lib/pricing';
import { PageHeader, ErrorAlert } from '@/components/ui';
import ProjectForm, { type ProjectFormLists } from '@/components/project-form';

export const metadata = { title: 'تعديل مشروع' };
export const dynamic = 'force-dynamic';

export default async function EditProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await requireUser();
  // بابُ التعديل هو بابُ الصفحة نفسه — قاعدةٌ واحدة لا شرطٌ مكرَّر
  const seeAll = can(user, 'canViewAllLeads') || can(user, 'canAssignProduction');

  const project = await db.project.findUnique({ where: { id } });
  if (!project) notFound();
  if (
    !canOpenProject(
      { id: user.id, seesAll: seeAll, scopeIds: await visibleUserIds(user) },
      project
    )
  ) {
    notFound();
  }

  const [lists, companies, contacts, users, limit, priceList] = await Promise.all([
    listOptionsMany('service_line', 'language', 'currency'),
    db.company.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 500,
    }),
    db.contact.findMany({
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
      take: 500,
    }),
    seeAll
      ? db.user.findMany({
          where: { active: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
    discountLimitOf(user),
    activePriceList(),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="تعديل مشروع" subtitle={`${project.code ?? ''} · ${project.title}`} />
      <ErrorAlert message={error} />
      <ProjectForm
        recordId={id}
        backPath={`/projects/${id}/edit`}
        project={project}
        lists={lists as ProjectFormLists}
        companies={companies}
        contacts={contacts}
        users={users}
        currentUserId={user.id}
        canAssign={seeAll}
        showPrice={can(user, 'canViewSellPrice')}
        canDiscount={can(user, 'canDiscount')}
        priceList={priceList}
        discountTypes={Object.entries(DISCOUNT_TYPES)
          .filter(([v]) => v === 'percent' || v === 'amount')
          .map(([value, label]) => ({ value, label }))}
        discountHint={`حدّك ${(limit * 100).toFixed(0)}٪ — ما فوقه يوقف المشروع للاعتماد`}
        cancelHref={`/projects/${id}`}
      />
    </div>
  );
}
