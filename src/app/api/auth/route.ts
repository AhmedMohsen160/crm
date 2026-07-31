import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { createSession, destroySession, verifyPassword } from '@/lib/auth';

/** تسجيل الدخول والخروج — نموذج عادي ثم تحويل */
export async function POST(request: NextRequest) {
  const fd = await request.formData();
  const mode = String(fd.get('mode') ?? 'login');

  if (mode === 'logout') {
    await destroySession();
    return NextResponse.redirect(new URL('/login', request.url), 303);
  }

  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const password = String(fd.get('password') ?? '');
  const nextRaw = String(fd.get('next') ?? '/');
  const next = nextRaw.startsWith('/') ? nextRaw : '/';

  function fail(message: string) {
    const url = new URL('/login', request.url);
    url.searchParams.set('error', message);
    if (next !== '/') url.searchParams.set('next', next);
    return NextResponse.redirect(url, 303);
  }

  if (!email || !password) return fail('من فضلك أدخل البريد الإلكتروني وكلمة المرور.');

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return fail('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
  }
  if (!user.active) return fail('هذا الحساب موقوف. تواصل مع مدير النظام.');

  await createSession(user.id);
  return NextResponse.redirect(new URL(next, request.url), 303);
}
