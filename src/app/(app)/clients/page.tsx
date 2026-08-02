import Link from '@/components/link';
import { Plus, Users } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser, can, ownerFilter } from '@/lib/auth';
import { searchClients } from '@/lib/clients';
import { formatPhone, normalizePhone } from '@/lib/phone';
import { CLIENT_TYPES, type ClientType } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import { PageHeader, Badge, EmptyState } from '@/components/ui';
import { FilterBar, SearchInput } from '@/components/filters';

export const metadata = { title: 'العملاء' };
export const dynamic = 'force-dynamic';

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const user = await requireUser();

  const started = Date.now();
  const scope = can(user, 'canViewAllLeads') ? {} : await ownerFilter(user);

  const clients = q
    ? await searchClients(q, scope, 50)
    : await db.client.findMany({
        where: scope,
        select: {
          id: true,
          code: true,
          name: true,
          phone: true,
          type: true,
          companyName: true,
          city: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

  const elapsed = Date.now() - started;
  const normalized = q ? normalizePhone(q) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="العملاء" subtitle="ابحث بالهاتف أو الاسم أو رقم العميل">
        <Link href="/clients/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          عميل جديد
        </Link>
      </PageHeader>

      <FilterBar className="mb-4">
        <SearchInput defaultValue={q} placeholder="رقم الهاتف أو الاسم أو CL-00001" />
        {q && (
          <span className="text-xs text-slate-400">
            {clients.length} نتيجة في {elapsed} ملّي ثانية
            {normalized?.ok && ` · بحث بالرقم ${normalized.value}`}
          </span>
        )}
      </FilterBar>

      {clients.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title={q ? 'لا عميل بهذا الرقم أو الاسم' : 'لا عملاء بعد'}
          description={
            q
              ? 'يمكنك تسجيله كعميل جديد — لن يتكرر لأن الرقم مفتاح فريد.'
              : 'أول عميل يُسجَّل تلقائيًا مع أول ليد.'
          }
          actionHref="/clients/new"
          actionLabel="عميل جديد"
        />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>رقم العميل</th>
                <th>الاسم</th>
                <th>الهاتف</th>
                <th>النوع</th>
                <th>المدينة</th>
                <th>مسجَّل منذ</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap text-xs text-slate-500" dir="ltr">
                    {c.code}
                  </td>
                  <td>
                    <Link href={`/clients/${c.id}`} className="link font-medium">
                      {c.name}
                    </Link>
                    {c.companyName && (
                      <span className="block text-xs text-slate-400">{c.companyName}</span>
                    )}
                  </td>
                  <td dir="ltr" className="text-left text-sm text-slate-600">
                    {formatPhone(normalizePhone(c.phone).value)}
                  </td>
                  <td>
                    <Badge
                      className={
                        c.type === 'company'
                          ? 'border-indigo-300 bg-indigo-100 text-indigo-700'
                          : 'border-slate-300 bg-slate-100 text-slate-600'
                      }
                    >
                      {CLIENT_TYPES[c.type as ClientType] ?? c.type}
                    </Badge>
                  </td>
                  <td className="text-sm text-slate-600">{c.city ?? '—'}</td>
                  <td className="whitespace-nowrap text-xs text-slate-500">
                    {formatDate(c.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
