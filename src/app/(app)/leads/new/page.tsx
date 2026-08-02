import { db } from '@/lib/db';
import { requireUser, can } from '@/lib/auth';
import { listOptionsMany } from '@/lib/reference';
import { PageHeader, ErrorAlert } from '@/components/ui';
import LeadForm, { type LeadFormLists } from '@/components/lead-form';

export const metadata = { title: 'ليد جديد' };
export const dynamic = 'force-dynamic';

export default async function NewLeadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await requireUser();
  const seeAll = can(user, 'canViewAllLeads');

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
      <PageHeader title="ليد جديد" subtitle="ابدأ بالهاتف — سيبحث في العملاء تلقائيًا" />
      <ErrorAlert message={error} />
      <LeadForm
        backPath="/leads/new"
        lists={lists as LeadFormLists}
        users={users}
        currentUserId={user.id}
        canAssign={seeAll}
        cancelHref="/leads"
      />
    </div>
  );
}
