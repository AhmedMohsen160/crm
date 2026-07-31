import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser, canSeeAll } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import DealForm from '@/components/deal-form';

export const metadata = { title: 'تعديل صفقة' };

export default async function EditDealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const seeAll = canSeeAll(user);

  const deal = await db.deal.findUnique({ where: { id } });
  if (!deal) notFound();
  if (!seeAll && deal.ownerId !== user.id) notFound();

  const [companies, contacts, users] = await Promise.all([
    db.company.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 500,
    }),
    db.contact.findMany({
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
      take: 500,
    }),
    seeAll
      ? db.user.findMany({
          where: { active: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="تعديل صفقة" subtitle={deal.title} />
      <DealForm
        recordId={id}
        backPath={`/deals/${id}/edit`}
        deal={deal}
        companies={companies}
        contacts={contacts}
        users={users}
        currentUserId={user.id}
        canAssign={seeAll}
        cancelHref={`/deals/${id}`}
      />
    </div>
  );
}
