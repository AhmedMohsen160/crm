import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser, can, ownerFilter } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { ConfirmMutateButton } from '@/components/forms';
import TaskForm from '@/components/task-form';
import { fullName } from '@/lib/utils';

export const metadata = { title: 'تعديل مهمة' };

export default async function EditTaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { id } = await params;
  const { redirectTo } = await searchParams;
  const user = await requireUser();
  const seeAll = can(user, 'canViewAllLeads');

  const task = await db.task.findUnique({
    where: { id },
    include: {
      deal: { select: { title: true } },
      lead: { select: { firstName: true, lastName: true } },
      contact: { select: { firstName: true, lastName: true } },
      company: { select: { name: true } },
    },
  });
  if (!task) notFound();

  const allowed = seeAll || task.assigneeId === user.id || task.creatorId === user.id;
  if (!allowed) notFound();

  const pinned = Boolean(task.companyId || task.contactId || task.leadId || task.dealId);

  const [users, companies, contacts, deals, leads] = await Promise.all([
    seeAll
      ? db.user.findMany({
          where: { active: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : db.user.findMany({ where: { id: user.id }, select: { id: true, name: true } }),
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
          select: { id: true, title: true },
          orderBy: { updatedAt: 'desc' },
          take: 300,
        }),
    pinned
      ? Promise.resolve([])
      : db.lead.findMany({
          select: { id: true, firstName: true, lastName: true },
          orderBy: { createdAt: 'desc' },
          take: 300,
        }),
  ]);

  const back = redirectTo ?? '/tasks';

  const relatedLabel = task.deal
    ? `الصفقة: ${task.deal.title}`
    : task.lead
      ? `العميل المحتمل: ${fullName(task.lead.firstName, task.lead.lastName)}`
      : task.contact
        ? `جهة الاتصال: ${fullName(task.contact.firstName, task.contact.lastName)}`
        : task.company
          ? `الشركة: ${task.company.name}`
          : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="تعديل مهمة" subtitle={task.title}>
        <ConfirmMutateButton
          op="task.delete"
          id={id}
          redirectTo={back}
          label="حذف المهمة"
          className="btn-danger"
          confirmText={`حذف المهمة "${task.title}"؟`}
        />
      </PageHeader>
      <TaskForm
        recordId={id}
        backPath={`/tasks/${id}/edit`}
        task={task}
        users={users}
        currentUserId={user.id}
        canAssign={seeAll}
        cancelHref={back}
        redirectTo={back}
        link={{
          companyId: task.companyId ?? undefined,
          contactId: task.contactId ?? undefined,
          leadId: task.leadId ?? undefined,
          dealId: task.dealId ?? undefined,
        }}
        relatedLabel={relatedLabel}
        companies={companies}
        contacts={contacts}
        deals={deals}
        leads={leads}
      />
      <p className="mt-4 text-center text-xs text-slate-400">
        <Link href="/tasks" className="link">
          العودة إلى كل المهام
        </Link>
      </p>
    </div>
  );
}
