import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { Phone, MessageCircle, Mail, Pencil, Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { clientTotals } from '@/lib/clients';
import { formatPhone, normalizePhone, whatsappLink } from '@/lib/phone';
import { listLabel } from '@/lib/reference';
import {
  CLIENT_TYPES,
  LEAD_STATUSES,
  LEAD_STATUS_COLORS,
  type ClientType,
  type LeadStatus,
} from '@/lib/constants';
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_COLORS,
  countsAsRevenue,
  type ProjectStatus,
} from '@/lib/projects';
import { formatMoney, formatDate } from '@/lib/utils';
import { PageHeader, Badge } from '@/components/ui';

export const metadata = { title: 'بطاقة العميل' };
export const dynamic = 'force-dynamic';

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();

  const client = await db.client.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      leads: { orderBy: { createdAt: 'desc' }, take: 20 },
      projects: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          netTotal: true,
          currency: true,
          createdAt: true,
          deadline: true,
        },
      },
    },
  });
  if (!client) notFound();

  const totals = await clientTotals(id);
  const wonCount = client.projects.filter((d) => countsAsRevenue(d.status)).length;
  const average = wonCount > 0 ? totals.totalValue / wonCount : 0;
  const branchName = await listLabel('branch', client.firstBranch);

  const normalized = normalizePhone(client.phone).value;
  const wa = whatsappLink(normalized);

  const stats = [
    { label: 'مشروع', value: String(totals.dealCount) },
    { label: 'إجمالي مشترياته', value: formatMoney(totals.totalValue) },
    { label: 'متوسط قيمة الطلب', value: formatMoney(average) },
    {
      label: 'آخر تعامل',
      value: totals.lastDealAt ? formatDate(totals.lastDealAt) : 'لا تعامل بعد',
    },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={client.name}
        subtitle={`${client.code} · ${CLIENT_TYPES[client.type as ClientType] ?? client.type}${
          client.companyName ? ` · ${client.companyName}` : ''
        }`}
      >
        <Link href={`/projects/new?clientId=${client.id}`} className="btn-primary">
          <Plus className="h-4 w-4" />
          مشروع جديد
        </Link>
        <Link href={`/clients/${client.id}/edit`} className="btn-secondary">
          <Pencil className="h-4 w-4" />
          تعديل
        </Link>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card card-pad text-center">
            <p className="text-lg font-bold text-slate-900">{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 card card-pad">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <a
            href={`tel:+${normalized}`}
            className="flex items-center gap-2 text-slate-700 hover:text-brand-600"
            dir="ltr"
          >
            <Phone className="h-4 w-4 text-slate-400" />
            {formatPhone(normalized)}
          </a>
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-emerald-700 hover:text-emerald-800"
            >
              <MessageCircle className="h-4 w-4" />
              واتساب
            </a>
          )}
          {client.email && (
            <a
              href={`mailto:${client.email}`}
              className="flex items-center gap-2 text-slate-700 hover:text-brand-600"
              dir="ltr"
            >
              <Mail className="h-4 w-4 text-slate-400" />
              {client.email}
            </a>
          )}
          <span className="text-slate-500">
            الفرع الأول: {branchName}
            {client.city ? ` · ${client.city}` : ''}
          </span>
          {client.owner && (
            <span className="text-slate-500">المسؤول: {client.owner.name}</span>
          )}
        </div>
        {client.notes && (
          <p className="mt-3 whitespace-pre-wrap border-t border-slate-100 pt-3 text-sm text-slate-600">
            {client.notes}
          </p>
        )}
      </div>

      <section className="mb-6">
        <h2 className="mb-3 section-title">مشاريعه ({client.projects.length})</h2>
        {client.projects.length === 0 ? (
          <p className="card card-pad text-sm text-slate-400">لا مشاريع بعد</p>
        ) : (
          <div className="card table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>المشروع</th>
                  <th>المرحلة</th>
                  <th>القيمة</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {client.projects.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/projects/${d.id}`} className="link">
                        {d.title}
                      </Link>
                    </td>
                    <td>
                      <Badge className={PROJECT_STATUS_COLORS[d.status as ProjectStatus]}>
                        {PROJECT_STATUSES[d.status as ProjectStatus] ?? d.status}
                      </Badge>
                    </td>
                    <td className="nums">{formatMoney(d.netTotal, d.currency)}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">
                      {formatDate(d.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 section-title">ليداته ({client.leads.length})</h2>
        {client.leads.length === 0 ? (
          <p className="card card-pad text-sm text-slate-400">لا ليدز</p>
        ) : (
          <div className="card table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>رقم الليد</th>
                  <th>المرحلة</th>
                  <th>الخدمة</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {client.leads.map((l) => (
                  <tr key={l.id}>
                    <td dir="ltr" className="text-xs">
                      <Link href={`/leads/${l.id}`} className="link">
                        {l.code}
                      </Link>
                    </td>
                    <td>
                      <Badge className={LEAD_STATUS_COLORS[l.status as LeadStatus]}>
                        {LEAD_STATUSES[l.status as LeadStatus] ?? l.status}
                      </Badge>
                    </td>
                    <td className="text-sm text-slate-600">{l.serviceInterest ?? '—'}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">
                      {formatDate(l.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
