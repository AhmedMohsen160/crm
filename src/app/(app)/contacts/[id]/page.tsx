import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { Pencil, Plus, Mail, Phone, Building2, Handshake } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser, can, ownerFilter } from '@/lib/auth';
import { DEAL_STAGES, DEAL_STAGE_COLORS, type DealStage } from '@/lib/constants';
import { formatMoney, formatDate, fullName } from '@/lib/utils';
import { PageHeader, Badge, Avatar, Field } from '@/components/ui';
import { ConfirmMutateButton } from '@/components/forms';
import { NotesPanel, TasksPanel, ActivityPanel } from '@/components/panels';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await db.contact.findUnique({
    where: { id },
    select: { firstName: true, lastName: true },
  });
  return { title: c ? fullName(c.firstName, c.lastName) : 'جهة اتصال' };
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const seeAll = can(user, 'canViewAllLeads');

  const contact = await db.contact.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true } },
      owner: { select: { name: true } },
      deals: { orderBy: { updatedAt: 'desc' } },
    },
  });
  if (!contact) notFound();
  if (!seeAll && contact.ownerId !== user.id) notFound();

  const name = fullName(contact.firstName, contact.lastName);
  const link = { contactId: id };

  return (
    <div className="space-y-6">
      <PageHeader title={name} subtitle={contact.jobTitle ?? contact.company?.name ?? undefined}>
        <Link href={`/deals/new?contactId=${id}&companyId=${contact.companyId ?? ''}`} className="btn-primary">
          <Plus className="h-4 w-4" />
          صفقة
        </Link>
        <Link href={`/contacts/${id}/edit`} className="btn-secondary">
          <Pencil className="h-4 w-4" />
          تعديل
        </Link>
        <ConfirmMutateButton
          op="contact.delete"
          id={id}
          redirectTo="/contacts"
          label="حذف"
          className="btn-danger"
          confirmText={`حذف "${name}" نهائيًا؟`}
        />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card card-pad">
            <div className="mb-4 flex items-center gap-4">
              <Avatar name={name} size="lg" />
              <div>
                <p className="text-lg font-semibold text-slate-900">{name}</p>
                <p className="text-sm text-slate-500">{contact.jobTitle ?? '—'}</p>
              </div>
            </div>

            <dl className="grid gap-x-6 sm:grid-cols-2">
              <Field label="الشركة">
                {contact.company ? (
                  <Link
                    href={`/companies/${contact.company.id}`}
                    className="link inline-flex items-center gap-1.5"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    {contact.company.name}
                  </Link>
                ) : (
                  'عميل فرد'
                )}
              </Field>
              <Field label="البريد الإلكتروني">
                {contact.email ? (
                  <a href={`mailto:${contact.email}`} dir="ltr" className="link inline-flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    {contact.email}
                  </a>
                ) : (
                  '—'
                )}
              </Field>
              <Field label="الجوال">
                {contact.mobile ? (
                  <a href={`tel:${contact.mobile}`} dir="ltr" className="link inline-flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    {contact.mobile}
                  </a>
                ) : (
                  '—'
                )}
              </Field>
              <Field label="هاتف العمل">
                {contact.phone ? (
                  <a href={`tel:${contact.phone}`} dir="ltr" className="link">
                    {contact.phone}
                  </a>
                ) : (
                  '—'
                )}
              </Field>
              <Field label="لغة التواصل">{contact.language ?? '—'}</Field>
              <Field label="الموظف المسؤول">
                {contact.owner ? (
                  <span className="inline-flex items-center gap-2">
                    <Avatar name={contact.owner.name} size="xs" />
                    {contact.owner.name}
                  </span>
                ) : (
                  '—'
                )}
              </Field>
            </dl>

            {contact.notes && (
              <div className="mt-4 rounded-lg bg-slate-50 p-3">
                <p className="mb-1 text-xs font-medium text-slate-500">ملاحظات</p>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{contact.notes}</p>
              </div>
            )}
          </section>

          <section className="card">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold text-slate-800">
                <Handshake className="h-4 w-4 text-brand-600" />
                الصفقات
              </h2>
            </div>
            {contact.deals.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">لا توجد صفقات</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {contact.deals.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/deals/${d.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                        {d.title}
                      </span>
                      <Badge className={DEAL_STAGE_COLORS[d.stage as DealStage]}>
                        {DEAL_STAGES[d.stage as DealStage] ?? d.stage}
                      </Badge>
                      <span className="shrink-0 text-sm font-semibold nums">
                        {formatMoney(d.amount, d.currency)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <TasksPanel
            link={link}
            newTaskHref={`/tasks/new?contactId=${id}&redirectTo=/contacts/${id}`}
            showAssignee={seeAll}
            currentPath={`/contacts/${id}`}
          />
          <NotesPanel
            link={link}
            currentUserId={user.id}
            canModerate={seeAll}
            currentPath={`/contacts/${id}`}
          />
        </div>

        <div className="space-y-6">
          <ActivityPanel link={link} />
          <p className="text-center text-xs text-slate-400">
            أُضيفت بتاريخ {formatDate(contact.createdAt)}
          </p>
        </div>
      </div>
    </div>
  );
}
