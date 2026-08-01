/**
 * يتأكد من وجود حساب مدير نظام واحد على الأقل.
 *
 * يُنفَّذ تلقائيًا عند كل تشغيل على السيرفر. لا يفعل شيئًا إن كان الحساب
 * موجودًا بالفعل، فلا يمسّ بياناتك عند إعادة النشر.
 *
 * البريد وكلمة المرور يُقرآن من إعدادات السيرفر:
 *   ADMIN_EMAIL     (الافتراضي: admin@fasttrans.local)
 *   ADMIN_PASSWORD  (مطلوب — لن يُنشأ الحساب بدونه)
 *   ADMIN_NAME      (الافتراضي: مدير النظام)
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

async function main() {
  const existing = await db.user.count({ where: { role: 'ADMIN', active: true } });
  if (existing > 0) {
    console.log('  • حساب مدير النظام موجود بالفعل — لا تغيير');
    return;
  }

  const email = (process.env.ADMIN_EMAIL ?? 'admin@fasttrans.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? 'مدير النظام';

  if (!password || password.length < 8) {
    console.error(
      '  ✗ لا يوجد حساب مدير، ولم تُضبط ADMIN_PASSWORD (8 أحرف على الأقل).\n' +
        '    أضِفها في إعدادات السيرفر ثم أعِد التشغيل.'
    );
    process.exit(1);
  }

  await db.user.upsert({
    where: { email },
    update: { role: 'ADMIN', active: true },
    create: {
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: 'ADMIN',
      jobTitle: 'مدير المكتب',
    },
  });

  console.log(`  ✓ تم إنشاء حساب مدير النظام: ${email}`);
}

main()
  .catch((error) => {
    console.error('  ✗ فشل تجهيز حساب المدير:', error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
