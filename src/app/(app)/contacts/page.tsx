import Link from '@/components/link';
import { Plus, Users } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser, can, ownerFilter } from '@/lib/auth';
import { formatDate, fullName, search } from '@/lib/utils';
import { PageHeader, Avatar, EmptyState } from '@/components/ui';
import { FilterBar, SearchInput, FilterSelect, KeepParam } from '@/components/filters';

export const metadata = { title: 'جهات الاتصال' };
export const dynamic = 'force-dynamic';

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; company?: string; owner?: string }>;
}) {
  const user = await requireUser();
  const seeAll = can(user, 'canViewAllLeads');
  const params = await searchParams;

  const where: Record<string, unknown> = {};
  if (!seeAll) where.ownerId = user.id;
  else if (params.owner) where.ownerId = params.owner;
  if (params.company) where.companyId = params.company;
  if (params.q) {
    where.OR = [
      { firstName: search(params.q) },
      { lastName: search(params.q) },
      { email: search(params.q) },
      { phone: search(params.q) },
      { mobile: search(params.q) },
      { company: { name: search(params.q) } },
    ];
  }

  const [contacts, companies, users] = await Promise.all([
    db.contact.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        owner: { select: { name: true } },
        _count: { select: { deals: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 300,
    }),
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
    <div>
      <PageHeader title="جهات الاتصال" subtitle="الأشخاص الذين تتعامل معهم داخل الشركات">
        <Link href="/contacts/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          جهة اتصال جديدة
        </Link>
      </PageHeader>

      <div className="card">
        <FilterBar className="border-b border-slate-200 p-4">
          <SearchInput placeholder="ابحث بالاسم أو البريد أو الهاتف..." defaultValue={params.q} />

          <FilterSelect
            name="company"
            defaultValue={params.company}
            placeholder="كل الشركات"
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
          />
          {seeAll && (
            <FilterSelect
              name="owner"
              defaultValue={params.owner}
              placeholder="كل الموظفين"
              options={users.map((u) => ({ value: u.id, label: u.name }))}
            />
          )}
        </FilterBar>

        {contacts.length === 0 ? (
          <EmptyState
            icon={<Users className="h-12 w-12" />}
            title="لا توجد جهات اتصال"
            description="أضف الأشخاص الذين تتواصل معهم لتربط بهم الصفقات والمهام."
            actionHref="/contacts/new"
            actionLabel="إضافة جهة اتصال"
          />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>المسمى الوظيفي</th>
                  <th>الشركة</th>
                  <th>التواصل</th>
                  <th>الصفقات</th>
                  {seeAll && <th>المسؤول</th>}
                  <th>آخر تحديث</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="flex items-center gap-2">
                        <Avatar name={fullName(c.firstName, c.lastName)} size="xs" />
                        <Link href={`/contacts/${c.id}`} className="link">
                          {fullName(c.firstName, c.lastName)}
                        </Link>
                      </span>
                    </td>
                    <td className="text-xs text-slate-500">{c.jobTitle ?? '—'}</td>
                    <td>
                      {c.company ? (
                        <Link href={`/companies/${c.company.id}`} className="text-sm text-slate-600 hover:underline">
                          {c.company.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <div className="space-y-0.5 text-xs">
                        {c.email && (
                          <a
                            href={`mailto:${c.email}`}
                            dir="ltr"
                            className="block text-left text-brand-700 hover:underline"
                          >
                            {c.email}
                          </a>
                        )}
                        {(c.mobile || c.phone) && (
                          <a
                            href={`tel:${c.mobile ?? c.phone}`}
                            dir="ltr"
                            className="block text-left text-slate-600"
                          >
                            {c.mobile ?? c.phone}
                          </a>
                        )}
                        {!c.email && !c.mobile && !c.phone && '—'}
                      </div>
                    </td>
                    <td className="nums">{c._count.deals}</td>
                    {seeAll && (
                      <td>
                        {c.owner ? (
                          <span className="flex items-center gap-2">
                            <Avatar name={c.owner.name} size="xs" />
                            <span className="text-xs">{c.owner.name}</span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    <td className="whitespace-nowrap text-xs text-slate-500">
                      {formatDate(c.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
