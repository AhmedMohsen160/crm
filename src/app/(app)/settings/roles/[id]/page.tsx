import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { PageHeader, FormField, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';
import { PermissionGrid } from '@/components/permission-grid';

export const metadata = { title: 'تعديل دور' };
export const dynamic = 'force-dynamic';

export default async function EditRolePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  await requirePermission('canManageUsers');

  const role = await db.role.findUnique({
    where: { id },
    include: { users: { select: { id: true, name: true }, orderBy: { name: 'asc' } } },
  });
  if (!role) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`تعديل دور: ${role.label}`}
        subtitle={`${role.users.length} مستخدم يعمل بهذا الدور — التعديل يسري عليهم فورًا`}
      />
      <ErrorAlert message={error} />

      {role.users.length > 0 && (
        <div className="mb-6 card card-pad bg-amber-50/60">
          <p className="text-sm text-slate-700">
            <b>سيتأثر:</b> {role.users.map((u) => u.name).join(' · ')}
          </p>
        </div>
      )}

      <form method="post" action="/api/save" className="space-y-6">
        <input type="hidden" name="entity" value="role" />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="back" value={`/settings/roles/${id}`} />

        <section className="card card-pad">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="اسم الدور بالعربية"
              name="label"
              required
              defaultValue={role.label}
            />
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                المفتاح البرمجي
              </span>
              <p
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                dir="ltr"
              >
                {role.name}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                لا يتغيّر — قد تكون سجلات قديمة مرتبطة به
              </p>
            </div>
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
            defaultValue={String(role.discountLimit)}
              dir="ltr"
            hint="نسبة عشرية: ٠٫١ تعني ١٠٪. ما فوقها يوقف المشروع بانتظار اعتماد."
          />
        </section>

        <section className="card card-pad">
          <h2 className="mb-3 font-semibold text-slate-800">الصلاحيات</h2>
          <PermissionGrid granted={role} />
        </section>

        <div className="flex items-center gap-3">
          <SaveButton>حفظ الصلاحيات</SaveButton>
          <Link href="/settings/roles" className="btn-secondary">
            إلغاء
          </Link>
        </div>
      </form>
    </div>
  );
}
