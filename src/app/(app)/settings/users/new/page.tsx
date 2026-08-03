import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { listOptionsMany } from '@/lib/reference';
import { PageHeader, ErrorAlert } from '@/components/ui';
import UserForm from '@/components/user-form';

export const metadata = { title: 'مستخدم جديد' };
export const dynamic = 'force-dynamic';

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; staff?: string }>;
}) {
  const { error, staff } = await searchParams;
  await requirePermission('canManageUsers');

  const [roles, lists, managers, departments] = await Promise.all([
    db.role.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, label: true } }),
    listOptionsMany('branch', 'payment_method'),
    db.user.findMany({
      where: { active: true, canLogin: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    db.department.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="مستخدم جديد"
        subtitle="حسابٌ يدخل النظام، أو منفِّذًا داخليًا يُسنَد إليه العمل بلا دخول"
      />
      <ErrorAlert message={error} />

      <UserForm
        values={{ active: true, canLogin: staff !== '1', isProducer: staff === '1' }}
        roles={roles}
        branches={lists.branch}
        managers={managers}
        departments={departments}
        paymentMethods={lists.payment_method}
        back="/settings/users/new"
        submitLabel="إضافة"
      />
    </div>
  );
}
