import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { listOptionsMany } from '@/lib/reference';
import { isPeriodClosed } from '@/lib/ledger';
import { toDateInput } from '@/lib/utils';
import { PageHeader, ErrorAlert } from '@/components/ui';
import JournalForm from '@/components/journal-form';

export const metadata = { title: 'تعديل قيد' };
export const dynamic = 'force-dynamic';

export default async function EditJournalEntryPage({
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
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!entry) notFound();

  const closed = await isPeriodClosed(entry.period);

  const [accounts, costCenters, salesAdmins, lists] = await Promise.all([
    db.account.findMany({
      where: { isPostable: true, active: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    }),
    db.costCenter.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    listOptionsMany('branch', 'currency'),
  ]);

  const blocked = entry.status !== 'draft' || closed;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="تعديل قيد" subtitle={`${entry.code ?? ''} · ${entry.description}`}>
        <Link href={`/finance/journal/${id}`} className="btn-secondary">
          رجوع للقيد
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />

      {blocked ? (
        <p className="card card-pad text-sm text-slate-600">
          {closed
            ? `فترة ${entry.period} مقفلة — لا تعديل فيها.`
            : 'القيد مرحَّل أو ملغى — لا يُعدَّل. ألغِه بسبب صريح ثم حرّر بديلًا.'}
        </p>
      ) : (
        <JournalForm
          entryId={id}
          accounts={accounts.map((a) => ({
            value: a.id,
            label: a.code ? `${a.code} — ${a.name}` : a.name,
          }))}
          branches={lists.branch.map((b) => ({ value: b.value, label: b.label }))}
          costCenters={costCenters.map((c) => ({
            value: c.id,
            label: c.project ? `${c.name} · ${c.project}` : c.name,
          }))}
          salesAdmins={salesAdmins.map((u) => ({ value: u.id, label: u.name }))}
          currencies={lists.currency.map((c) => ({ value: c.value, label: c.label }))}
          defaults={{
            date: toDateInput(entry.date) ?? '',
            description: entry.description,
            docType: entry.docType,
            docNumber: entry.docNumber ?? '',
          }}
          lines={entry.lines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit > 0 ? String(l.debit) : '',
            credit: l.credit > 0 ? String(l.credit) : '',
            memo: l.memo ?? '',
            branch: l.branch ?? '',
            costCenterId: l.costCenterId ?? '',
            salesAdminId: l.salesAdminId ?? '',
            currency: l.currency,
            fxRate: String(l.fxRate),
          }))}
          back={`/finance/journal/${id}/edit`}
        />
      )}
    </div>
  );
}
