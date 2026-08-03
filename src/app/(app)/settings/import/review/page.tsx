import Link from '@/components/link';
import { CheckCircle2, ClipboardList } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import { PageHeader, Badge, EmptyState, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';
import { FilterBar, FilterSelect } from '@/components/filters';

export const metadata = { title: 'مراجعة الترحيل' };
export const dynamic = 'force-dynamic';

const SOURCE_LABEL: Record<string, string> = {
  leads: 'سجل الليدز',
  sales: 'ملف المبيعات',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'ينتظر',
  resolved: 'صُحّح ورُحّل',
  skipped: 'استُبعد',
};

/**
 * قائمة المراجعة اليدوية (§١٤).
 *
 * > «كل سجل لا يمكن حسمه يذهب إلى جدول `migration_review` بسبب واضح،
 * >  ويُعرض في شاشة للمراجعة اليدوية.»
 *
 * والصف هنا **لا يُحذف**: يُصحَّح في الملف ويُعاد ترحيله فيصير «صُحّح»، أو
 * يُستبعد بسبب مكتوب. القرار بلا سبب لا يُراجَع بعد شهر.
 */
export default async function MigrationReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; source?: string; saved?: string; error?: string }>;
}) {
  await requirePermission('canManageSettings');
  const { status, source, saved, error } = await searchParams;

  const where = {
    ...(status ? { status } : { status: 'pending' }),
    ...(source ? { source } : {}),
  };

  const [rows, counts] = await Promise.all([
    db.migrationReview.findMany({
      where,
      include: { resolvedBy: { select: { name: true } } },
      orderBy: [{ source: 'asc' }, { rowNo: 'asc' }],
      take: 300,
    }),
    db.migrationReview.groupBy({ by: ['status'], _count: true }),
  ]);

  const countOf = (key: string) => counts.find((c) => c.status === key)?._count ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="مراجعة الترحيل"
        subtitle={`${countOf('pending')} ينتظر · ${countOf('resolved')} صُحّح · ${countOf('skipped')} استُبعد`}
      >
        <Link href="/settings/import" className="btn-secondary">
          شاشة الترحيل
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />

      {saved && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          تم — والصف باقٍ في السجل بقرارك وسببه.
        </div>
      )}

      <FilterBar>
        <FilterSelect
          name="status"
          defaultValue={status}
          placeholder="ينتظر المراجعة"
          options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
        />
        <FilterSelect
          name="source"
          defaultValue={source}
          placeholder="كل الملفات"
          options={Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }))}
        />
      </FilterBar>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<ClipboardList className="h-10 w-10" />}
            title="لا صفوف تنتظر المراجعة"
            description="كل ما رُحّل حُسم. وإن ظهرت صفوف جديدة بعد ترحيل دفعة أخرى ستجدها هنا."
            actionHref="/settings/import"
            actionLabel="ترحيل دفعة"
          />
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <section key={row.id} className="card card-pad">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                  {SOURCE_LABEL[row.source] ?? row.source}
                </Badge>
                {row.rowNo && <span className="text-xs text-slate-400">صف {row.rowNo}</span>}
                <Badge
                  className={
                    row.status === 'pending'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : row.status === 'resolved'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-300 bg-slate-100 text-slate-500'
                  }
                >
                  {STATUS_LABEL[row.status] ?? row.status}
                </Badge>
                <span className="text-xs text-slate-400">{formatDate(row.createdAt)}</span>
              </div>

              <p className="mb-2 text-sm font-medium text-rose-700">{row.reason}</p>
              <pre
                className="mb-3 overflow-x-auto rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"
                dir="ltr"
              >
                {row.raw}
              </pre>

              {row.status === 'pending' ? (
                <div className="flex flex-wrap items-end gap-3">
                  <form method="post" action="/api/save" className="flex items-end gap-2">
                    <input type="hidden" name="entity" value="migrationReview" />
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="action" value="resolve" />
                    <input type="hidden" name="back" value="/settings/import/review" />
                    <input
                      name="note"
                      placeholder="ما صحّحته في الملف"
                      className="input w-56 py-1 text-sm"
                    />
                    <SaveButton>صُحّح ورُحّل</SaveButton>
                  </form>

                  <form method="post" action="/api/save" className="flex items-end gap-2">
                    <input type="hidden" name="entity" value="migrationReview" />
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="action" value="skip" />
                    <input type="hidden" name="back" value="/settings/import/review" />
                    <input
                      name="note"
                      required
                      placeholder="سبب الاستبعاد (إلزامي)"
                      className="input w-56 py-1 text-sm"
                    />
                    <button type="submit" className="btn-secondary btn-sm">
                      استبعاد
                    </button>
                  </form>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  {row.note ?? '—'}
                  {row.resolvedBy && ` · ${row.resolvedBy.name}`}
                  {row.resolvedAt && ` · ${formatDate(row.resolvedAt)}`}
                </p>
              )}
            </section>
          ))}
        </div>
      )}

      <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <b>الصف لا يُحذف.</b> صحّحه في الملف وأعِد ترحيل الدفعة فيدخل النظام، أو
        استبعده بسبب مكتوب. وفي الحالتين يبقى الأثر — فمن يسأل بعد سنة «أين ذهب
        هذا الصف؟» يجد الإجابة.
      </p>
    </div>
  );
}
