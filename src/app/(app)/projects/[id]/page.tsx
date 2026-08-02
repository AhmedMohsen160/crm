import { Suspense } from 'react';
import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { Pencil, AlertTriangle, ArrowRight, FileText, Zap } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser, can } from '@/lib/auth';
import { listLabel } from '@/lib/reference';
import {
  DISCOUNT_TYPES,
  PROJECT_STATUSES,
  PROJECT_STATUS_COLORS,
  allowedTransitions,
  projectAlert,
  projectBalance,
  isOverdue,
  countsAsRevenue,
  type ProjectStatus,
  type DiscountType,
} from '@/lib/projects';
import { QUOTE_STATUSES, QUOTE_STATUS_COLORS, type QuoteStatus } from '@/lib/constants';
import { formatMoney, formatDate, formatDateTime, cn } from '@/lib/utils';
import { PageHeader, Badge, Avatar, Field, ErrorAlert } from '@/components/ui';
import { NotesPanel, TasksPanel, ActivityPanel } from '@/components/panels';
import ProjectTransitions from '@/components/project-transitions';
import ProjectSteps from '@/components/project-steps';
import ProjectCostPanel from '@/components/project-cost-panel';
import ApprovalPanel from '@/components/approval-panel';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.project.findUnique({
    where: { id },
    select: { title: true, code: true },
  });
  return { title: project ? `${project.code} — ${project.title}` : 'مشروع' };
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await requireUser();
  const seeAll = can(user, 'canViewAllLeads');
  const showPrice = can(user, 'canViewSellPrice');

  const project = await db.project.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, code: true, name: true, phone: true } },
      company: { select: { id: true, name: true } },
      lead: { select: { id: true, code: true } },
      owner: { select: { name: true } },
      projectManager: { select: { name: true } },
      approvedBy: { select: { name: true } },
      primaryProducer: { select: { name: true } },
      quotes: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!project) notFound();
  if (!seeAll && project.ownerId !== user.id) notFound();

  const link = { projectId: id };
  const status = project.status as ProjectStatus;
  const alert = projectAlert(project);
  const balance = projectBalance(project);
  const overdue = isOverdue(project);

  const showCost = can(user, 'canViewCostIndicator') || can(user, 'canViewStaffSalary');
  const canAssign = can(user, 'canAssignProduction');

  const [serviceName, branchName, sourceName, targetName, workModeName] = await Promise.all([
    listLabel('service_line', project.serviceLine),
    listLabel('branch', project.branch),
    listLabel('language', project.sourceLang),
    listLabel('language', project.targetLang),
    listLabel('work_mode', project.workMode),
  ]);

  // الانتقالات المسموحة **لهذا المستخدم** — تُرشَّح في الخادم لا في الواجهة
  const transitions = allowedTransitions(status).filter(
    (t) => !t.permission || can(user, t.permission)
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={project.title}
        subtitle={`${project.code ?? ''}${
          project.client ? ` · ${project.client.name}` : ''
        }`}
      >
        {showPrice && (
          <Link href={`/quotes/new?projectId=${id}`} className="btn-secondary">
            <FileText className="h-4 w-4" />
            عرض سعر
          </Link>
        )}
        <Link href={`/projects/${id}/edit`} className="btn-secondary">
          <Pencil className="h-4 w-4" />
          تعديل
        </Link>
      </PageHeader>

      <ErrorAlert message={error} />

      {alert && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>تنبيه مفتوح:</b> {alert}
            <span className="block text-xs text-rose-600">
              لا يُعتمد تقرير شهري وفيه تنبيه مفتوح — أكمل الناقص من شاشة التعديل.
            </span>
          </span>
        </div>
      )}

      {status === 'cancelled' && (
        <div className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          هذا المشروع <b>ملغى</b>
          {project.cancelReason ? ` — ${project.cancelReason}` : ''}. يبقى في اللوحة
          التشغيلية وخارج كل تقرير مالي.
        </div>
      )}

      {project.approvalState !== 'not_required' && showPrice && (
        <ApprovalPanel
          projectId={id}
          state={project.approvalState}
          canDecide={can(user, 'canApproveDiscount')}
          discountLabel={
            project.discountType === 'amount'
              ? `خصم ${formatMoney(project.discountValue ?? 0, project.currency)}`
              : `خصم ${((project.discountValue ?? 0) * 100).toFixed(1)}٪`
          }
          approverName={project.approvedBy?.name ?? null}
          note={project.approvalNote}
        />
      )}

      {canAssign && (
        <div className="card card-pad">
          <p className="mb-3 section-title">التشغيل</p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/projects/${id}/assign`} className="btn-secondary">
              {project.workMode ? 'تعديل الإسناد' : 'إسناد المشروع'}
            </Link>
            {/* التسليم من «جاهز للتسليم» وحدها — مسار §٦ متسلسل، ولا
                نضيف قفزة لم تنصّ عليها المواصفة */}
            {status === 'ready' && (
              <Link href={`/projects/${id}/deliver`} className="btn-primary">
                تسليم المشروع
              </Link>
            )}
          </div>
        </div>
      )}

      <ProjectTransitions
        projectId={id}
        status={status}
        transitions={transitions.map((t) => ({ to: t.to, label: PROJECT_STATUSES[t.to] }))}
        netTotal={showPrice ? project.netTotal : null}
        alreadyCollected={project.collectedAmount}
        deposit={project.deposit}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card card-pad">
            <h2 className="mb-3 section-title">بيانات المشروع</h2>
            <dl className="grid gap-x-6 sm:grid-cols-2">
              <Field label="الحالة">
                <Badge className={PROJECT_STATUS_COLORS[status]}>
                  {PROJECT_STATUSES[status] ?? status}
                </Badge>
              </Field>
              <Field label="خط الخدمة">{serviceName}</Field>
              <Field label="زوج اللغات">
                <span className="inline-flex items-center gap-1.5">
                  {sourceName}
                  <ArrowRight className="h-3.5 w-3.5 rotate-180 text-slate-400" />
                  {targetName}
                </span>
              </Field>
              <Field label="عدد الصفحات">
                <span className="nums">{project.pages ?? '—'}</span>
              </Field>
              <Field label="الفرع">{branchName}</Field>
              <Field label="العميل">
                {project.client ? (
                  <Link href={`/clients/${project.client.id}`} className="link">
                    {project.client.name}
                    <span className="mr-1.5 text-xs text-slate-400" dir="ltr">
                      {project.client.code}
                    </span>
                  </Link>
                ) : (
                  (project.company?.name ?? '—')
                )}
              </Field>
              <Field label="الليد الأصل">
                {project.lead ? (
                  <Link href={`/leads/${project.lead.id}`} className="link" dir="ltr">
                    {project.lead.code}
                  </Link>
                ) : (
                  'مشروع مباشر'
                )}
              </Field>
              <Field label="أدمن المبيعات">
                {project.owner ? (
                  <span className="inline-flex items-center gap-2">
                    <Avatar name={project.owner.name} size="xs" />
                    {project.owner.name}
                  </span>
                ) : (
                  '—'
                )}
              </Field>
              <Field label="الموعد">
                <span className={cn(overdue && 'font-medium text-rose-600')}>
                  {project.deadline ? formatDate(project.deadline) : 'بلا موعد'}
                  {project.isExpress && (
                    <span className="mr-2 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">
                      <Zap className="h-3 w-3" />
                      فوري
                    </span>
                  )}
                  {overdue && ' — متأخر'}
                </span>
              </Field>
              {project.isRush && <Field label="استعجال">مطبَّق</Field>}
              <Field label="نمط التشغيل">{workModeName}</Field>
              <Field label="المنتِج الرئيسي">
                {project.primaryProducer?.name ?? 'لم يُسند بعد'}
              </Field>
            </dl>

            {project.description && (
              <div className="mt-4 rounded-lg bg-slate-50 p-3">
                <p className="mb-1 text-xs font-medium text-slate-500">تفاصيل</p>
                <p className="whitespace-pre-wrap text-sm text-slate-700">
                  {project.description}
                </p>
              </div>
            )}
          </section>

          {/* الحقول المالية لا تُرسل أصلًا لمن لا يملك صلاحيتها (§٣ بند ٢) */}
          {showPrice && (
            <section className="card card-pad">
              <h2 className="mb-3 section-title">المالية</h2>
              <dl className="grid gap-x-6 sm:grid-cols-3">
                <Field label="الإجمالي">
                  <span className="nums font-semibold">
                    {formatMoney(project.netTotal, project.currency)}
                  </span>
                </Field>
                <Field label="المقدم">
                  <span className="nums">{formatMoney(project.deposit, project.currency)}</span>
                </Field>
                <Field label="المحصَّل">
                  <span className="nums">
                    {formatMoney(project.collectedAmount, project.currency)}
                  </span>
                </Field>
                <Field label="المتبقي">
                  <span
                    className={cn('nums font-semibold', balance > 0 && 'text-amber-700')}
                  >
                    {formatMoney(balance, project.currency)}
                  </span>
                </Field>
                <Field label="سعر الصفحة">
                  <span className="nums">
                    {project.unitPrice ? formatMoney(project.unitPrice) : '—'}
                  </span>
                </Field>
                <Field label="قبل الخصم">
                  <span className="nums">
                    {project.gross ? formatMoney(project.gross, project.currency) : '—'}
                  </span>
                </Field>
                <Field label="الخصم">
                  {project.discountType ? (
                    <span className="nums">
                      {DISCOUNT_TYPES[project.discountType as DiscountType] ??
                        project.discountType}
                      {' · '}
                      {project.discountType === 'amount'
                        ? formatMoney(project.discountValue ?? 0, project.currency)
                        : `${((project.discountValue ?? 0) * 100).toFixed(1)}٪`}
                    </span>
                  ) : (
                    'بلا خصم'
                  )}
                </Field>
                <Field label="شهر الإيراد">{project.revenueMonth ?? '—'}</Field>
              </dl>
              {!countsAsRevenue(project.status) && (
                <p className="mt-3 rounded bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  هذا المشروع <b>لا يدخل أي تقرير مالي</b> بعد — الإيراد يُعترف به عند
                  «سُلّم» أو «محصَّل» (§٣ بند ٤).
                </p>
              )}
            </section>
          )}

          <section className="card card-pad">
            <h2 className="mb-3 section-title">الطوابع الزمنية</h2>
            <dl className="grid gap-x-6 sm:grid-cols-3">
              <Field label="أُنشئ">{formatDateTime(project.createdAt)}</Field>
              <Field label="حُوّل">
                {project.convertedAt ? formatDateTime(project.convertedAt) : '—'}
              </Field>
              <Field label="أُسند">
                {project.assignedAt ? formatDateTime(project.assignedAt) : '—'}
              </Field>
              <Field label="سُلّم">
                {project.deliveredAt ? formatDateTime(project.deliveredAt) : '—'}
              </Field>
              <Field label="حُصّل">
                {project.collectedAt ? formatDateTime(project.collectedAt) : '—'}
              </Field>
              <Field label="أُغلق">
                {project.closedAt ? formatDateTime(project.closedAt) : '—'}
              </Field>
            </dl>
          </section>

          {showPrice && project.quotes.length > 0 && (
            <section className="card card-pad">
              <h2 className="mb-3 section-title">عروض الأسعار</h2>
              <ul className="space-y-2">
                {project.quotes.map((q) => (
                  <li key={q.id} className="flex items-center justify-between gap-3 text-sm">
                    <Link href={`/quotes/${q.id}`} className="link" dir="ltr">
                      {q.number}
                    </Link>
                    <Badge className={QUOTE_STATUS_COLORS[q.status as QuoteStatus]}>
                      {QUOTE_STATUSES[q.status as QuoteStatus] ?? q.status}
                    </Badge>
                    <span className="nums">{formatMoney(q.total, q.currency)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Suspense fallback={<div className="card h-32 animate-pulse bg-slate-100" />}>
            <ProjectSteps projectId={id} canEdit={canAssign} showCost={showCost} />
          </Suspense>

          {showCost && (
            <Suspense fallback={<div className="card h-32 animate-pulse bg-slate-100" />}>
              <ProjectCostPanel projectId={id} showSellPrice={showPrice} />
            </Suspense>
          )}

          <Suspense fallback={<div className="card h-40 animate-pulse bg-slate-100" />}>
            <TasksPanel
              link={link}
              newTaskHref={`/tasks/new?projectId=${id}&redirectTo=/projects/${id}`}
              showAssignee={seeAll}
              currentPath={`/projects/${id}`}
            />
          </Suspense>
          <Suspense fallback={<div className="card h-40 animate-pulse bg-slate-100" />}>
            <NotesPanel
              link={link}
              currentUserId={user.id}
              canModerate={seeAll}
              currentPath={`/projects/${id}`}
            />
          </Suspense>
        </div>

        <div className="space-y-6">
          <Suspense fallback={<div className="card h-40 animate-pulse bg-slate-100" />}>
            <ActivityPanel link={link} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
