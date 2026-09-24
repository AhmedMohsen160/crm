import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser, can } from '@/lib/auth';
import { PageHeader, ErrorAlert } from '@/components/ui';
import ClientForm from '@/components/client-form';

export const metadata = { title: 'تعديل عميل' };
export const dynamic = 'force-dynamic';

export default async function EditClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await requireUser();

  const client = await db.client.findUnique({ where: { id } });
  if (!client) notFound();

  /**
   * **قائمة الملّاك لمن يرى أكثر من نفسه وحده.** من لا يرى إلا سجلاته لا
   * يملك أن ينقل بطاقةً من زميلٍ إليه — فالخانة لا تُرسل إليه أصلًا.
   */
  const mayReassign =
    can(user, 'canViewAllLeads') || can(user, 'canViewTeamLeads') || can(user, 'canManageUsers');
  const owners = mayReassign
    ? (
        await db.user.findMany({
          where: { active: true },
          select: { id: true, name: true, jobTitle: true },
          orderBy: { name: 'asc' },
        })
      ).map((u) => ({ value: u.id, label: u.jobTitle ? `${u.name} — ${u.jobTitle}` : u.name }))
    : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="تعديل عميل" subtitle={client.code ?? undefined} />
      <ErrorAlert message={error} />
      <ClientForm
        recordId={id}
        backPath={`/clients/${id}/edit`}
        client={client}
        cancelHref={`/clients/${id}`}
        owners={owners}
      />
    </div>
  );
}
