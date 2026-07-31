import { db } from '@/lib/db';
import { requireUser, canSeeAll } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import DealForm from '@/components/deal-form';

export const metadata = { title: 'صفقة جديدة' };

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string; contactId?: string }>;
}) {
  const user = await requireUser();
  const seeAll = canSeeAll(user);
  const params = await searchParams;

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
      <PageHeader title="صفقة جديدة" subtitle="فرصة بيعية جديدة في مسار المبيعات" />
      <DealForm
        backPath="/deals/new"
        companies={companies}
        contacts={contacts}
        users={users}
        currentUserId={user.id}
        canAssign={seeAll}
        cancelHref="/deals"
        defaultCompanyId={params.companyId}
        defaultContactId={params.contactId}
      />
    </div>
  );
}
