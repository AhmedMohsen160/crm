import { PrismaClient } from '@prisma/client';
import { isPostgres } from './utils';

// نستخدم نسخة واحدة من الاتصال بقاعدة البيانات لتجنّب فتح اتصالات كثيرة أثناء التطوير
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaTuned?: Promise<void>;
};

function createClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

/**
 * ضبط SQLite لتحمّل القراءة والكتابة في نفس الوقت.
 *
 * لماذا؟ SQLite في وضعه الافتراضي يسمح بعملية واحدة فقط على الملف في اللحظة
 * الواحدة. وبما أن الصفحات تقرأ من القاعدة أثناء عرضها، كانت عملية الحفظ
 * تصطدم بقفل القراءة فتتوقف بلا نهاية: يُحفظ السجل الأول ثم يتجمّد الطلب،
 * فيبقى الزر على "جارٍ الحفظ..." ولا يرى المستخدم ما حفظه.
 *
 *   journal_mode = WAL  → يسمح لعدة قرّاء بالعمل بالتوازي مع كاتب واحد.
 *   busy_timeout = 5000 → بدل الفشل الفوري عند التزاحم، ينتظر حتى 5 ثوانٍ.
 *   synchronous = NORMAL→ أداء أفضل مع بقاء الأمان في وضع WAL.
 *
 * تُنفَّذ مرة واحدة لكل عملية تشغيل.
 */
async function tuneSqlite() {
  // على السيرفر نستخدم PostgreSQL، وهذه الإعدادات خاصة بـ SQLite فقط
  if (isPostgres()) return;

  try {
    await db.$executeRawUnsafe('PRAGMA journal_mode = WAL;');
    await db.$executeRawUnsafe('PRAGMA busy_timeout = 5000;');
    await db.$executeRawUnsafe('PRAGMA synchronous = NORMAL;');
  } catch (error) {
    console.error('تعذّر ضبط إعدادات SQLite:', error);
  }
}

// نضمن تنفيذها مرة واحدة فقط حتى مع إعادة تحميل الوحدات أثناء التطوير
export const dbReady: Promise<void> = (globalForPrisma.prismaTuned ??= tuneSqlite());

if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaTuned = dbReady;
