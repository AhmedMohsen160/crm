import Link from '@/components/link';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { PageHeader, ErrorAlert } from '@/components/ui';
import { MailboxForm } from '@/components/mailbox-form';

export const metadata = { title: 'ربط صندوق بريد' };
export const dynamic = 'force-dynamic';

export default async function NewMailboxPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission('canManageSettings');
  const { error } = await searchParams;
  const users = await db.user.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="ربط صندوق بريد" subtitle="مشترك للفريق أو شخصي لأدمن بعينه">
        <Link href="/settings/mailboxes" className="btn-secondary">
          رجوع
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />
      <MailboxForm users={users} />
    </div>
  );
}
