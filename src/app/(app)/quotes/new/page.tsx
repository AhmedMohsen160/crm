import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import QuoteForm from '@/components/quote-form';
import type { QuoteItemData } from '@/components/quote-items-editor';

export const metadata = { title: 'عرض سعر جديد' };

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ dealId?: string; companyId?: string; contactId?: string }>;
}) {
  await requireUser();
  const params = await searchParams;

  const [deals, companies, contacts] = await Promise.all([
    db.deal.findMany({
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

  // إن جاء العرض من صفقة، نملأ البند الأول تلقائيًا من بياناتها
  let prefillItems: QuoteItemData[] | undefined;
  let defaultTitle: string | undefined;
  let defaultCompanyId = params.companyId;
  let defaultContactId = params.contactId;

  if (params.dealId) {
    const deal = await db.deal.findUnique({ where: { id: params.dealId } });
    if (deal) {
      defaultTitle = `عرض سعر — ${deal.title}`;
      defaultCompanyId ??= deal.companyId ?? undefined;
      defaultContactId ??= deal.contactId ?? undefined;
      prefillItems = [
        {
          description: deal.title,
          serviceType: deal.serviceType,
          sourceLang: deal.sourceLang,
          targetLang: deal.targetLang,
          unit: deal.wordCount ? 'WORD' : deal.pageCount ? 'PAGE' : 'PROJECT',
          quantity: deal.wordCount ?? deal.pageCount ?? 1,
          unitPrice: 0,
        },
      ];
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="عرض سعر جديد"
        subtitle="أضف البنود وسيُحسب الإجمالي تلقائيًا أثناء الكتابة"
      />
      <QuoteForm
        backPath="/quotes/new"
        items={prefillItems}
        deals={deals}
        companies={companies}
        contacts={contacts}
        cancelHref={params.dealId ? `/deals/${params.dealId}` : '/quotes'}
        defaultDealId={params.dealId}
        defaultCompanyId={defaultCompanyId}
        defaultContactId={defaultContactId}
        defaultTitle={defaultTitle}
      />
    </div>
  );
}
