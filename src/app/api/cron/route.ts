import { type NextRequest, NextResponse } from 'next/server';
import { syncAllMailboxes } from '@/lib/email-engine';
import { runAllEvents } from '@/lib/notification-engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * المهام الدورية: سحب البريد وتوليد التنبيهات.
 *
 * تُنادى من جدولة خارجية (Vercel Cron أو أي منبّه) لا من متصفح، ولذلك تُحمى
 * بسرّ في متغيّرات البيئة: مسار يفتح صناديق البريد بلا حماية بابٌ مفتوح على
 * بريد المكتب كلّه.
 *
 * وإن لم يُضبط السرّ فالمسار **مغلق** لا مفتوح: الافتراض الآمن أن يتعطّل
 * الجدول حتى يُضبط، لا أن يعمل للجميع.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'يلزم ضبط CRON_SECRET قبل تشغيل المهام الدورية' },
      { status: 503 }
    );
  }

  const header = request.headers.get('authorization');
  const supplied = header?.startsWith('Bearer ')
    ? header.slice(7)
    : request.nextUrl.searchParams.get('key');
  if (supplied !== secret) {
    return NextResponse.json({ ok: false, error: 'غير مصرّح' }, { status: 401 });
  }

  const job = request.nextUrl.searchParams.get('job') ?? 'all';
  const out: Record<string, unknown> = { ranAt: new Date().toISOString() };

  try {
    if (job === 'all' || job === 'email') {
      out.email = await syncAllMailboxes(true);
    }
    if (job === 'all' || job === 'notifications') {
      out.notifications = await runAllEvents();
    }
    return NextResponse.json({ ok: true, ...out });
  } catch (error) {
    console.error('فشلت المهمة الدورية:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'عطل غير معروف', ...out },
      { status: 500 }
    );
  }
}
