import Link from '@/components/link';
import { Plus, FileText } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser, canSeeAll } from '@/lib/auth';
import { QUOTE_STATUSES, QUOTE_STATUS_COLORS, type QuoteStatus } from '@/lib/constants';
import { formatMoney, formatDate, isOverdue, cn } from '@/lib/utils';
import { PageHeader, Badge, Avatar, EmptyState, StatCard } from '@/components/ui';
import { FilterBar, SearchInput, FilterSelect, KeepParam } from '@/components/filters';

export const metadata = { title: 'عروض الأسعار' };
export const dynamic = 'force-dynamic';

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; owner?: string }>;
}) {
  const user = await requireUser();
  const seeAll = canSeeAll(user);
  const params = await searchParams;

  const where: Record<string, unknown> = {};
  if (!seeAll) where.ownerId = user.id;
  else if (params.owner) where.ownerId = params.owner;
  if (params.status) where.status = params.status;
  if (params.q) {
    where.OR = [
      { number: { contains: params.q } },
      { title: { contains: params.q } },
      { company: { name: { contains: params.q } } },
    ];
  }

  const [quotes, users] = await Promise.all([
    db.quote.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        owner: { select: { name: true } },
        deal: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
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

  const sentValue = quotes
    .filter((q) => q.status === 'SENT')
    .reduce((s, q) => s + q.total, 0);
  const acceptedValue = quotes
    .filter((q) => q.status === 'ACCEPTED')
    .reduce((s, q) => s + q.total, 0);
  const decided = quotes.filter(
    (q) => q.status === 'ACCEPTED' || q.status === 'REJECTED'
  ).length;
  const acceptRate = decided
    ? Math.round((quotes.filter((q) => q.status === 'ACCEPTED').length / decided) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="عروض الأسعار" subtitle="تسعير مشاريع الترجمة ومتابعة قبولها">
        <Link href="/quotes/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          عرض سعر جديد
        </Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="إجمالي العروض" value={quotes.length} accent="slate" />
        <StatCard label="قيمة العروض المُرسلة" value={formatMoney(sentValue)} accent="brand" />
        <StatCard label="قيمة العروض المقبولة" value={formatMoney(acceptedValue)} accent="emerald" />
        <StatCard
          label="نسبة القبول"
          value={`${acceptRate}%`}
          hint={`من ${decided} عرض تم البتّ فيه`}
          accent="violet"
        />
      </div>

      <div className="card">
        <FilterBar className="border-b border-slate-200 p-4">
          <SearchInput placeholder="ابحث برقم العرض أو العنوان..." defaultValue={params.q} />

          <FilterSelect
            name="status"
            defaultValue={params.status}
            placeholder="كل الحالات"
            options={Object.entries(QUOTE_STATUSES).map(([v, l]) => ({ value: v, label: l }))}
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

        {quotes.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-12 w-12" />}
            title="لا توجد عروض أسعار"
            description="أنشئ عرض سعر واحسب التكلفة تلقائيًا حسب عدد الكلمات أو الصفحات."
            actionHref="/quotes/new"
            actionLabel="عرض سعر جديد"
          />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الرقم</th>
                  <th>العنوان</th>
                  <th>العميل</th>
                  <th>الحالة</th>
                  <th>الإجمالي</th>
                  <th>صالح حتى</th>
                  {seeAll && <th>المسؤول</th>}
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => {
                  const expired =
                    q.status === 'SENT' && q.validUntil && isOverdue(q.validUntil);
                  return (
                    <tr key={q.id}>
                      <td>
                        <Link href={`/quotes/${q.id}`} className="link font-mono text-xs">
                          {q.number}
                        </Link>
                      </td>
                      <td className="max-w-[16rem] truncate text-slate-700">{q.title}</td>
                      <td className="text-sm text-slate-600">
                        {q.company ? (
                          <Link href={`/companies/${q.company.id}`} className="hover:underline">
                            {q.company.name}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <Badge className={QUOTE_STATUS_COLORS[q.status as QuoteStatus]}>
                          {QUOTE_STATUSES[q.status as QuoteStatus] ?? q.status}
                        </Badge>
                      </td>
                      <td className="nums font-semibold">{formatMoney(q.total, q.currency)}</td>
                      <td
                        className={cn(
                          'whitespace-nowrap text-xs',
                          expired ? 'font-medium text-rose-600' : 'text-slate-500'
                        )}
                      >
                        {expired && '⚠ '}
                        {formatDate(q.validUntil)}
                      </td>
                      {seeAll && (
                        <td>
                          {q.owner ? (
                            <span className="flex items-center gap-2">
                              <Avatar name={q.owner.name} size="xs" />
                              <span className="text-xs">{q.owner.name}</span>
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
