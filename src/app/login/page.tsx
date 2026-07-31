import LoginForm from './login-form';

export const metadata = { title: 'تسجيل الدخول' };

const COMPANY_AR = process.env.NEXT_PUBLIC_COMPANY_NAME_AR || 'نظام إدارة العملاء';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-bl from-slate-100 via-slate-50 to-brand-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white shadow-lg shadow-brand-600/25">
            CRM
          </div>
          <h1 className="text-xl font-bold text-slate-900">{COMPANY_AR}</h1>
          <p className="mt-1 text-sm text-slate-500">نظام إدارة العملاء والمبيعات</p>
        </div>

        <div className="card card-pad">
          <LoginForm next={next ?? '/'} error={error} />
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          للمساعدة تواصل مع مدير النظام
        </p>
      </div>
    </main>
  );
}
