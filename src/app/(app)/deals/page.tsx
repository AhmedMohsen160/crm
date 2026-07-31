import Link from '@/components/link';
import { Plus, LayoutGrid, List, Handshake } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser, canSeeAll } from '@/lib/auth';
import {
  DEAL_STAGES,
  DEAL_STAGE_COLORS,
  DEAL_STAGE_ORDER,
  SERVICE_TYPES,
  type DealStage,
} from '@/lib/constants';
import { formatMoney, formatDate, fullName, cn } from '@/lib/utils';
import { PageHeader, Badge, Avatar, EmptyState, StatCard } from '@/components/ui';
import { FilterBar, SearchInput, FilterSelect, KeepParam } from '@/components/filters';
import PipelineBoard, { type BoardDeal } from '@/components/pipeline-board';

export const metadata = { title: 'الصفقات' };
export const dynamic = 'force-dynamic';

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    stage?: string;
    owner?: string;
    service?: string;
    view?: string;
  }>;
}) {
  const user = await requireUser();
  const seeAll = canSeeAll(user);
  const params = await searchParams;
  const view = params.view === 'list' ? 'list' : 'board';

  const where: Record<string, unknown> = {};
  if (!seeAll) where.ownerId = user.id;
  else if (params.owner) where.ownerId = params.owner;
  if (params.stage) where.stage = params.stage;
  if (params.service) where.serviceType = params.service;
  if (params.q) {
    where.OR = [
      { title: { contains: params.q } },
      { description: { contains: params.q } },
      { company: { name: { contains: params.q } } },
    ];
  }

  const [deals, users] = await Promise.all([
    db.deal.findMany({
      where,
      include: {
        company: { select: { name: true } },
        contact: { select: { firstName: true, lastName: true } },
        owner: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
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

  const openDeals = deals.filter((d) => d.stage !== 'WON' && d.stage !== 'LOST');
  const openValue = openDeals.reduce((s, d) => s + d.amount, 0);
  const wonValue = deals.filter((d) => d.stage === 'WON').reduce((s, d) => s + d.amount, 0);
  const closedCount = deals.filter((d) => d.stage === 'WON' || d.stage === 'LOST').length;
  const winRate = closedCount
    ? Math.round((deals.filter((d) => d.stage === 'WON').length / closedCount) * 100)
    : 0;

  const boardDeals: BoardDeal[] = deals.map((d) => ({
    id: d.id,
    title: d.title,
    amount: d.amount,
    currency: d.currency,
    stage: d.stage,
    probability: d.probability,
    expectedCloseDate: d.expectedCloseDate?.toISOString() ?? null,
    companyName: d.company?.name ?? null,
    contactName: d.contact ? fullName(d.contact.firstName, d.contact.lastName) : null,
    ownerName: d.owner?.name ?? null,
    serviceType: d.serviceType,
  }));

  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.stage) qs.set('stage', params.stage);
  if (params.owner) qs.set('owner', params.owner);
  if (params.service) qs.set('service', params.service);

  // نعود بعد نقل الصفقة إلى نفس اللوحة بنفس الفلاتر
  const boardQs = new URLSearchParams(qs);
  boardQs.set('view', 'board');
  const boardPath = `/deals?${boardQs.toString()}`;

  function viewHref(v: string) {
    const p = new URLSearchParams(qs);
    p.set('view', v);
    return `/deals?${p.toString()}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="الصفقات" subtitle="مسار المبيعات من أول تواصل حتى الإغلاق">
        <div className="flex overflow-hidden rounded-lg border border-slate-300">
          <Link
            href={viewHref('board')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors',
              view === 'board' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
            )}
          >
            <LayoutGrid className="h-4 w-4" />
            لوحة
          </Link>
          <Link
            href={viewHref('list')}
            className={cn(
              'flex items-center gap-1.5 border-r border-slate-300 px-3 py-2 text-sm font-medium transition-colors',
              view === 'list' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
            )}
          >
            <List className="h-4 w-4" />
            جدول
          </Link>
        </div>
        <Link href="/deals/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          صفقة جديدة
        </Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="عدد الصفقات" value={deals.length} accent="slate" />
        <StatCard label="قيمة الصفقات المفتوحة" value={formatMoney(openValue)} accent="brand" />
        <StatCard label="إجمالي المكسوب" value={formatMoney(wonValue)} accent="emerald" />
        <StatCard
          label="نسبة النجاح"
          value={`${winRate}%`}
          hint={`من ${closedCount} صفقة مغلقة`}
          accent="violet"
        />
      </div>

      <div className="card card-pad">
        <FilterBar>
          <SearchInput placeholder="ابحث في الصفقات..." defaultValue={params.q} />
          <KeepParam name="view" value={params.view} />
          <FilterSelect
            name="stage"
            defaultValue={params.stage}
            placeholder="كل المراحل"
            options={DEAL_STAGE_ORDER.map((s) => ({ value: s, label: DEAL_STAGES[s] }))}
          />
          <FilterSelect
            name="service"
            defaultValue={params.service}
            placeholder="كل الخدمات"
            options={SERVICE_TYPES.map((s) => ({ value: s, label: s }))}
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
      </div>

      {deals.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Handshake className="h-12 w-12" />}
            title="لا توجد صفقات"
            description="أنشئ صفقة مباشرة، أو حوّل عميلاً محتملاً إلى صفقة."
            actionHref="/deals/new"
            actionLabel="صفقة جديدة"
          />
        </div>
      ) : view === 'board' ? (
        <>
          <p className="text-xs text-slate-400">
            💡 اسحب أي بطاقة وأفلِتها في عمود آخر لتغيير مرحلة الصفقة.
          </p>
          <PipelineBoard deals={boardDeals} showOwner={seeAll} redirectTo={boardPath} />
        </>
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>الصفقة</th>
                <th>العميل</th>
                <th>المرحلة</th>
                <th>القيمة</th>
                <th>الخدمة</th>
                <th>الإغلاق المتوقع</th>
                {seeAll && <th>المسؤول</th>}
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link href={`/deals/${d.id}`} className="link">
                      {d.title}
                    </Link>
                  </td>
                  <td className="text-slate-600">
                    {d.company?.name ??
                      (d.contact ? fullName(d.contact.firstName, d.contact.lastName) : '—')}
                  </td>
                  <td>
                    <Badge className={DEAL_STAGE_COLORS[d.stage as DealStage]}>
                      {DEAL_STAGES[d.stage as DealStage] ?? d.stage}
                    </Badge>
                  </td>
                  <td className="nums font-semibold">{formatMoney(d.amount, d.currency)}</td>
                  <td className="text-xs text-slate-500">{d.serviceType ?? '—'}</td>
                  <td className="whitespace-nowrap text-xs text-slate-500">
                    {formatDate(d.expectedCloseDate)}
                  </td>
                  {seeAll && (
                    <td>
                      {d.owner ? (
                        <span className="flex items-center gap-2">
                          <Avatar name={d.owner.name} size="xs" />
                          <span className="text-xs">{d.owner.name}</span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
