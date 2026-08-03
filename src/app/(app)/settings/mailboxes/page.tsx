import Link from '@/components/link';
import { Plus, Mail, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { encryptionReady } from '@/lib/crypto';
import { formatDateTime } from '@/lib/utils';
import { PageHeader, Badge, EmptyState } from '@/components/ui';

export const metadata = { title: 'صناديق البريد' };
export const dynamic = 'force-dynamic';

/**
 * صناديق البريد.
 *
 * النمطان مدعومان معًا لأن المكتب قد يعمل بهما في وقت واحد: صندوق `info@`
 * مشترك يقرؤه الفريق، وصندوق لكل أدمن لا يقرؤه غيره. الفارق سطر واحد في
 * الإعداد — «صاحب الصندوق» فارغًا أو مملوءًا.
 */
export default async function MailboxesPage() {
  await requirePermission('canManageSettings');

  const boxes = await db.mailbox.findMany({
    include: {
      owner: { select: { name: true } },
      _count: { select: { messages: true } },
    },
    orderBy: [{ ownerId: 'asc' }, { label: 'asc' }],
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="صناديق البريد"
        subtitle="صندوق مشترك للفريق، أو صندوق لكل أدمن — أو الاثنان معًا"
      >
        <Link href="/settings/mailboxes/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          ربط صندوق
        </Link>
      </PageHeader>

      {!encryptionReady() && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            لا يمكن حفظ كلمات مرور الصناديق قبل ضبط <code dir="ltr">SECRET_KEY</code> (أو{' '}
            <code dir="ltr">AUTH_SECRET</code>) في متغيّرات البيئة — تُعمّى بها الأسرار، ولولاها
            لحُفظت كما هي.
          </span>
        </p>
      )}

      {boxes.length === 0 ? (
        <EmptyState
          icon={<Mail className="h-8 w-8" />}
          title="لا صندوق مربوط"
          description="يلزم لكل صندوق: عنوانه، وخادم الوارد (IMAP) والصادر (SMTP)، وكلمة مرور تطبيق — لا كلمة مرور الحساب نفسها."
          actionHref="/settings/mailboxes/new"
          actionLabel="ربط صندوق"
        />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>الصندوق</th>
                <th>النمط</th>
                <th>الرسائل</th>
                <th>آخر مزامنة</th>
                <th>الحال</th>
              </tr>
            </thead>
            <tbody>
              {boxes.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link href={`/settings/mailboxes/${b.id}`} className="link font-medium">
                      {b.label}
                    </Link>
                    <span className="block text-xs text-slate-400" dir="ltr">
                      {b.address}
                    </span>
                  </td>
                  <td className="text-sm text-slate-600">
                    {b.owner ? `شخصي — ${b.owner.name}` : 'مشترك للفريق'}
                  </td>
                  <td className="nums">{b._count.messages}</td>
                  <td className="text-xs text-slate-400">
                    {b.lastSyncAt ? formatDateTime(b.lastSyncAt) : 'لم تُزامَن بعد'}
                  </td>
                  <td>
                    {b.lastError ? (
                      <Badge className="border-rose-200 bg-rose-50 text-rose-700">عُطل</Badge>
                    ) : b.active ? (
                      <Badge className="border-lime-300 bg-lime-50 text-lime-800">نشط</Badge>
                    ) : (
                      <Badge className="border-slate-200 bg-slate-50 text-slate-500">موقوف</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
