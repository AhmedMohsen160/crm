import Link from '@/components/link';
import { AlertTriangle, Clock, Users } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission, can } from '@/lib/auth';
import { listOptionsMany } from '@/lib/reference';
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_COLORS,
  ACTIVE_STATUSES,
  projectAlert,
  isOverdue,
  type ProjectStatus,
} from '@/lib/projects';
import { formatDate, cn } from '@/lib/utils';
import { PageHeader, Badge, EmptyState, StatCard } from '@/components/ui';

export const metadata = { title: 'قائمة الإسناد' };
export const dynamic = 'force-dynamic';

/**
 * قائمة الإسناد (§٧.٢).
 *
 * > **«لا سعر بيع ظاهر إطلاقًا.»**
 *
 * ليس إخفاءً بالـCSS: الاستعلام لا يختار `netTotal` ولا `deposit` ولا
 * `unitPrice` أصلًا، فلا يغادر الرقم الخادم. الغرض المنصوص عليه: ألا يُبنى
 * قرار الإسناد على قيمة الطلب.
 */
export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requirePermission('canAssignProduction');
  const { status } = await searchParams;

  const lists = await listOptionsMany('service_line', 'work_mode');
  const serviceLabel = new Map(lists.service_line.map((s) => [s.value, s.label]));
  const modeLabel = new Map(lists.work_mode.map((m) => [m.value, m.label]));

  const projects = await db.project.findMany({
    where: { status: status ? status : { in: ACTIVE_STATUSES } },
    // الحقول المالية غير مذكورة عمدًا — لا تُرسل من الخادم
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      serviceLine: true,
      sourceLang: true,
      targetLang: true,
      pages: true,
      deadline: true,
      isExpress: true,
      isRush: true,
      isRework: true,
      workMode: true,
      createdAt: true,
      netTotal: false as never,
      primaryProducer: { select: { name: true } },
      client: { select: { name: true } },
    },
    orderBy: [{ deadline: 'asc' }, { createdAt: 'asc' }],
    take: 300,
  });

  const pending = projects.filter((p) => p.status === 'pending_assignment');
  const overdue = projects.filter((p) => isOverdue({ status: p.status, deadline: p.deadline }));
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const dueToday = projects.filter(
    (p) => p.deadline && p.deadline <= today && !isOverdue({ status: p.status, deadline: p.deadline })
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="قائمة الإسناد"
        subtitle="مرتّبة بالموعد — المتأخر أولًا. لا أسعار بيع في هذه الشاشة."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="بانتظار الإسناد" value={pending.length} accent="slate" />
        <StatCard label="جارية" value={projects.length} accent="brand" />
        <StatCard label="مستحقة اليوم" value={dueToday.length} accent="amber" />
        <StatCard
          label="متأخرة"
          value={overdue.length}
          accent={overdue.length ? 'rose' : 'slate'}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/production"
          className={`badge ${
            !status
              ? 'border-brand-400 bg-brand-50 text-brand-700'
              : 'border-slate-300 bg-white text-slate-600'
          }`}
        >
          كل الجاري
        </Link>
        {ACTIVE_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/production?status=${s}`}
            className={`badge ${
              status === s ? PROJECT_STATUS_COLORS[s] : 'border-slate-300 bg-white text-slate-600'
            }`}
          >
            {PROJECT_STATUSES[s]}
          </Link>
        ))}
      </div>

      {projects.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Users className="h-12 w-12" />}
            title="لا مشاريع جارية"
            description="كل شيء مسلَّم أو محصَّل."
          />
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>الرقم</th>
                <th>المشروع</th>
                <th>خط الخدمة</th>
                <th>الصفحات</th>
                <th>الحالة</th>
                <th>نمط التشغيل</th>
                <th>المنتِج</th>
                <th>الموعد</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const late = isOverdue({ status: p.status, deadline: p.deadline });
                const alert = projectAlert({
                  status: p.status,
                  createdAt: p.createdAt,
                  pages: p.pages,
                  // السعر غير متاح في هذه الشاشة عمدًا — نمرّر قيمة محايدة
                  // حتى لا يُبلَّغ عن «السعر مفقود» لمن لا يراه أصلًا
                  netTotal: 1,
                  workMode: p.workMode,
                  primaryProducerId: p.primaryProducer ? 'set' : null,
                  serviceLine: p.serviceLine,
                });

                return (
                  <tr key={p.id} className={late ? 'bg-rose-50/60' : undefined}>
                    <td className="whitespace-nowrap text-xs text-slate-400" dir="ltr">
                      {p.code}
                    </td>
                    <td>
                      <Link href={`/projects/${p.id}`} className="link">
                        {p.title}
                      </Link>
                      <span className="block text-xs text-slate-400">
                        {p.client?.name ?? ''}
                        {p.isRework && <span className="mr-1 text-amber-700">· مُعاد</span>}
                        {(p.isExpress || p.isRush) && (
                          <span className="mr-1 text-amber-700">· عاجل</span>
                        )}
                      </span>
                      {alert && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-rose-600">
                          <AlertTriangle className="h-3 w-3" />
                          {alert}
                        </span>
                      )}
                    </td>
                    <td className="text-sm text-slate-600">
                      {p.serviceLine ? (serviceLabel.get(p.serviceLine) ?? '—') : '—'}
                    </td>
                    <td className="nums">{p.pages ?? '—'}</td>
                    <td>
                      <Badge className={PROJECT_STATUS_COLORS[p.status as ProjectStatus]}>
                        {PROJECT_STATUSES[p.status as ProjectStatus] ?? p.status}
                      </Badge>
                    </td>
                    <td className="text-xs text-slate-600">
                      {p.workMode ? (modeLabel.get(p.workMode) ?? '—') : '—'}
                    </td>
                    <td className="text-sm text-slate-600">
                      {p.primaryProducer?.name ?? '—'}
                    </td>
                    <td
                      className={cn(
                        'whitespace-nowrap text-xs',
                        late ? 'font-medium text-rose-600' : 'text-slate-500'
                      )}
                    >
                      {p.deadline ? formatDate(p.deadline) : 'بلا موعد'}
                      {late && (
                        <span className="mr-1 inline-flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          متأخر
                        </span>
                      )}
                    </td>
                    <td>
                      <Link href={`/projects/${p.id}/assign`} className="btn-secondary text-xs">
                        {p.workMode ? 'تعديل الإسناد' : 'إسناد'}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!can(user, 'canViewSellPrice') && (
        <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
          أسعار البيع لا تظهر في شاشات التشغيل عمدًا، حتى لا يُبنى قرار الإسناد على
          قيمة الطلب.
        </p>
      )}
    </div>
  );
}
