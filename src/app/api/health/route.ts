import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * فحص صحة النظام — تستخدمه منصات الاستضافة للتأكد أن التطبيق يعمل.
 * يتحقق أيضًا من أن الاتصال بقاعدة البيانات سليم.
 */
export async function GET() {
  try {
    await db.$queryRawUnsafe('SELECT 1');
    return NextResponse.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error('فشل فحص الصحة:', error);
    return NextResponse.json({ status: 'error', database: 'unreachable' }, { status: 503 });
  }
}
