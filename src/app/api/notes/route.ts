import { type NextRequest } from 'next/server';
import { redirectTo } from '@/lib/http';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { logActivity, readEntityLink, linkPath } from '@/lib/actions/helpers';

/**
 * إضافة ملاحظة عبر إرسال نموذج عادي (POST) ثم التحويل إلى نفس الصفحة.
 *
 * لماذا لا نستخدم Server Action هنا؟ لأن رحلة الـ Server Action كانت تتعطّل
 * أحيانًا في المتصفح: يُحفظ السجل على الخادم خلال أجزاء من الثانية، لكن
 * الواجهة تبقى معلّقة على "جارٍ الحفظ..." ولا تعرض ما حُفظ. هذا المسار
 * التقليدي (إرسال ثم تحويل) لا يعتمد على ذلك الآلية، فيعمل في كل مرة —
 * ويعمل أيضًا لو كان الجافاسكربت معطّلًا في المتصفح.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return redirectTo('/login');
  }

  const formData = await request.formData();
  const body = String(formData.get('body') ?? '').trim();
  const link = readEntityLink(formData);

  const requested = String(formData.get('redirectTo') ?? '');
  const back = redirectTo(requested, linkPath(link, '/'));

  if (!body) return back;

  await db.note.create({
    data: { body, authorId: user.id, ...link },
  });

  await logActivity({
    type: 'NOTE_ADDED',
    title: 'تمت إضافة ملاحظة',
    detail: body.slice(0, 120),
    userId: user.id,
    link,
  });

  return back;
}
