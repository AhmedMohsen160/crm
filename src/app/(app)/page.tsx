import Link from '@/components/link';
import {
  Handshake,
  UserPlus,
  ListChecks,
  TrendingUp,
  AlertTriangle,
  CalendarClock,
  Trophy,
} from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser, can, ownerFilter } from '@/lib/auth';
import {
  TASK_PRIORITY_COLORS,
  TASK_PRIORITIES,
  type TaskPriority,
} from '@/lib/constants';
import {
  PROJECT_STATUSES,
  PROJECT_FLOW,
  PROJECT_STATUS_COLORS,
  ACTIVE_STATUSES,
  REVENUE_STATUSES,
  projectBalance,
  type ProjectStatus,
} from '@/lib/projects';
import { formatMoney, formatDate, isOverdue, cn, fullName } from '@/lib/utils';
import { StatCard, Badge, Avatar, EmptyState } from '@/components/ui';

export const metadata = { title: 'لوحة التحكم' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireUser();
  const seeAll = can(user, 'canViewAllLeads');
  const mine = seeAll ? {} : { ownerId: user.id };
  const myTasks = seeAll ? {} : { assigneeId: user.id };

  /**
   * المحاسب لا يفتح سجلات الليدز ويعرف **أعدادها**: «يستطيع معرفة عدد الليدز
   * وتكلفتها وأسعارها». فالعدد يُحسب على المستوى الذي يراه، والبطاقة تفقد
   * رابطها فلا تقوده إلى شاشة محجوبة عنه.
   */
  const seesLeadStats = can(user, 'canViewLeadStats');
  const opensLeads = seeAll || can(user, 'canViewTeamLeads') || can(user, 'canCreateLead');
  const leadScope = seeAll || seesLeadStats ? {} : { ownerId: user.id };

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const in7Days = new Date();
  in7Days.setDate(in7Days.getDate() + 7);

  const [
    openDeals,
    wonThisMonth,
    activeLeads,
    openTasksCount,
    overdueTasks,
    upcomingTasks,
    recentDeals,
    stageBreakdown,
    leaderboard,
  ] = await Promise.all([
    // المشاريع الجارية — قيد الإسناد حتى جاهز للتسليم
    db.project.findMany({
      where: { ...mine, status: { in: ACTIVE_STATUSES } },
      select: { netTotal: true, currency: true, deposit: true, collectedAmount: true },
    }),
    // الإيراد المعترَف به هذا الشهر — سُلّم أو حُصّل وحدهما (§٣ بند ٤)
    db.project.findMany({
      where: {
        ...mine,
        status: { in: REVENUE_STATUSES },
        deliveredAt: { gte: startOfMonth },
      },
      select: { netTotal: true, currency: true },
    }),
    db.lead.count({
      where: { ...leadScope, status: { notIn: ['WON', 'LOST'] } },
    }),
    db.task.count({ where: { ...myTasks, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    // المهام المتأخرة
    db.task.findMany({
      where: {
        ...myTasks,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        dueDate: { lt: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      include: { assignee: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 6,
    }),
    // مهام الأيام السبعة القادمة
    db.task.findMany({
      where: {
        ...myTasks,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        dueDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)), lte: in7Days },
      },
      include: { assignee: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 6,
    }),
    db.project.findMany({
      where: mine,
      include: {
        company: { select: { name: true } },
        contact: { select: { firstName: true, lastName: true } },
        owner: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    }),
    db.project.groupBy({
      by: ['status'],
      where: mine,
      _count: { _all: true },
      _sum: { netTotal: true },
    }),
    // ترتيب الفريق حسب المبيعات المكسوبة هذا الشهر (للمديرين فقط)
    seeAll
      ? db.project.groupBy({
          by: ['ownerId'],
          where: { status: { in: REVENUE_STATUSES }, deliveredAt: { gte: startOfMonth } },
          _sum: { netTotal: true },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const pipelineValue = openDeals.reduce((sum, d) => sum + d.netTotal, 0);
  // ما سُلّم ولم يُحصَّل — أهم رقم يومي لأدمن المبيعات
  const outstanding = openDeals.reduce((s, d) => s + projectBalance(d), 0);
  const wonValue = wonThisMonth.reduce((sum, d) => sum + d.netTotal, 0);

  const stageMap = new Map(
    stageBreakdown.map((s) => [s.status, { count: s._count._all, sum: s._sum.netTotal ?? 0 }])
  );
  const maxStageCount = Math.max(1, ...stageBreakdown.map((s) => s._count._all));

  // أسماء أصحاب الصفقات للوحة الترتيب
  const ownerIds = leaderboard.map((l) => l.ownerId).filter(Boolean) as string[];
  const owners = ownerIds.length
    ? await db.user.findMany({
        where: { id: { in: ownerIds } },
        select: { id: true, name: true },
      })
    : [];
  const ownerNames = new Map(owners.map((o) => [o.id, o.name]));
  const rankedTeam = leaderboard
    .map((l) => ({
      name: l.ownerId ? (ownerNames.get(l.ownerId) ?? 'غير محدد') : 'غير محدد',
      total: l._sum.netTotal ?? 0,
      count: l._count._all,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'صباح الخير' : hour < 18 ? 'مساء الخير' : 'مساء الخير';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          {greeting}، {user.name.split(' ')[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {seeAll ? 'ملخص أداء الفريق بالكامل' : 'ملخص سجلاتك ومهامك'}
        </p>
      </div>

      {/* البطاقات الإحصائية */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="قيمة المشاريع الجارية"
          value={formatMoney(pipelineValue)}
          hint={`${openDeals.length} مشروع نشط`}
          icon={<Handshake className="h-5 w-5" />}
          accent="brand"
          href="/projects"
        />
        <StatCard
          label="مستحق على العملاء"
          value={formatMoney(outstanding)}
          hint="إجمالي ما لم يُحصَّل بعد"
          icon={<TrendingUp className="h-5 w-5" />}
          accent={outstanding > 0 ? 'amber' : 'slate'}
        />
        <StatCard
          label="إيراد هذا الشهر"
          value={formatMoney(wonValue)}
          hint={`${wonThisMonth.length} مشروع سُلّم أو حُصّل`}
          icon={<Trophy className="h-5 w-5" />}
          accent="emerald"
          href="/projects?status=delivered"
        />
        {(opensLeads || seesLeadStats) && (
          <StatCard
            label="عملاء محتملون نشطون"
            value={activeLeads}
            hint={`${openTasksCount} مهمة مفتوحة`}
            icon={<UserPlus className="h-5 w-5" />}
            accent="amber"
            href={opensLeads ? '/leads' : undefined}
          />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* توزيع الصفقات على المراحل */}
        <section className="card card-pad lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">مسار المبيعات (Pipeline)</h2>
            <Link href="/projects" className="link text-sm">
              عرض اللوحة ←
            </Link>
          </div>

          {stageBreakdown.length === 0 ? (
            <EmptyState
              title="لا توجد صفقات بعد"
              description="ابدأ بإضافة عميل محتمل ثم حوّله إلى صفقة."
              actionHref="/leads/new"
              actionLabel="إضافة عميل محتمل"
            />
          ) : (
            <div className="space-y-3">
              {PROJECT_FLOW.map((stage) => {
                const data = stageMap.get(stage) ?? { count: 0, sum: 0 };
                const pct = (data.count / maxStageCount) * 100;
                return (
                  <Link
                    key={stage}
                    // المسار `/projects` والمرشِّح `status` — وكان `/deals?stage`
                    // بقيّةً من التسمية القديمة، فيقع كل شريط في صفحة ٤٠٤
                    href={`/projects?status=${stage}&view=list`}
                    className="block rounded-lg p-2 transition-colors hover:bg-slate-50"
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Badge className={PROJECT_STATUS_COLORS[stage]}>{PROJECT_STATUSES[stage]}</Badge>
                        <span className="text-slate-500 nums">{data.count}</span>
                      </span>
                      <span className="font-medium text-slate-700 nums">
                        {formatMoney(data.sum)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          stage === 'collected'
                            ? 'bg-teal-600'
                            : stage === 'delivered'
                              ? 'bg-emerald-500'
                              : 'bg-brand-500'
                        )}
                        style={{ width: `${Math.max(pct, data.count > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* المهام المتأخرة */}
        <section className="card card-pad">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
            <AlertTriangle className="h-4 w-4 text-rose-500" />
            مهام متأخرة
            {overdueTasks.length > 0 && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700 nums">
                {overdueTasks.length}
              </span>
            )}
          </h2>

          {overdueTasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              ممتاز! لا توجد مهام متأخرة 🎉
            </p>
          ) : (
            <ul className="space-y-3">
              {overdueTasks.map((t) => (
                <li key={t.id}>
                  <Link href="/tasks" className="block rounded-lg p-2 hover:bg-slate-50">
                    <p className="truncate text-sm font-medium text-slate-800">{t.title}</p>
                    <p className="mt-1 flex items-center gap-2 text-xs">
                      <span className="text-rose-600">{formatDate(t.dueDate)}</span>
                      {seeAll && t.assignee && (
                        <span className="text-slate-400">• {t.assignee.name}</span>
                      )}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* آخر الصفقات */}
        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-slate-800">آخر تحديثات الصفقات</h2>
            <Link href="/projects" className="link text-sm">
              الكل ←
            </Link>
          </div>

          {recentDeals.length === 0 ? (
            <EmptyState title="لا توجد صفقات" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentDeals.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/projects/${d.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{d.title}</p>
                      <p className="truncate text-xs text-slate-500">
                        {d.company?.name ??
                          (d.contact ? fullName(d.contact.firstName, d.contact.lastName) : '—')}
                      </p>
                    </div>
                    <Badge className={PROJECT_STATUS_COLORS[d.status as ProjectStatus]}>
                      {PROJECT_STATUSES[d.status as ProjectStatus] ?? d.status}
                    </Badge>
                    <span className="hidden shrink-0 text-sm font-semibold text-slate-700 nums sm:block">
                      {formatMoney(d.netTotal, d.currency)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* القادم هذا الأسبوع / ترتيب الفريق */}
        <div className="space-y-6">
          <section className="card card-pad">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
              <CalendarClock className="h-4 w-4 text-brand-600" />
              الأسبوع القادم
            </h2>
            {upcomingTasks.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">لا توجد مهام مجدولة</p>
            ) : (
              <ul className="space-y-3">
                {upcomingTasks.map((t) => (
                  <li key={t.id} className="flex items-start gap-2">
                    <ListChecks
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        isOverdue(t.dueDate) ? 'text-rose-500' : 'text-slate-400'
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-800">{t.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span>{formatDate(t.dueDate)}</span>
                        <Badge
                          className={cn(
                            'text-[10px]',
                            TASK_PRIORITY_COLORS[t.priority as TaskPriority]
                          )}
                        >
                          {TASK_PRIORITIES[t.priority as TaskPriority] ?? t.priority}
                        </Badge>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {seeAll && rankedTeam.length > 0 && (
            <section className="card card-pad">
              <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
                <Trophy className="h-4 w-4 text-amber-500" />
                ترتيب الفريق هذا الشهر
              </h2>
              <ul className="space-y-3">
                {rankedTeam.map((m, i) => (
                  <li key={m.name + i} className="flex items-center gap-3">
                    <span className="w-5 text-center text-sm font-bold text-slate-400 nums">
                      {i + 1}
                    </span>
                    <Avatar name={m.name} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                      {m.name}
                    </span>
                    <span className="text-sm font-semibold text-emerald-700 nums">
                      {formatMoney(m.total)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
