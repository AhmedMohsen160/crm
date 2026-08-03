import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { listOptionsMany } from '@/lib/reference';
import { PageHeader, ErrorAlert, Badge } from '@/components/ui';
import UserForm from '@/components/user-form';

export const metadata = { title: 'تعديل مستخدم' };
export const dynamic = 'force-dynamic';

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const admin = await requirePermission('canManageUsers');

  const [target, roles, lists, managers, departments] = await Promise.all([
    db.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            ownedProjects: true,
            ownedLeads: true,
            assignedTasks: true,
            team: true,
            projectSteps: true,
          },
        },
      },
    }),
    db.role.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, label: true } }),
    listOptionsMany('branch', 'payment_method'),
    db.user.findMany({
      where: { active: true, canLogin: true, id: { not: id } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    db.department.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);
  if (!target) notFound();

  const isSelf = admin.id === id;

  const stats = [
    { value: target._count.ownedProjects, label: 'مشروع' },
    { value: target._count.ownedLeads, label: 'عميل محتمل' },
    { value: target._count.projectSteps, label: 'خطوة نفّذها' },
    { value: target._count.assignedTasks, label: 'مهمة' },
    { value: target._count.team, label: 'يتبعه' },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="تعديل مستخدم"
        subtitle={target.email ?? (target.canLogin ? undefined : 'منفِّذ داخلي — لا يدخل النظام')}
      >
        {!target.canLogin && (
          <Badge className="border-lime-300 bg-lime-50 text-lime-800">منفِّذ داخلي</Badge>
        )}
        <Link href="/settings/users" className="btn-secondary">
          رجوع للقائمة
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />

      <div className="mb-6 grid gap-4 sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="card card-pad text-center">
            <p className="nums text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <UserForm
        values={target}
        roles={roles}
        branches={lists.branch}
        managers={managers}
        departments={departments}
        paymentMethods={lists.payment_method}
        back={`/settings/users/${id}`}
        isSelf={isSelf}
        submitLabel="حفظ التعديلات"
      />
    </div>
  );
}
