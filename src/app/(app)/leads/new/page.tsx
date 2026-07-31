import { db } from '@/lib/db';
import { requireUser, canSeeAll } from '@/lib/auth';
import { PageHeader, ErrorAlert } from '@/components/ui';
import LeadForm from '@/components/lead-form';

export const metadata = { title: 'عميل محتمل جديد' };

export default async function NewLeadPage({
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
      <PageHeader
        title="عميل محتمل جديد"
        subtitle="سجّل بيانات العميل الذي تواصل معك للمرة الأولى"
      />
      <ErrorAlert message={error} />
      <ErrorAlert message={error} />
      <LeadForm
        backPath="/leads/new"
        users={users}
        currentUserId={user.id}
        canAssign={seeAll}
        cancelHref="/leads"
      />
    </div>
  );
}
