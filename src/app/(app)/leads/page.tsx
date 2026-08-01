import Link from '@/components/link';
import { Plus, UserPlus } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser, canSeeAll } from '@/lib/auth';
import {
  LEAD_STATUSES,
  LEAD_STATUS_COLORS,
  LEAD_SOURCES,
  type LeadStatus,
} from '@/lib/constants';
import { formatMoney, formatDate, fullName, search } from '@/lib/utils';
import { PageHeader, Badge, Avatar, EmptyState } from '@/components/ui';
import { FilterBar, SearchInput, FilterSelect, KeepParam } from '@/components/filters';

export const metadata = { title: 'العملاء المحتملون' };
export const dynamic = 'force-dynamic';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; owner?: string; source?: string }>;
}) {
  const user = await requireUser();
  const seeAll = canSeeAll(user);
  const params = await searchParams;

  const where: Record<string, unknown> = {};
  if (!seeAll) where.ownerId = user.id;
  else if (params.owner) where.ownerId = params.owner;
  if (params.status) where.status = params.status;
  if (params.source) where.source = params.source;
  if (params.q) {
    where.OR = [
      { firstName: search(params.q) },
      { lastName: search(params.q) },
      { companyName: search(params.q) },
      { email: search(params.q) },
      { phone: search(params.q) },
    ];
  }

  const [leads, users, counts] = await Promise.all([
    db.lead.findMany({
      where,
      include: { owner: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    seeAll
      ? db.user.findMany({ where: { active: true }, select: { id: true, name: true } })
      : Promise.resolve([]),
    db.lead.groupBy({
      by: ['status'],
      where: seeAll ? {} : { ownerId: user.id },
      _count: { _all: true },
    }),
  ]);

  const countMap = new Map(counts.map((c) => [c.status, c._count._all]));

  return (
    <div>
      <PageHeader
        title="العملاء المحتملون"
        subtitle="كل من تواصل معك ولم يتحوّل بعد إلى صفقة"
      >
        <Link href="/leads/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          عميل محتمل جديد
        </Link>
      </PageHeader>

      {/* شريط الحالات السريع */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/leads"
          className={`badge ${!params.status ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-slate-600'}`}
        >
          الكل <span className="nums">{leads.length}</span>
        </Link>
        {(Object.keys(LEAD_STATUSES) as LeadStatus[]).map((s) => (
          <Link
            key={s}
            href={`/leads?status=${s}`}
            className={`badge ${params.status === s ? LEAD_STATUS_COLORS[s] : 'border-slate-300 bg-white text-slate-600'}`}
          >
            {LEAD_STATUSES[s]} <span className="nums">{countMap.get(s) ?? 0}</span>
          </Link>
        ))}
      </div>

      <div className="card">
        <FilterBar className="border-b border-slate-200 p-4">
          <SearchInput placeholder="ابحث بالاسم أو الشركة أو الهاتف..." defaultValue={params.q} />
          <KeepParam name="status" value={params.status} />
          <FilterSelect
            name="source"
            defaultValue={params.source}
            placeholder="كل المصادر"
            options={LEAD_SOURCES.map((s) => ({ value: s, label: s }))}
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

        {leads.length === 0 ? (
          <EmptyState
            icon={<UserPlus className="h-12 w-12" />}
            title="لا يوجد عملاء محتملون"
            description="أضف أول عميل محتمل لتبدأ متابعته."
            actionHref="/leads/new"
            actionLabel="إضافة عميل محتمل"
          />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>الشركة</th>
                  <th>وسيلة التواصل</th>
                  <th>الحالة</th>
                  <th>المصدر</th>
                  <th>القيمة المتوقعة</th>
                  {seeAll && <th>المسؤول</th>}
                  <th>تاريخ الإضافة</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <Link href={`/leads/${lead.id}`} className="link">
                        {fullName(lead.firstName, lead.lastName)}
                      </Link>
                    </td>
                    <td className="text-slate-600">{lead.companyName ?? '—'}</td>
                    <td>
                      <div className="space-y-0.5 text-xs">
                        {lead.email && (
                          <a
                            href={`mailto:${lead.email}`}
                            dir="ltr"
                            className="block text-left text-brand-700 hover:underline"
                          >
                            {lead.email}
                          </a>
                        )}
                        {lead.phone && (
                          <a
                            href={`tel:${lead.phone}`}
                            dir="ltr"
                            className="block text-left text-slate-600"
                          >
                            {lead.phone}
                          </a>
                        )}
                        {!lead.email && !lead.phone && '—'}
                      </div>
                    </td>
                    <td>
                      <Badge className={LEAD_STATUS_COLORS[lead.status as LeadStatus]}>
                        {LEAD_STATUSES[lead.status as LeadStatus] ?? lead.status}
                      </Badge>
                    </td>
                    <td className="text-xs text-slate-500">{lead.source ?? '—'}</td>
                    <td className="nums font-medium">
                      {lead.estimatedValue ? formatMoney(lead.estimatedValue) : '—'}
                    </td>
                    {seeAll && (
                      <td>
                        {lead.owner ? (
                          <span className="flex items-center gap-2">
                            <Avatar name={lead.owner.name} size="xs" />
                            <span className="text-xs">{lead.owner.name}</span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    <td className="whitespace-nowrap text-xs text-slate-500">
                      {formatDate(lead.createdAt)}
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
