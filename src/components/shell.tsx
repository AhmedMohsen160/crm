'use client';

import { useState } from 'react';
import Link from '@/components/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  UserPlus,
  Building2,
  Users,
  Handshake,
  ListChecks,
  FileText,
  Settings,
  Menu,
  X,
  LogOut,
} from 'lucide-react';
import { hasAnyPermission } from '@/lib/permissions';
import type { SessionUser } from '@/lib/auth';
import { Avatar } from '@/components/ui';
import { cn } from '@/lib/utils';

const COMPANY_AR = process.env.NEXT_PUBLIC_COMPANY_NAME_AR || 'نظام إدارة العملاء';

const NAV = [
  { href: '/', label: 'لوحة التحكم', icon: LayoutDashboard, exact: true },
  { href: '/leads', label: 'العملاء المحتملون', icon: UserPlus },
  { href: '/companies', label: 'الشركات', icon: Building2 },
  { href: '/contacts', label: 'جهات الاتصال', icon: Users },
  { href: '/deals', label: 'الصفقات', icon: Handshake },
  { href: '/quotes', label: 'عروض الأسعار', icon: FileText },
  { href: '/tasks', label: 'المهام', icon: ListChecks },
];

export default function Shell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
      {NAV.map((item) => {
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
      })}

      {hasAnyPermission(user, 'canManageUsers', 'canManageSettings') && (
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
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
            CRM
          </div>
          <span className="truncate text-sm font-bold text-slate-800">{COMPANY_AR}</span>
        </div>
        {nav}
        {footer}
      </aside>

      {/* الشريط العلوي — الجوال */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-[10px] font-bold text-white">
            CRM
          </div>
          <span className="truncate text-sm font-bold text-slate-800">{COMPANY_AR}</span>
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
              <span className="truncate text-sm font-bold text-slate-800">{COMPANY_AR}</span>
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
