import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { listOptions } from '@/lib/reference';
import { PageHeader, FormField, SelectField, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';

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

  const [target, roles, branches, managers] = await Promise.all([
    db.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: { ownedProjects: true, ownedLeads: true, assignedTasks: true, team: true },
        },
      },
    }),
    db.role.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, label: true } }),
    listOptions('branch'),
    db.user.findMany({
      where: { active: true, id: { not: id } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);
  if (!target) notFound();

  const isSelf = admin.id === id;

  const stats = [
    { value: target._count.ownedProjects, label: 'مشروع' },
    { value: target._count.ownedLeads, label: 'عميل محتمل' },
    { value: target._count.assignedTasks, label: 'مهمة' },
    { value: target._count.team, label: 'يتبعه' },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="تعديل مستخدم" subtitle={target.email} />
      <ErrorAlert message={error} />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card card-pad text-center">
            <p className="text-2xl font-bold nums">{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <form method="post" action="/api/save" className="space-y-6">
        <input type="hidden" name="entity" value="user" />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="back" value={`/settings/users/${id}`} />
        <section className="card card-pad">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="الاسم الكامل"
              name="name"
              required
              className="sm:col-span-2"
              defaultValue={target.name}
            />
            <SelectField
              label="الدور"
              name="roleId"
              required
              defaultValue={target.roleId ?? ''}
              placeholder="اختر الدور"
              options={roles.map((r) => ({ value: r.id, label: r.label }))}
              hint={isSelf ? 'لا يمكنك تغيير دورك بنفسك' : undefined}
            />
            <SelectField
              label="الفرع"
              name="branch"
              defaultValue={target.branch ?? ''}
              placeholder="بلا فرع"
              options={branches.map((b) => ({ value: b.value, label: b.label }))}
            />
            <SelectField
              label="يتبع إداريًا"
              name="reportsToId"
              defaultValue={target.reportsToId ?? ''}
              placeholder="لا يتبع أحدًا"
              options={managers.map((m) => ({ value: m.id, label: m.name }))}
              hint="عليه يقوم نطاق «رؤية الفريق» ونسبة المدير"
            />
            <FormField label="رقم الهاتف" name="phone" defaultValue={target.phone} />
            <FormField
              label="المسمى الوظيفي"
              name="jobTitle"
              defaultValue={target.jobTitle}
              className="sm:col-span-2"
            />
            <FormField
              label="كلمة مرور جديدة"
              name="password"
              type="password"
              className="sm:col-span-2"
              hint="اتركه فارغًا للإبقاء على كلمة المرور الحالية"
            />
          </div>

          <label className="mt-4 flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              name="isProducer"
              defaultChecked={target.isProducer}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-slate-700">
              يعمل في الإنتاج
              <span className="mr-2 text-xs text-slate-400">
                (يظهر في قائمة الإسناد كمنتِج أو مراجع)
              </span>
            </span>
          </label>

          <label className="mt-3 flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={target.active}
              disabled={isSelf}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-slate-700">
              الحساب نشط
              <span className="mr-2 text-xs text-slate-400">
                (إلغاء التحديد يمنع الموظف من الدخول دون حذف سجلاته)
              </span>
            </span>
          </label>
        </section>

        <div className="flex items-center gap-3">
          <SaveButton>حفظ التعديلات</SaveButton>
          <Link href="/settings/users" className="btn-secondary">
            إلغاء
          </Link>
        </div>
      </form>
    </div>
  );
}
