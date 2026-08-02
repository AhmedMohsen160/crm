import Link from '@/components/link';
import { requirePermission } from '@/lib/auth';
import { PageHeader, FormField, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';
import { PermissionGrid } from '@/components/permission-grid';

export const metadata = { title: 'دور جديد' };

export default async function NewRolePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  await requirePermission('canManageUsers');

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="دور جديد" subtitle="حدّد ما يستطيع صاحب هذا الدور فعله" />
      <ErrorAlert message={error} />

      <form method="post" action="/api/save" className="space-y-6">
        <input type="hidden" name="entity" value="role" />
        <input type="hidden" name="id" value="" />
        <input type="hidden" name="back" value="/settings/roles/new" />

        <section className="card card-pad">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="اسم الدور بالعربية"
              name="label"
              required
              placeholder="مثال: مشرف فرع"
            />
            <FormField
              label="المفتاح البرمجي"
              name="name"
              required
              dir="ltr"
              placeholder="branch_supervisor"
              hint="إنجليزي صغير بلا مسافات — لا يتغيّر بعد الحفظ"
            />
          </div>
        </section>

        <section className="card card-pad">
          <h2 className="mb-3 font-semibold text-slate-800">حد الخصم</h2>
          <FormField
            label="أقصى خصم بلا اعتماد"
            name="discountLimit"
            type="number"
            step="0.01"
            min="0"
            max="1"
            dir="ltr"
            hint="نسبة عشرية: ٠٫١ تعني ١٠٪. ما فوقها يوقف المشروع بانتظار اعتماد."
          />
        </section>

        <section className="card card-pad">
          <h2 className="mb-3 font-semibold text-slate-800">الصلاحيات</h2>
          <PermissionGrid />
        </section>

        <div className="flex items-center gap-3">
          <SaveButton>إنشاء الدور</SaveButton>
          <Link href="/settings/roles" className="btn-secondary">
            إلغاء
          </Link>
        </div>
      </form>
    </div>
  );
}
