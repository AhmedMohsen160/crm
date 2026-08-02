import Link from '@/components/link';
import { Lock, LockOpen, CheckCircle2 } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { fiscalMonth, fiscalMonthLabel, shiftMonth } from '@/lib/accounting';
import { formatDate } from '@/lib/utils';
import { PageHeader, Badge, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'إقفال الشهور' };
export const dynamic = 'force-dynamic';

/**
 * إقفال الشهور المحاسبية.
 *
 * **الشهر المقفل لا يُعدَّل ولا يُرحَّل فيه ولا يُلغى منه قيد.** وهذا ما يجعل
 * قائمة دخل الشهر الماضي رقمًا يُعتمد لا لقطةً تتغيّر.
 *
 * ولا يُقفل شهر وفيه مسوَّدة معلّقة — المسوَّدة عملٌ لم يُراجَع، والإقفال
 * فوقها يخفيه بدل أن يحسمه.
 */
export default async function FiscalPeriodsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requirePermission('canManageAccounting');
  const { saved, error } = await searchParams;

  const current = fiscalMonth(new Date());
  // اثنا عشر شهرًا للخلف — مدى العمل الفعلي
  const periods = Array.from({ length: 12 }, (_, i) => shiftMonth(current, -i));

  const [rows, drafts, posted] = await Promise.all([
    db.fiscalPeriod.findMany({
      where: { period: { in: periods } },
      include: { closedBy: { select: { name: true } } },
    }),
    db.journalEntry.groupBy({
      by: ['period'],
      where: { period: { in: periods }, status: 'draft' },
      _count: true,
    }),
    db.journalEntry.groupBy({
      by: ['period'],
      where: { period: { in: periods }, status: 'posted' },
      _count: true,
    }),
  ]);

  const byPeriod = new Map(rows.map((r) => [r.period, r]));
  const draftCount = new Map(drafts.map((d) => [d.period, d._count]));
  const postedCount = new Map(posted.map((p) => [p.period, p._count]));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="إقفال الشهور" subtitle="الشهر المقفل رقمٌ يُعتمد لا لقطة تتغيّر">
        <Link href="/finance" className="btn-secondary">
          لوحة الماليات
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />

      {saved && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          تم.
        </div>
      )}

      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>الشهر</th>
              <th>القيود</th>
              <th>الحال</th>
              <th>الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => {
              const row = byPeriod.get(period);
              const closed = Boolean(row?.closedAt);
              const openDrafts = draftCount.get(period) ?? 0;
              return (
                <tr key={period}>
                  <td className="font-medium text-slate-800">{fiscalMonthLabel(period)}</td>
                  <td className="text-xs text-slate-500">
                    {postedCount.get(period) ?? 0} مرحَّل
                    {openDrafts > 0 && (
                      <span className="mr-1 text-amber-600">· {openDrafts} مسوَّدة</span>
                    )}
                  </td>
                  <td>
                    {closed ? (
                      <>
                        <Badge className="border-slate-300 bg-slate-100 text-slate-600">مقفل</Badge>
                        {row?.closedBy && (
                          <span className="block text-xs text-slate-400">
                            {row.closedBy.name} · {formatDate(row.closedAt!)}
                          </span>
                        )}
                      </>
                    ) : (
                      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">مفتوح</Badge>
                    )}
                  </td>
                  <td>
                    <form method="post" action="/api/save" className="flex items-center gap-2">
                      <input type="hidden" name="entity" value="fiscalPeriod" />
                      <input type="hidden" name="period" value={period} />
                      <input type="hidden" name="action" value={closed ? 'open' : 'close'} />
                      <input type="hidden" name="back" value="/finance/periods" />
                      {closed ? (
                        <button type="submit" className="btn-secondary btn-sm">
                          <LockOpen className="h-3.5 w-3.5" />
                          إعادة الفتح
                        </button>
                      ) : (
                        <SaveButton>
                          <Lock className="h-3.5 w-3.5" />
                          إقفال
                        </SaveButton>
                      )}
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <b>لا يُقفل شهر وفيه مسوَّدة معلّقة.</b> المسوَّدة عملٌ لم يُراجَع بعد،
        والإقفال فوقها يخفيه بدل أن يحسمه — فرحّلها أو ألغِها أولًا. وإعادة الفتح
        متاحة، وكل إقفال وفتح مسجَّل باسم صاحبه في سجل التدقيق.
      </p>
    </div>
  );
}
