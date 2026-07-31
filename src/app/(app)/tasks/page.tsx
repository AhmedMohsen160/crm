import Link from '@/components/link';
import { Plus, ListChecks, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser, canSeeAll } from '@/lib/auth';
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  TASK_PRIORITY_COLORS,
  TASK_TYPES,
  type TaskStatus,
  type TaskPriority,
  type TaskType,
} from '@/lib/constants';
import { formatDate, isOverdue, cn, fullName } from '@/lib/utils';
import { PageHeader, Badge, Avatar, EmptyState, StatCard } from '@/components/ui';
import { FilterBar, SearchInput, FilterSelect, KeepParam } from '@/components/filters';
import { TaskToggle } from '@/components/forms';
import { TaskStatusBadge } from '@/components/panels';

export const metadata = { title: 'المهام' };
export const dynamic = 'force-dynamic';

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    priority?: string;
    assignee?: string;
    scope?: string;
  }>;
}) {
  const user = await requireUser();
  const seeAll = canSeeAll(user);
  const params = await searchParams;

  // النطاق: مهامي / كل المهام (للمديرين)
  const scope = params.scope ?? (seeAll ? 'all' : 'mine');

  const where: Record<string, unknown> = {};
  if (!seeAll || scope === 'mine') where.assigneeId = user.id;
  else if (params.assignee) where.assigneeId = params.assignee;

  if (params.status) where.status = params.status;
  else where.status = { in: ['OPEN', 'IN_PROGRESS'] }; // الافتراضي: المفتوحة فقط

  if (params.priority) where.priority = params.priority;
  if (params.q) {
    where.OR = [{ title: { contains: params.q } }, { description: { contains: params.q } }];
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [tasks, users, openCount, overdueCount, doneToday] = await Promise.all([
    db.task.findMany({
      where,
      include: {
        assignee: { select: { name: true } },
        deal: { select: { id: true, title: true } },
        lead: { select: { id: true, firstName: true, lastName: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    }),
    seeAll
      ? db.user.findMany({
          where: { active: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
    db.task.count({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        ...(seeAll && scope !== 'mine' ? {} : { assigneeId: user.id }),
      },
    }),
    db.task.count({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        dueDate: { lt: todayStart },
        ...(seeAll && scope !== 'mine' ? {} : { assigneeId: user.id }),
      },
    }),
    db.task.count({
      where: {
        status: 'DONE',
        completedAt: { gte: todayStart },
        ...(seeAll && scope !== 'mine' ? {} : { assigneeId: user.id }),
      },
    }),
  ]);

  function relatedLink(t: (typeof tasks)[number]) {
    if (t.deal) return { href: `/deals/${t.deal.id}`, label: t.deal.title };
    if (t.lead)
      return {
        href: `/leads/${t.lead.id}`,
        label: fullName(t.lead.firstName, t.lead.lastName),
      };
    if (t.contact)
      return {
        href: `/contacts/${t.contact.id}`,
        label: fullName(t.contact.firstName, t.contact.lastName),
      };
    if (t.company) return { href: `/companies/${t.company.id}`, label: t.company.name };
    return null;
  }

  // نعود بعد التعديل إلى نفس القائمة بنفس الفلاتر
  const currentQs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) currentQs.set(k, v);
  const tasksPath = currentQs.toString() ? `/tasks?${currentQs}` : '/tasks';

  const scopeQuery = (s: string) => {
    const p = new URLSearchParams();
    p.set('scope', s);
    return `/tasks?${p.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader title="المهام" subtitle="متابعة العمل وتوزيعه على الفريق">
        <Link href="/tasks/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          مهمة جديدة
        </Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="مهام مفتوحة"
          value={openCount}
          icon={<ListChecks className="h-5 w-5" />}
          accent="brand"
        />
        <StatCard
          label="مهام متأخرة"
          value={overdueCount}
          icon={<AlertTriangle className="h-5 w-5" />}
          accent={overdueCount > 0 ? 'rose' : 'slate'}
        />
        <StatCard label="أُنجزت اليوم" value={doneToday} accent="emerald" />
      </div>

      {seeAll && (
        <div className="flex gap-2">
          <Link
            href={scopeQuery('all')}
            className={cn(
              'badge',
              scope === 'all'
                ? 'border-brand-400 bg-brand-50 text-brand-700'
                : 'border-slate-300 bg-white text-slate-600'
            )}
          >
            كل مهام الفريق
          </Link>
          <Link
            href={scopeQuery('mine')}
            className={cn(
              'badge',
              scope === 'mine'
                ? 'border-brand-400 bg-brand-50 text-brand-700'
                : 'border-slate-300 bg-white text-slate-600'
            )}
          >
            مهامي فقط
          </Link>
        </div>
      )}

      <div className="card">
        <FilterBar className="border-b border-slate-200 p-4">
          <SearchInput placeholder="ابحث في المهام..." defaultValue={params.q} />
          <KeepParam name="scope" value={params.scope} />
          <FilterSelect
            name="status"
            defaultValue={params.status}
            placeholder="المفتوحة فقط"
            options={Object.entries(TASK_STATUSES).map(([v, l]) => ({ value: v, label: l }))}
          />
          <FilterSelect
            name="priority"
            defaultValue={params.priority}
            placeholder="كل الأولويات"
            options={Object.entries(TASK_PRIORITIES).map(([v, l]) => ({ value: v, label: l }))}
          />
          {seeAll && scope === 'all' && (
            <FilterSelect
              name="assignee"
              defaultValue={params.assignee}
              placeholder="كل الموظفين"
              options={users.map((u) => ({ value: u.id, label: u.name }))}
            />
          )}
        </FilterBar>

        {tasks.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="h-12 w-12" />}
            title="لا توجد مهام"
            description="أنشئ مهمة متابعة حتى لا تفوتك أي فرصة."
            actionHref="/tasks/new"
            actionLabel="مهمة جديدة"
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {tasks.map((t) => {
              const rel = relatedLink(t);
              const done = t.status === 'DONE' || t.status === 'CANCELLED';
              const late = !done && isOverdue(t.dueDate);

              return (
                <li key={t.id} className="flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50/70">
                  <div className="pt-0.5">
                    <TaskToggle id={t.id} done={t.status === 'DONE'} redirectTo={tasksPath} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/tasks/${t.id}/edit`}
                        className={cn(
                          'text-sm font-medium hover:underline',
                          done ? 'text-slate-400 line-through' : 'text-slate-800'
                        )}
                      >
                        {t.title}
                      </Link>
                      <Badge className={TASK_PRIORITY_COLORS[t.priority as TaskPriority]}>
                        {TASK_PRIORITIES[t.priority as TaskPriority] ?? t.priority}
                      </Badge>
                      <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                        {TASK_TYPES[t.type as TaskType] ?? t.type}
                      </Badge>
                      {params.status && <TaskStatusBadge status={t.status} />}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      {t.dueDate && (
                        <span className={cn(late && 'font-semibold text-rose-600')}>
                          {late && '⚠ '}
                          {formatDate(t.dueDate)}
                        </span>
                      )}
                      {rel && (
                        <Link href={rel.href} className="truncate text-brand-700 hover:underline">
                          {rel.label}
                        </Link>
                      )}
                      {t.description && (
                        <span className="truncate text-slate-400">{t.description}</span>
                      )}
                    </div>
                  </div>

                  {t.assignee && (
                    <div className="flex shrink-0 items-center gap-2">
                      <Avatar name={t.assignee.name} size="xs" />
                      <span className="hidden text-xs text-slate-500 sm:block">
                        {t.assignee.name}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
