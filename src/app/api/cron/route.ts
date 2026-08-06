import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { syncAllMailboxes } from '@/lib/email-engine';
import { runAllEvents } from '@/lib/notification-engine';
import { logError } from '@/lib/error-log-engine';
import { JOBS, JOB_KEYS, jobByKey, lastOkKey, hasBudget, type JobKey } from '@/lib/jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * المهام الدورية.
 *
 * تُنادى من جدولة خارجية لا من متصفح، ولذلك تُحمى بسرّ في متغيّرات البيئة:
 * مسار يفتح صناديق البريد بلا حماية بابٌ مفتوح على بريد المكتب كلّه. وإن لم
 * يُضبط السرّ فالمسار **مغلق** لا مفتوح.
 *
 * **وكل مهمة نداءٌ مستقلّ بجدوله** (`?job=email`). كانت تعمل كلها في نداء
 * واحد، ومع نموّ البيانات يتجاوز الطلبُ مهلة الدالة فيموت **صامتًا**: لا
 * رسالة خطأ، فقط تنبيهات تكفّ عن الوصول ولا يعلم أحد.
 *
 * **ولكل تشغيل ناجح بصمةٌ تُقرأ في الشاشة** — فمهمةٌ لم تعمل منذ يومين تُرى.
 * وكل إخفاق يدخل سجلّ الأعطال، فلا يمرّ في سجلّ نصّي لا يفتحه أحد.
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

  const requested = request.nextUrl.searchParams.get('job') ?? 'all';
  if (requested !== 'all' && !jobByKey(requested)) {
    return NextResponse.json(
      { ok: false, error: `مهمة غير معروفة: ${requested}`, known: JOB_KEYS },
      { status: 400 }
    );
  }

  const queue: JobKey[] = requested === 'all' ? JOBS.map((j) => j.key) : [requested as JobKey];

  const startedAt = Date.now();
  const done: Record<string, unknown> = {};
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const key of queue) {
    /**
     * **الأمانة أهم من الإتمام.** حين ينفد الوقت نتوقّف ونقول ما لم يُنفَّذ،
     * ولا نُكمل حتى تقتلنا المهلة فيبدو الأمر كأن كل شيء تمّ.
     */
    if (!hasBudget(startedAt, Date.now())) {
      skipped.push(key);
      continue;
    }

    try {
      done[key] = key === 'email' ? await syncAllMailboxes(true) : await runAllEvents();

      // بصمة النجاح — يقرؤها المالك في «المهام المجدولة»
      await db.setting.upsert({
        where: { key: lastOkKey(key) },
        create: { key: lastOkKey(key), value: new Date().toISOString() },
        update: { value: new Date().toISOString() },
      });
    } catch (error) {
      failed.push(key);
      // المهمة التي تفشل صامتةً تبقى فاشلة شهورًا — تدخل سجلّ الأعطال
      await logError({ kind: 'cron', error, path: key });
      console.error(`فشلت المهمة الدورية ${key}:`, error);
    }
  }

  const body = {
    ok: failed.length === 0,
    ranAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    done,
    ...(skipped.length ? { skipped } : {}),
    ...(failed.length ? { failed } : {}),
  };

  return NextResponse.json(body, { status: failed.length ? 500 : 200 });
}
