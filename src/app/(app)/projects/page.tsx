import Link from '@/components/link';
import { Plus, LayoutGrid, List, Briefcase, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser, can, ownerFilter, branchFilter } from '@/lib/auth';
import { listOptionsMany } from '@/lib/reference';
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_COLORS,
  PROJECT_STATUS_ORDER,
  PROJECT_FLOW,
  ACTIVE_STATUSES,
  REVENUE_STATUSES,
  projectAlert,
  projectBalance,
  isOverdue,
  type ProjectStatus,
} from '@/lib/projects';
import { formatMoney, formatDate, cn, search } from '@/lib/utils';
import { PageHeader, Badge, Avatar, EmptyState, StatCard } from '@/components/ui';
import { FilterBar, SearchInput, FilterSelect, KeepParam } from '@/components/filters';
import PipelineBoard, { type BoardProject } from '@/components/pipeline-board';

export const metadata = { title: 'المشاريع' };
export const dynamic = 'force-dynamic';

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    owner?: string;
    service?: string;
    branch?: string;
    view?: string;
    alerts?: string;
  }>;
}) {
  const user = await requireUser();
  const seeAll = can(user, 'canViewAllLeads');
  const showPrice = can(user, 'canViewSellPrice');
  const params = await searchParams;
  const view = params.view === 'list' ? 'list' : 'board';

  const [scope, branchScope, lists] = await Promise.all([
    ownerFilter(user),
    branchFilter(user),
    listOptionsMany('service_line', 'branch'),
  ]);

  const where: Record<string, unknown> = { ...scope, ...branchScope };
  if (seeAll && params.owner) where.ownerId = params.owner;
  if (params.status) where.status = params.status;
  if (params.service) where.serviceLine = params.service;
  if (params.branch) where.branch = params.branch;
  if (params.q) {
    where.OR = [
      { code: search(params.q) },
      { title: search(params.q) },
      { client: { name: search(params.q) } },
      { company: { name: search(params.q) } },
    ];
  }

  const [projects, users] = await Promise.all([
    db.project.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        company: { select: { name: true } },
        owner: { select: { name: true } },
      },
      orderBy: [{ deadline: 'asc' }, { updatedAt: 'desc' }],
      take: 500,
    }),
    seeAll
      ? db.user.findMany({
          where: { active: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  const serviceLabel = new Map(lists.service_line.map((s) => [s.value, s.label]));

  const withAlerts = projects.map((p) => ({ ...p, alert: projectAlert(p) }));
  const alertCount = withAlerts.filter((p) => p.alert).length;
  const visible = params.alerts ? withAlerts.filter((p) => p.alert) : withAlerts;

  // §٣ بند ٤: لا إيراد إلا لمشروع سُلّم أو محصَّل
  const recognised = withAlerts.filter((p) =>
    REVENUE_STATUSES.includes(p.status as ProjectStatus)
  );
  const recognisedValue = recognised.reduce((s, p) => s + p.netTotal, 0);
  const outstanding = withAlerts
    .filter((p) => p.status === 'delivered')
    .reduce((s, p) => s + projectBalance(p), 0);
  const activeCount = withAlerts.filter((p) =>
    ACTIVE_STATUSES.includes(p.status as ProjectStatus)
  ).length;
  const overdueCount = withAlerts.filter(isOverdue).length;

  const boardProjects: BoardProject[] = visible.map((p) => ({
    id: p.id,
    code: p.code,
    title: p.title,
    // الحقل الحسّاس لا يُرسل أصلًا لمن لا يملك صلاحيته (§٣ بند ٢)
    netTotal: showPrice ? p.netTotal : 0,
    currency: p.currency,
    status: p.status,
    deadline: p.deadline?.toISOString() ?? null,
    clientName: p.client?.name ?? p.company?.name ?? null,
    ownerName: p.owner?.name ?? null,
    serviceLineLabel: p.serviceLine ? (serviceLabel.get(p.serviceLine) ?? null) : null,
    alert: p.alert,
    showPrice,
  }));

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v && k !== 'view') qs.set(k, v);

  function viewHref(v: string) {
    const p = new URLSearchParams(qs);
    p.set('view', v);
    return `/projects?${p.toString()}`;
  }
  const boardQs = new URLSearchParams(qs);
  boardQs.set('view', 'board');

  return (
    <div className="space-y-6">
      <PageHeader title="المشاريع" subtitle="من الإسناد حتى التحصيل">
        <div className="flex overflow-hidden rounded-lg border border-slate-300">
          <Link
            href={viewHref('board')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors',
              view === 'board'
                ? 'bg-brand-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            )}
          >
            <LayoutGrid className="h-4 w-4" />
            لوحة
          </Link>
          <Link
            href={viewHref('list')}
            className={cn(
              'flex items-center gap-1.5 border-r border-slate-300 px-3 py-2 text-sm font-medium transition-colors',
              view === 'list'
                ? 'bg-brand-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            )}
          >
            <List className="h-4 w-4" />
            جدول
          </Link>
        </div>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="مشاريع جارية" value={activeCount} accent="brand" />
        <StatCard
          label="متأخرة عن موعدها"
          value={overdueCount}
          accent={overdueCount ? 'rose' : 'slate'}
        />
        {showPrice ? (
          <>
            <StatCard
              label="إيراد معترَف به"
              value={formatMoney(recognisedValue)}
              hint="سُلّم أو حُصّل فقط"
              accent="emerald"
            />
            <StatCard
              label="سُلّم ولم يُحصَّل"
              value={formatMoney(outstanding)}
              accent={outstanding ? 'amber' : 'slate'}
            />
          </>
        ) : (
          <>
            <StatCard label="بانتظار الإسناد" value={
              withAlerts.filter((p) => p.status === 'pending_assignment').length
            } accent="slate" />
            <StatCard label="إجمالي المشاريع" value={projects.length} accent="slate" />
          </>
        )}
      </div>

      {alertCount > 0 && (
        <Link
          href={`/projects?alerts=1&view=${view}`}
          className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 hover:bg-rose-100"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <b className="nums">{alertCount}</b> مشروع فيه تنبيه مفتوح — لا يُعتمد تقرير
            شهري وفيه تنبيه مفتوح.
          </span>
        </Link>
      )}

      <div className="card card-pad">
        <FilterBar>
          <SearchInput placeholder="PR-2608-0042 أو الاسم..." defaultValue={params.q} />
          <KeepParam name="view" value={params.view} />
          <KeepParam name="alerts" value={params.alerts} />
          <FilterSelect
            name="status"
            defaultValue={params.status}
            placeholder="كل الحالات"
            options={PROJECT_STATUS_ORDER.map((s) => ({
              value: s,
              label: PROJECT_STATUSES[s],
            }))}
          />
          <FilterSelect
            name="service"
            defaultValue={params.service}
            placeholder="كل خطوط الخدمة"
            options={lists.service_line.map((s) => ({ value: s.value, label: s.label }))}
          />
          {seeAll && (
            <>
              <FilterSelect
                name="branch"
                defaultValue={params.branch}
                placeholder="كل الفروع"
                options={lists.branch.map((b) => ({ value: b.value, label: b.label }))}
              />
              <FilterSelect
                name="owner"
                defaultValue={params.owner}
                placeholder="كل الموظفين"
                options={users.map((u) => ({ value: u.id, label: u.name }))}
              />
            </>
          )}
        </FilterBar>
      </div>

      {visible.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Briefcase className="h-12 w-12" />}
            title="لا مشاريع مطابقة"
            description="المشروع يُنشأ بتحويل ليد فائز — ابدأ من شاشة العملاء المحتملين."
            actionHref="/leads"
            actionLabel="العملاء المحتملون"
          />
        </div>
      ) : view === 'board' ? (
        <>
          <p className="text-xs text-slate-400">
            💡 اسحب البطاقة إلى العمود التالي لتغيير حالتها. الأعمدة التي لا يجوز
            الانتقال إليها تبهت أثناء السحب.
          </p>
          <PipelineBoard
            projects={boardProjects}
            showOwner={seeAll}
            redirectTo={`/projects?${boardQs.toString()}`}
            columns={PROJECT_FLOW}
          />
        </>
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>الرقم</th>
                <th>المشروع</th>
                <th>العميل</th>
                <th>الحالة</th>
                {showPrice && <th>الإجمالي</th>}
                {showPrice && <th>المتبقي</th>}
                <th>الموعد</th>
                {seeAll && <th>المسؤول</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id} className={p.alert ? 'bg-rose-50/50' : undefined}>
                  <td className="whitespace-nowrap text-xs text-slate-400" dir="ltr">
                    {p.code}
                  </td>
                  <td>
                    <Link href={`/projects/${p.id}`} className="link">
                      {p.title}
                    </Link>
                    {p.alert && (
                      <span className="block text-xs text-rose-600">⚠ {p.alert}</span>
                    )}
                  </td>
                  <td className="text-slate-600">
                    {p.client ? (
                      <Link href={`/clients/${p.client.id}`} className="link">
                        {p.client.name}
                      </Link>
                    ) : (
                      (p.company?.name ?? '—')
                    )}
                  </td>
                  <td>
                    <Badge className={PROJECT_STATUS_COLORS[p.status as ProjectStatus]}>
                      {PROJECT_STATUSES[p.status as ProjectStatus] ?? p.status}
                    </Badge>
                  </td>
                  {showPrice && (
                    <td className="nums font-semibold">
                      {formatMoney(p.netTotal, p.currency)}
                    </td>
                  )}
                  {showPrice && (
                    <td className="nums">{formatMoney(projectBalance(p), p.currency)}</td>
                  )}
                  <td
                    className={cn(
                      'whitespace-nowrap text-xs',
                      isOverdue(p) ? 'font-medium text-rose-600' : 'text-slate-500'
                    )}
                  >
                    {p.deadline ? formatDate(p.deadline) : '—'}
                  </td>
                  {seeAll && (
                    <td>
                      {p.owner ? (
                        <span className="flex items-center gap-2">
                          <Avatar name={p.owner.name} size="xs" />
                          <span className="text-xs">{p.owner.name}</span>
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
