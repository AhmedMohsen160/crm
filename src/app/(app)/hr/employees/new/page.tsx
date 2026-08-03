import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { listOptionsMany } from '@/lib/reference';
import { PageHeader, ErrorAlert } from '@/components/ui';
import EmployeeForm from '@/components/employee-form';

export const metadata = { title: 'تعيين موظف' };
export const dynamic = 'force-dynamic';

export default async function NewEmployeePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  await requirePermission('canManageHr');

  const [lists, departments, managers] = await Promise.all([
    listOptionsMany('branch', 'payment_method'),
    db.department.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    // المدير قد يكون منفِّذًا داخليًا بلا حساب — رئيس قسم الترجمة مثلًا
    db.user.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="تعيين موظف"
        subtitle="القسم والمدير والراتب — والحساب يُفتح بعدها من شاشة المستخدمين إن احتاجه"
      />
      <ErrorAlert message={error} />

      <EmployeeForm
        values={{ isProducer: true }}
        branches={lists.branch}
        departments={departments}
        managers={managers}
        paymentMethods={lists.payment_method}
        back="/hr/employees/new"
        submitLabel="تعيين"
      />
    </div>
  );
}
