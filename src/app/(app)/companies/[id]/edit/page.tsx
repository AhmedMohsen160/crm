import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser, canSeeAll } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import CompanyForm from '@/components/company-form';

export const metadata = { title: 'تعديل شركة' };

export default async function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const seeAll = canSeeAll(user);

  const company = await db.company.findUnique({ where: { id } });
  if (!company) notFound();
  if (!seeAll && company.ownerId !== user.id) notFound();

  const users = seeAll
    ? await db.user.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : [];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="تعديل شركة" subtitle={company.name} />
      <CompanyForm
        recordId={id}
        backPath={`/companies/${id}/edit`}
        company={company}
        users={users}
        currentUserId={user.id}
        canAssign={seeAll}
        cancelHref={`/companies/${id}`}
      />
    </div>
  );
}
