import { type NextRequest } from 'next/server';
import { redirectTo } from '@/lib/http';
import { db } from '@/lib/db';
import { createSession, destroySession, verifyPassword } from '@/lib/auth';
import { auditEvent } from '@/lib/audit';

/** تسجيل الدخول والخروج — نموذج عادي ثم تحويل */
export async function POST(request: NextRequest) {
  const fd = await request.formData();
  const mode = String(fd.get('mode') ?? 'login');

  if (mode === 'logout') {
    await destroySession();
    return redirectTo('/login');
  }

  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const password = String(fd.get('password') ?? '');
  const nextRaw = String(fd.get('next') ?? '/');
  const next = nextRaw.startsWith('/') ? nextRaw : '/';

  function fail(message: string) {
    const params = new URLSearchParams({ error: message });
    if (next !== '/') params.set('next', next);
    return redirectTo(`/login?${params.toString()}`);
  }

  if (!email || !password) return fail('من فضلك أدخل البريد الإلكتروني وكلمة المرور.');

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return fail('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
  }
  if (!user.active) return fail('هذا الحساب موقوف. تواصل مع مدير النظام.');

  await createSession(user.id);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await auditEvent(user.id, 'login', 'User', user.id);
  return redirectTo(next);
}
