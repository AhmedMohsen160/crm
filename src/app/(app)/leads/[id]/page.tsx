import { Suspense } from 'react';
import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { Pencil, ArrowRightLeft, Mail, Phone, ArrowRight } from 'lucide-react';
import { db } from '@/lib/db';
import { can, requireAnyPermission, requireUser } from '@/lib/auth';
import { listLabel } from '@/lib/reference';
import { formatPhone, normalizePhone, whatsappLink } from '@/lib/phone';
import {
  LEAD_STATUSES,
  LEAD_STATUS_COLORS,
  LEAD_STATUS_ORDER,
  type LeadStatus,
} from '@/lib/constants';
import { formatMoney, formatDate, formatDateTime, fullName } from '@/lib/utils';
import { PageHeader, Badge, Avatar, Field } from '@/components/ui';
import { MutateButton, ConfirmMutateButton } from '@/components/forms';
import { NotesPanel, TasksPanel, ActivityPanel } from '@/components/panels';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await db.lead.findUnique({ where: { id } });
  return { title: lead ? fullName(lead.firstName, lead.lastName) : 'عميل محتمل' };
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAnyPermission('canViewAllLeads', 'canViewTeamLeads', 'canCreateLead');
  const seeAll = can(user, 'canViewAllLeads');

  const lead = await db.lead.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      client: { select: { id: true, code: true, name: true, phone: true } },
    },
  });
  if (!lead) notFound();
  if (!seeAll && lead.ownerId !== user.id) notFound();

  const name = fullName(lead.firstName, lead.lastName);
  const link = { leadId: id };
  const isWon = lead.status === 'WON';

  const [channelName, methodName, branchName, serviceName, lossName] = await Promise.all([
    listLabel('channel', lead.channel),
    listLabel('contact_method', lead.contactMethod),
    listLabel('branch', lead.branch),
    listLabel('service_line', lead.serviceInterest),
    listLabel('loss_reason', lead.lossReason),
  ]);

  // سرعة أول رد — المقياس الذي وُجد `firstReplyAt` من أجله
  const replyHours = lead.firstReplyAt
    ? (lead.firstReplyAt.getTime() - lead.createdAt.getTime()) / 3_600_000
    : null;

  const clientPhone = lead.client ? normalizePhone(lead.client.phone).value : null;

  return (
    <div className="space-y-6">
      <PageHeader title={name} subtitle={`${lead.code}${lead.companyName ? ` · ${lead.companyName}` : ''}`}>
        {!isWon && (
          <Link href={`/leads/${id}/convert`} className="btn-primary">
            <ArrowRightLeft className="h-4 w-4" />
            تحويل إلى صفقة
          </Link>
        )}
        <Link href={`/leads/${id}/edit`} className="btn-secondary">
          <Pencil className="h-4 w-4" />
          تعديل
        </Link>
        <ConfirmMutateButton
          op="lead.delete"
          id={id}
          redirectTo="/leads"
          label="حذف"
          className="btn-danger"
          confirmText={`حذف العميل المحتمل "${name}" نهائيًا؟`}
        />
      </PageHeader>

      {isWon && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          ✓ ليد فائز — حُوّل إلى مشروع بتاريخ {formatDate(lead.convertedAt)}.{' '}
          <Link href="/projects" className="font-medium underline">
            اذهب إلى الصفقات
          </Link>
        </div>
      )}

      {lead.status === 'LOST' && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          ✗ ليد خاسر — السبب: <b>{lossName}</b>
        </div>
      )}

      {/* تغيير المرحلة بضغطة — «خاسر» يمرّ بالنموذج لأن السبب إلزامي */}
      {!isWon && (
        <div className="card card-pad">
          <p className="mb-3 section-title">المرحلة</p>
          <div className="flex flex-wrap gap-2">
            {LEAD_STATUS_ORDER.filter((s) => s !== 'LOST' && s !== 'WON').map((s) => (
                <MutateButton
                  key={s}
                  op="lead.status"
                  id={id}
                  value={s}
                  redirectTo={`/leads/${id}`}
                  className={`badge cursor-pointer transition-all hover:scale-105 ${
                    lead.status === s
                      ? LEAD_STATUS_COLORS[s] + ' ring-2 ring-offset-1 ring-slate-300'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
              >
                {LEAD_STATUSES[s]}
              </MutateButton>
            ))}
            <Link
              href={`/leads/${id}/edit`}
              className="badge border-rose-300 bg-white text-rose-600 hover:bg-rose-50"
            >
              خاسر — يحتاج سببًا
            </Link>
          </div>
          {replyHours !== null && (
            <p className="mt-3 text-xs text-slate-500">
              أول رد بعد {replyHours < 1 ? 'أقل من ساعة' : `${replyHours.toFixed(1)} ساعة`} من
              وصول الليد ({formatDateTime(lead.createdAt)})
            </p>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card card-pad">
            <h2 className="mb-3 section-title">بيانات العميل</h2>
            <dl className="grid gap-x-6 sm:grid-cols-2">
              <Field label="الحالة">
                <Badge className={LEAD_STATUS_COLORS[lead.status as LeadStatus]}>
                  {LEAD_STATUSES[lead.status as LeadStatus] ?? lead.status}
                </Badge>
              </Field>
              <Field label="القناة">{channelName}</Field>
              <Field label="وسيلة التواصل">{methodName}</Field>
              <Field label="الفرع">{branchName}</Field>
              <Field label="العميل">
                {lead.client ? (
                  <Link href={`/clients/${lead.client.id}`} className="link">
                    {lead.client.name}
                    <span className="mr-1.5 text-xs text-slate-400" dir="ltr">
                      {lead.client.code}
                    </span>
                  </Link>
                ) : (
                  '—'
                )}
              </Field>
              <Field label="البريد الإلكتروني">
                {lead.email ? (
                  <a
                    href={`mailto:${lead.email}`}
                    dir="ltr"
                    className="link inline-flex items-center gap-1.5"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {lead.email}
                  </a>
                ) : (
                  '—'
                )}
              </Field>
              <Field label="الهاتف">
                {clientPhone ? (
                  <span className="inline-flex items-center gap-3">
                    <a
                      href={`tel:+${clientPhone}`}
                      dir="ltr"
                      className="link inline-flex items-center gap-1.5"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {formatPhone(clientPhone)}
                    </a>
                    <a
                      href={whatsappLink(clientPhone) ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-700 hover:underline"
                    >
                      واتساب
                    </a>
                  </span>
                ) : (
                  '—'
                )}
              </Field>
              <Field label="خط الخدمة">{serviceName}</Field>
              <Field label="الصفحات التقديرية">{lead.estPages ?? '—'}</Field>
              <Field label="زوج اللغات">
                {lead.sourceLang || lead.targetLang ? (
                  <span className="inline-flex items-center gap-1.5">
                    {lead.sourceLang ?? '؟'}
                    <ArrowRight className="h-3.5 w-3.5 rotate-180 text-slate-400" />
                    {lead.targetLang ?? '؟'}
                  </span>
                ) : (
                  '—'
                )}
              </Field>
              <Field label="القيمة المتوقعة">
                <span className="nums font-semibold">
                  {lead.estimatedValue ? formatMoney(lead.estimatedValue) : '—'}
                </span>
              </Field>
              <Field label="الموظف المسؤول">
                {lead.owner ? (
                  <span className="inline-flex items-center gap-2">
                    <Avatar name={lead.owner.name} size="xs" />
                    {lead.owner.name}
                  </span>
                ) : (
                  '—'
                )}
              </Field>
              <Field label="وصل في">{formatDateTime(lead.createdAt)}</Field>
              <Field label="أول رد">
                {lead.firstReplyAt ? formatDateTime(lead.firstReplyAt) : 'لم يُردّ بعد'}
              </Field>
            </dl>

            {lead.notes && (
              <div className="mt-4 rounded-lg bg-slate-50 p-3">
                <p className="mb-1 text-xs font-medium text-slate-500">ملاحظات أولية</p>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{lead.notes}</p>
              </div>
            )}
          </section>

          <Suspense fallback={<div className="card h-40 animate-pulse bg-slate-100" />}>
            <TasksPanel
              link={link}
              newTaskHref={`/tasks/new?leadId=${id}&redirectTo=/leads/${id}`}
              showAssignee={seeAll}
            currentPath={`/leads/${id}`}
            />
          </Suspense>
          <Suspense fallback={<div className="card h-40 animate-pulse bg-slate-100" />}>
            <NotesPanel
            link={link}
            currentUserId={user.id}
            canModerate={seeAll}
            currentPath={`/leads/${id}`}
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
