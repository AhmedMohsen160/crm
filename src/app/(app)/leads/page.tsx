import Link from '@/components/link';
import { Plus, UserPlus, Clock } from 'lucide-react';
import { db } from '@/lib/db';
import { branchFilter, can, ownerFilter, requireAnyPermission, requireUser } from '@/lib/auth';
import { listOptionsMany, settingNumber } from '@/lib/reference';
import { normalizePhone, formatPhone } from '@/lib/phone';
import {
  LEAD_STATUSES,
  LEAD_STATUS_COLORS,
  LEAD_STATUS_ORDER,
  type LeadStatus,
} from '@/lib/constants';
import { formatMoney, formatDate, fullName, search } from '@/lib/utils';
import { PageHeader, Badge, Avatar, EmptyState } from '@/components/ui';
import { FilterBar, SearchInput, FilterSelect, KeepParam } from '@/components/filters';

export const metadata = { title: 'العملاء المحتملون' };
export const dynamic = 'force-dynamic';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    owner?: string;
    channel?: string;
    branch?: string;
    unanswered?: string;
  }>;
}) {
  const user = await requireAnyPermission('canViewAllLeads', 'canViewTeamLeads', 'canCreateLead');
  const seeAll = can(user, 'canViewAllLeads');
  const params = await searchParams;

  // النطاق أولًا — الفريق أو الذات أو الكل، ثم الفرع فوقه
  const [scope, branchScope, lists, slaHours] = await Promise.all([
    ownerFilter(user),
    branchFilter(user),
    listOptionsMany('channel', 'branch'),
    settingNumber('sla_first_reply_hours'),
  ]);

  const where: Record<string, unknown> = { ...scope, ...branchScope };
  if (seeAll && params.owner) where.ownerId = params.owner;
  if (params.status) where.status = params.status;
  if (params.channel) where.channel = params.channel;
  if (params.branch) where.branch = params.branch;

  // «لم يُردّ عليها» — الليدز التي تجاوزت مهلة أول رد وما زالت جديدة
  const slaDeadline = new Date(Date.now() - slaHours * 3_600_000);
  if (params.unanswered) {
    where.status = 'NEW';
    where.firstReplyAt = null;
    where.createdAt = { lt: slaDeadline };
  }

  if (params.q) {
    const phone = normalizePhone(params.q);
    where.OR = [
      { code: search(params.q) },
      { firstName: search(params.q) },
      { lastName: search(params.q) },
      { companyName: search(params.q) },
      { email: search(params.q) },
      ...(phone.ok
        ? [{ client: { phoneNormalized: phone.value } }, { phone: search(params.q) }]
        : [{ phone: search(params.q) }]),
    ];
  }

  const scopeOnly = { ...scope, ...branchScope };

  const [leads, users, counts, overdueCount] = await Promise.all([
    db.lead.findMany({
      where,
      include: {
        owner: { select: { name: true } },
        client: { select: { id: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    seeAll
      ? db.user.findMany({ where: { active: true }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
    db.lead.groupBy({ by: ['status'], where: scopeOnly, _count: { _all: true } }),
    db.lead.count({
      where: { ...scopeOnly, status: 'NEW', firstReplyAt: null, createdAt: { lt: slaDeadline } },
    }),
  ]);

  const countMap = new Map(counts.map((c) => [c.status, c._count._all]));

  return (
    <div>
      <PageHeader title="العملاء المحتملون" subtitle="من تواصل معنا ولم يتحوّل بعد إلى مشروع">
        <Link href="/leads/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          ليد جديد
        </Link>
      </PageHeader>

      {overdueCount > 0 && (
        <Link
          href="/leads?unanswered=1"
          className="mb-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 hover:bg-rose-100"
        >
          <Clock className="h-4 w-4 shrink-0" />
          <span>
            <b className="nums">{overdueCount}</b> ليد تجاوز مهلة أول رد ({slaHours} ساعات) ولم
            يُردّ عليه بعد — اضغط لعرضها
          </span>
        </Link>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/leads"
          className={`badge ${
            !params.status && !params.unanswered
              ? 'border-brand-400 bg-brand-50 text-brand-700'
              : 'border-slate-300 bg-white text-slate-600'
          }`}
        >
          الكل <span className="nums">{leads.length}</span>
        </Link>
        {LEAD_STATUS_ORDER.map((s) => (
          <Link
            key={s}
            href={`/leads?status=${s}`}
            className={`badge ${
              params.status === s
                ? LEAD_STATUS_COLORS[s]
                : 'border-slate-300 bg-white text-slate-600'
            }`}
          >
            {LEAD_STATUSES[s]} <span className="nums">{countMap.get(s) ?? 0}</span>
          </Link>
        ))}
      </div>

      <div className="card">
        <FilterBar className="border-b border-slate-200 p-4">
          <SearchInput
            placeholder="الهاتف أو الاسم أو LD-2608-0001..."
            defaultValue={params.q}
          />
          <KeepParam name="status" value={params.status} />
          <KeepParam name="unanswered" value={params.unanswered} />
          <FilterSelect
            name="channel"
            defaultValue={params.channel}
            placeholder="كل القنوات"
            options={lists.channel.map((c) => ({ value: c.value, label: c.label }))}
          />
          {seeAll && (
            <>
              <FilterSelect
                name="branch"
                defaultValue={params.branch}
                placeholder="كل الفروع"
                options={lists.branch.map((b) => ({ value: b.value, label: b.label }))}
              />
              <FilterSelect
                name="owner"
                defaultValue={params.owner}
                placeholder="كل الموظفين"
                options={users.map((u) => ({ value: u.id, label: u.name }))}
              />
            </>
          )}
        </FilterBar>

        {leads.length === 0 ? (
          <EmptyState
            icon={<UserPlus className="h-12 w-12" />}
            title="لا ليدز مطابقة"
            description="ابدأ بالهاتف — الشاشة تبحث في العملاء تلقائيًا."
            actionHref="/leads/new"
            actionLabel="ليد جديد"
          />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الرقم</th>
                  <th>الاسم</th>
                  <th>الهاتف</th>
                  <th>المرحلة</th>
                  <th>القناة</th>
                  <th>القيمة المتوقعة</th>
                  {seeAll && <th>المسؤول</th>}
                  <th>وصل في</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const phone = lead.client
                    ? normalizePhone(lead.client.phone).value
                    : lead.phone
                      ? normalizePhone(lead.phone).value
                      : null;
                  const overdue =
                    lead.status === 'NEW' &&
                    !lead.firstReplyAt &&
                    lead.createdAt < slaDeadline;

                  return (
                    <tr key={lead.id} className={overdue ? 'bg-rose-50/50' : undefined}>
                      <td className="whitespace-nowrap text-xs text-slate-400" dir="ltr">
                        {lead.code}
                      </td>
                      <td>
                        <Link href={`/leads/${lead.id}`} className="link">
                          {fullName(lead.firstName, lead.lastName)}
                        </Link>
                        {lead.companyName && (
                          <span className="block text-xs text-slate-400">
                            {lead.companyName}
                          </span>
                        )}
                      </td>
                      <td dir="ltr" className="text-left text-xs text-slate-600">
                        {phone ? formatPhone(phone) : '—'}
                      </td>
                      <td>
                        <Badge className={LEAD_STATUS_COLORS[lead.status as LeadStatus]}>
                          {LEAD_STATUSES[lead.status as LeadStatus] ?? lead.status}
                        </Badge>
                      </td>
                      <td className="text-xs text-slate-500">
                        {lists.channel.find((c) => c.value === lead.channel)?.label ?? '—'}
                      </td>
                      <td className="nums font-medium">
                        {lead.estimatedValue ? formatMoney(lead.estimatedValue) : '—'}
                      </td>
                      {seeAll && (
                        <td>
                          {lead.owner ? (
                            <span className="flex items-center gap-2">
                              <Avatar name={lead.owner.name} size="xs" />
                              <span className="text-xs">{lead.owner.name}</span>
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}
                      <td className="whitespace-nowrap text-xs text-slate-500">
                        {formatDate(lead.createdAt)}
                        {overdue && (
                          <span className="mr-1 text-rose-600">· لم يُردّ</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
