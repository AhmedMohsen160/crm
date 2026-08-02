import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { formatDateTime } from '@/lib/utils';
import { PageHeader, Badge } from '@/components/ui';
import { FilterBar, SearchInput, FilterSelect } from '@/components/filters';

export const metadata = { title: 'سجل التدقيق' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;

const ACTION_LABELS: Record<string, string> = {
  create: 'إنشاء',
  update: 'تعديل',
  delete: 'حذف',
  restore: 'استرجاع',
  login: 'دخول',
};

const ACTION_COLORS: Record<string, string> = {
  create: 'border-emerald-300 bg-emerald-100 text-emerald-700',
  update: 'border-blue-300 bg-blue-100 text-blue-700',
  delete: 'border-rose-300 bg-rose-100 text-rose-700',
  restore: 'border-amber-300 bg-amber-100 text-amber-800',
  login: 'border-slate-300 bg-slate-100 text-slate-600',
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; table?: string; action?: string }>;
}) {
  const { q, table, action } = await searchParams;
  await requirePermission('canManageSettings');

  const where = {
    ...(table ? { tableName: table } : {}),
    ...(action ? { action } : {}),
    ...(q ? { recordId: q } : {}),
  };

  const [entries, tables] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { user: { select: { name: true } } },
      orderBy: { ts: 'desc' },
      take: PAGE_SIZE,
    }),
    db.auditLog.findMany({
      distinct: ['tableName'],
      select: { tableName: true },
      orderBy: { tableName: 'asc' },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="سجل التدقيق"
        subtitle="كل تغيير على النظام بقيمته القديمة والجديدة — لا يُحذف ولا يُعدَّل"
      />

      <FilterBar className="mb-4">
        <SearchInput placeholder="معرّف السجل" defaultValue={q} />
        <FilterSelect
          name="table"
          defaultValue={table}
          placeholder="كل الجداول"
          options={tables.map((t) => ({ value: t.tableName, label: t.tableName }))}
        />
        <FilterSelect
          name="action"
          defaultValue={action}
          placeholder="كل العمليات"
          options={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </FilterBar>

      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>التوقيت</th>
              <th>من</th>
              <th>العملية</th>
              <th>الجدول</th>
              <th>الحقل</th>
              <th>القيمة السابقة</th>
              <th>القيمة الجديدة</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-slate-400">
                  لا قيود مطابقة
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap text-xs text-slate-500">
                  {formatDateTime(e.ts)}
                </td>
                <td className="text-sm text-slate-700">{e.user?.name ?? 'النظام'}</td>
                <td>
                  <Badge className={ACTION_COLORS[e.action]}>
                    {ACTION_LABELS[e.action] ?? e.action}
                  </Badge>
                </td>
                <td className="text-xs text-slate-600" dir="ltr">
                  {e.tableName}
                </td>
                <td className="text-xs text-slate-600" dir="ltr">
                  {e.field ?? '—'}
                </td>
                <td className="max-w-[16rem] truncate text-xs text-rose-600">
                  {e.oldValue ?? '—'}
                </td>
                <td className="max-w-[16rem] truncate text-xs text-emerald-700">
                  {e.newValue ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {entries.length === PAGE_SIZE && (
        <p className="mt-3 text-center text-xs text-slate-400">
          تُعرض آخر {PAGE_SIZE} قيد — ضيّق البحث لرؤية ما قبلها
        </p>
      )}
    </div>
  );
}
