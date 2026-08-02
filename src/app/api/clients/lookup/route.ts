import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { findClientByPhone } from '@/lib/clients';
import { normalizePhone } from '@/lib/phone';

/**
 * بحث فوري بالهاتف — يناديه حقل الهاتف في شاشة «ليد جديد» أثناء الكتابة.
 *
 * نداء `fetch` مباشر لا تنقّل من جهة المتصفح، فلا يمسّ مسار التنقّل الذي
 * ثبت تعطّله. الاستجابة JSON صغيرة، والمعيار ≤٣٠٠ ملّي ثانية (§١٥).
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'غير مصرّح' }, { status: 401 });

  const raw = request.nextUrl.searchParams.get('phone') ?? '';
  const { ok } = normalizePhone(raw);
  if (!ok) return NextResponse.json({ found: false, valid: false });

  const client = await findClientByPhone(raw);
  if (!client) return NextResponse.json({ found: false, valid: true });

  return NextResponse.json({
    found: true,
    valid: true,
    client: {
      id: client.id,
      code: client.code,
      name: client.name,
      phone: client.phone,
      companyName: client.companyName,
      dealCount: client.dealCount,
      totalValue: client.totalValue,
      lastDealAt: client.lastDealAt,
    },
  });
}
