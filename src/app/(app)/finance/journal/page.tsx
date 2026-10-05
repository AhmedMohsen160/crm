import Link from '@/components/link';
import { Plus, CheckCircle2, BookOpen } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { listOptions } from '@/lib/reference';
import { DOCUMENT_TYPES, ENTRY_STATUSES, fiscalMonth, fiscalMonthLabel } from '@/lib/accounting';
import { formatMoney, formatDate } from '@/lib/utils';
import { PageHeader, EmptyState, ErrorAlert } from '@/components/ui';
import { FilterBar, SearchInput, FilterSelect, KeepParam } from '@/components/filters';
import { JournalDecision, JournalTally } from '@/components/journal-decision';

export const metadata = { title: 'دفتر اليومية' };
export const dynamic = 'force-dynamic';

/** مصدر المقترح — يُنسب ليُراجَع لا ليُصدَّق */
const SOURCE_LABEL: Record<string, string> = {
  'project.delivered': 'اعتراف بالإيراد عند التسليم',
  'project.collected': 'تحصيل',
  'freelancerPayment.paid': 'صرف مستحق فريلانسر',
  'commission.period': 'استحقاق عمولات',
  'depreciation.period': 'إهلاك أصول',
  accounting_import: 'مُرحَّل من دفتر المحاسب',
};

/**
 * دفتر اليومية.
 *
 * **الصف يُغني عن فتحه.** المحاسب يراجع عشرات القيود في الجلسة الواحدة، وكل
 * قيد كان يلزمه فتحُ بطاقته ليعرف عميلَه وأدمنَ مبيعاته وحسابَيه. فصار الصف
 * يحمل ما يُبنى عليه القرار: **من أي حساب إلى أي حساب**، ولأي عميل ومشروع،
 * وعلى يد من، وفي أي فرع. والتفصيل الكامل خلف اسم المشروع لمن أراده.
 *
 * **وزر الاعتماد في الصف** — لأن ترحيل ثلاثين قيدًا لا يحتمل ثلاثين رحلة
 * ذهابًا وإيابًا. والضغطة تُبدّل الصفّ في مكانه بلا إعادة بناء الصفحة
 * (`JournalDecision`)، والعدّة في الترويسة تتبعها.
 */
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
  const user = await requirePermission('canManageAccounting');
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

  const [entries, closed, counts, branches] = await Promise.all([
    db.journalEntry.findMany({
      where,
      include: {
        lines: {
          select: {
            debitBase: true,
            creditBase: true,
            branch: true,
            account: { select: { name: true } },
            salesAdmin: { select: { name: true } },
            costCenter: { select: { project: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
        project: {
          select: {
            id: true,
            code: true,
            title: true,
            client: { select: { name: true } },
            owner: { select: { name: true } },
          },
        },
        postedBy: { select: { name: true } },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    }),
    db.fiscalPeriod.findUnique({ where: { period } }),
    db.journalEntry.groupBy({ by: ['status'], where: { period }, _count: true }),
    listOptions('branch'),
  ]);

  const countOf = (key: string) => counts.find((c) => c.status === key)?._count ?? 0;
  const branchLabel = new Map(branches.map((b) => [b.value, b.label]));
  const drafts = countOf('draft');

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="دفتر اليومية"
        subtitle={
          <JournalTally
            prefix={fiscalMonthLabel(period)}
            drafts={drafts}
            posted={countOf('posted')}
          />
        }
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
          <table className="tbl tbl-wide">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>البيان والحسابان</th>
                <th>العميل والمشروع</th>
                <th>الموظف المسؤول</th>
                <th>الفرع</th>
                <th>المبلغ</th>
                <th>الحال</th>
                <th className="text-left">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const total = entry.lines.reduce((s, l) => s + l.debitBase, 0);
                // الحسابان الغالبان: أكبر سطر مدين وأكبر سطر دائن
                const debit = [...entry.lines]
                  .filter((l) => l.debitBase > 0)
                  .sort((a, b) => b.debitBase - a.debitBase)[0];
                const credit = [...entry.lines]
                  .filter((l) => l.creditBase > 0)
                  .sort((a, b) => b.creditBase - a.creditBase)[0];

                // من حصّل: أدمن السطر، وإلا مالك المشروع
                const admin =
                  entry.lines.find((l) => l.salesAdmin)?.salesAdmin?.name ??
                  entry.project?.owner?.name ??
                  null;
                const branch = entry.lines.find((l) => l.branch)?.branch ?? null;
                const centre = entry.lines.find((l) => l.costCenter?.project)?.costCenter?.project;

                return (
                  <tr key={entry.id} className={entry.status === 'void' ? 'opacity-50' : undefined}>
                    <td className="whitespace-nowrap text-sm text-slate-600">
                      {formatDate(entry.date)}
                      <span className="block text-[11px] text-slate-400" dir="ltr">
                        {entry.code}
                      </span>
                    </td>

                    <td className="min-w-[16rem]">
                      <Link href={`/finance/journal/${entry.id}`} className="link">
                        {entry.description}
                      </Link>
                      {(debit || credit) && (
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {debit?.account.name ?? '—'}
                          <span className="mx-1 text-slate-300">←</span>
                          {credit?.account.name ?? '—'}
                        </span>
                      )}
                      {entry.sourceType && (
                        <span className="block text-[11px] text-brand-600">
                          مقترح آليًا · {SOURCE_LABEL[entry.sourceType] ?? entry.sourceType}
                        </span>
                      )}
                      {entry.docNumber && (
                        <span className="block text-[11px] text-slate-400">
                          {DOCUMENT_TYPES[entry.docType as keyof typeof DOCUMENT_TYPES] ??
                            entry.docType}{' '}
                          {entry.docNumber}
                        </span>
                      )}
                    </td>

                    <td className="text-sm">
                      {entry.project ? (
                        <>
                          <span className="block text-slate-800">
                            {entry.project.client?.name ?? '—'}
                          </span>
                          {/* التفصيل خلف المشروع — لمن أراد أكثر مما في الصف */}
                          <Link
                            href={`/projects/${entry.project.id}`}
                            className="link block text-xs"
                          >
                            {entry.project.code} · {entry.project.title}
                          </Link>
                        </>
                      ) : centre ? (
                        <span className="text-xs text-slate-500">{centre}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    <td className="whitespace-nowrap text-sm text-slate-700">
                      {admin ?? <span className="text-slate-300">—</span>}
                    </td>

                    <td className="whitespace-nowrap text-sm text-slate-600">
                      {branch ? (branchLabel.get(branch) ?? branch) : <span className="text-slate-300">—</span>}
                    </td>

                    <td className="nums font-semibold">{formatMoney(total)}</td>

                    <JournalDecision
                      id={entry.id}
                      period={period}
                      status={entry.status}
                      postedBy={entry.postedBy?.name ?? null}
                      currentUserName={user.name}
                      locked={Boolean(closed?.closedAt)}
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {drafts > 0 && !closed?.closedAt && (
        <p className="text-xs text-slate-400">
          الاعتماد يُرحّل القيد ويُبقيك في القائمة. والقيد المرحَّل{' '}
          <b>لا يُعدَّل ولا يُحذف</b> — يُصحَّح بقيد مضادّ من بطاقته.
        </p>
      )}
    </div>
  );
}
