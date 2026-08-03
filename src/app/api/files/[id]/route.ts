import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser, can } from '@/lib/auth';
import { contentDisposition } from '@/lib/files';

export const dynamic = 'force-dynamic';

/**
 * تنزيل ملف مرفوع.
 *
 * الملف يخرج **بصلاحية**: السيرة الذاتية جزء من ملفّ الفريلانسر، فمن لا يرى
 * الفريلانسرز لا يُنزّلها. ومسارٌ يعيد أي ملف بمعرّفه وحده هو تسريبٌ مؤجَّل.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse('غير مصرّح', { status: 401 });

  const { id } = await context.params;
  const file = await db.storedFile.findUnique({ where: { id } });
  if (!file) return new NextResponse('الملف غير موجود', { status: 404 });

  if (file.purpose === 'freelancer_cv' && !can(user, 'canManageFreelancers') && !can(user, 'canViewFreelancerCost')) {
    return new NextResponse('لا صلاحية', { status: 403 });
  }

  // الصور وPDF تُعرض داخل المتصفّح، وما عداها يُنزَّل — والعرض داخل الصفحة
  // مقصور عليهما فلا يُفتح مستند مجهول في سياق النظام
  const inline = file.mimeType === 'application/pdf' || file.mimeType.startsWith('image/');

  return new NextResponse(Buffer.from(file.data) as unknown as BodyInit, {
    headers: {
      'content-type': file.mimeType,
      'content-length': String(file.size),
      'content-disposition': contentDisposition(file.name, inline),
      // ملفّ خاص: لا يُخزَّن في وسيط مشترك
      'cache-control': 'private, max-age=0, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
