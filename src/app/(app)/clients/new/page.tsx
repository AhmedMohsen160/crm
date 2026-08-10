import { db } from '@/lib/db';
import { requireUser, can } from '@/lib/auth';
import { PageHeader, ErrorAlert } from '@/components/ui';
import ClientForm from '@/components/client-form';

export const metadata = { title: 'عميل جديد' };
export const dynamic = 'force-dynamic';

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await requireUser();

  // القائمة لمن يرى أكثر من نفسه — وما عداه تقع البطاقة عليه هو
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
      <PageHeader
        title="عميل جديد"
        subtitle="الهاتف مفتاح العميل — لن يُنشأ سجل ثانٍ لنفس الرقم"
      />
      <ErrorAlert message={error} />
      <ClientForm
        backPath="/clients/new"
        cancelHref="/clients"
        owners={owners}
        defaultOwnerId={user.id}
      />
    </div>
  );
}
