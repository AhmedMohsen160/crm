import Link from '@/components/link';
import {
  Wallet,
  Landmark,
  AlertTriangle,
  FileClock,
  Lock,
  HandCoins,
  TrendingUp,
  Scale,
} from 'lucide-react';
import { db } from '@/lib/db';
import { type SessionUser } from '@/lib/auth';
import { profitAndLoss } from '@/lib/ledger';
import { fiscalMonth, monthRange } from '@/lib/accounting';
import { REVENUE_STATUSES } from '@/lib/projects';
import { ageReceivables, AGING_ORDER, AGING_LABELS } from '@/lib/receivables';
import { formatMoney } from '@/lib/utils';
import { PageHeader, StatCard, Badge } from '@/components/ui';

/**
 * لوحة الماليات — للمحاسب.
 *
 * **الأرقام التي تخصّ عمله لا عمل غيره.** كان المحاسب يفتح لوحةً مبنيّة
 * لأدمن المبيعات: مسار مبيعات وصفقات مفتوحة وترتيب البائعين — أرقامٌ لا
 * يملك منها قرارًا. فصارت لوحته تسأل أسئلته هو:
 *
 *   **كم عندنا نقدًا · كم لنا عند العملاء ومنذ متى · ما الذي ينتظر يدي
 *   الآن · وهل الشهر رابح.**
 *
 * والترتيب مقصود: النقد أولًا لأنه الذي يقتل الشركة حين ينفد، ثم الذمم لأنها
 * مصدره، ثم طابور العمل، ثم الربح — وهو آخرها لأنه لا يُدفع منه راتب.
 */
