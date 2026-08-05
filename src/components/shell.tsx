'use client';

import { useState } from 'react';
import Link from '@/components/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  UserPlus,
  Building2,
  Users,
  Contact,
  Briefcase,
  Factory,
  Languages,
  ListChecks,
  FileText,
  FileSignature,
  Percent,
  Gauge,
  Trophy,
  Calculator,
  BarChart3,
  Mail,
  Sparkles,
  UsersRound,
  Bell,
  Settings,
  Menu,
  X,
  LogOut,
} from 'lucide-react';
import { hasAnyPermission, hasPermission } from '@/lib/permissions';
import type { SessionUser } from '@/lib/auth';
import { Avatar } from '@/components/ui';
import { FastTransLogo, FastTransMark } from '@/components/brand';
import { cn } from '@/lib/utils';

const COMPANY_AR = process.env.NEXT_PUBLIC_COMPANY_NAME_AR || 'نظام إدارة العملاء';

const NAV = [
  { href: '/', label: 'لوحة التحكم', icon: LayoutDashboard, exact: true },
  /**
   * قسم الليدز محجوب عن المحاسب بقرار الإدارة: «هو يتعامل فقط مع العملاء».
   * ويبقى له `canViewLeadStats` — الأعداد والتكلفة إجمالًا في التحليلات.
   */
  {
    href: '/leads',
    label: 'العملاء المحتملون',
    icon: UserPlus,
    anyOf: ['canViewAllLeads', 'canViewTeamLeads', 'canCreateLead'] as const,
  },
  { href: '/clients', label: 'العملاء', icon: Contact },
  { href: '/companies', label: 'الشركات', icon: Building2 },
  { href: '/contacts', label: 'جهات الاتصال', icon: Users },
  { href: '/projects', label: 'المشاريع', icon: Briefcase },
  {
    href: '/production',
    label: 'قائمة الإسناد',
    icon: Factory,
    permission: 'canAssignProduction' as const,
  },
  {
    href: '/freelancers',
    label: 'الفريلانسرز',
    icon: Languages,
    anyOf: ['canViewFreelancerCost', 'canManageFreelancers'] as const,
  },
  {
    href: '/quotes',
    label: 'عروض الأسعار',
    icon: FileText,
    permission: 'canViewSellPrice' as const,
  },
  {
    href: '/proposals',
    label: 'العروض الاحترافية',
    icon: FileSignature,
    permission: 'canViewSellPrice' as const,
  },
  { href: '/tasks', label: 'المهام', icon: ListChecks },
  // «نسبي» و«أدائي» بلا صلاحية: كلٌّ يرى نفسه. الترشيح في الخادم.
  { href: '/commissions', label: 'نسبي', icon: Percent },
  { href: '/me', label: 'أدائي', icon: Gauge, exact: true },
  {
    href: '/leaderboard',
    label: 'لوحة الترتيب',
    icon: Trophy,
    permission: 'canViewLeaderboard' as const,
  },
  {
    href: '/email',
    label: 'البريد',
    icon: Mail,
    permission: 'canUseEmail' as const,
  },
  {
    href: '/assistant',
    label: 'المساعد',
    icon: Sparkles,
    permission: 'canUseAi' as const,
  },
  {
    href: '/analytics',
    label: 'التحليلات',
    icon: BarChart3,
    permission: 'canViewTeamAnalytics' as const,
  },
  {
    href: '/finance',
    label: 'الماليات',
    icon: Calculator,
    permission: 'canManageAccounting' as const,
  },
  {
    href: '/hr',
    label: 'الموارد البشرية',
    icon: UsersRound,
    permission: 'canManageHr' as const,
  },
];

export default function Shell({
  user,
  children,
  unread = 0,
}: {
  user: SessionUser;
  children: React.ReactNode;
  /** عدد التنبيهات غير المقروءة — يُقرأ في الخادم لا بنداء دوري */
  unread?: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
      {NAV.filter(
        (item) =>
          (!item.permission || hasPermission(user, item.permission)) &&
          (!item.anyOf || hasAnyPermission(user, ...item.anyOf))
      ).map(
        (item) => {
        const Icon = item.icon;
        const active = isActive(item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
        }
      )}

      {/* التنبيهات لكل مستخدم: كلٌّ يرى ما وُجّه إليه هو */}
      <Link
        href="/notifications"
        onClick={() => setOpen(false)}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          isActive('/notifications')
            ? 'bg-brand-600 text-white shadow-sm'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        )}
      >
        <Bell className="h-[18px] w-[18px] shrink-0" />
        <span className="truncate">التنبيهات</span>
        {unread > 0 && (
          <span
            data-testid="unread-badge"
            className={cn(
              'mr-auto rounded-full px-2 py-0.5 text-xs font-bold',
              isActive('/notifications') ? 'bg-white text-brand-700' : 'bg-rose-500 text-white'
            )}
          >
            {unread}
          </span>
        )}
      </Link>

      {hasAnyPermission(user, 'canManageUsers', 'canManageRoles', 'canManageSettings') && (
        <>
          <div className="my-2 border-t border-slate-200" />
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive('/settings')
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            <Settings className="h-[18px] w-[18px] shrink-0" />
            <span>الإعدادات</span>
          </Link>
        </>
      )}
    </nav>
  );

  const footer = (
    <div className="border-t border-slate-200 p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <Avatar name={user.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">{user.name}</p>
          <p className="truncate text-xs text-slate-500">
            {user.roleLabel}
            {user.branchLabel ? ` · ${user.branchLabel}` : ''}
          </p>
        </div>
        <form method="post" action="/api/auth">
          <input type="hidden" name="mode" value="logout" />
          <button
            type="submit"
            title="تسجيل الخروج"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* الشريط الجانبي — سطح المكتب */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-l border-slate-200 bg-white lg:flex">
        <div className="border-b border-slate-200 px-4 py-4">
          <FastTransLogo />
          <span className="mt-2 block truncate text-xs text-slate-400">{COMPANY_AR}</span>
        </div>
        {nav}
        {footer}
      </aside>

      {/* الشريط العلوي — الجوال */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <FastTransMark className="h-8 w-[19px]" />
          <span className="truncate text-sm font-bold text-brand-600">FAST TRANS</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          aria-label="فتح القائمة"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* القائمة المنسدلة — الجوال */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 right-0 flex w-72 flex-col bg-white shadow-xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
              <FastTransLogo compact />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="إغلاق"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
            {footer}
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
