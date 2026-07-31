import { db } from '@/lib/db';
import { requireUser, canSeeAll } from '@/lib/auth';
import { PageHeader, ErrorAlert } from '@/components/ui';
import CompanyForm from '@/components/company-form';

export const metadata = { title: 'شركة جديدة' };

export default async function NewCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await requireUser();
  const seeAll = canSeeAll(user);

  const users = seeAll
    ? await db.user.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : [];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="شركة جديدة" subtitle="أضف عميلاً مؤسسيًا جديدًا" />
      <ErrorAlert message={error} />
      <CompanyForm
        backPath="/companies/new"
        users={users}
        currentUserId={user.id}
        canAssign={seeAll}
        cancelHref="/companies"
      />
    </div>
  );
}
