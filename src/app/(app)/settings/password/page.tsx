import { requireUser } from '@/lib/auth';
import { PageHeader, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'تغيير كلمة المرور' };

export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await requireUser();
  const { error, saved } = await searchParams;

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="تغيير كلمة المرور" subtitle={user.email ?? undefined} />

      <div className="card card-pad">
        <form method="post" action="/api/save" className="space-y-4">
          <input type="hidden" name="entity" value="password" />
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="back" value="/settings/password" />

          <ErrorAlert message={error} />

          {saved && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              تم تغيير كلمة المرور بنجاح.
            </div>
          )}

          <div>
            <label className="label" htmlFor="currentPassword">
              كلمة المرور الحالية
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              required
              dir="ltr"
              autoComplete="current-password"
              className="input text-left"
            />
          </div>

          <div>
            <label className="label" htmlFor="newPassword">
              كلمة المرور الجديدة
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              minLength={8}
              dir="ltr"
              autoComplete="new-password"
              className="input text-left"
            />
            <p className="mt-1 text-xs text-slate-400">8 أحرف على الأقل</p>
          </div>

          <div>
            <label className="label" htmlFor="confirmPassword">
              تأكيد كلمة المرور الجديدة
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              dir="ltr"
              autoComplete="new-password"
              className="input text-left"
            />
          </div>

          <SaveButton>تغيير كلمة المرور</SaveButton>
        </form>
      </div>
    </div>
  );
}
