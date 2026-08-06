/**
 * تحديد محاولات الدخول — الوحدة الخالصة.
 *
 * **بابٌ بلا حدٍّ لمحاولات الفتح مفتوحٌ لمن يملك الوقت.** كلمة مرور من ثمانية
 * أحرف تُخمَّن آليًّا في ساعات إن سُمح بآلاف المحاولات في الدقيقة؛ وحدُّ عشر
 * محاولات في الربع ساعة يجعلها قرونًا.
 *
 * والحدّ **على البريد لا على الجهاز وحده**: من يبدّل عنوان شبكته كل محاولة
 * لا يُوقفه حدُّ الجهاز، لكنه لا يستطيع أن يبدّل البريد الذي يهاجمه.
 */

/** عدد الإخفاقات المسموح بها قبل الإيقاف */
export const MAX_FAILURES = 10;

/** نافذة العدّ بالملّي ثانية — ربع ساعة */
export const WINDOW_MS = 15 * 60 * 1000;

export type LockState = {
  locked: boolean;
  /** كم بقي من الثواني حتى تُفتح المحاولة التالية */
  retryAfterSeconds: number;
  /** كم محاولة بقيت قبل الإيقاف */
  remaining: number;
};

/**
 * هل بلغ هذا المفتاح حدَّه؟
 *
 * `failures` أوقاتُ الإخفاقات داخل النافذة، والأحدث أولًا أو آخرًا — لا فرق،
 * نأخذ أقدمَها لنعرف متى تنقضي.
 *
 * **والحدّ يُبلَغ لا يُتجاوَز** (`>=`): العاشرة توقف، ولا ننتظر الحادية عشرة.
 */
export function lockState(
  failures: Date[],
  now: Date,
  max = MAX_FAILURES,
  windowMs = WINDOW_MS
): LockState {
  const recent = failures.filter((f) => now.getTime() - f.getTime() < windowMs);

  if (recent.length < max) {
    return { locked: false, retryAfterSeconds: 0, remaining: max - recent.length };
  }

  const oldest = recent.reduce((a, b) => (a.getTime() < b.getTime() ? a : b));
  const elapsed = now.getTime() - oldest.getTime();
  return {
    locked: true,
    retryAfterSeconds: Math.max(1, Math.ceil((windowMs - elapsed) / 1000)),
    remaining: 0,
  };
}

/** رسالة الإيقاف بالعربية — بالدقائق لا بالثواني حين تطول */
export function lockMessage(retryAfterSeconds: number): string {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return minutes > 1
    ? `محاولات كثيرة متتالية. حاول بعد ${minutes} دقيقة.`
    : 'محاولات كثيرة متتالية. حاول بعد دقيقة.';
}
