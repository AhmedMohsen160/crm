import { db } from '@/lib/db';
import { requireUser, can, ownerFilter } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import TaskForm from '@/components/task-form';
import { fullName } from '@/lib/utils';

export const metadata = { title: 'مهمة جديدة' };

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{
    companyId?: string;
    contactId?: string;
    leadId?: string;
    dealId?: string;
    redirectTo?: string;
  }>;
}) {
  const user = await requireUser();
  const seeAll = can(user, 'canViewAllLeads');
  const params = await searchParams;

  const pinned = Boolean(
    params.companyId || params.contactId || params.leadId || params.dealId
  );

  const [users, companies, contacts, deals, leads] = await Promise.all([
    seeAll
      ? db.user.findMany({
          where: { active: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : db.user.findMany({
          where: { id: user.id },
          select: { id: true, name: true },
        }),
    pinned
      ? Promise.resolve([])
      : db.company.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 300 }),
    pinned
      ? Promise.resolve([])
      : db.contact.findMany({
          select: { id: true, firstName: true, lastName: true },
          orderBy: { firstName: 'asc' },
          take: 300,
        }),
    pinned
      ? Promise.resolve([])
      : db.deal.findMany({
          where: { stage: { notIn: ['WON', 'LOST'] } },
          select: { id: true, title: true },
          orderBy: { updatedAt: 'desc' },
          take: 300,
        }),
    pinned
      ? Promise.resolve([])
      : db.lead.findMany({
          where: { status: { not: 'CONVERTED' } },
          select: { id: true, firstName: true, lastName: true },
          orderBy: { createdAt: 'desc' },
          take: 300,
        }),
  ]);

  // اسم السجل المرتبط لعرضه في النموذج
  let relatedLabel: string | null = null;
  if (params.dealId) {
    const d = await db.deal.findUnique({ where: { id: params.dealId }, select: { title: true } });
    relatedLabel = d ? `الصفقة: ${d.title}` : null;
  } else if (params.leadId) {
    const l = await db.lead.findUnique({
      where: { id: params.leadId },
      select: { firstName: true, lastName: true },
    });
    relatedLabel = l ? `العميل المحتمل: ${fullName(l.firstName, l.lastName)}` : null;
  } else if (params.contactId) {
    const c = await db.contact.findUnique({
      where: { id: params.contactId },
      select: { firstName: true, lastName: true },
    });
    relatedLabel = c ? `جهة الاتصال: ${fullName(c.firstName, c.lastName)}` : null;
  } else if (params.companyId) {
    const c = await db.company.findUnique({
      where: { id: params.companyId },
      select: { name: true },
    });
    relatedLabel = c ? `الشركة: ${c.name}` : null;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="مهمة جديدة" subtitle="حدّد ما يجب عمله ومن سينفّذه ومتى" />
      <TaskForm
        backPath="/tasks/new"
        users={users}
        currentUserId={user.id}
        canAssign={seeAll}
        cancelHref={params.redirectTo ?? '/tasks'}
        redirectTo={params.redirectTo}
        link={{
          companyId: params.companyId,
          contactId: params.contactId,
          leadId: params.leadId,
          dealId: params.dealId,
        }}
        relatedLabel={relatedLabel}
        companies={companies}
        contacts={contacts}
        deals={deals}
        leads={leads}
      />
    </div>
  );
}
