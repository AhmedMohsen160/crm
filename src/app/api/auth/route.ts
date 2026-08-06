import { type NextRequest } from 'next/server';
import { redirectTo } from '@/lib/http';
import { db } from '@/lib/db';
import { createSession, destroySession, hashPassword, verifyPassword } from '@/lib/auth';
import { auditEvent } from '@/lib/audit';
import { lockState, lockMessage, WINDOW_MS } from '@/lib/rate-limit';

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

  /**
   * **حدُّ المحاولات قبل أي شيء آخر.**
   * كلمة مرور من ثمانية أحرف تُخمَّن آليًّا في ساعات إن سُمح بآلاف المحاولات؛
   * وعشرُ محاولات في الربع ساعة تجعلها قرونًا. والعدّ في القاعدة لا في ذاكرة
   * الخادم، فلا يُلتفّ عليه بتوزيع الطلبات على نسخ الخادم.
   */
  const since = new Date(Date.now() - WINDOW_MS);
  const failures = await db.loginAttempt.findMany({
    where: { key: email, createdAt: { gte: since } },
    select: { createdAt: true },
    take: 50,
  });
  const lock = lockState(
    failures.map((f) => f.createdAt),
    new Date()
  );
  if (lock.locked) return fail(lockMessage(lock.retryAfterSeconds));

  async function reject() {
    await db.loginAttempt.create({ data: { key: email } });
    return fail('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
  }

  const user = await db.user.findUnique({ where: { email } });

  // المنفِّذ الداخلي سجلٌّ للإسناد لا حساب دخول: بلا كلمة مرور وبلا إذن دخول.
  // نردّ عليه نفس رسالة الخطأ العامة، فلا يكشف الردُّ من يملك حسابًا ومن لا.
  if (!user || !user.canLogin || !user.passwordHash) {
    /**
     * **وزنُ العمل نفسه لمن لا حساب له.** لولا هذا لعاد الردّ فورًا للبريد
     * غير الموجود وتأخّر للموجود، فيُعرف أصحابُ الحسابات من زمن الردّ وحده.
     */
    await hashPassword(password);
    return reject();
  }
  if (!(await verifyPassword(password, user.passwordHash))) return reject();
  if (!user.active) return fail('هذا الحساب موقوف. تواصل مع مدير النظام.');

  // نجح الدخول: يُمسح عدّاد الإخفاق فلا يعاقَب صاحبُه على أخطاء اليوم الماضية
  await db.loginAttempt.deleteMany({ where: { key: email } });

  await createSession(user.id);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await auditEvent(user.id, 'login', 'User', user.id);
  return redirectTo(next);
}
