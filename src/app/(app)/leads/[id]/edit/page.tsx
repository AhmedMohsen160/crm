import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser, canSeeAll } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import LeadForm from '@/components/lead-form';
import { fullName } from '@/lib/utils';

export const metadata = { title: 'تعديل عميل محتمل' };

export default async function EditLeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const seeAll = canSeeAll(user);

  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) notFound();
  if (!seeAll && lead.ownerId !== user.id) notFound();

  const users = seeAll
    ? await db.user.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : [];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="تعديل عميل محتمل" subtitle={fullName(lead.firstName, lead.lastName)} />
      <LeadForm
        recordId={id}
        backPath={`/leads/${id}/edit`}
        lead={lead}
        users={users}
        currentUserId={user.id}
        canAssign={seeAll}
        cancelHref={`/leads/${id}`}
      />
    </div>
  );
}
