/**
 * تنقية رسائل الأخطاء وتوقيعها — الوحدة الخالصة.
 *
 * **سجلُّ الأخطاء يُقرأ، فلا يُكتب فيه سرّ.** رسالة خطأ من قاعدة البيانات قد
 * تحمل رابط الاتصال بكلمة مروره، ورسالة من البريد قد تحمل كلمة مرور الصندوق.
 * وسجلٌّ يفتحه المالك على شاشته ليس مكانًا لهذه.
 *
 * **والتوقيع يمنع الغرق**: خطأٌ يتكرّر ألف مرة بطاقةٌ واحدة عدّادها ألف، لا
 * ألفُ بطاقة تُخفي ما عداها.
 */

/** أنماط ما لا يُكتب أبدًا — بقيمته لا باسمه */
const SECRET_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  // روابط اتصال بقواعد البيانات: postgres://user:PASS@host
  { pattern: /(\w+:\/\/[^:\s/]+:)[^@\s]+@/g, replacement: '$1***@' },
  // مفاتيح أنثروبيك ونظائرها — قبل الأنماط العامة، فهي أخصّ منها
  { pattern: /sk-[A-Za-z0-9_-]{8,}/g, replacement: 'sk-***' },
  { pattern: /(Bearer\s+)[\w.\-]+/gi, replacement: '$1***' },
  /**
   * مفاتيح ورموز بأشكالها الثلاثة: `KEY=value` و`"token": "value"` و
   * `secret: value`. والاسم قد يكون بين علامتَي اقتباس — ولذلك `["']?`
   * **بعد** الاسم وقبل النقطتين، وإلا مرّ الشكلُ الشائع في JSON بلا تنقية.
   */
  {
    pattern:
      /((?:password|passwd|secret|token|api[_-]?key|authorization)["']?\s*[:=]\s*)["']?[^\s"',;}]+/gi,
    replacement: '$1***',
  },
];

/** يُزيل ما لا يجوز أن يُكتب في سجلّ يُقرأ */
export function redactSecrets(text: string): string {
  let out = text;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/** أقصى ما يُخزَّن من نصّ — أثر التنفيذ يطول بلا فائدة بعد أوّله */
export const MAX_DETAIL = 4000;
export const MAX_MESSAGE = 500;

export function clamp(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/**
 * توقيع الخطأ — ما يجعل تكرارَه يُعرف.
 *
 * **تُحذف الأرقام والمعرّفات من الرسالة**، فخطأٌ على المشروع `cmsc…a` وآخر
 * على `cmsc…b` هما خطأٌ واحد يتكرّر لا خطآن مختلفان.
 */
export function signature(kind: string, message: string): string {
  const normalised = message
    .replace(/\b[a-z0-9]{20,}\b/gi, '#') // معرّفات cuid
    .replace(/\b\d+([.,]\d+)?\b/g, '#') // أي رقم
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return `${kind}:${clamp(normalised, 200)}`;
}

/** وصفٌ عربيّ لمصدر الخطأ — الشاشة لا تعرض مفاتيح إنجليزية */
export const ERROR_KINDS: Record<string, string> = {
  save: 'حفظ سجل',
  mutate: 'تعديل سريع',
  cron: 'المهام المجدولة',
  email: 'البريد',
  ai: 'الذكاء الاصطناعي',
  job: 'مهمة خلفية',
};

export function kindLabel(kind: string): string {
  return ERROR_KINDS[kind] ?? kind;
}
