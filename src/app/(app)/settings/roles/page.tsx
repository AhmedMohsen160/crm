import Link from '@/components/link';
import { Plus, ShieldCheck, Check, Minus } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { PERMISSIONS, PERMISSION_KEYS, roleColor } from '@/lib/permissions';
import { PageHeader, Badge } from '@/components/ui';

export const metadata = { title: 'الأدوار والصلاحيات' };
export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  await requirePermission('canManageUsers');

  const roles = await db.role.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { users: true } } },
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="الأدوار والصلاحيات"
        subtitle="أنشئ دورًا جديدًا وامنحه ما تشاء — بلا برمجة وبلا انتظار"
      >
        <Link href="/settings/roles/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          دور جديد
        </Link>
      </PageHeader>

      <div className="mb-6 card card-pad bg-slate-50/60">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <ShieldCheck className="h-4 w-4 text-brand-600" />
          ثلاث خانات لا تُمنح تسهيلًا
        </h2>
        <ul className="space-y-1.5 text-sm text-slate-600">
          <li>
            <b>مدير المشاريع لا يرى سعر البيع</b> — حتى لا يُبنى قرار الإسناد على قيمة
            الطلب.
          </li>
          <li>
            <b>رواتب الموظفين</b> لمدير النظام والإدارة فقط.
          </li>
          <li>
            <b>أدمن المبيعات لا يعتمد خصمه بنفسه</b> — الاعتماد لمن فوقه.
          </li>
        </ul>
      </div>

      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="sticky right-0 bg-slate-50">الصلاحية</th>
              {roles.map((r) => (
                <th key={r.id} className="whitespace-nowrap text-center">
                  <Link href={`/settings/roles/${r.id}`} className="link">
                    {r.label}
                  </Link>
                  <span className="mt-1 block text-[11px] font-normal text-slate-400">
                    {r._count.users} مستخدم
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_KEYS.map((key) => (
              <tr key={key}>
                <td className="sticky right-0 whitespace-nowrap bg-white text-sm font-medium text-slate-700">
                  {PERMISSIONS[key]}
                </td>
                {roles.map((r) => (
                  <td key={r.id} className="text-center">
                    {r[key] ? (
                      <Check className="mx-auto h-4 w-4 text-emerald-600" />
                    ) : (
                      <Minus className="mx-auto h-4 w-4 text-slate-200" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {roles.map((r) => (
          <Badge key={r.id} className={roleColor(r.sortOrder)}>
            {r.label}
            <span className="mr-1.5 text-[10px] opacity-60" dir="ltr">
              {r.name}
            </span>
          </Badge>
        ))}
      </div>
    </div>
  );
}
