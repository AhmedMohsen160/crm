import { NextResponse } from 'next/server';

/**
 * تحويل المتصفح إلى مسار داخل النظام.
 *
 * نضع المسار كما هو (نسبيًا) في ترويسة Location بدل بناء عنوان كامل.
 * السبب: على السيرفر يعمل التطبيق خلف وسيط (proxy)، فيكون العنوان الذي
 * يراه التطبيق داخليًا هو http://0.0.0.0:3000 لا اسم النطاق الحقيقي —
 * فلو بنينا عنوانًا كاملًا لأُرسل المستخدم إلى عنوان داخلي لا يفتح عنده.
 * المسار النسبي يحلّه المتصفح على النطاق الصحيح دائمًا.
 *
 * ونتحقق أن المسار داخلي (يبدأ بـ /) حتى لا يُستغل لتحويل المستخدم
 * إلى موقع خارجي.
 */
export function redirectTo(path: string, fallback = '/'): NextResponse {
  const safe = path.startsWith('/') && !path.startsWith('//') ? path : fallback;
  return new NextResponse(null, {
    status: 303, // "شاهد النتيجة هنا" — يحوّل POST إلى GET
    headers: { Location: safe },
  });
}

/** تحويل مع إضافة رسالة خطأ إلى رابط الصفحة */
export function redirectWithError(path: string, message: string, fallback = '/'): NextResponse {
  const base = path.startsWith('/') && !path.startsWith('//') ? path : fallback;
  const [pathname, query = ''] = base.split('?');
  const params = new URLSearchParams(query);
  params.set('error', message);
  return redirectTo(`${pathname}?${params.toString()}`);
}
