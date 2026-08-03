import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser, can } from '@/lib/auth';
import { sanitizeHtml } from '@/lib/quote-design';

export const dynamic = 'force-dynamic';

/**
 * المستند المصمَّم كصفحة قائمة بذاتها — للعرض داخل الإطار وللطباعة.
 *
 * **حزامان لا واحد:** المستند مُعقَّم عند الحفظ وعند العرض، وفوق ذلك تُرسل
 * سياسة محتوى تمنع كل سكربت وكل جلب خارجي. لو أفلت سطرٌ من التعقيم فلن
 * ينفّذه المتصفّح أصلًا — والتعقيم بالأنماط وحده رهانٌ لا يُبنى عليه.
 */
const CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  'img-src data: https:',
  'font-src data:',
  "form-action 'none'",
  "frame-ancestors 'self'",
  "base-uri 'none'",
].join('; ');

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse('غير مصرّح', { status: 401 });
  if (!can(user, 'canViewSellPrice')) return new NextResponse('لا صلاحية', { status: 403 });

  const { id } = await context.params;
  const quote = await db.quote.findUnique({
    where: { id },
    select: { designHtml: true },
  });
  if (!quote?.designHtml) return new NextResponse('لا تصميم لهذا العرض', { status: 404 });

  return new NextResponse(sanitizeHtml(quote.designHtml), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': CSP,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'cache-control': 'private, no-store',
    },
  });
}
