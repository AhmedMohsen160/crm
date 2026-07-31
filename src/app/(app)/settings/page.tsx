import Link from '@/components/link';
import { Users, KeyRound, Building2 } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/ui';

export const metadata = { title: 'الإعدادات' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  await requireRole('ADMIN');

  const [userCount, companyCount, dealCount, leadCount] = await Promise.all([
    db.user.count({ where: { active: true } }),
    db.company.count(),
    db.deal.count(),
    db.lead.count(),
  ]);

  const cards = [
    {
      href: '/settings/users',
      icon: Users,
      title: 'المستخدمون والصلاحيات',
      description: `إضافة موظفي المبيعات وتحديد صلاحياتهم — ${userCount} مستخدم نشط`,
    },
    {
      href: '/settings/password',
      icon: KeyRound,
      title: 'تغيير كلمة المرور',
      description: 'تغيير كلمة مرور حسابك الشخصي',
    },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="الإعدادات" subtitle="إدارة النظام والمستخدمين" />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="card card-pad text-center">
          <p className="text-2xl font-bold text-slate-900 nums">{userCount}</p>
          <p className="text-xs text-slate-500">مستخدم</p>
        </div>
        <div className="card card-pad text-center">
          <p className="text-2xl font-bold text-slate-900 nums">{companyCount}</p>
          <p className="text-xs text-slate-500">شركة</p>
        </div>
        <div className="card card-pad text-center">
          <p className="text-2xl font-bold text-slate-900 nums">{leadCount}</p>
          <p className="text-xs text-slate-500">عميل محتمل</p>
        </div>
        <div className="card card-pad text-center">
          <p className="text-2xl font-bold text-slate-900 nums">{dealCount}</p>
          <p className="text-xs text-slate-500">صفقة</p>
        </div>
      </div>

      <div className="space-y-3">
        {cards.map((c) => {
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

      <div className="mt-6 card card-pad">
        <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-800">
          <Building2 className="h-4 w-4 text-brand-600" />
          بيانات الشركة
        </h2>
        <p className="text-sm text-slate-600">
          اسم الشركة الظاهر في الواجهة وعروض الأسعار يُضبط من ملف{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs" dir="ltr">
            .env
          </code>{' '}
          عبر المتغيرين{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs" dir="ltr">
            NEXT_PUBLIC_COMPANY_NAME_AR
          </code>{' '}
          و{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs" dir="ltr">
            NEXT_PUBLIC_COMPANY_NAME
          </code>
          .
        </p>
      </div>
    </div>
  );
}
