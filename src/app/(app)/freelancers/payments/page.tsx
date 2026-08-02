import Link from '@/components/link';
import { Wallet, CheckCircle2 } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { agingBucket } from '@/lib/freelancer-engine';
import { PAYMENT_STATUSES } from '@/lib/freelancers';
import { formatMoney, formatDate } from '@/lib/utils';
import { PageHeader, StatCard, Badge, EmptyState, ErrorAlert } from '@/components/ui';
import { FilterBar, FilterSelect } from '@/components/filters';

export const metadata = { title: 'مستحقات الفريلانسرز' };
export const dynamic = 'force-dynamic';

const AGING_LABEL = {
  fresh: 'أقل من ٧ أيام',
  mid: '٧ إلى ٣٠ يومًا',
  late: 'أكثر من ٣٠ يومًا',
} as const;

/**
 * حساب دائنين مستقل عن حساب العملاء (§٤.٦).
 *
 * السطر يُنشأ **تلقائيًا** عند إسناد خطوة لفريلانسر، والمحاسب يدخل ليؤكد
 * الإرسال. ولا يُحذف سطر أبدًا: يتغيّر حاله ويُوقَّع بمن صرف ومتى.
 */
export default async function FreelancerPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string; saved?: string }>;
}) {
  const { status, error, saved } = await searchParams;
  await requirePermission('canPayFreelancers');

  const where = status ? { status } : { status: { in: ['due', 'held'] } };

  const [payments, dueSum, lateCount] = await Promise.all([
    db.freelancerPayment.findMany({
      where,
      include: {
        freelancer: { select: { id: true, name: true, paymentMethod: true, paymentRef: true } },
        project: { select: { id: true, code: true, title: true } },
        paidBy: { select: { name: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    }),
    db.freelancerPayment.aggregate({ where: { status: 'due' }, _sum: { amount: true } }),
    db.freelancerPayment.count({
      where: { status: 'due', createdAt: { lt: new Date(Date.now() - 30 * 86_400_000) } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="مستحقات الفريلانسرز"
        subtitle="حساب دائنين مستقل — السطر يُنشأ عند الإسناد، وأنت تؤكد الإرسال"
      >
        <Link href="/freelancers" className="btn-secondary">
          سجل الفريلانسرز
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />

      {saved && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          تم — والسطر باقٍ في السجل موقَّعًا باسمك وتاريخه.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="إجمالي المستحق الآن"
          value={formatMoney(dueSum._sum.amount ?? 0)}
          icon={<Wallet className="h-5 w-5" />}
          accent="amber"
        />
        <StatCard
          label="متأخر أكثر من ٣٠ يومًا"
          value={String(lateCount)}
          hint={lateCount > 0 ? 'يستحق ملخصًا أسبوعيًا للماليات (§١٢)' : 'لا متأخرات'}
          accent={lateCount > 0 ? 'rose' : 'emerald'}
        />
        <StatCard label="سطور معروضة" value={String(payments.length)} accent="slate" />
      </div>

      <FilterBar>
        <FilterSelect
          name="status"
          defaultValue={status}
          placeholder="المستحق والمعلَّق"
          options={Object.entries(PAYMENT_STATUSES).map(([value, label]) => ({ value, label }))}
        />
      </FilterBar>

      {payments.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Wallet className="h-10 w-10" />}
            title="لا مستحقات"
            description="سطر الاستحقاق يُنشأ تلقائيًا لحظة إسناد خطوة تنفيذ لفريلانسر."
          />
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>الفريلانسر</th>
                <th>المشروع</th>
                <th>المبلغ</th>
                <th>العمر</th>
                <th>الحال</th>
                <th>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const bucket = agingBucket(p.dueDate ?? p.createdAt);
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/freelancers/${p.freelancer.id}`} className="link font-medium">
                        {p.freelancer.name}
                      </Link>
                      {p.freelancer.paymentMethod && (
                        <span className="block text-xs text-slate-400">
                          {p.freelancer.paymentMethod}
                          {p.freelancer.paymentRef ? ` · ${p.freelancer.paymentRef}` : ''}
                        </span>
                      )}
                    </td>
                    <td>
                      {p.project ? (
                        <Link href={`/projects/${p.project.id}`} className="link">
                          {p.project.title}
                        </Link>
                      ) : (
                        '—'
                      )}
                      <span className="block text-xs text-slate-400" dir="ltr">
                        {p.project?.code}
                      </span>
                    </td>
                    <td className="nums font-semibold">{formatMoney(p.amount, p.currency)}</td>
                    <td>
                      <Badge
                        className={
                          bucket === 'late'
                            ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : bucket === 'mid'
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-slate-200 bg-slate-50 text-slate-600'
                        }
                      >
                        {AGING_LABEL[bucket]}
                      </Badge>
                      <span className="block text-xs text-slate-400">
                        منذ {formatDate(p.createdAt)}
                      </span>
                    </td>
                    <td>
                      <Badge
                        className={
                          p.status === 'paid'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : p.status === 'held'
                              ? 'border-slate-200 bg-slate-100 text-slate-500'
                              : 'border-amber-200 bg-amber-50 text-amber-700'
                        }
                      >
                        {PAYMENT_STATUSES[p.status as keyof typeof PAYMENT_STATUSES] ?? p.status}
                      </Badge>
                      {p.paidBy && (
                        <span className="block text-xs text-slate-400">
                          أكّده {p.paidBy.name}
                        </span>
                      )}
                    </td>
                    <td>
                      {p.status !== 'paid' && (
                        <div className="flex flex-wrap items-center gap-2">
                          <form method="post" action="/api/save" className="flex items-center gap-1">
                            <input type="hidden" name="entity" value="freelancerPayment" />
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="action" value="pay" />
                            <input type="hidden" name="back" value="/freelancers/payments" />
                            <input
                              name="reference"
                              placeholder="رقم التحويل"
                              className="input w-28 py-1 text-xs"
                            />
                            <button type="submit" className="btn-primary btn-sm whitespace-nowrap">
                              تأكيد الإرسال
                            </button>
                          </form>
                          <form method="post" action="/api/save">
                            <input type="hidden" name="entity" value="freelancerPayment" />
                            <input type="hidden" name="id" value={p.id} />
                            <input
                              type="hidden"
                              name="action"
                              value={p.status === 'held' ? 'release' : 'hold'}
                            />
                            <input type="hidden" name="back" value="/freelancers/payments" />
                            <button type="submit" className="text-xs text-slate-500 hover:underline">
                              {p.status === 'held' ? 'رفع التعليق' : 'تعليق'}
                            </button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
