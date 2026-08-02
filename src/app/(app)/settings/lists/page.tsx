import Link from '@/components/link';
import { Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { LIST_DEFINITIONS, listDefinition } from '@/lib/lists';
import { PageHeader, FormField, Badge, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';
import { cn } from '@/lib/utils';

export const metadata = { title: 'القوائم المرجعية' };
export const dynamic = 'force-dynamic';

export default async function ListsPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string; error?: string }>;
}) {
  const { list, error } = await searchParams;
  await requirePermission('canManageSettings');

  const current = listDefinition(list ?? '') ?? LIST_DEFINITIONS[0];
  const items = await db.listItem.findMany({
    where: { listName: current.name },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="القوائم المرجعية"
        subtitle="كل قائمة في النظام تُعدَّل من هنا — بلا برمجة وبلا إعادة نشر"
      />
      <ErrorAlert message={error} />

      <div className="mb-6 flex flex-wrap gap-2">
        {LIST_DEFINITIONS.map((def) => (
          <Link
            key={def.name}
            href={`/settings/lists?list=${def.name}`}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm transition-colors',
              def.name === current.name
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            )}
          >
            {def.label}
          </Link>
        ))}
      </div>

      {current.hint && (
        <p className="mb-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {current.hint}
        </p>
      )}

      <div className="card table-wrap mb-6">
        <table className="tbl">
          <thead>
            <tr>
              <th>الاسم المعروض</th>
              <th>المفتاح</th>
              {current.hasExtra && <th>{current.extraLabel ?? 'المعامل'}</th>}
              <th>الترتيب</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-slate-400">
                  لا عناصر بعد — أضف أول عنصر من النموذج أدناه
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.id} className={item.active ? undefined : 'opacity-50'}>
                <td className="font-medium text-slate-800">{item.label}</td>
                <td className="text-xs text-slate-400" dir="ltr">
                  {item.value}
                </td>
                {current.hasExtra && <td className="nums">{item.extra ?? '—'}</td>}
                <td className="nums text-slate-500">{item.sortOrder}</td>
                <td>
                  {item.active ? (
                    <Badge className="border-emerald-300 bg-emerald-100 text-emerald-700">
                      مفعَّل
                    </Badge>
                  ) : (
                    <Badge className="border-slate-300 bg-slate-100 text-slate-500">
                      معطَّل
                    </Badge>
                  )}
                </td>
                <td>
                  <details>
                    <summary className="cursor-pointer text-sm text-brand-600">تعديل</summary>
                    <form
                      method="post"
                      action="/api/save"
                      className="mt-3 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4"
                    >
                      <input type="hidden" name="entity" value="listItem" />
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="listName" value={current.name} />
                      <input
                        type="hidden"
                        name="back"
                        value={`/settings/lists?list=${current.name}`}
                      />
                      <FormField label="الاسم" name="label" defaultValue={item.label} required />
                      {current.hasExtra && (
                        <FormField
                          label={current.extraLabel ?? 'المعامل'}
                          name="extra"
                          defaultValue={item.extra}
                          dir="ltr"
                        />
                      )}
                      <FormField
                        label="الترتيب"
                        name="sortOrder"
                        type="number"
                        defaultValue={String(item.sortOrder)}
                      />
                      <label className="flex items-end gap-2 pb-2 text-sm">
                        <input
                          type="checkbox"
                          name="active"
                          defaultChecked={item.active}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600"
                        />
                        <span>مفعَّل</span>
                      </label>
                      <div className="sm:col-span-4">
                        <SaveButton>حفظ</SaveButton>
                      </div>
                    </form>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card card-pad">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-800">
          <Plus className="h-4 w-4 text-brand-600" />
          عنصر جديد في «{current.label}»
        </h2>
        <form method="post" action="/api/save" className="grid gap-4 sm:grid-cols-4">
          <input type="hidden" name="entity" value="listItem" />
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="listName" value={current.name} />
          <input type="hidden" name="back" value={`/settings/lists?list=${current.name}`} />
          <FormField label="الاسم المعروض" name="label" required />
          <FormField
            label="المفتاح البرمجي"
            name="value"
            required
            dir="ltr"
            placeholder="new_item"
            hint="إنجليزي صغير — لا يتغيّر بعد الحفظ"
          />
          {current.hasExtra && (
            <FormField
              label={current.extraLabel ?? 'المعامل'}
              name="extra"
              dir="ltr"
              placeholder="1.00"
            />
          )}
          <FormField label="الترتيب" name="sortOrder" type="number" defaultValue="99" />
          <div className="sm:col-span-4">
            <SaveButton>إضافة</SaveButton>
          </div>
        </form>
      </section>
    </div>
  );
}
