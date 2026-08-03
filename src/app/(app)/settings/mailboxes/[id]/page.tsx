import { notFound } from 'next/navigation';
import Link from '@/components/link';
import { PlugZap, RefreshCw } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { formatDateTime } from '@/lib/utils';
import { PageHeader, ErrorAlert } from '@/components/ui';
import { MailboxForm } from '@/components/mailbox-form';

export const metadata = { title: 'صندوق بريد' };
export const dynamic = 'force-dynamic';

export default async function MailboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requirePermission('canManageSettings');
  const { id } = await params;
  const { error, ok } = await searchParams;

  const [mailbox, users] = await Promise.all([
    db.mailbox.findUnique({ where: { id } }),
    db.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  if (!mailbox) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={mailbox.label}
        subtitle={
          mailbox.lastSyncAt ? `آخر مزامنة ${formatDateTime(mailbox.lastSyncAt)}` : 'لم تُزامَن بعد'
        }
      >
        <form method="post" action="/api/save" className="inline">
          <input type="hidden" name="entity" value="mailbox.check" />
          <input type="hidden" name="id" value={mailbox.id} />
          <input type="hidden" name="back" value={`/settings/mailboxes/${mailbox.id}`} />
          <button type="submit" className="btn-secondary">
            <PlugZap className="h-4 w-4" />
            فحص الاتصال
          </button>
        </form>
        <form method="post" action="/api/save" className="inline">
          <input type="hidden" name="entity" value="email.sync" />
          <input type="hidden" name="id" value={mailbox.id} />
          <input type="hidden" name="back" value={`/settings/mailboxes/${mailbox.id}`} />
          <button type="submit" className="btn-secondary">
            <RefreshCw className="h-4 w-4" />
            سحب الجديد
          </button>
        </form>
        <Link href="/settings/mailboxes" className="btn-secondary">
          رجوع
        </Link>
      </PageHeader>

      <ErrorAlert message={error} />
      {ok && (
        <p className="mb-4 rounded-lg border border-lime-300 bg-lime-50 px-4 py-3 text-sm text-lime-900">
          الاتصال سليم — الوارد والصادر معًا.
        </p>
      )}

      <MailboxForm mailbox={mailbox} users={users} />
    </div>
  );
}
