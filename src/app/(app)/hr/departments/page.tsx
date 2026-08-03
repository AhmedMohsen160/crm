import Link from '@/components/link';
import { Network } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { departmentTree } from '@/lib/hr-engine';
import { listOptions } from '@/lib/reference';
import { PageHeader, ErrorAlert, FormField, SelectField } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'الشجرة التنظيمية' };
export const dynamic = 'force-dynamic';

/**
 * الشجرة التنظيمية.
 *
 * مستقلّة عن «يتبع إداريًا» عمدًا: التبعية الإدارية للشخص قد تخالف موقعه
 * التنظيمي — مترجم في قسم الإنتاج يتبع مدير مشاريع في قسم آخر — وخلطهما
 * يُفسد تقارير القسمين معًا.
 */
export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; edit?: string }>;
}) {
  await requirePermission('canManageHr');
  const sp = await searchParams;

  const [{ flat, unassigned }, managers, branches, costCenters] = await Promise.all([
    departmentTree(),
    db.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    listOptions('branch'),
    db.costCenter.findMany({ where: { active: true }, select: { id: true, name: true } }),
  ]);

  const editing = sp.edit ? flat.find((d) => d.id === sp.edit) : null;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="الشجرة التنظيمية" subtitle="الأقسام والإدارات ومن يرأسها">
        <Link href="/hr" className="btn-secondary">
          لوحة الموارد البشرية
        </Link>
      </PageHeader>
      <ErrorAlert message={sp.error} />

      <section className="card mb-5">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold text-slate-800">
            <Network className="h-4 w-4 text-brand-600" />
            الأقسام
          </h2>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>القسم</th>
                <th>يرأسه</th>
                <th>الفرع</th>
                <th>عدد الأفراد</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {flat.map((dept) => (
                <tr key={dept.id}>
                  <td>
                    <span style={{ paddingInlineStart: `${dept.depth * 20}px` }}>
                      {dept.depth > 0 && <span className="text-slate-300">└ </span>}
                      <span className="font-medium text-slate-800">{dept.name}</span>
                      {dept.code && (
                        <span className="mr-2 text-xs text-slate-400" dir="ltr">
                          {dept.code}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="text-sm text-slate-600">{dept.manager?.name ?? '—'}</td>
                  <td className="text-sm text-slate-600">{dept.branch ?? '—'}</td>
                  <td className="nums text-sm">{dept.headcount}</td>
                  <td>
                    <Link href={`/hr/departments?edit=${dept.id}`} className="link text-xs">
                      تعديل
                    </Link>
                  </td>
                </tr>
              ))}
              {flat.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-slate-400">
                    لا أقسام بعد — ابدأ بالإدارة العليا ثم انزل بالأقسام تحتها.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {unassigned > 0 && (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-amber-700">
            {unassigned} من الفريق بلا قسم — لن يظهروا في تقارير الأقسام.
          </p>
        )}
      </section>

      <section className="card card-pad">
        <h2 className="mb-4 section-title">{editing ? `تعديل: ${editing.name}` : 'قسم جديد'}</h2>
        <form method="post" action="/api/save" className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="entity" value="department" />
          <input type="hidden" name="id" value={editing?.id ?? ''} />
          <input type="hidden" name="back" value="/hr/departments" />

          <FormField label="اسم القسم" name="name" required defaultValue={editing?.name} />
          <FormField label="الرمز" name="code" defaultValue={editing?.code} dir="ltr" />
          <SelectField
            label="يتبع قسم"
            name="parentId"
            defaultValue={editing?.parentId}
            placeholder="— قسم رئيسي —"
            options={flat
              .filter((d) => d.id !== editing?.id)
              .map((d) => ({ value: d.id, label: `${'— '.repeat(d.depth)}${d.name}` }))}
          />
          <SelectField
            label="رئيس القسم"
            name="managerId"
            defaultValue={editing?.managerId}
            placeholder="— بلا رئيس —"
            options={managers.map((m) => ({ value: m.id, label: m.name }))}
          />
          <SelectField
            label="الفرع"
            name="branch"
            defaultValue={editing?.branch}
            placeholder="— كل الفروع —"
            options={branches.map((b) => ({ value: b.value, label: b.label }))}
          />
          <SelectField
            label="مركز التكلفة المحاسبي"
            name="costCenterId"
            defaultValue={editing?.costCenterId}
            placeholder="— بلا ربط —"
            options={costCenters.map((c) => ({ value: c.id, label: c.name }))}
            hint="يربط رواتب القسم بالدفتر"
          />
          <div className="sm:col-span-2 flex items-center gap-4">
            <SaveButton>{editing ? 'حفظ التعديلات' : 'إضافة القسم'}</SaveButton>
            {editing && (
              <Link href="/hr/departments" className="btn-secondary">
                إلغاء
              </Link>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
