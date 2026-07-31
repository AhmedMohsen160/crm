import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser, canSeeAll } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import ContactForm from '@/components/contact-form';
import { fullName } from '@/lib/utils';

export const metadata = { title: 'تعديل جهة اتصال' };

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const seeAll = canSeeAll(user);

  const contact = await db.contact.findUnique({ where: { id } });
  if (!contact) notFound();
  if (!seeAll && contact.ownerId !== user.id) notFound();

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
      <PageHeader
        title="تعديل جهة اتصال"
        subtitle={fullName(contact.firstName, contact.lastName)}
      />
      <ContactForm
        recordId={id}
        backPath={`/contacts/${id}/edit`}
        contact={contact}
        companies={companies}
        users={users}
        currentUserId={user.id}
        canAssign={seeAll}
        cancelHref={`/contacts/${id}`}
      />
    </div>
  );
}
