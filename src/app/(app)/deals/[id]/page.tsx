import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { Pencil, Building2, User, FileText, ArrowRight, Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser, can, ownerFilter } from '@/lib/auth';
import {
  DEAL_STAGES,
  DEAL_STAGE_COLORS,
  DEAL_STAGE_ORDER,
  QUOTE_STATUSES,
  QUOTE_STATUS_COLORS,
  type DealStage,
  type QuoteStatus,
} from '@/lib/constants';
import { formatMoney, formatDate, formatNumber, fullName, cn } from '@/lib/utils';
import { PageHeader, Badge, Avatar, Field, EmptyState } from '@/components/ui';
import { MutateButton, ConfirmMutateButton } from '@/components/forms';
import { NotesPanel, TasksPanel, ActivityPanel } from '@/components/panels';

export const dynamic = 'force-dynamic';


export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = await db.deal.findUnique({ where: { id }, select: { title: true } });
  return { title: deal?.title ?? 'صفقة' };
}

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const seeAll = can(user, 'canViewAllLeads');

  const deal = await db.deal.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      owner: { select: { name: true } },
      quotes: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!deal) notFound();
  if (!seeAll && deal.ownerId !== user.id) notFound();

  const link = { dealId: id };
  const stage = deal.stage as DealStage;
  const isClosed = stage === 'WON' || stage === 'LOST';

  return (
    <div className="space-y-6">
      <PageHeader
        title={deal.title}
        subtitle={deal.company?.name ?? (deal.contact ? fullName(deal.contact.firstName, deal.contact.lastName) : undefined)}
      >
        <Link href={`/quotes/new?dealId=${id}`} className="btn-primary">
          <FileText className="h-4 w-4" />
          عرض سعر
        </Link>
        <Link href={`/deals/${id}/edit`} className="btn-secondary">
          <Pencil className="h-4 w-4" />
          تعديل
        </Link>
        <ConfirmMutateButton
          op="deal.delete"
          id={id}
          redirectTo="/deals"
          label="حذف"
          className="btn-danger"
          confirmText={`حذف الصفقة "${deal.title}" نهائيًا؟`}
        />
      </PageHeader>

      {/* شريط المراحل — اضغط لتغيير المرحلة */}
      <div className="card card-pad">
        <p className="mb-3 section-title">مرحلة الصفقة</p>
        <div className="flex flex-wrap items-center gap-2">
          {DEAL_STAGE_ORDER.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <MutateButton
                op="deal.stage"
                id={id}
                value={s}
                redirectTo={`/deals/${id}`}
                className={cn(
                  'badge cursor-pointer transition-all hover:scale-105',
                  stage === s
                    ? DEAL_STAGE_COLORS[s] + ' ring-2 ring-slate-300 ring-offset-1'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                )}
              >
                {DEAL_STAGES[s]}
              </MutateButton>
              {i < DEAL_STAGE_ORDER.length - 1 && (
                <ArrowRight className="hidden h-3 w-3 rotate-180 text-slate-300 sm:block" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card card-pad">
          <p className="text-xs text-slate-500">قيمة الصفقة</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 nums">
            {formatMoney(deal.amount, deal.currency)}
          </p>
        </div>
        <div className="card card-pad">
          <p className="text-xs text-slate-500">احتمال الإغلاق</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 nums">{deal.probability}%</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${deal.probability}%` }}
            />
          </div>
        </div>
        <div className="card card-pad">
          <p className="text-xs text-slate-500">
            {isClosed ? 'تاريخ الإغلاق' : 'الإغلاق المتوقع'}
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {formatDate(isClosed ? deal.closedAt : deal.expectedCloseDate)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card card-pad">
            <h2 className="mb-3 section-title">تفاصيل المشروع</h2>
            <dl className="grid gap-x-6 sm:grid-cols-2">
              <Field label="المرحلة">
                <Badge className={DEAL_STAGE_COLORS[stage]}>
                  {DEAL_STAGES[stage] ?? deal.stage}
                </Badge>
              </Field>
              <Field label="نوع الخدمة">{deal.serviceType ?? '—'}</Field>
              <Field label="زوج اللغات">
                {deal.sourceLang || deal.targetLang ? (
                  <span className="inline-flex items-center gap-1.5">
                    {deal.sourceLang ?? '؟'}
                    <ArrowRight className="h-3.5 w-3.5 rotate-180 text-slate-400" />
                    {deal.targetLang ?? '؟'}
                  </span>
                ) : (
                  '—'
                )}
              </Field>
              <Field label="الحجم">
                {deal.wordCount || deal.pageCount ? (
                  <span className="nums">
                    {deal.wordCount ? `${formatNumber(deal.wordCount)} كلمة` : ''}
                    {deal.wordCount && deal.pageCount ? ' • ' : ''}
                    {deal.pageCount ? `${formatNumber(deal.pageCount)} صفحة` : ''}
                  </span>
                ) : (
                  '—'
                )}
              </Field>
              <Field label="موعد التسليم">{formatDate(deal.deliveryDate)}</Field>
              <Field label="الموظف المسؤول">
                {deal.owner ? (
                  <span className="inline-flex items-center gap-2">
                    <Avatar name={deal.owner.name} size="xs" />
                    {deal.owner.name}
                  </span>
                ) : (
                  '—'
                )}
              </Field>
              {stage === 'LOST' && (
                <Field label="سبب الخسارة">
                  <span className="text-rose-700">{deal.lostReason ?? '—'}</span>
                </Field>
              )}
            </dl>

            {deal.description && (
              <div className="mt-4 rounded-lg bg-slate-50 p-3">
                <p className="mb-1 text-xs font-medium text-slate-500">الوصف والمتطلبات</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {deal.description}
                </p>
              </div>
            )}
          </section>

          {/* عروض الأسعار المرتبطة */}
          <section className="card">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold text-slate-800">
                <FileText className="h-4 w-4 text-brand-600" />
                عروض الأسعار
                <span className="text-sm font-normal text-slate-400 nums">
                  ({deal.quotes.length})
                </span>
              </h2>
              <Link href={`/quotes/new?dealId=${id}`} className="btn-secondary btn-sm">
                <Plus className="h-3.5 w-3.5" />
                عرض جديد
              </Link>
            </div>
            {deal.quotes.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">
                لم يُرسَل عرض سعر بعد
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {deal.quotes.map((q) => (
                  <li key={q.id}>
                    <Link
                      href={`/quotes/${q.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50"
                    >
                      <span className="font-mono text-xs text-slate-500">{q.number}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                        {q.title}
                      </span>
                      <Badge className={QUOTE_STATUS_COLORS[q.status as QuoteStatus]}>
                        {QUOTE_STATUSES[q.status as QuoteStatus] ?? q.status}
                      </Badge>
                      <span className="shrink-0 text-sm font-semibold nums">
                        {formatMoney(q.total, q.currency)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <TasksPanel
            link={link}
            newTaskHref={`/tasks/new?dealId=${id}&redirectTo=/deals/${id}`}
            showAssignee={seeAll}
            currentPath={`/deals/${id}`}
          />
          <NotesPanel
            link={link}
            currentUserId={user.id}
            canModerate={seeAll}
            currentPath={`/deals/${id}`}
          />
        </div>

        <div className="space-y-6">
          {/* بطاقة العميل */}
          <section className="card card-pad">
            <h2 className="mb-3 section-title">العميل</h2>
            {deal.company ? (
              <Link
                href={`/companies/${deal.company.id}`}
                className="mb-3 flex items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
              >
                <Building2 className="h-5 w-5 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                  {deal.company.name}
                </span>
              </Link>
            ) : (
              <p className="mb-3 text-sm text-slate-400">لم تُربط شركة</p>
            )}

            {deal.contact ? (
              <Link
                href={`/contacts/${deal.contact.id}`}
                className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
              >
                <User className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {fullName(deal.contact.firstName, deal.contact.lastName)}
                  </p>
                  {deal.contact.email && (
                    <p dir="ltr" className="truncate text-left text-xs text-slate-500">
                      {deal.contact.email}
                    </p>
                  )}
                  {deal.contact.phone && (
                    <p dir="ltr" className="truncate text-left text-xs text-slate-500">
                      {deal.contact.phone}
                    </p>
                  )}
                </div>
              </Link>
            ) : (
              <p className="text-sm text-slate-400">لم تُربط جهة اتصال</p>
            )}
          </section>

          <ActivityPanel link={link} />
        </div>
      </div>
    </div>
  );
}
