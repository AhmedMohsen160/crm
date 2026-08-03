import 'server-only';
import { can } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { date } from '@/lib/utils';
import { endOfToday } from '@/lib/projects';
import { readDiscountFields } from '@/lib/costing';

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

/**
 * قيمة الخصم — **والنسبة تُكتب مئويّة لا عشريّة**.
 *
 * كانت خانة النسبة تطلب `0.1` لتعني ١٠٪، بينما شاشة عرض السعر تطلب `10`
 * لنفس المعنى. فشاشتان بوحدتين، ومن يكتب `10` في الأولى يمنح خصم ألف
 * بالمئة. الآن تُكتب مئويّةً في الشاشتين، وتُحوَّل هنا إلى النسبة العشرية
 * التي يخزّنها النظام — فلا تتغيّر دلالة رقمٍ محفوظ ولا حسابُ خصمٍ ماضٍ.
 *
 * ويقبل الاسمين معًا: `discountPercent` من الشاشات الجديدة، و`discountValue`
 * من أي نموذج قديم — فلا ينكسر شيء لم يُحدَّث بعد.
 */
export function readDiscount(fd: FormData): { type: string | null; value: number | null } {
  return readDiscountFields({
    type: String(fd.get('discountType') ?? '').trim() || null,
    percent: numberOrNull(fd.get('discountPercent')),
    value: numberOrNull(fd.get('discountValue')),
  });
}

function numberOrNull(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? '').trim();
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
