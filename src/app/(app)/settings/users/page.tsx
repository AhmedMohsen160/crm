import Link from '@/components/link';
import { Plus, ShieldCheck } from 'lucide-react';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { ROLES, type Role } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import { PageHeader, Avatar, Badge } from '@/components/ui';
import { ConfirmMutateButton } from '@/components/forms';

export const metadata = { title: 'المستخدمون' };
export const dynamic = 'force-dynamic';

const ROLE_COLORS: Record<Role, string> = {
  ADMIN: 'bg-violet-100 text-violet-700 border-violet-300',
  MANAGER: 'bg-blue-100 text-blue-700 border-blue-300',
  AGENT: 'bg-slate-100 text-slate-700 border-slate-300',
};

export default async function UsersPage() {
  const admin = await requireRole('ADMIN');

  const users = await db.user.findMany({
    include: {
      _count: {
        select: { ownedDeals: true, ownedLeads: true, assignedTasks: true },
      },
    },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="المستخدمون والصلاحيات" subtitle="فريق المبيعات ومن يرى ماذا">
        <Link href="/settings/users/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          مستخدم جديد
        </Link>
      </PageHeader>

      <div className="mb-6 card card-pad bg-slate-50/60">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <ShieldCheck className="h-4 w-4 text-brand-600" />
          شرح الصلاحيات
        </h2>
        <ul className="space-y-2 text-sm text-slate-600">
          <li>
            <Badge className={ROLE_COLORS.ADMIN}>مدير النظام</Badge> — يرى كل شيء، ويضيف
            المستخدمين ويحذفهم.
          </li>
          <li>
            <Badge className={ROLE_COLORS.MANAGER}>مدير مبيعات</Badge> — يرى كل سجلات الفريق
            ويوزّع المهام، لكن لا يدير المستخدمين.
          </li>
          <li>
            <Badge className={ROLE_COLORS.AGENT}>موظف مبيعات</Badge> — يرى فقط العملاء
            والصفقات المسنَدة إليه.
          </li>
        </ul>
      </div>

      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>البريد الإلكتروني</th>
              <th>الصلاحية</th>
              <th>الحالة</th>
              <th>الصفقات</th>
              <th>المهام</th>
              <th>أُضيف</th>
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
                  {u.jobTitle && (
                    <span className="block pr-8 text-xs text-slate-400">{u.jobTitle}</span>
                  )}
                </td>
                <td dir="ltr" className="text-left text-xs text-slate-600">
                  {u.email}
                </td>
                <td>
                  <Badge className={ROLE_COLORS[u.role as Role]}>
                    {ROLES[u.role as Role] ?? u.role}
                  </Badge>
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
                <td className="nums">{u._count.ownedDeals}</td>
                <td className="nums">{u._count.assignedTasks}</td>
                <td className="whitespace-nowrap text-xs text-slate-500">
                  {formatDate(u.createdAt)}
                </td>
                <td>
                  {u.id !== admin.id && (
                    <ConfirmMutateButton
                      op="user.delete"
                      id={u.id}
                      redirectTo="/settings/users"
                      label="حذف"
                      confirmText={`حذف المستخدم "${u.name}"؟ ستبقى سجلاته لكن بدون مسؤول.`}
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
