import { CheckCircle2, Target } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { listOptions } from '@/lib/reference';
import { formatMoney } from '@/lib/utils';
import { REVENUE_FILTER } from '@/lib/projects';
import { PageHeader, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';
import Link from '@/components/link';

export const metadata = { title: 'أهداف الفروع' };
export const dynamic = 'force-dynamic';

/** `YYYY-MM` للشهر الحالي أو المطلوب */
function periodKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return periodKey(d);
}

const MONTH_NAMES = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/**
 * التارجت الشهري لكل فرع — **يُعدَّل من هنا، لا من الكود**.
 *
 * سطر لكل (فرع، شهر): تعديل هدف هذا الشهر لا يمسّ هدف الشهر الماضي، فتبقى
 * المقارنات التاريخية صحيحة. عليه تقوم شرائح النسب لاحقًا.
 */
export default async function TargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; saved?: string; error?: string }>;
}) {
  const { period: requested, saved, error } = await searchParams;
  await requirePermission('canManageSettings');

  const period = /^\d{4}-\d{2}$/.test(requested ?? '') ? requested! : periodKey();

  const [branches, targets, achieved] = await Promise.all([
    listOptions('branch'),
    db.branchTarget.findMany({ where: { period } }),
    // المحقَّق = ما سُلّم أو حُصّل في هذا الشهر (§٣ بند ٤)
    db.project.groupBy({
      by: ['branch'],
      where: { ...REVENUE_FILTER, revenueMonth: period },
      _sum: { netTotal: true },
    }),
  ]);

  const targetMap = new Map(targets.map((t) => [t.branch, t.amount]));
  const achievedMap = new Map(achieved.map((a) => [a.branch ?? '', a._sum.netTotal ?? 0]));

  const totalTarget = branches.reduce((s, b) => s + (targetMap.get(b.value) ?? 0), 0);
  const totalAchieved = branches.reduce((s, b) => s + (achievedMap.get(b.value) ?? 0), 0);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="أهداف الفروع الشهرية"
        subtitle="التارجت الذي تُقاس عليه نسب المبيعات — يُعدَّل هنا في أي وقت"
      >
        <Link href={`/settings/targets/year?year=${period.slice(0, 4)}`} className="btn-primary">
          أدخل السنة كاملة
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />

      {saved && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          تم حفظ أهداف {periodLabel(period)}.
        </div>
      )}

      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          href={`/settings/targets?period=${shiftMonth(period, -1)}`}
          className="btn-secondary"
        >
          → الشهر السابق
        </Link>
        <span className="font-semibold text-slate-800">{periodLabel(period)}</span>
        <Link
          href={`/settings/targets?period=${shiftMonth(period, 1)}`}
          className="btn-secondary"
        >
          الشهر التالي ←
        </Link>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="card card-pad text-center">
          <p className="text-xl font-bold text-slate-900">{formatMoney(totalTarget)}</p>
          <p className="text-xs text-slate-500">إجمالي الهدف</p>
        </div>
        <div className="card card-pad text-center">
          <p className="text-xl font-bold text-emerald-700">{formatMoney(totalAchieved)}</p>
          <p className="text-xs text-slate-500">
            المحقَّق ({totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0}٪)
          </p>
        </div>
      </div>

      <form method="post" action="/api/save" className="space-y-4">
        <input type="hidden" name="entity" value="targets" />
        <input type="hidden" name="id" value="" />
        <input type="hidden" name="period" value={period} />
        <input type="hidden" name="back" value={`/settings/targets?period=${period}`} />

        <section className="card card-pad">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
            <Target className="h-4 w-4 text-brand-600" />
            هدف كل فرع
          </h2>

          <div className="space-y-3">
            {branches.map((b) => {
              const target = targetMap.get(b.value) ?? 0;
              const done = achievedMap.get(b.value) ?? 0;
              const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;

              return (
                <div key={b.value} className="grid items-center gap-3 sm:grid-cols-[1fr_10rem]">
                  <div>
                    <label className="label" htmlFor={`target_${b.value}`}>
                      {b.label}
                    </label>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-400 nums">
                      المحقَّق {formatMoney(done)} — {pct}٪
                    </p>
                  </div>
                  <input
                    id={`target_${b.value}`}
                    name={`target_${b.value}`}
                    type="number"
                    step="1000"
                    min="0"
                    defaultValue={target || ''}
                    placeholder="0"
                    dir="ltr"
                    className="input text-left"
                  />
                </div>
              );
            })}
          </div>
        </section>

        <SaveButton>حفظ أهداف {periodLabel(period)}</SaveButton>
      </form>

      <p className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
        تعديل هدف هذا الشهر <b>لا يمسّ</b> أهداف الشهور السابقة — لكل شهر سطره الخاص،
        فتبقى المقارنات التاريخية صحيحة.
      </p>
    </div>
  );
}
