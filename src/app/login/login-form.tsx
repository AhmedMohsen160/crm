import { ErrorAlert } from '@/components/ui';

/**
 * نموذج الدخول — إرسال تقليدي إلى /api/auth ثم تحويل.
 * لا يحتاج جافاسكربت، ويعرض سبب الفشل عبر رابط الصفحة.
 */
export default function LoginForm({
  next,
  error,
}: {
  next: string;
  error?: string;
}) {
  return (
    <form method="post" action="/api/auth" className="space-y-4">
      <input type="hidden" name="mode" value="login" />
      <input type="hidden" name="next" value={next} />

      <ErrorAlert message={error} />

      <div>
        <label className="label" htmlFor="email">
          البريد الإلكتروني
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          dir="ltr"
          placeholder="you@company.com"
          className="input text-left"
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          كلمة المرور
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          dir="ltr"
          placeholder="••••••••"
          className="input text-left"
        />
      </div>

      <button type="submit" className="btn-primary w-full">
        دخول
      </button>
    </form>
  );
}
