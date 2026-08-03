import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser, can, ownerFilter } from '@/lib/auth';
import { searchClients } from '@/lib/clients';

/**
 * بحث العملاء أثناء الكتابة — بلا ضغط «إدخال».
 *
 * **والبحث الفارغ ليس فراغًا:** يُعيد أكثر العملاء تعاملًا (بعدد مشاريعهم)،
 * فمن يفتح الشاشة يجد من يبحث عنه غالبًا قبل أن يكتب حرفًا. وأغلب فتحات
 * هذه الشاشة تنتهي عند عميلٍ من هؤلاء.
 *
 * **والنطاق يدخل الاستعلام** لا يُرشَّح بعده: من لا يرى إلا عملاءه لا يصل
 * جهازَه عميلُ غيره أصلًا (§٣ بند ٢).
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'غير مصرّح' }, { status: 401 });

  const term = (request.nextUrl.searchParams.get('q') ?? '').trim();
  const scope = can(user, 'canViewAllLeads') ? {} : await ownerFilter(user);

  const select = {
    id: true,
    code: true,
    name: true,
    phone: true,
    type: true,
    companyName: true,
    city: true,
    createdAt: true,
  } as const;

  if (term) {
    const rows = await searchClients(term, scope, 30);
    return NextResponse.json({ clients: rows.map(shape), suggested: false });
  }

  // أكثر تعاملًا = أكثر مشاريع. والمتساوون يُرتَّبون بالأحدث تعاملًا.
  const rows = await db.client.findMany({
    where: scope,
    select: { ...select, _count: { select: { projects: true } } },
    orderBy: [{ projects: { _count: 'desc' } }, { updatedAt: 'desc' }],
    take: 20,
  });

  return NextResponse.json({
    clients: rows.map((row) => ({ ...shape(row), projects: row._count.projects })),
    suggested: true,
  });
}

function shape(row: {
  id: string;
  code: string | null;
  name: string;
  phone: string;
  type: string;
  companyName: string | null;
  city: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    phone: row.phone,
    type: row.type,
    companyName: row.companyName,
    city: row.city,
    createdAt: row.createdAt.toISOString(),
  };
}
