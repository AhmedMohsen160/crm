import Link from '@/components/link';
import {
  Users,
  KeyRound,
  ShieldCheck,
  ListOrdered,
  SlidersHorizontal,
  ScrollText,
  Target,
  Lock,
  Tag,
  Percent,
  Upload,
} from 'lucide-react';
import { requireUser, can } from '@/lib/auth';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/ui';
import type { Permission } from '@/lib/permissions';

export const metadata = { title: 'الإعدادات' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireUser();

  const [userCount, roleCount, listCount, auditCount] = await Promise.all([
    db.user.count({ where: { active: true } }),
    db.role.count(),
    db.listItem.count({ where: { active: true } }),
    db.auditLog.count(),
  ]);

  const cards: {
    href: string;
    icon: typeof Users;
    title: string;
    description: string;
    permission?: Permission;
  }[] = [
    {
      href: '/settings/users',
      icon: Users,
      title: 'المستخدمون',
      description: `الفريق وفروعه وتسلسله الإداري — ${userCount} مستخدم نشط`,
      permission: 'canManageUsers',
    },
    {
      href: '/settings/roles',
      icon: ShieldCheck,
      title: 'الأدوار والصلاحيات',
      description: `أنشئ دورًا وامنحه ما تشاء من ١٨ صلاحية — ${roleCount} دور`,
      permission: 'canManageUsers',
    },
    {
      href: '/settings/lists',
      icon: ListOrdered,
      title: 'القوائم المرجعية',
      description: `الفروع والقنوات وأنماط التشغيل ومعاملاتها — ${listCount} عنصر`,
      permission: 'canManageSettings',
    },
    {
      href: '/settings/targets',
      icon: Target,
      title: 'أهداف الفروع الشهرية',
      description: 'التارجت الذي تُقاس عليه نسب المبيعات — لكل فرع ولكل شهر',
      permission: 'canManageSettings',
    },
    {
      href: '/settings/commissions',
      icon: Percent,
      title: 'خطط نسب المبيعات',
      description: 'الشرائح ونسبة الأدمن ونسبة المدير — أرقام تُعدَّل، لا كود يُبرمَج',
      permission: 'canManageSettings',
    },
    {
      href: '/settings/prices',
      icon: Tag,
      title: 'قائمة الأسعار',
      description: 'سعر الصفحة لكل خط خدمة وزوج لغات — بتاريخ سريان يحمي أسعار الماضي',
      permission: 'canManageSettings',
    },
    {
      href: '/settings/staff-costs',
      icon: Lock,
      title: 'تكلفة الموظفين',
      description: 'الرواتب ومعطيات حساب تكلفة الصفحة — لمدير النظام والإدارة فقط',
      permission: 'canViewStaffSalary',
    },
    {
      href: '/settings/import',
      icon: Upload,
      title: 'ترحيل الملفات القديمة',
      description: 'سجل الليدز وملف المبيعات — لا يُحذف صف ولا يُخمَّن',
      permission: 'canManageSettings',
    },
    {
      href: '/settings/system',
      icon: SlidersHorizontal,
      title: 'إعدادات النظام',
      description: 'المعاملات التي تبني عليها كل الحسابات والتقارير',
      permission: 'canManageSettings',
    },
    {
      href: '/settings/audit',
      icon: ScrollText,
      title: 'سجل التدقيق',
      description: `كل تغيير بقيمته القديمة والجديدة — ${auditCount} قيد`,
      permission: 'canManageSettings',
    },
    {
      href: '/settings/password',
      icon: KeyRound,
      title: 'تغيير كلمة المرور',
      description: 'تغيير كلمة مرور حسابك الشخصي',
    },
  ];

  const visible = cards.filter((c) => !c.permission || can(user, c.permission));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="الإعدادات" subtitle={`${user.roleLabel} — ${user.name}`} />

      <div className="space-y-3">
        {visible.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.href}
              href={c.href}
              className="card card-pad flex items-center gap-4 transition-shadow hover:shadow-md"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800">{c.title}</p>
                <p className="text-sm text-slate-500">{c.description}</p>
              </div>
              <span className="text-slate-300">←</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
