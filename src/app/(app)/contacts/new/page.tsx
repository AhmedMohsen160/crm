import { db } from '@/lib/db';
import { requireUser, can, ownerFilter } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import ContactForm from '@/components/contact-form';

export const metadata = { title: 'جهة اتصال جديدة' };

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const user = await requireUser();
  const seeAll = can(user, 'canViewAllLeads');
  const params = await searchParams;

  const [companies, users] = await Promise.all([
    db.company.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
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
      <PageHeader title="جهة اتصال جديدة" subtitle="أضف شخصًا تتواصل معه" />
      <ContactForm
        backPath="/contacts/new"
        companies={companies}
        users={users}
        currentUserId={user.id}
        canAssign={seeAll}
        cancelHref="/contacts"
        defaultCompanyId={params.companyId}
      />
    </div>
  );
}
