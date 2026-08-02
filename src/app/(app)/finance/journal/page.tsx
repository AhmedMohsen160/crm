import Link from '@/components/link';
import { Plus, CheckCircle2, BookOpen } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { DOCUMENT_TYPES, ENTRY_STATUSES, fiscalMonth, fiscalMonthLabel } from '@/lib/accounting';
import { formatMoney, formatDate } from '@/lib/utils';
import { PageHeader, Badge, EmptyState, ErrorAlert } from '@/components/ui';
import { FilterBar, SearchInput, FilterSelect, KeepParam } from '@/components/filters';

export const metadata = { title: 'دفتر اليومية' };
export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  draft: 'border-amber-200 bg-amber-50 text-amber-700',
  posted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  void: 'border-slate-300 bg-slate-100 text-slate-400',
};

/** مصدر المقترح — يُنسب ليُراجَع لا ليُصدَّق */
const SOURCE_LABEL: Record<string, string> = {
  'project.delivered': 'اعتراف بالإيراد عند التسليم',
  'project.collected': 'تحصيل',
  'freelancerPayment.paid': 'صرف مستحق فريلانسر',
  'commission.period': 'استحقاق عمولات',
  'depreciation.period': 'إهلاك أصول',
};

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    status?: string;
    q?: string;
    error?: string;
    generated?: string;
  }>;
}) {
  await requirePermission('canManageAccounting');
  const { period: requested, status, q, error, generated } = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(requested ?? '') ? requested! : fiscalMonth(new Date());

  const where = {
    period,
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { description: { contains: q } },
            { code: { contains: q } },
            { docNumber: { contains: q } },
          ],
        }
      : {}),
  };

  const [entries, closed, counts] = await Promise.all([
    db.journalEntry.findMany({
      where,
      include: {
        lines: { select: { debitBase: true, creditBase: true } },
        createdBy: { select: { name: true } },
        postedBy: { select: { name: true } },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    }),
    db.fiscalPeriod.findUnique({ where: { period } }),
    db.journalEntry.groupBy({ by: ['status'], where: { period }, _count: true }),
  ]);

  const countOf = (key: string) => counts.find((c) => c.status === key)?._count ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="دفتر اليومية"
        subtitle={`${fiscalMonthLabel(period)} — ${countOf('draft')} مسوَّدة · ${countOf('posted')} مرحَّل`}
      >
        {!closed?.closedAt && (
          <Link href={`/finance/journal/new?period=${period}`} className="btn-primary">
            <Plus className="h-4 w-4" />
            قيد جديد
          </Link>
        )}
        <Link href={`/finance?period=${period}`} className="btn-secondary">
          لوحة الماليات
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />

      {generated && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {generated === '0'
            ? 'لا جديد يُقترح — كل أحداث الشهر لها قيودها بالفعل.'
            : `اقتُرح ${generated} قيدًا. راجعها ورحّل ما تعتمده.`}
        </div>
      )}

      {closed?.closedAt && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          هذا الشهر <b>مقفل</b> — القيود للعرض فقط.
        </p>
      )}

      <FilterBar>
        <input type="hidden" name="period" value={period} />
        <SearchInput defaultValue={q} placeholder="البيان أو رقم القيد أو المستند" />
        <FilterSelect
          name="status"
          defaultValue={status}
          placeholder="كل الحالات"
          options={Object.entries(ENTRY_STATUSES).map(([value, label]) => ({ value, label }))}
        />
        <KeepParam name="period" value={period} />
      </FilterBar>

      {entries.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<BookOpen className="h-10 w-10" />}
            title="لا قيود في هذا الشهر"
            description="ابدأ بقيد يدوي، أو دع النظام يقترح قيود الشهر من التسليمات والتحصيلات."
            actionHref={`/finance/journal/new?period=${period}`}
            actionLabel="قيد جديد"
          />
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>الرقم</th>
                <th>التاريخ</th>
                <th>البيان</th>
                <th>المبلغ</th>
                <th>الحال</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const total = entry.lines.reduce((s, l) => s + l.debitBase, 0);
                return (
                  <tr key={entry.id} className={entry.status === 'void' ? 'opacity-50' : undefined}>
                    <td className="whitespace-nowrap text-xs text-slate-400" dir="ltr">
                      {entry.code}
                    </td>
                    <td className="whitespace-nowrap text-sm text-slate-600">
                      {formatDate(entry.date)}
                    </td>
                    <td>
                      <Link href={`/finance/journal/${entry.id}`} className="link">
                        {entry.description}
                      </Link>
                      {entry.sourceType && (
                        <span className="block text-xs text-brand-600">
                          مقترح آليًا · {SOURCE_LABEL[entry.sourceType] ?? entry.sourceType}
                        </span>
                      )}
                      {entry.docNumber && (
                        <span className="block text-xs text-slate-400">
                          {DOCUMENT_TYPES[entry.docType as keyof typeof DOCUMENT_TYPES] ?? entry.docType}{' '}
                          {entry.docNumber}
                        </span>
                      )}
                    </td>
                    <td className="nums font-medium">{formatMoney(total)}</td>
                    <td>
                      <Badge className={STATUS_STYLE[entry.status] ?? STATUS_STYLE.draft}>
                        {ENTRY_STATUSES[entry.status as keyof typeof ENTRY_STATUSES] ?? entry.status}
                      </Badge>
                      {entry.postedBy && entry.status === 'posted' && (
                        <span className="block text-xs text-slate-400">
                          رحّله {entry.postedBy.name}
                        </span>
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
  );
}
