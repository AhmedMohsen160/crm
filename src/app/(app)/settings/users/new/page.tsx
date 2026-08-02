import Link from '@/components/link';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { listOptions } from '@/lib/reference';
import { PageHeader, FormField, SelectField, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'مستخدم جديد' };
export const dynamic = 'force-dynamic';

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  await requirePermission('canManageUsers');

  const [roles, branches, managers] = await Promise.all([
    db.role.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, label: true } }),
    listOptions('branch'),
    db.user.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="مستخدم جديد" subtitle="أضف موظفًا وحدّد دوره وفرعه ومديره" />
      <ErrorAlert message={error} />

      <form method="post" action="/api/save" className="space-y-6">
        <input type="hidden" name="entity" value="user" />
        <input type="hidden" name="id" value="" />
        <input type="hidden" name="back" value="/settings/users/new" />
        <section className="card card-pad">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="الاسم الكامل" name="name" required className="sm:col-span-2" />
            <FormField
              label="البريد الإلكتروني"
              name="email"
              type="email"
              required
              className="sm:col-span-2"
              hint="سيستخدمه الموظف لتسجيل الدخول"
            />
            <FormField
              label="كلمة المرور"
              name="password"
              type="password"
              required
              hint="8 أحرف على الأقل"
            />
            <SelectField
              label="الدور"
              name="roleId"
              required
              placeholder="اختر الدور"
              options={roles.map((r) => ({ value: r.id, label: r.label }))}
              hint="الدور يحدّد صلاحياته"
            />
            <SelectField
              label="الفرع"
              name="branch"
              placeholder="بلا فرع"
              options={branches.map((b) => ({ value: b.value, label: b.label }))}
            />
            <SelectField
              label="يتبع إداريًا"
              name="reportsToId"
              placeholder="لا يتبع أحدًا"
              options={managers.map((m) => ({ value: m.id, label: m.name }))}
              hint="مديره المباشر — عليه يقوم نطاق «رؤية الفريق» ونسبة المدير"
            />
            <FormField label="رقم الهاتف" name="phone" />
            <FormField label="المسمى الوظيفي" name="jobTitle" placeholder="مثال: أدمن مبيعات" />
          </div>

          <label className="mt-4 flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              name="isProducer"
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-slate-700">
              يعمل في الإنتاج
              <span className="mr-2 text-xs text-slate-400">
                (يظهر في قائمة الإسناد كمنتِج أو مراجع)
              </span>
            </span>
          </label>
        </section>

        <div className="flex items-center gap-3">
          <SaveButton>إضافة المستخدم</SaveButton>
          <Link href="/settings/users" className="btn-secondary">
            إلغاء
          </Link>
        </div>
      </form>
    </div>
  );
}
