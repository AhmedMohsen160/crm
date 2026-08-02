import Link from '@/components/link';
import {
  BookOpen, Scale, TrendingUp, Target, Building2, Landmark,
  FileStack, Lock, Wallet, AlertTriangle, Sparkles,
} from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { profitAndLoss, balanceSheetTotals } from '@/lib/ledger';
import { fiscalMonth, fiscalMonthLabel, monthRange, yearRange } from '@/lib/accounting';
import { formatMoney } from '@/lib/utils';
import { PageHeader, StatCard, Badge } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'الماليات' };
export const dynamic = 'force-dynamic';

/**
 * لوحة الماليات — أول ما يفتحه المحاسب صباحًا.
 *
 * ترتيبها يتبع سؤاله لا هيكل قاعدة البيانات: ماذا في دفتري اليوم · ما الذي
 * ينتظر مراجعتي · كيف يقف الشهر · وأين أدخل.
 */
export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requirePermission('canManageAccounting');
  const { period: requested } = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(requested ?? '') ? requested! : fiscalMonth(new Date());
  const year = Number(period.slice(0, 4));

  const { start, end } = monthRange(period);
  const yr = yearRange(year);

  const [monthPL, yearPL, sheet, drafts, closed, dueFreelancers, receivables] = await Promise.all([
    profitAndLoss({ from: start, to: end }),
    profitAndLoss({ from: yr.start, to: yr.end }),
    balanceSheetTotals(end),
    db.journalEntry.count({ where: { period, status: 'draft' } }),
    db.fiscalPeriod.findUnique({ where: { period } }),
    db.freelancerPayment.aggregate({ where: { status: 'due' }, _sum: { amount: true } }),
    db.project.aggregate({
      where: { status: 'delivered' },
      _sum: { netTotal: true, deposit: true, collectedAmount: true },
    }),
  ]);

  const outstanding =
    (receivables._sum.netTotal ?? 0) -
    (receivables._sum.deposit ?? 0) -
    (receivables._sum.collectedAmount ?? 0);

  const cards = [
    { href: '/finance/journal', icon: BookOpen, title: 'دفتر اليومية', desc: 'تحرير القيود ومراجعتها وترحيلها' },
    { href: '/finance/accounts', icon: FileStack, title: 'شجرة الحسابات', desc: 'أربعة مستويات — تُضاف وتُعطَّل من هنا' },
    { href: '/finance/reports/pl', icon: TrendingUp, title: 'قائمة الدخل', desc: 'بالفروع وبالشهور — البنود الثلاثة' },
    { href: '/finance/reports/trial', icon: Scale, title: 'ميزان المراجعة', desc: 'أرصدة كل حساب ومجموعا العمودين' },
    { href: '/finance/reports/branches', icon: Building2, title: 'كشف الفروع', desc: 'مبيعات ومصاريف وعمولات كل فرع' },
    { href: '/finance/budget', icon: Target, title: 'الموازنة السنوية', desc: 'المستهدف الشهري وانحرافه عن الفعلي' },
    { href: '/finance/assets', icon: Landmark, title: 'الأصول الثابتة', desc: 'التكلفة والإهلاك والقيمة الدفترية' },
    { href: '/finance/periods', icon: Lock, title: 'إقفال الشهور', desc: 'الشهر المقفل لا يُعدَّل' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="الماليات"
        subtitle={`${fiscalMonthLabel(period)} — دفتر مزدوج القيد مربوط بالمبيعات والمشاريع`}
      />

      {drafts > 0 && (
        <Link
          href={`/finance/journal?period=${period}&status=draft`}
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <b>{drafts}</b> قيدًا مسوَّدة تنتظر مراجعتك — منها ما اقترحه النظام من
            التسليمات والتحصيلات والمصروفات.
          </span>
        </Link>
      )}

      {closed?.closedAt && (
        <p className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <Lock className="h-4 w-4 shrink-0" />
          {fiscalMonthLabel(period)} <b>شهر مقفل</b> — لا تحرير ولا ترحيل فيه.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={`إيراد ${fiscalMonthLabel(period)}`}
          value={formatMoney(monthPL.revenue)}
          hint={`السنة ${formatMoney(yearPL.revenue)}`}
          icon={<TrendingUp className="h-5 w-5" />}
          accent="brand"
        />
        <StatCard
          label="مجمل الربح"
          value={formatMoney(monthPL.grossProfit)}
          hint={`هامش ${(monthPL.grossMarginPct * 100).toFixed(1)}٪`}
          icon={<Sparkles className="h-5 w-5" />}
          accent="emerald"
        />
        <StatCard
          label="صافي الربح"
          value={formatMoney(monthPL.netProfit)}
          hint={`هامش ${(monthPL.netMarginPct * 100).toFixed(1)}٪`}
          icon={<Scale className="h-5 w-5" />}
          accent={monthPL.netProfit >= 0 ? 'emerald' : 'rose'}
        />
        <StatCard
          label="مستحقات علينا وللغير"
          value={formatMoney(dueFreelancers._sum.amount ?? 0)}
          hint={`ومستحق لنا لدى العملاء ${formatMoney(Math.max(0, outstanding))}`}
          icon={<Wallet className="h-5 w-5" />}
          accent="amber"
        />
      </div>

      {/* ── هيكل المصروف: البنود الثلاثة ─────────────────────── */}
      <section className="card card-pad">
        <h2 className="mb-1 section-title">هيكل المصروف هذا الشهر</h2>
        <p className="mb-4 text-xs text-slate-500">
          نسبة كل بند من الإيراد — وهي ما يُقارَن شهرًا بشهر وسنةً بسنة.
        </p>
        <div className="space-y-3">
          {[
            { label: 'تشغيلية وإنتاجية', value: monthPL.productionOperating, pct: monthPL.structure.productionOperatingPct, colour: 'bg-brand-500' },
            { label: 'بيعية وتسويقية', value: monthPL.sellingMarketing, pct: monthPL.structure.sellingMarketingPct, colour: 'bg-violet-500' },
            { label: 'عمومية وإدارية', value: monthPL.generalAdmin, pct: monthPL.structure.generalAdminPct, colour: 'bg-amber-500' },
          ].map((row) => (
            <div key={row.label}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-slate-700">{row.label}</span>
                <span className="nums text-slate-600">
                  {formatMoney(row.value)} · {(row.pct * 100).toFixed(1)}٪
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${row.colour}`}
                  style={{ width: `${Math.min(100, row.pct * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          إجمالي المصروف <b className="nums">{(monthPL.structure.totalPct * 100).toFixed(1)}٪</b> من
          الإيراد
          {monthPL.otherIncome !== 0 && (
            <> · وفروق العملة <b className="nums">{formatMoney(monthPL.otherIncome)}</b></>
          )}
        </p>
      </section>

      {/* ── توليد المقترحات ──────────────────────────────────── */}
      {!closed?.closedAt && (
        <section className="card card-pad">
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-800">
            <Sparkles className="h-4 w-4 text-brand-600" />
            اقترِح قيود {fiscalMonthLabel(period)} من المشغّل
          </h2>
          <p className="mb-4 text-sm text-slate-600">
            يمسح النظام تسليمات الشهر وتحصيلاته ومستحقات الفريلانسرز المصروفة
            واستحقاق العمولات وإهلاك الأصول، ويكتب لك <b>مسوَّدات</b> جاهزة.
            لا يُرحَّل منها شيء إلا بيدك — الدفتر ملكك.
          </p>
          <form method="post" action="/api/save" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="entity" value="journal.generate" />
            <input type="hidden" name="period" value={period} />
            <input type="hidden" name="back" value={`/finance?period=${period}`} />
            <SaveButton>توليد المسوَّدات</SaveButton>
          </form>
        </section>
      )}

      {/* ── الميزانية ────────────────────────────────────────── */}
      <section className="card card-pad">
        <h2 className="mb-3 section-title">
          المركز المالي حتى {fiscalMonthLabel(period)}
          {sheet.balanced ? (
            <Badge className="mr-2 border-emerald-200 bg-emerald-50 text-emerald-700">متوازن</Badge>
          ) : (
            <Badge className="mr-2 border-rose-200 bg-rose-50 text-rose-700">
              فرق {formatMoney(sheet.difference)}
            </Badge>
          )}
        </h2>
        <dl className="grid gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">الأصول</dt>
            <dd className="nums text-lg font-bold text-slate-800">{formatMoney(sheet.assets)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">الالتزامات</dt>
            <dd className="nums text-lg font-bold text-slate-800">{formatMoney(sheet.liabilities)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">حقوق الملكية</dt>
            <dd className="nums text-lg font-bold text-slate-800">{formatMoney(sheet.equity)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">أرباح الفترة</dt>
            <dd className="nums text-lg font-bold text-slate-800">{formatMoney(sheet.profit)}</dd>
          </div>
        </dl>
        {!sheet.balanced && (
          <p className="mt-3 rounded-lg bg-rose-50 px-4 py-3 text-xs text-rose-800">
            الأصول لا تساوي الالتزامات + حقوق الملكية. الخلل في الترحيل لا في
            التقرير — راجع ميزان المراجعة.
          </p>
        )}
      </section>

      {/* ── الأبواب ──────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href} className="card card-pad hover:shadow-md">
              <Icon className="mb-2 h-5 w-5 text-brand-600" />
              <p className="font-semibold text-slate-800">{card.title}</p>
              <p className="mt-1 text-xs text-slate-500">{card.desc}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
