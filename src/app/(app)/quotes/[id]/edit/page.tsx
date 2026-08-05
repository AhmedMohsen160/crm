import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { can, ownerFilter, requirePermission, requireUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import QuoteForm from '@/components/quote-form';

export const metadata = { title: 'تعديل عرض سعر' };

export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePermission('canViewSellPrice');
  const seeAll = can(user, 'canViewAllLeads');

  const quote = await db.quote.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!quote) notFound();
  if (!seeAll && quote.ownerId !== user.id) notFound();

  const [deals, companies, contacts] = await Promise.all([
    db.project.findMany({
      select: { id: true, title: true },
      orderBy: { updatedAt: 'desc' },
      take: 300,
    }),
    db.company.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 500 }),
    db.contact.findMany({
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
      take: 500,
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="تعديل عرض السعر" subtitle={`${quote.number} — ${quote.title}`} />
      <QuoteForm
        recordId={id}
        backPath={`/quotes/${id}/edit`}
        quote={quote}
        items={quote.items.map((it) => ({
          description: it.description,
          serviceType: it.serviceType,
          sourceLang: it.sourceLang,
          targetLang: it.targetLang,
          unit: it.unit,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        }))}
        deals={deals}
        companies={companies}
        contacts={contacts}
        cancelHref={`/quotes/${id}`}
      />
    </div>
  );
}
