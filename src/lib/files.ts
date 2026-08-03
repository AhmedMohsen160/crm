/**
 * قواعد رفع الملفات — بلا قاعدة بيانات ولا قرص.
 *
 * الفحص كلّه هنا ليُختبر بلا خادم: النوع والحجم والاسم. والملف الذي يمرّ من
 * هنا هو وحده ما يُحفظ.
 */

/** أقصى حجم مقبول — خمسة ميجابايت. السيرة الذاتية مستند لا مكتبة صور */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * الأنواع المقبولة للسيرة الذاتية.
 *
 * لا نقبل `.zip` ولا `.exe` ولا HTML: نحن نخزّن الملف ونعيده للتنزيل، وملفٌ
 * تنفيذي أو صفحة HTML يُفتح في متصفّح موظف بابٌ لا داعي له.
 */
export const CV_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/rtf': 'rtf',
  'text/plain': 'txt',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type FileCheck =
  | { ok: true; name: string; mimeType: string; size: number }
  | { ok: false; error: string };

/** يقلّم اسم الملف من المسارات والمحارف التي تكسر ترويسة التنزيل */
export function safeFileName(raw: string): string {
  const base = (raw ?? '')
    .split(/[\\/]/)
    .pop()!
    // محارف التحكّم وعلامة التنصيص تكسر ترويسة `Content-Disposition`
    .replace(/[\u0000-\u001f\u007f"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cleaned = base || 'ملف';
  return cleaned.length > 120 ? cleaned.slice(-120) : cleaned;
}

/** يفحص ملفًا قادمًا من نموذج قبل حفظه */
export function checkUpload(
  file: { name: string; type: string; size: number } | null | undefined,
  allowed: Record<string, string> = CV_MIME_TYPES,
  maxBytes = MAX_FILE_BYTES
): FileCheck {
  if (!file || !file.size) return { ok: false, error: 'لم يُرفع ملف' };

  if (file.size > maxBytes) {
    return {
      ok: false,
      error: `حجم الملف ${formatBytes(file.size)} ويتجاوز الحدّ المسموح ${formatBytes(maxBytes)}`,
    };
  }

  // بعض المتصفحات ترسل نوعًا فارغًا — نستدلّ عندها بالامتداد
  const type = file.type || mimeFromName(file.name, allowed) || '';
  if (!allowed[type]) {
    return {
      ok: false,
      error: `صيغة غير مقبولة${file.type ? ` (${file.type})` : ''} — المقبول: ${extensionList(allowed)}`,
    };
  }

  return { ok: true, name: safeFileName(file.name), mimeType: type, size: file.size };
}

/** يستنتج النوع من الامتداد حين لا يرسله المتصفّح */
export function mimeFromName(name: string, allowed = CV_MIME_TYPES): string | null {
  const ext = safeFileName(name).split('.').pop()?.toLowerCase();
  if (!ext) return null;
  for (const [mime, e] of Object.entries(allowed)) {
    if (e === ext) return mime;
    if (ext === 'jpeg' && e === 'jpg') return mime;
  }
  return null;
}

export function extensionList(allowed = CV_MIME_TYPES): string {
  return [...new Set(Object.values(allowed))].map((e) => `.${e}`).join(' · ');
}

/** سمة `accept` لخانة الرفع — تمنع اختيار ما سيُرفض أصلًا */
export function acceptAttribute(allowed = CV_MIME_TYPES): string {
  return [...Object.keys(allowed), ...Object.values(allowed).map((e) => `.${e}`)].join(',');
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}

/**
 * ترويسة اسم الملف عند التنزيل.
 *
 * الاسم العربي لا يمرّ في `filename=` — لأنها لاتينية صرف — فيصل مشوَّهًا.
 * `filename*` بترميز UTF-8 هي التي تحمله، ونُبقي الاسم اللاتيني احتياطًا
 * للمتصفّحات القديمة.
 */
export function contentDisposition(name: string, inline = false): string {
  const safe = safeFileName(name);
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_') || 'file';
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
