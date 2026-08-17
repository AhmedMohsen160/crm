import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { Phone, MessageCircle, Mail, Pencil, Plus, Trash2 } from 'lucide-react';
import { db } from '@/lib/db';
import { can, requireUser } from '@/lib/auth';
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
import { clientPurgeInventory } from '@/lib/client-purge-engine';
import { PURGE_PHRASE, purgeVerdict, purgeTotal } from '@/lib/client-purge';

export const metadata = { title: 'بطاقة العميل' };
export const dynamic = 'force-dynamic';

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  /**
   * **سعر البيع لا يُرسل لمن لا يملكه** (§٣ بند ٢).
   *
   * كانت بطاقة العميل تعرض «إجمالي مشترياته» وقيمة كل مشروع لأي مستخدم
   * يدخل — والمترجم من هؤلاء، وهو ممنوعٌ من الأسعار بنصّ الاتفاق. والحجب
   * هنا **في الاستعلام**: الحقل لا يُقرأ من القاعدة أصلًا، فلا يُخفى بأنماط
   * ولا يظهر في حمولة الصفحة.
   */
  const showPrice = can(user, 'canViewSellPrice');
  /** الحذف النهائيّ — للمالك ومدير النظام وحدهما */
  const mayPurge = can(user, 'canPurgeRecords');

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
          netTotal: showPrice,
          currency: true,
          createdAt: true,
          deadline: true,
        },
      },
    },
  });
  if (!client) notFound();

  const totals = await clientTotals(id);
  /**
   * جردُ الحذف — **لا يُقرأ إلا لمن يملك الحذف.**
   *
   * وهو استعلامٌ ثقيل يعدّ عشرة جداول، فقراءتُه لكل من يفتح البطاقة تُبطئ
   * شاشةً تُفتح مئة مرة في اليوم لأجل زرٍّ يراه اثنان.
   */
  const purge = mayPurge ? await clientPurgeInventory(id) : null;
  const verdict = purge ? purgeVerdict(purge) : null;
  const wonCount = client.projects.filter((d) => countsAsRevenue(d.status)).length;
  const average = wonCount > 0 ? totals.totalValue / wonCount : 0;
  const branchName = await listLabel('branch', client.firstBranch);

  const normalized = normalizePhone(client.phone).value;
  const wa = whatsappLink(normalized);

  const stats = [
    { label: 'مشروع', value: String(totals.dealCount) },
    ...(showPrice
      ? [
          { label: 'إجمالي مشترياته', value: formatMoney(totals.totalValue) },
          { label: 'متوسط قيمة الطلب', value: formatMoney(average) },
        ]
      : []),
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
                  {showPrice && <th>القيمة</th>}
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
                    {showPrice && (
                      <td className="nums">{formatMoney(d.netTotal, d.currency)}</td>
                    )}
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

      {/* ══ الحذف النهائيّ ══════════════════════════════════════ */}
      {mayPurge && purge && (
        <section className="rounded-xl border-2 border-rose-200 bg-rose-50/40 p-5">
          <h2 className="mb-1 flex items-center gap-2 font-bold text-rose-900">
            <Trash2 className="h-4 w-4" />
            حذفٌ نهائيّ
          </h2>
          <p className="mb-4 max-w-prose text-sm text-rose-800">
            لتنقية ما أُدخل تجربةً. يمحو البطاقة وكلَّ ما يتعلّق بها بلا رجعة، ويبقى سطرٌ في
            سجل التدقيق يقول ماذا حُذف ومن حذفه.
          </p>

          <div className="mb-4 rounded-lg border border-rose-200 bg-white p-4">
            <p className="mb-2 text-sm font-semibold text-slate-800">
              سيُحذف <span className="nums">{purgeTotal(purge.counts)}</span> سجلًّا:
            </p>
            {Object.keys(purge.counts).length === 0 ? (
              <p className="text-sm text-slate-500">البطاقة وحدها — لا سجلات تابعة</p>
            ) : (
              <ul className="grid gap-x-6 gap-y-1 text-sm text-slate-700 sm:grid-cols-2">
                {Object.entries(purge.counts).map(([label, n]) => (
                  <li key={label} className="flex justify-between gap-3">
                    <span>{label}</span>
                    <b className="nums">{n}</b>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {verdict && !verdict.ok ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <b>الحذف موقوف.</b> {verdict.reason}.
            </p>
          ) : (
            <>
              {verdict?.warnings.map((warning) => (
                <p
                  key={warning}
                  className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900"
                >
                  {warning}
                </p>
              ))}
              <form method="post" action="/api/save" className="mt-3 flex flex-wrap items-end gap-3">
                <input type="hidden" name="entity" value="client.purge" />
                <input type="hidden" name="clientId" value={client.id} />
                <div>
                  <label className="label" htmlFor="confirm">
                    اكتب «{PURGE_PHRASE}»
                  </label>
                  <input
                    id="confirm"
                    name="confirm"
                    required
                    autoComplete="off"
                    placeholder={PURGE_PHRASE}
                    className="input w-80"
                  />
                </div>
                <button type="submit" className="btn-danger">
                  احذف نهائيًا
                </button>
              </form>
            </>
          )}
        </section>
      )}
    </div>
  );
}
