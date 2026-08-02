import Link from '@/components/link';
import { Plus, ShieldCheck } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { listOptions } from '@/lib/reference';
import { roleColor } from '@/lib/permissions';
import { formatDate } from '@/lib/utils';
import { PageHeader, Avatar, Badge } from '@/components/ui';
import { ConfirmMutateButton } from '@/components/forms';

export const metadata = { title: 'المستخدمون' };
export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const admin = await requirePermission('canManageUsers');

  const [users, branches] = await Promise.all([
    db.user.findMany({
      include: {
        roleRef: { select: { label: true, sortOrder: true } },
        reportsTo: { select: { name: true } },
        _count: {
          select: { ownedDeals: true, ownedLeads: true, assignedTasks: true },
        },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    }),
    listOptions('branch'),
  ]);

  const branchLabel = new Map(branches.map((b) => [b.value, b.label]));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="المستخدمون" subtitle="الفريق، فروعه، وتسلسله الإداري">
        <Link href="/settings/users/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          مستخدم جديد
        </Link>
      </PageHeader>

      <div className="mb-6 card card-pad bg-slate-50/60">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <ShieldCheck className="h-4 w-4 text-brand-600" />
          كيف تُحدَّد رؤية كل موظف
        </h2>
        <ul className="space-y-1.5 text-sm text-slate-600">
          <li>
            <b>الدور</b> يحدّد ما يستطيع فعله — يُدار من{' '}
            <Link href="/settings/roles" className="link">
              شاشة الأدوار والصلاحيات
            </Link>
            .
          </li>
          <li>
            <b>«يتبع إداريًا»</b> يحدّد نطاق «رؤية الفريق»: من يملكها يرى سجلات كل من
            يتبعه، بأي عمق.
          </li>
          <li>
            <b>الفرع</b> يقيّد الرؤية بسجلات الفرع نفسه لمن لا يملك «رؤية كل الليدز».
          </li>
        </ul>
      </div>

      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الدور</th>
              <th>الفرع</th>
              <th>يتبع</th>
              <th>الإنتاج</th>
              <th>الحالة</th>
              <th>آخر دخول</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <span className="flex items-center gap-2">
                    <Avatar name={u.name} size="xs" />
                    <Link href={`/settings/users/${u.id}`} className="link">
                      {u.name}
                    </Link>
                    {u.id === admin.id && (
                      <span className="text-xs text-slate-400">(أنت)</span>
                    )}
                  </span>
                  <span className="block pr-8 text-xs text-slate-400" dir="ltr">
                    {u.email}
                  </span>
                </td>
                <td>
                  {u.roleRef ? (
                    <Badge className={roleColor(u.roleRef.sortOrder)}>
                      {u.roleRef.label}
                    </Badge>
                  ) : (
                    <Badge className="border-rose-300 bg-rose-100 text-rose-700">
                      بلا دور
                    </Badge>
                  )}
                </td>
                <td className="text-sm text-slate-600">
                  {u.branch ? branchLabel.get(u.branch) ?? u.branch : '—'}
                </td>
                <td className="text-sm text-slate-600">{u.reportsTo?.name ?? '—'}</td>
                <td>
                  {u.isProducer ? (
                    <Badge className="border-emerald-300 bg-emerald-50 text-emerald-700">
                      منتِج
                    </Badge>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td>
                  {u.active ? (
                    <Badge className="border-emerald-300 bg-emerald-100 text-emerald-700">
                      نشط
                    </Badge>
                  ) : (
                    <Badge className="border-slate-300 bg-slate-100 text-slate-500">
                      موقوف
                    </Badge>
                  )}
                </td>
                <td className="whitespace-nowrap text-xs text-slate-500">
                  {u.lastLoginAt ? formatDate(u.lastLoginAt) : 'لم يدخل بعد'}
                </td>
                <td>
                  {u.id !== admin.id && (
                    <ConfirmMutateButton
                      op="user.delete"
                      id={u.id}
                      redirectTo="/settings/users"
                      label="إيقاف"
                      confirmText={`إيقاف حساب "${u.name}"؟ لن يستطيع الدخول، وتبقى كل سجلاته كما هي.`}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
