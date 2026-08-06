import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, can, visibleUserIds } from '@/lib/auth';
import { teamClients } from '@/lib/clients';
import { periodRange } from '@/lib/client-segments';

/**
 * بحث العملاء أثناء الكتابة — بلا ضغط «إدخال».
 *
 * **والبحث الفارغ ليس فراغًا:** يُعيد سجلّ الفريق مرتَّبًا، فمن يفتح الشاشة
 * يجد من يبحث عنه غالبًا قبل أن يكتب حرفًا.
 *
 * **والنطاق والفلاتر تُحسب هنا كما تُحسب في الصفحة** — بنفس `teamClients`،
 * فلا تختلف نتيجة الكتابة عن نتيجة إعادة التحميل. ولا يصل جهازَ من لا يملك
 * رؤية السعر مبلغٌ أصلًا (§٣ بند ٢).
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'غير مصرّح' }, { status: 401 });

  const p = request.nextUrl.searchParams;
  const term = (p.get('q') ?? '').trim();
  const now = new Date();
  const { from, to } = periodRange(p.get('period') ?? undefined, now);

  const { rows, total } = await teamClients({
    ownerIds: await visibleUserIds(user),
    production: can(user, 'canAssignProduction') && !can(user, 'canViewSellPrice'),
    adminId: p.get('admin'),
    from,
    to,
    branch: p.get('branch'),
    type: p.get('type'),
    segment: p.get('segment'),
    term,
    sort: p.get('sort'),
    showValue: can(user, 'canViewSellPrice'),
    now,
  });

  return NextResponse.json({
    clients: rows.map((c) => ({
      ...c,
      lastDealAt: c.lastDealAt?.toISOString() ?? null,
    })),
    total,
    suggested: term === '',
  });
}
