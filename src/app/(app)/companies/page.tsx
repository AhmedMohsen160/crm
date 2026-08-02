import Link from '@/components/link';
import { Plus, Building2 } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser, can, ownerFilter } from '@/lib/auth';
import { INDUSTRIES } from '@/lib/constants';
import { formatDate, search } from '@/lib/utils';
import { PageHeader, Avatar, EmptyState } from '@/components/ui';
import { FilterBar, SearchInput, FilterSelect, KeepParam } from '@/components/filters';

export const metadata = { title: 'الشركات' };
export const dynamic = 'force-dynamic';

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; industry?: string; owner?: string }>;
}) {
  const user = await requireUser();
  const seeAll = can(user, 'canViewAllLeads');
  const params = await searchParams;

  const where: Record<string, unknown> = {};
  if (!seeAll) where.ownerId = user.id;
  else if (params.owner) where.ownerId = params.owner;
  if (params.industry) where.industry = params.industry;
  if (params.q) {
    where.OR = [
      { name: search(params.q) },
      { nameAr: search(params.q) },
      { email: search(params.q) },
      { phone: search(params.q) },
      { taxNumber: search(params.q) },
    ];
  }

  const [companies, users] = await Promise.all([
    db.company.findMany({
      where,
      include: {
        owner: { select: { name: true } },
        _count: { select: { contacts: true, deals: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 300,
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
      <PageHeader title="الشركات" subtitle="العملاء المؤسسيون وبياناتهم">
        <Link href="/companies/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          شركة جديدة
        </Link>
      </PageHeader>

      <div className="card">
        <FilterBar className="border-b border-slate-200 p-4">
          <SearchInput placeholder="ابحث بالاسم أو البريد أو الرقم الضريبي..." defaultValue={params.q} />

          <FilterSelect
            name="industry"
            defaultValue={params.industry}
            placeholder="كل القطاعات"
            options={INDUSTRIES.map((i) => ({ value: i, label: i }))}
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

        {companies.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-12 w-12" />}
            title="لا توجد شركات"
            description="أضف الشركات التي تتعامل معها لتربط بها جهات الاتصال والصفقات."
            actionHref="/companies/new"
            actionLabel="إضافة شركة"
          />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>اسم الشركة</th>
                  <th>القطاع</th>
                  <th>التواصل</th>
                  <th>جهات الاتصال</th>
                  <th>الصفقات</th>
                  {seeAll && <th>المسؤول</th>}
                  <th>آخر تحديث</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/companies/${c.id}`} className="link">
                        {c.name}
                      </Link>
                      {c.nameAr && (
                        <span className="block text-xs text-slate-400">{c.nameAr}</span>
                      )}
                    </td>
                    <td className="text-xs text-slate-500">{c.industry ?? '—'}</td>
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
                        {c.phone && (
                          <span dir="ltr" className="block text-left text-slate-600">
                            {c.phone}
                          </span>
                        )}
                        {!c.email && !c.phone && '—'}
                      </div>
                    </td>
                    <td className="nums">{c._count.contacts}</td>
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
