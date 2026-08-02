import Link from '@/components/link';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { listOptionsMany } from '@/lib/reference';
import { fiscalMonth, monthRange } from '@/lib/accounting';
import { isPeriodClosed } from '@/lib/ledger';
import { toDateInput } from '@/lib/utils';
import { PageHeader, ErrorAlert } from '@/components/ui';
import JournalForm from '@/components/journal-form';

export const metadata = { title: 'قيد جديد' };
export const dynamic = 'force-dynamic';

export default async function NewJournalEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; error?: string }>;
}) {
  await requirePermission('canManageAccounting');
  const { period: requested, error } = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(requested ?? '') ? requested! : fiscalMonth(new Date());

  const closed = await isPeriodClosed(period);

  const [accounts, costCenters, salesAdmins, lists] = await Promise.all([
    db.account.findMany({
      where: { isPostable: true, active: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    }),
    db.costCenter.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    db.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    listOptionsMany('branch', 'currency'),
  ]);

  // تاريخ افتراضي داخل الشهر المطلوب — فلا يقع القيد في شهر آخر سهوًا
  const today = new Date();
  const { start, end } = monthRange(period);
  const defaultDate = today >= start && today < end ? today : start;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="قيد جديد" subtitle={`فترة ${period} — يُحفظ مسوَّدةً ثم يُرحَّل`}>
        <Link href={`/finance/journal?period=${period}`} className="btn-secondary">
          رجوع للدفتر
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />

      {closed ? (
        <p className="card card-pad text-sm text-slate-600">
          فترة <b>{period}</b> مقفلة — لا يُحرَّر فيها قيد. أعِد فتحها من شاشة
          «إقفال الشهور» إن كان لا بد.
        </p>
      ) : (
        <JournalForm
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
            date: toDateInput(defaultDate) ?? '',
            description: '',
            docType: 'journal',
            docNumber: '',
          }}
          back={`/finance/journal/new?period=${period}`}
        />
      )}
    </div>
  );
}
