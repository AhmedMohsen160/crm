import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { Pencil, Scale } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { DOCUMENT_TYPES, ENTRY_STATUSES, checkBalance } from '@/lib/accounting';
import { isPeriodClosed } from '@/lib/ledger';
import { formatMoney, formatDate } from '@/lib/utils';
import { PageHeader, Badge, Field, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  draft: 'border-amber-200 bg-amber-50 text-amber-700',
  posted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  void: 'border-slate-300 bg-slate-100 text-slate-400',
};

export default async function JournalEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  await requirePermission('canManageAccounting');

  const entry = await db.journalEntry.findUnique({
    where: { id },
    include: {
      lines: {
        include: {
          account: { select: { id: true, name: true, code: true } },
          costCenter: { select: { name: true, project: true } },
          salesAdmin: { select: { name: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
      createdBy: { select: { name: true } },
      postedBy: { select: { name: true } },
      project: { select: { id: true, code: true, title: true } },
    },
  });
  if (!entry) notFound();

  const closed = await isPeriodClosed(entry.period);
  const balance = checkBalance(
    entry.lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit }))
  );
  const isDraft = entry.status === 'draft';

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title={entry.description} subtitle={`${entry.code ?? ''} · فترة ${entry.period}`}>
        {isDraft && !closed && (
          <Link href={`/finance/journal/${id}/edit`} className="btn-secondary">
            <Pencil className="h-4 w-4" />
            تعديل
          </Link>
        )}
        <Link href={`/finance/journal?period=${entry.period}`} className="btn-secondary">
          رجوع للدفتر
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />

      <section className="card card-pad">
        <dl className="grid gap-4 sm:grid-cols-4">
          <Field label="التاريخ">{formatDate(entry.date)}</Field>
          <Field label="نوع المستند">
            {DOCUMENT_TYPES[entry.docType as keyof typeof DOCUMENT_TYPES] ?? entry.docType}
            {entry.docNumber && <span className="block text-xs text-slate-400" dir="ltr">{entry.docNumber}</span>}
          </Field>
          <Field label="الحال">
            <Badge className={STATUS_STYLE[entry.status] ?? STATUS_STYLE.draft}>
              {ENTRY_STATUSES[entry.status as keyof typeof ENTRY_STATUSES] ?? entry.status}
            </Badge>
          </Field>
          <Field label="التوقيع">
            {entry.createdBy?.name ? `حرّره ${entry.createdBy.name}` : 'مقترح آليًا'}
            {entry.postedBy && entry.status === 'posted' && (
              <span className="block text-xs text-slate-400">رحّله {entry.postedBy.name}</span>
            )}
          </Field>
          {entry.project && (
            <Field label="المشروع">
              <Link href={`/projects/${entry.project.id}`} className="link">
                {entry.project.code} — {entry.project.title}
              </Link>
            </Field>
          )}
          {entry.voidReason && <Field label="سبب الإلغاء">{entry.voidReason}</Field>}
        </dl>

        {entry.sourceType && (
          <p className="mt-4 rounded-lg bg-brand-50 px-4 py-3 text-xs text-brand-800">
            هذا القيد <b>اقترحه النظام</b> من حدث تشغيلي ({entry.sourceType}). راجعه
            قبل الترحيل — الاقتراح ليس اعتمادًا.
          </p>
        )}
      </section>

      <section className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>الحساب</th>
              <th>مدين</th>
              <th>دائن</th>
              <th>الفرع</th>
              <th>مركز الربحية</th>
              <th>البيان</th>
            </tr>
          </thead>
          <tbody>
            {entry.lines.map((line) => (
              <tr key={line.id}>
                <td className="text-sm">
                  {line.account.code && (
                    <span className="ml-1 text-xs text-slate-400" dir="ltr">
                      {line.account.code}
                    </span>
                  )}
                  {line.account.name}
                </td>
                <td className="nums font-medium">
                  {line.debit > 0 ? formatMoney(line.debit, line.currency) : '—'}
                  {line.currency !== 'EGP' && line.debit > 0 && (
                    <span className="block text-xs text-slate-400">
                      = {formatMoney(line.debitBase)}
                    </span>
                  )}
                </td>
                <td className="nums font-medium">
                  {line.credit > 0 ? formatMoney(line.credit, line.currency) : '—'}
                  {line.currency !== 'EGP' && line.credit > 0 && (
                    <span className="block text-xs text-slate-400">
                      = {formatMoney(line.creditBase)}
                    </span>
                  )}
                </td>
                <td className="text-xs text-slate-500">{line.branch ?? '—'}</td>
                <td className="text-xs text-slate-500">
                  {line.costCenter ? `${line.costCenter.name}` : '—'}
                </td>
                <td className="text-xs text-slate-500">
                  {line.memo ?? '—'}
                  {line.salesAdmin && (
                    <span className="block text-slate-400">{line.salesAdmin.name}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 font-semibold">
              <td>الإجمالي</td>
              <td className="nums">{formatMoney(balance.totalDebit)}</td>
              <td className="nums">{formatMoney(balance.totalCredit)}</td>
              <td colSpan={3}>
                <span
                  className={`inline-flex items-center gap-1.5 text-xs ${
                    balance.balanced ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  <Scale className="h-3.5 w-3.5" />
                  {balance.balanced ? 'متوازن' : `فرق ${balance.difference}`}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {closed ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          فترة <b>{entry.period}</b> مقفلة — لا ترحيل ولا إلغاء فيها.
        </p>
      ) : (
        <section className="card card-pad">
          <h2 className="mb-3 section-title">الإجراء</h2>
          <div className="flex flex-wrap items-end gap-4">
            {isDraft && (
              <form method="post" action="/api/save">
                <input type="hidden" name="entity" value="journalEntry.decide" />
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="action" value="post" />
                <input type="hidden" name="back" value={`/finance/journal/${id}`} />
                <SaveButton>ترحيل القيد</SaveButton>
              </form>
            )}

            {entry.status !== 'void' && (
              <form method="post" action="/api/save" className="flex items-end gap-2">
                <input type="hidden" name="entity" value="journalEntry.decide" />
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="action" value="void" />
                <input type="hidden" name="back" value={`/finance/journal/${id}`} />
                <div>
                  <label className="label" htmlFor="reason">
                    سبب الإلغاء
                  </label>
                  <input id="reason" name="reason" required className="input w-64" />
                </div>
                <button type="submit" className="btn-danger">
                  إلغاء القيد
                </button>
              </form>
            )}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            القيد المرحَّل لا يُعدَّل ولا يُحذف. ما يصحّحه قيدٌ عكسي أو إلغاء بسبب
            صريح يبقى في السجل.
          </p>
        </section>
      )}
    </div>
  );
}
