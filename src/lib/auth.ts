import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { db } from './db';
import {
  PERMISSION_KEYS,
  hasPermission,
  hasAnyPermission,
  type Permission,
  type Scope,
} from './permissions';

const COOKIE_NAME = 'crm_session';
const SESSION_DAYS = 7;

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'AUTH_SECRET غير موجود أو قصير جدًا. أضِفه في إعدادات النظام بقيمة نصية طويلة وعشوائية.'
    );
  }
  return new TextEncoder().encode(secret);
}

export type SessionUser = {
  id: string;
  name: string;
  /** فارغ للمنفِّذ الداخلي الذي لا يدخل النظام */
  email: string | null;
  /** مفتاح الدور — للعرض فقط. **لا تبنِ عليه شرطًا**، استخدم can() */
  roleName: string;
  roleLabel: string;
  branch: string | null;
  /** اسم الفرع بالعربية — للعرض فقط */
  branchLabel: string | null;
  reportsToId: string | null;
  isProducer: boolean;
  permissions: Record<Permission, boolean>;
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

/** كل الصلاحيات مغلقة — الافتراضي الآمن لمستخدم بلا دور */
function noPermissions(): Record<Permission, boolean> {
  return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false])) as Record<
    Permission,
    boolean
  >;
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
      include: { roleRef: true },
    });
    // سجلّ المنفِّذ الداخلي لا يصلح جلسةً ولو حمل رمزًا بطريقة ما
    if (!user || !user.active || !user.canLogin) return null;

    const permissions = noPermissions();
    if (user.roleRef) {
      for (const key of PERMISSION_KEYS) {
        permissions[key] = Boolean(user.roleRef[key]);
      }
    }

    const branchLabel = user.branch
      ? (
          await db.listItem.findUnique({
            where: { listName_value: { listName: 'branch', value: user.branch } },
            select: { label: true },
          })
        )?.label ?? user.branch
      : null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roleName: user.roleRef?.name ?? '',
      roleLabel: user.roleRef?.label ?? 'بلا دور',
      branch: user.branch,
      branchLabel,
      reportsToId: user.reportsToId,
      isProducer: user.isProducer,
      permissions,
    };
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

// ── الصلاحيات ──────────────────────────────────────────────────

/** هل يملك المستخدم هذه الصلاحية؟ — الدالة الوحيدة المسموح بها للفحص */
export function can(user: SessionUser, permission: Permission): boolean {
  return hasPermission(user, permission);
}

/** هل يملك أيًّا من هذه الصلاحيات؟ */
export function canAny(user: SessionUser, ...permissions: Permission[]): boolean {
  return hasAnyPermission(user, ...permissions);
}

/**
 * يفرض **أيًّا** من صلاحيات — يحوّل للوحة التحكم إن لم يملك واحدةً منها.
 *
 * لازمة للشاشات التي يبلغها أكثر من دور بطرق مختلفة: سجل الليدز يبلغه من
 * يراها كلها ومن يرى ليدز فريقه ومن ينشئ ليدًا — وثلاثتها صلاحيات مستقلّة.
 *
 * **وإخفاء الرابط من القائمة ليس حجبًا**: من يعرف المسار يكتبه. الحجب يقع
 * في الصفحة نفسها.
 */
export async function requireAnyPermission(
  ...permissions: Permission[]
): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasAnyPermission(user, ...permissions)) redirect('/');
  return user;
}

/** يفرض صلاحية — يحوّل للوحة التحكم إن لم يملكها */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, permission)) redirect('/');
  return user;
}

// ── نطاق الرؤية ────────────────────────────────────────────────

/**
 * ما الذي يراه هذا المستخدم من السجلات؟
 *   all  → كل الشركة
 *   team → هو ومن يتبعونه إداريًا (reportsTo)
 *   self → سجلاته وحده
 */
export function scopeOf(user: SessionUser): Scope {
  if (can(user, 'canViewAllLeads')) return 'all';
  if (can(user, 'canViewTeamLeads')) return 'team';
  return 'self';
}

/**
 * معرّفات المستخدمين الذين تدخل سجلاتهم في نطاق رؤية هذا المستخدم.
 * يرجع null حين يكون النطاق «الكل» (لا ترشيح).
 *
 * **الترشيح يقع في الخادم** — لا يُرسل سجل خارج النطاق ثم يُخفى في الواجهة.
 */
export async function visibleUserIds(user: SessionUser): Promise<string[] | null> {
  const scope = scopeOf(user);
  if (scope === 'all') return null;
  if (scope === 'self') return [user.id];

  // نطاق الفريق: هو + كل من يتبعه (بأي عمق)
  const ids = new Set<string>([user.id]);
  let frontier = [user.id];

  // شجرة الإدارة قد تكون بأكثر من مستوى — نتوسّع حتى لا يبقى جديد
  while (frontier.length > 0) {
    const reports = await db.user.findMany({
      where: { reportsToId: { in: frontier } },
      select: { id: true },
    });
    frontier = reports.map((r) => r.id).filter((id) => !ids.has(id));
    frontier.forEach((id) => ids.add(id));
  }

  return [...ids];
}

/** شرط Prisma جاهز للترشيح حسب النطاق على حقل مالك السجل */
export async function ownerFilter(
  user: SessionUser,
  field = 'ownerId'
): Promise<Record<string, unknown>> {
  const ids = await visibleUserIds(user);
  if (ids === null) return {};
  return { [field]: { in: ids } };
}

/**
 * تقييد الرؤية بالفرع.
 * مفعَّل حسب إعداد النظام `restrict_by_branch` — والإدارة قرّرت تفعيله.
 * من يملك رؤية كل الليدز لا يُقيَّد.
 */
export async function branchFilter(
  user: SessionUser
): Promise<Record<string, unknown>> {
  if (can(user, 'canViewAllLeads')) return {};
  if (!user.branch) return {};

  const row = await db.setting.findUnique({ where: { key: 'restrict_by_branch' } });
  // الافتراضي المزروع `true` — الغياب يعني «لم يُزرع بعد» لا «معطَّل»
  if (row && row.value !== 'true') return {};

  return { branch: user.branch };
}
