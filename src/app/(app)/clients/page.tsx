import Link from '@/components/link';
import { Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser, can, ownerFilter } from '@/lib/auth';
import { searchClients } from '@/lib/clients';
import { PageHeader } from '@/components/ui';
import ClientSearch, { type ClientRow } from '@/components/client-search';

export const metadata = { title: 'العملاء' };
export const dynamic = 'force-dynamic';

/**
 * سجل العملاء.
 *
 * الصفوف الأولى تأتي **من الخادم** فتظهر الشاشة كاملةً في أول رسم وتعمل بلا
 * جافاسكربت، ثم يتولّى البحث الفوري ما بعدها. والفارغ يعرض **أكثر العملاء
 * تعاملًا** لا لا شيء.
 */
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const user = await requireUser();
  const scope = can(user, 'canViewAllLeads') ? {} : await ownerFilter(user);

  const select = {
    id: true,
    code: true,
    name: true,
    phone: true,
    type: true,
    companyName: true,
    city: true,
    createdAt: true,
  } as const;

  const term = (q ?? '').trim();

  const rows: ClientRow[] = term
    ? (await searchClients(term, scope, 30)).map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      }))
    : (
        await db.client.findMany({
          where: scope,
          select: { ...select, _count: { select: { projects: true } } },
          orderBy: [{ projects: { _count: 'desc' } }, { updatedAt: 'desc' }],
          take: 20,
        })
      ).map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        projects: c._count.projects,
      }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="العملاء" subtitle="ابحث بالهاتف أو الاسم أو رقم العميل">
        <Link href="/clients/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          عميل جديد
        </Link>
      </PageHeader>

      <ClientSearch initialQuery={term} initialRows={rows} initialSuggested={!term} />
    </div>
  );
}
