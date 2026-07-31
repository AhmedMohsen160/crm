import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { PageHeader, FormField, SelectField } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'تعديل مستخدم' };

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = await requireRole('ADMIN');

  const target = await db.user.findUnique({
    where: { id },
    include: {
      _count: { select: { ownedDeals: true, ownedLeads: true, assignedTasks: true } },
    },
  });
  if (!target) notFound();

  const isSelf = admin.id === id;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="تعديل مستخدم" subtitle={target.email} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card card-pad text-center">
          <p className="text-2xl font-bold nums">{target._count.ownedDeals}</p>
          <p className="text-xs text-slate-500">صفقة</p>
        </div>
        <div className="card card-pad text-center">
          <p className="text-2xl font-bold nums">{target._count.ownedLeads}</p>
          <p className="text-xs text-slate-500">عميل محتمل</p>
        </div>
        <div className="card card-pad text-center">
          <p className="text-2xl font-bold nums">{target._count.assignedTasks}</p>
          <p className="text-xs text-slate-500">مهمة</p>
        </div>
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
              label="الصلاحية"
              name="role"
              required
              defaultValue={target.role}
              options={Object.entries(ROLES).map(([v, l]) => ({ value: v, label: l }))}
              hint={isSelf ? 'لا يمكنك تغيير صلاحيتك بنفسك' : undefined}
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
