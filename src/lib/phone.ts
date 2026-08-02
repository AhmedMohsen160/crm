/**
 * تطبيع الهاتف — القاعدة السباعية في §١٤ من المواصفة، حرفيًا.
 *
 * هذه أهم دالة في منع تكرار العملاء. المواصفة تحذّر صراحةً: بلا حذف محارف
 * الاتجاه (الخطوة ٢) نفقد نحو ١٠٪ من المطابقات، لأن الأرقام المنسوخة من
 * واتساب تحمل محارف اتجاه غير مرئية.
 *
 * تعمل في الخادم والمتصفح معًا — البحث الفوري يطبّع قبل الإرسال.
 */

/** ما يُخزَّن حين يتعذّر استخراج رقم صالح */
export const NO_PHONE = 'NO_PHONE';

/** محارف الاتجاه غير المرئية التي تلتصق بالأرقام المنسوخة */
const DIRECTION_MARKS = /[⁦-⁩‪-‮‎‏]/g;

/** الأرقام العربية والفارسية إلى لاتينية — يكتبها المستخدمون كثيرًا */
const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

function toLatinDigits(value: string): string {
  return value.replace(ARABIC_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

export type NormalizedPhone = {
  /** الرقم المطبَّع، أو NO_PHONE إن تعذّر */
  value: string;
  /** هل نتج رقم صالح للاستخدام مفتاحًا؟ */
  ok: boolean;
  /** سبب الرفض — يُعرض للمستخدم وللمراجعة اليدوية عند الترحيل */
  reason?: string;
};

/**
 * يطبّق الخطوات السبع بالترتيب:
 *   ١ احذف كل ما ليس رقمًا
 *   ٢ احذف محارف الاتجاه
 *   ٣ احذف "00" البادئة
 *   ٤ ١١ رقمًا يبدأ بـ01  → أضف 20
 *   ٥ ١٠ أرقام يبدأ بـ1   → أضف 20
 *   ٦ ١٢ رقمًا يبدأ بـ20  → اتركه
 *   ٧ "0" أو أقل من ٨ أرقام → NO_PHONE
 */
export function normalizePhone(raw: string | null | undefined): NormalizedPhone {
  if (!raw) return { value: NO_PHONE, ok: false, reason: 'لا رقم' };

  // ٢ ثم ١: حذف محارف الاتجاه أولًا ثم كل ما ليس رقمًا — النتيجة واحدة،
  // والترتيب هنا يجعل النية واضحة في الكود.
  const cleaned = toLatinDigits(String(raw))
    .replace(DIRECTION_MARKS, '')
    .trim()
    // الكسر العشري يُقطع قبل حذف الرموز، لا بعده: الرقم المخزَّن عددًا في
    // إكسل يخرج `201117741994.0`، ولو حذفنا النقطة أولًا لالتصق الصفر
    // بالرقم فصار ثلاثة عشر خانة ولم يطابق شيئًا. المواصفة تذكر هذه
    // القيمة بعينها مثالًا (§١٤).
    .replace(/\.\d+$/, '');

  let digits = cleaned.replace(/\D/g, '');

  // ٣ حذف بادئة الاتصال الدولي
  while (digits.startsWith('00')) digits = digits.slice(2);

  // ٧ (جزء أول) القيمة "0" أو الفارغة
  if (digits === '' || Number(digits) === 0) {
    return { value: NO_PHONE, ok: false, reason: 'رقم غير صالح' };
  }

  // ٤ رقم مصري محلي كامل
  if (digits.length === 11 && digits.startsWith('01')) {
    digits = '20' + digits.slice(1);
  }
  // ٥ رقم مصري فقد صفره البادئ (خُزّن عددًا في إكسل)
  else if (digits.length === 10 && digits.startsWith('1')) {
    digits = '20' + digits;
  }
  // ٦ رقم مصري بمفتاح الدولة — يُترك كما هو

  // ٧ (جزء ثانٍ) أقصر من أن يكون رقمًا
  if (digits.length < 8) {
    return { value: NO_PHONE, ok: false, reason: 'الرقم أقصر من ٨ أرقام' };
  }

  return { value: digits, ok: true };
}

/** للعرض: ‎+20 100 123 4567 */
export function formatPhone(normalized: string | null | undefined): string {
  if (!normalized || normalized === NO_PHONE) return '—';
  if (normalized.startsWith('20') && normalized.length === 12) {
    const rest = normalized.slice(2);
    return `+20 ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`;
  }
  return `+${normalized}`;
}

/** رابط واتساب مباشر — الفريق يتواصل به أكثر من الاتصال */
export function whatsappLink(normalized: string | null | undefined): string | null {
  if (!normalized || normalized === NO_PHONE) return null;
  return `https://wa.me/${normalized}`;
}
