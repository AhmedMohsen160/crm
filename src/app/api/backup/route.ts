import { NextResponse } from 'next/server';
import { getCurrentUser, can } from '@/lib/auth';
import { auditEvent } from '@/lib/audit';
import { buildBackup, backupFileName } from '@/lib/backup';

/**
 * تنزيل نسخة احتياطية كاملة.
 *
 * **لمن يملك إعدادات النظام وحده** — الملف يحمل سجل العملاء والدفاتر كاملًا،
 * فهو أخطر ما يمكن أن يخرج من النظام في ملف واحد. ولذلك يُسجَّل كل تنزيل في
 * سجل التدقيق باسم من نزّله ووقته.
 *
 * ولا يحمل كلمة مرور ولا سرّ صندوق بريد — تُنقّى عند البناء.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'غير مصرّح' }, { status: 401 });
  if (!can(user, 'canManageSettings')) {
    return NextResponse.json({ error: 'لا صلاحية' }, { status: 403 });
  }

  const backup = await buildBackup();
  const total = Object.values(backup.counts).reduce((s, n) => s + n, 0);

  await auditEvent(user.id, 'export', 'Backup', 'full', `نسخة احتياطية — ${total} سجلًّا`);

  return new NextResponse(JSON.stringify(backup), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${backupFileName()}"`,
      // نسخةٌ تُخزَّن في ذاكرة الوسيط نسخةٌ تُسرَّب
      'cache-control': 'no-store, must-revalidate',
    },
  });
}
