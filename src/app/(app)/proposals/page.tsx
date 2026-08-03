import Link from '@/components/link';
import { Plus, FileSignature } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { PROPOSAL_STATUSES, type ProposalStatus } from '@/lib/proposals';
import { formatDate } from '@/lib/utils';
import { PageHeader, Badge, EmptyState } from '@/components/ui';
import { FilterBar, SearchInput, FilterSelect } from '@/components/filters';

export const metadata = { title: 'العروض الاحترافية' };
export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  draft: 'border-slate-200 bg-slate-50 text-slate-600',
  sent: 'border-brand-200 bg-brand-50 text-brand-700',
  accepted: 'border-lime-300 bg-lime-50 text-lime-800',
  declined: 'border-rose-200 bg-rose-50 text-rose-700',
  expired: 'border-slate-300 bg-slate-100 text-slate-400',
};

/**
 * العروض الاحترافية — المستند الذي يُرسَل للعميل المؤسسي.
 *
 * مستقلّ عن «عروض الأسعار» السريعة: ذاك سطر أسعار لطلب واحد، وهذا إطار
 * تجاري لشهور بشرائح ومدة صلاحية وموقِّع.
 */
export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requirePermission('canViewSellPrice');
  const { q, status } = await searchParams;

  const proposals = await db.proposal.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q
        ? { OR: [{ title: { contains: q } }, { clientName: { contains: q } }, { code: { contains: q } }] }
        : {}),
    },
    include: { owner: { select: { name: true } }, tiers: { orderBy: { fromWords: 'asc' }, take: 1 } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="العروض الاحترافية"
        subtitle="المستند الذي يُرسَل للعميل المؤسسي — بشرائحه ومدة صلاحيته وموقِّعه"
      >
        <Link href="/proposals/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          عرض جديد
        </Link>
      </PageHeader>

      <FilterBar className="mb-4">
        <SearchInput defaultValue={q} placeholder="العنوان أو الجهة أو المرجع" />
        <FilterSelect
          name="status"
          defaultValue={status}
          placeholder="كل الحالات"
          options={Object.entries(PROPOSAL_STATUSES).map(([value, label]) => ({ value, label }))}
        />
      </FilterBar>

      {proposals.length === 0 ? (
        <EmptyState
          icon={<FileSignature className="h-8 w-8" />}
          title="لا عروض بعد"
          description="العرض الاحترافي إطار تجاري لشهور — بشرائح كمّية تنزل بسعر الصفحة على حجم الشهر كاملًا."
          actionHref="/proposals/new"
          actionLabel="عرض جديد"
        />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>المرجع</th>
                <th>العرض</th>
                <th>الجهة</th>
                <th>سعر الصفحة</th>
                <th>الحال</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap text-xs text-slate-400" dir="ltr">
                    {p.code}
                    {p.revision > 1 && (
                      <span className="block text-[10px]">مراجعة {p.revision}</span>
                    )}
                  </td>
                  <td>
                    <Link href={`/proposals/${p.id}`} className="link font-medium">
                      {p.title}
                    </Link>
                    {p.owner && (
                      <span className="block text-xs text-slate-400">{p.owner.name}</span>
                    )}
                  </td>
                  <td className="text-sm text-slate-700">{p.clientName}</td>
                  <td className="nums">
                    {p.tiers[0] ? `${p.tiers[0].ratePerPage} ${p.currency}` : '—'}
                  </td>
                  <td>
                    <Badge className={STATUS_STYLE[p.status] ?? STATUS_STYLE.draft}>
                      {PROPOSAL_STATUSES[p.status as ProposalStatus] ?? p.status}
                    </Badge>
                  </td>
                  <td className="text-xs text-slate-400">{formatDate(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
