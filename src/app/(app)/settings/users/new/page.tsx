import Link from '@/components/link';
import { requireRole } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { PageHeader, FormField, SelectField, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'مستخدم جديد' };

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  await requireRole('ADMIN');

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="مستخدم جديد" subtitle="أضف موظفًا إلى فريق المبيعات" />
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
              label="الصلاحية"
              name="role"
              required
              defaultValue="AGENT"
              placeholder="موظف مبيعات"
              options={Object.entries(ROLES).map(([v, l]) => ({ value: v, label: l }))}
            />
            <FormField label="رقم الهاتف" name="phone" />
            <FormField
              label="المسمى الوظيفي"
              name="jobTitle"
              placeholder="مثال: أخصائي مبيعات"
            />
          </div>
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
