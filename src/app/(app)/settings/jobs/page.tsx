import { Clock, CheckCircle2, AlertTriangle, CircleDashed } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { JOBS, lastOkKey, jobHealth, agoLabel, HEALTH_LABELS } from '@/lib/jobs';
import { formatDate } from '@/lib/utils';
import { PageHeader, Badge } from '@/components/ui';

export const metadata = { title: 'المهام المجدولة' };
export const dynamic = 'force-dynamic';

const TONE = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  late: 'border-rose-200 bg-rose-50 text-rose-700',
  never: 'border-slate-200 bg-slate-50 text-slate-500',
} as const;

/**
 * المهام المجدولة.
 *
 * **المهمة التي تموت صامتة تبقى ميتة شهورًا.** لا شيء يقع حين تتوقّف: فقط
 * تنبيهات تكفّ عن الوصول وبريدٌ يكفّ عن الدخول — ولا يعلم أحد. وهذه الشاشة
 * تجعل الصمت مرئيًّا: كل مهمة وآخر مرة نجحت فيها.
 */
export default async function JobsPage() {
  await requirePermission('canManageSettings');

  const rows = await db.setting.findMany({
    where: { key: { in: JOBS.map((j) => lastOkKey(j.key)) } },
    select: { key: true, value: true },
  });
  const lastOk = new Map(rows.map((r) => [r.key, r.value]));
  const now = new Date();

  const scheduled = JOBS.map((job) => {
    const raw = lastOk.get(lastOkKey(job.key));
    const at = raw ? new Date(raw) : null;
    const valid = at && !Number.isNaN(at.getTime()) ? at : null;
    return { job, at: valid, ...jobHealth(valid, job.everyMinutes, now) };
  });

  const troubled = scheduled.filter((s) => s.state !== 'ok');

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="المهام المجدولة"
        subtitle={
          troubled.length === 0
            ? 'كل المهام تعمل في مواعيدها'
            : `${troubled.length} مهمة تحتاج انتباهك`
        }
      />

      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>المهمة</th>
              <th>ماذا تفعل</th>
              <th>كل</th>
              <th>آخر نجاح</th>
              <th>الحال</th>
            </tr>
          </thead>
          <tbody>
            {scheduled.map(({ job, at, state, minutesAgo }) => (
              <tr key={job.key}>
                <td className="whitespace-nowrap font-medium text-slate-800">{job.label}</td>
                <td className="text-sm text-slate-600">{job.hint}</td>
                <td className="whitespace-nowrap text-sm text-slate-600">
                  {job.everyMinutes < 60
                    ? `${job.everyMinutes} دقيقة`
                    : `${job.everyMinutes / 60} ساعة`}
                </td>
                <td className="whitespace-nowrap text-sm text-slate-600">
                  {at ? (
                    <>
                      {formatDate(at)}
                      <span className="block text-[11px] text-slate-400">
                        {agoLabel(minutesAgo)}
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td>
                  <Badge className={TONE[state]}>
                    <span className="inline-flex items-center gap-1">
                      {state === 'ok' ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : state === 'late' ? (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      ) : (
                        <CircleDashed className="h-3.5 w-3.5" />
                      )}
                      {HEALTH_LABELS[state]}
                    </span>
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card card-pad space-y-3 text-sm text-slate-700">
        <h2 className="flex items-center gap-2 font-semibold text-slate-800">
          <Clock className="h-4 w-4 text-brand-600" />
          إن كانت «لم تعمل بعد»
        </h2>
        <p>
          المهام لا تعمل حتى يُضبط <b dir="ltr">CRON_SECRET</b> في إعدادات النشر. وهذا
          مقصود: مسارٌ يفتح صناديق البريد بلا حماية بابٌ مفتوح على بريد المكتب كلّه.
        </p>
        <p className="text-xs text-slate-500">
          وكل إخفاق يدخل «أعطال النظام» بسببه — لا يمرّ صامتًا.
        </p>
      </section>
    </div>
  );
}
