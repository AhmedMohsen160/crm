import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, can } from '@/lib/auth';
import { costIndicator } from '@/lib/project-costing';

/**
 * مؤشر التكلفة المجرّد — رقمان بلا أي إشارة إلى راتب أحد.
 *
 * الحساب كله في الخادم، فلا تصل معطيات الراتب إلى المتصفح إطلاقًا. من لا
 * يملك `canViewCostIndicator` لا يستقبل شيئًا — ولو نادى المسار مباشرة.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'غير مصرّح' }, { status: 401 });
  if (!can(user, 'canViewCostIndicator')) {
    return NextResponse.json({ error: 'لا صلاحية' }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const projectId = params.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'معرّف المشروع مفقود' }, { status: 400 });

  const rawRate = Number(params.get('externalRate'));

  const result = await costIndicator({
    projectId,
    producerId: params.get('producerId'),
    externalRate: Number.isFinite(rawRate) && rawRate > 0 ? rawRate : null,
  });

  return NextResponse.json(result);
}
