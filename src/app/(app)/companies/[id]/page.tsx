import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { Pencil, Plus, Globe, Mail, Phone, MapPin, Users, Handshake } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser, canSeeAll } from '@/lib/auth';
import { DEAL_STAGES, DEAL_STAGE_COLORS, type DealStage } from '@/lib/constants';
import { formatMoney, formatDate, fullName } from '@/lib/utils';
import { PageHeader, Badge, Avatar, Field } from '@/components/ui';
import { ConfirmMutateButton } from '@/components/forms';
import { NotesPanel, TasksPanel, ActivityPanel } from '@/components/panels';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await db.company.findUnique({ where: { id }, select: { name: true } });
  return { title: company?.name ?? 'شركة' };
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const seeAll = canSeeAll(user);

  const company = await db.company.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      contacts: { orderBy: { firstName: 'asc' } },
      deals: { orderBy: { updatedAt: 'desc' } },
    },
  });
  if (!company) notFound();
  if (!seeAll && company.ownerId !== user.id) notFound();

  const link = { companyId: id };
  const openValue = company.deals
    .filter((d) => d.stage !== 'WON' && d.stage !== 'LOST')
    .reduce((s, d) => s + d.amount, 0);
  const wonValue = company.deals
    .filter((d) => d.stage === 'WON')
    .reduce((s, d) => s + d.amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader title={company.name} subtitle={company.nameAr ?? company.industry ?? undefined}>
        <Link href={`/deals/new?companyId=${id}`} className="btn-primary">
          <Plus className="h-4 w-4" />
          صفقة
        </Link>
        <Link href={`/contacts/new?companyId=${id}`} className="btn-secondary">
          <Plus className="h-4 w-4" />
          جهة اتصال
        </Link>
        <Link href={`/companies/${id}/edit`} className="btn-secondary">
          <Pencil className="h-4 w-4" />
          تعديل
        </Link>
        <ConfirmMutateButton
          op="company.delete"
          id={id}
          redirectTo="/companies"
          label="حذف"
          className="btn-danger"
          confirmText={`حذف "${company.name}" نهائيًا؟ سيُحذف معها كل المهام والملاحظات المرتبطة.`}
        />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card card-pad">
          <p className="text-xs text-slate-500">جهات الاتصال</p>
          <p className="mt-1 text-2xl font-bold nums">{company.contacts.length}</p>
        </div>
        <div className="card card-pad">
          <p className="text-xs text-slate-500">الصفقات</p>
          <p className="mt-1 text-2xl font-bold nums">{company.deals.length}</p>
        </div>
        <div className="card card-pad">
          <p className="text-xs text-slate-500">قيمة مفتوحة</p>
          <p className="mt-1 text-xl font-bold text-brand-700 nums">{formatMoney(openValue)}</p>
        </div>
        <div className="card card-pad">
          <p className="text-xs text-slate-500">إجمالي المكسوب</p>
          <p className="mt-1 text-xl font-bold text-emerald-700 nums">{formatMoney(wonValue)}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card card-pad">
            <h2 className="mb-3 section-title">بيانات الشركة</h2>
            <dl className="grid gap-x-6 sm:grid-cols-2">
              <Field label="القطاع">{company.industry ?? '—'}</Field>
              <Field label="الموقع الإلكتروني">
                {company.website ? (
                  <a
                    href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    dir="ltr"
                    className="link inline-flex items-center gap-1.5"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    {company.website}
                  </a>
                ) : (
                  '—'
                )}
              </Field>
              <Field label="البريد الإلكتروني">
                {company.email ? (
                  <a href={`mailto:${company.email}`} dir="ltr" className="link inline-flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    {company.email}
                  </a>
                ) : (
                  '—'
                )}
              </Field>
              <Field label="الهاتف">
                {company.phone ? (
                  <a href={`tel:${company.phone}`} dir="ltr" className="link inline-flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    {company.phone}
                  </a>
                ) : (
                  '—'
                )}
              </Field>
              <Field label="العنوان">
                {company.address || company.city || company.country ? (
                  <span className="inline-flex items-start gap-1.5">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    {[company.address, company.city, company.country].filter(Boolean).join('، ')}
                  </span>
                ) : (
                  '—'
                )}
              </Field>
              <Field label="الرقم الضريبي">
                <span dir="ltr" className="inline-block">
                  {company.taxNumber ?? '—'}
                </span>
              </Field>
              <Field label="شروط الدفع">{company.paymentTerms ?? '—'}</Field>
              <Field label="الموظف المسؤول">
                {company.owner ? (
                  <span className="inline-flex items-center gap-2">
                    <Avatar name={company.owner.name} size="xs" />
                    {company.owner.name}
                  </span>
                ) : (
                  '—'
                )}
              </Field>
            </dl>

            {company.notes && (
              <div className="mt-4 rounded-lg bg-slate-50 p-3">
                <p className="mb-1 text-xs font-medium text-slate-500">ملاحظات</p>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{company.notes}</p>
              </div>
            )}
          </section>

          {/* الصفقات */}
          <section className="card">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold text-slate-800">
                <Handshake className="h-4 w-4 text-brand-600" />
                الصفقات
              </h2>
              <Link href={`/deals/new?companyId=${id}`} className="btn-secondary btn-sm">
                <Plus className="h-3.5 w-3.5" />
                صفقة
              </Link>
            </div>
            {company.deals.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">لا توجد صفقات</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {company.deals.map((d) => (
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
            newTaskHref={`/tasks/new?companyId=${id}&redirectTo=/companies/${id}`}
            showAssignee={seeAll}
            currentPath={`/companies/${id}`}
          />
          <NotesPanel
            link={link}
            currentUserId={user.id}
            canModerate={seeAll}
            currentPath={`/companies/${id}`}
          />
        </div>

        <div className="space-y-6">
          {/* جهات الاتصال */}
          <section className="card">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold text-slate-800">
                <Users className="h-4 w-4 text-brand-600" />
                جهات الاتصال
              </h2>
              <Link href={`/contacts/new?companyId=${id}`} className="btn-secondary btn-sm">
                <Plus className="h-3.5 w-3.5" />
              </Link>
            </div>
            {company.contacts.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">
                لا توجد جهات اتصال
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {company.contacts.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/contacts/${c.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50"
                    >
                      <Avatar name={fullName(c.firstName, c.lastName)} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {fullName(c.firstName, c.lastName)}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {c.jobTitle ?? c.email ?? '—'}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <ActivityPanel link={link} />

          <p className="text-center text-xs text-slate-400">
            أُضيفت بتاريخ {formatDate(company.createdAt)}
          </p>
        </div>
      </div>
    </div>
  );
}
