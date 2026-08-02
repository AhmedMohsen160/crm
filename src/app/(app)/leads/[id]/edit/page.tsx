import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser, can } from '@/lib/auth';
import { listOptionsMany } from '@/lib/reference';
import { PageHeader, ErrorAlert } from '@/components/ui';
import LeadForm, { type LeadFormLists } from '@/components/lead-form';

export const metadata = { title: 'تعديل ليد' };
export const dynamic = 'force-dynamic';

export default async function EditLeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await requireUser();
  const seeAll = can(user, 'canViewAllLeads');

  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) notFound();
  if (!seeAll && lead.ownerId !== user.id) notFound();

  const [lists, users] = await Promise.all([
    listOptionsMany('channel', 'contact_method', 'service_line', 'language', 'loss_reason'),
    seeAll
      ? db.user.findMany({
          where: { active: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="تعديل ليد" subtitle={lead.code ?? undefined} />
      <ErrorAlert message={error} />
      <LeadForm
        recordId={id}
        backPath={`/leads/${id}/edit`}
        lead={lead}
        lists={lists as LeadFormLists}
        users={users}
        currentUserId={user.id}
        canAssign={seeAll}
        cancelHref={`/leads/${id}`}
      />
    </div>
  );
}
