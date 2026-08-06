import 'server-only';
import { db } from './db';
import { redactSecrets, clamp, signature, MAX_DETAIL, MAX_MESSAGE } from './error-log';

/**
 * تسجيل خطأ وقع في الخادم.
 *
 * **لا أحد يعرف أن شيئًا انكسر حتى يشتكي موظف** — وأغلب الأعطال لا يشتكي منها
 * أحد: يلتفّ الموظف حولها ويكمل يومه، فتبقى شهورًا. هذه الدالة تجعل العطل
 * يصل صاحب القرار بلا وسيط.
 *
 * **وهي لا ترمي أبدًا.** خطأٌ في تسجيل الأخطاء لا يجوز أن يُسقط العملية التي
 * كان يراقبها؛ فشلُ الكتابة يُطبع في السجلّ النصّي وينتهي الأمر.
 */
export async function logError(input: {
  kind: string;
  error: unknown;
  path?: string | null;
  userId?: string | null;
}): Promise<void> {
  try {
    const raw =
      input.error instanceof Error
        ? input.error.message
        : typeof input.error === 'string'
          ? input.error
          : JSON.stringify(input.error);

    const message = clamp(redactSecrets(raw || 'خطأ بلا رسالة'), MAX_MESSAGE);
    const stack =
      input.error instanceof Error && input.error.stack
        ? clamp(redactSecrets(input.error.stack), MAX_DETAIL)
        : null;

    const key = signature(input.kind, message);

    /**
     * **بطاقة واحدة لكل خطأ متكرّر.** لولا الجمع لأغرق عطلٌ واحد يقع مع كل
     * طلبٍ الشاشةَ بآلاف الصفوف فأخفى ما عداه — وهو الدرس نفسه الذي تعلّمناه
     * في التنبيهات (٤٦ بطاقة لحدثين).
     */
    const existing = await db.errorLog.findFirst({
      where: { kind: input.kind, message },
      select: { id: true, count: true },
      orderBy: { createdAt: 'desc' },
    });

    if (existing && signature(input.kind, message) === key) {
      await db.errorLog.update({
        where: { id: existing.id },
        data: {
          count: existing.count + 1,
          seen: false, // تكرارُه بعد الاطّلاع خبرٌ جديد
          detail: stack,
          path: input.path ? clamp(input.path, 200) : undefined,
        },
      });
      return;
    }

    await db.errorLog.create({
      data: {
        kind: input.kind,
        message,
        detail: stack,
        path: input.path ? clamp(input.path, 200) : null,
        userId: input.userId ?? null,
      },
    });
  } catch (failure) {
    // لا نُسقط العملية لأن تسجيل خطئها فشل
    console.error('تعذّر تسجيل الخطأ:', failure);
  }
}

/** عدد الأخطاء غير المطّلع عليها — لشارة الإعدادات */
export async function unseenErrorCount(): Promise<number> {
  return db.errorLog.count({ where: { seen: false } });
}
