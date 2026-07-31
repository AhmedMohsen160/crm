import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { db } from './db';
import type { Role } from './constants';

const COOKIE_NAME = 'crm_session';
const SESSION_DAYS = 7;

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'AUTH_SECRET غير موجود أو قصير جدًا. أضِفه في ملف .env بقيمة نصية طويلة وعشوائية.'
    );
  }
  return new TextEncoder().encode(secret);
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

// ── كلمات المرور ───────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ── الجلسة ─────────────────────────────────────────────────────

export async function createSession(userId: string): Promise<void> {
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(secretKey());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires,
    path: '/',
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** يقرأ المستخدم الحالي من الكوكي — يرجع null إن لم يكن مسجّل الدخول */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey());
    const userId = payload.sub;
    if (typeof userId !== 'string') return null;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    if (!user || !user.active) return null;

    return { id: user.id, name: user.name, email: user.email, role: user.role as Role };
  } catch {
    return null;
  }
}

/** يفرض تسجيل الدخول — يحوّل لصفحة الدخول إن لم يكن مسجّلاً */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/** يفرض صلاحية معيّنة */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect('/');
  return user;
}

// ── قواعد الرؤية (من يرى ماذا) ─────────────────────────────────

/** المدير ومدير المبيعات يريان كل السجلات، الموظف يرى سجلاته فقط */
export function canSeeAll(user: SessionUser): boolean {
  return user.role === 'ADMIN' || user.role === 'MANAGER';
}

/** شرط Prisma لتصفية السجلات حسب صلاحية المستخدم */
export function ownerScope(user: SessionUser): { ownerId?: string } {
  return canSeeAll(user) ? {} : { ownerId: user.id };
}

export function isAdmin(user: SessionUser): boolean {
  return user.role === 'ADMIN';
}
