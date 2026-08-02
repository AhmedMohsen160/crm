/**
 * أجزاء المعرّفات التسلسلية الخالية من أي أثر جانبي.
 *
 * منفصلة عن `sequence.ts` لأن الأخير خادمي صرف (يلمس قاعدة البيانات)، بينما
 * هذه تُستخدم أيضًا في سكربتات التجهيز خارج Next.
 */

/** `YYMM` — جزء الشهر في `LD-2608-0001` و`PR-2608-0042` */
export function yearMonth(date = new Date()): string {
  const yy = String(date.getFullYear() % 100).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${yy}${mm}`;
}
