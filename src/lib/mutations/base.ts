import 'server-only';
import { can } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { date } from '@/lib/utils';
import { endOfToday } from '@/lib/projects';

/**
 * كل عمليات الحفظ في النظام.
 *
 * تُستدعى من مسارات /api عبر إرسال نموذج عادي (POST) ثم تحويل إلى صفحة
 * النتيجة. اخترنا هذا الأسلوب بدل Server Actions لأن رحلة الـ Server Action
 * كانت تتعطّل أحيانًا في المتصفح: يُحفظ السجل على الخادم خلال أجزاء من
 * الثانية، لكن الواجهة تبقى معلّقة ولا تنتقل ولا تعرض ما حُفظ. الأسلوب
 * التقليدي يعمل في كل مرة، ويعمل أيضًا لو تعطّل الجافاسكربت.
 *
 * كل دالة تُعيد المسار الذي ننتقل إليه بعد الحفظ.
 */

export class MutationError extends Error {}

/**
 * يمنع من لا يرى إلا سجلاته من لمس سجل غيره.
 *
 * **يُصدَّر من هنا وحده** فلا تتعدّد نسخ `MutationError` بين الملفات: نسختان
 * من الصنف تعنيان أن `instanceof` يفشل في مسار الحفظ، فتضيع رسالة الخطأ
 * العربية ويُعرض «تعذّر الحفظ» مكانها.
 */
export function requireOwn(ownerId: string | null, user: SessionUser, message: string) {
  if (!can(user, 'canViewAllLeads') && ownerId !== user.id) throw new MutationError(message);
}

/** الموعد: «فوري» يعني نهاية اليوم، وإلا التاريخ المُدخَل */
export function readDeadline(fd: FormData) {
  const express = fd.get('isExpress') === 'on';
  return {
    isExpress: express,
    deadline: express ? endOfToday() : date(fd, 'deadline'),
  };
}