export default async function FinanceDashboard({ user }: { user: SessionUser }) {
  const now = new Date();
  const period = fiscalMonth(now);
  const { start, end } = monthRange(period);
  const monthEnd = new Date(end.getTime() - 1);

  const [
    cashParent,
    receivableProjects,
    draftCount,
    unpostedOldest,
    openPeriods,
    duePayments,
    pl,
  ] = await Promise.all([
    // الخزائن والبنوك — من الشجرة المزروعة لا بتخمين الأسماء
    db.account.findFirst({
      where: { nameEn: 'Cash and Cash Equivalents' },
      select: { id: true },
    }),
    db.project.findMany({
      where: { status: { in: REVENUE_STATUSES } },
      select: { netTotal: true, deposit: true, collectedAmount: true, deliveredAt: true },
    }),
    db.journalEntry.count({ where: { status: 'draft' } }),
    db.journalEntry.findFirst({
      where: { status: 'draft' },
      orderBy: { date: 'asc' },
      select: { period: true },
    }),
    db.journalEntry.groupBy({
      by: ['period'],
      where: { status: 'posted' },
      _count: { _all: true },
    }),
    db.freelancerPayment.aggregate({
      where: { status: 'due' },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    profitAndLoss({ from: start, to: monthEnd }),
  ]);

  // أرصدة النقد: كل ما تحت «النقدية وما في حكمها» مهما عمُق
  let cashBalance = 0;
  if (cashParent) {
    const ids = await descendantIds(cashParent.id);
    if (ids.length > 0) {
      const totals = await db.journalLine.aggregate({
        where: { accountId: { in: ids }, entry: { status: 'posted' } },
        _sum: { debitBase: true, creditBase: true },
      });
      cashBalance = (totals._sum.debitBase ?? 0) - (totals._sum.creditBase ?? 0);
    }
  }

  const aging = ageReceivables(
    receivableProjects.map((p) => ({
      outstanding: p.netTotal - p.deposit - p.collectedAmount,
      deliveredAt: p.deliveredAt,
    })),
    now
  );

  // الشهور المرحَّلة التي لم تُقفل — والشهر الجاري لا يُطالَب بإقفال
  const closed = await db.fiscalPeriod.findMany({
    where: { closedAt: { not: null } },
    select: { period: true },
  });
  const closedSet = new Set(closed.map((c) => c.period));
  const openBefore = openPeriods
    .map((p) => p.period)
    .filter((p) => p < period && !closedSet.has(p))
    .sort();

  const money = (n: number) => formatMoney(n, 'EGP');
  const queue = [
    {
      show: draftCount > 0,
      href: `/finance/journal?status=draft`,
      icon: FileClock,
      label: `${draftCount} قيدًا مسوَّدة تنتظر الترحيل`,
      hint: unpostedOldest ? `أقدمها في ${unpostedOldest.period}` : null,
    },
    {
      show: openBefore.length > 0,
      href: '/finance/periods',
      icon: Lock,
      label: `${openBefore.length} شهرًا مضى ولم يُقفل`,
      hint: `أقدمها ${openBefore[0]}`,
    },
    {
      show: (duePayments._count._all ?? 0) > 0,
      href: '/freelancers/payments',
      icon: HandCoins,
      label: `${duePayments._count._all} مستحقًّا للفريلانسرز ينتظر الصرف`,
      hint: money(duePayments._sum.amount ?? 0),
    },
  ].filter((row) => row.show);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`أهلًا، ${user.name.split(' ')[0]}`}
        subtitle={`الماليات — ${period}`}
      />

      {/* ── النقد والذمم ─────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="النقد والبنوك" value={money(cashBalance)} icon={<Landmark className="h-4 w-4" />} />
        <StatCard label="لنا عند العملاء" value={money(aging.total)} icon={<Wallet className="h-4 w-4" />} />
        <StatCard
          label="متأخر أكثر من ٩٠ يومًا"
          value={money(aging.atRisk)}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatCard label="مستحقّ لم يُسلَّم بعد" value={money(aging.notDue)} icon={<FileClock className="h-4 w-4" />} />
      </div>

      {/* ── أعمار الذمم ──────────────────────────────── */}
      <section className="card card-pad">
        <h2 className="mb-1 section-title">أعمار الذمم</h2>
        <p className="mb-4 text-xs text-slate-500">
          العمر من <b>تاريخ التسليم</b> — قبله لا شيء مستحقّ أصلًا.
        </p>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>الشريحة</th>
                <th>المبلغ</th>
                <th>من الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {AGING_ORDER.map((key) => {
                const amount = aging.buckets[key];
                const share = aging.total > 0 ? (amount / aging.total) * 100 : null;
                return (
                  <tr key={key}>
                    <td className="text-sm text-slate-700">{AGING_LABELS[key]}</td>
                    <td className="nums text-sm text-slate-800">{money(amount)}</td>
                    <td>
                      <Badge
                        className={
                          share === null
                            ? 'border-slate-200 bg-slate-50 text-slate-400'
                            : key === 'over90' && share > 0
                              ? 'border-rose-200 bg-rose-50 text-rose-700'
                              : 'border-slate-200 bg-slate-50 text-slate-600'
                        }
                      >
                        {share === null ? '—' : `${share.toFixed(0)}%`}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── طابور عمله ───────────────────────────────── */}
      <section className="card card-pad">
        <h2 className="mb-4 section-title">ما ينتظر يدك</h2>
        {queue.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            لا شيء معلَّق — الدفتر مرحَّل والشهور مقفلة والمستحقات مصروفة.
          </p>
        ) : (
          <ul className="space-y-2">
            {queue.map((row) => (
              <li key={row.href}>
                <Link
                  href={row.href}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-sm transition hover:border-brand-300 hover:bg-slate-50"
                >
                  <row.icon className="h-4 w-4 shrink-0 text-brand-600" />
                  <span className="font-medium text-slate-800">{row.label}</span>
                  {row.hint && <span className="text-xs text-slate-400">{row.hint}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── ربح الشهر ────────────────────────────────── */}
      <section className="card card-pad">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="section-title">شهر {period}</h2>
          <Link href="/finance/reports/pl" className="link text-xs">
            قائمة الدخل كاملة
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="الإيراد" value={money(pl.revenue)} icon={<TrendingUp className="h-4 w-4" />} />
          <StatCard label="تكلفة الإنتاج والتشغيل" value={money(pl.productionOperating)} />
          <StatCard label="بيعية وتسويقية" value={money(pl.sellingMarketing)} />
          <StatCard label="عمومية وإدارية" value={money(pl.generalAdmin)} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <StatCard label="الهامش المجمل" value={money(pl.grossProfit)} icon={<Scale className="h-4 w-4" />} />
          <StatCard label="صافي الشهر" value={money(pl.netProfit)} icon={<Scale className="h-4 w-4" />} />
        </div>
      </section>
    </div>
  );
}

/**
 * كل الحسابات تحت حسابٍ أب مهما عمُقت الشجرة.
 *
 * الشجرة أربعة مستويات، فالنزول محدود — والحلقة تقف عند مستوى بلا أبناء لا
 * عند عدد مثبَّت: شجرةٌ تعمّق يومًا لا تُسقط الرصيد صامتةً.
 */
async function descendantIds(rootId: string): Promise<string[]> {
  const collected: string[] = [];
  let frontier = [rootId];

  while (frontier.length > 0) {
    const children = await db.account.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    if (children.length === 0) break;
    frontier = children.map((c) => c.id);
    collected.push(...frontier);
  }

  return collected;
}
