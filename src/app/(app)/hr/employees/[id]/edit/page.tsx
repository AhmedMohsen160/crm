import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { listOptionsMany } from '@/lib/reference';
import { PageHeader, ErrorAlert, Badge } from '@/components/ui';
import EmployeeForm from '@/components/employee-form';

export const metadata = { title: 'تعديل بيانات موظف' };
export const dynamic = 'force-dynamic';

export default async function EditEmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  await requirePermission('canManageHr');

  const [employee, lists, departments, managers] = await Promise.all([
    db.user.findUnique({ where: { id } }),
    listOptionsMany('branch', 'payment_method'),
    db.department.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    db.user.findMany({
      where: { active: true, id: { not: id } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);
  if (!employee) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`تعديل بيانات ${employee.name}`} subtitle={employee.jobTitle ?? undefined}>
        {!employee.canLogin && (
          <Badge className="border-lime-300 bg-lime-50 text-lime-800">منفِّذ داخلي</Badge>
        )}
        <Link href={`/hr/employees/${id}`} className="btn-secondary">
          رجوع للملف
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />

      <EmployeeForm
        values={employee}
        branches={lists.branch}
        departments={departments}
        managers={managers}
        paymentMethods={lists.payment_method}
        back={`/hr/employees/${id}/edit`}
        submitLabel="حفظ التعديلات"
      />
    </div>
  );
}
