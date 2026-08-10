import Link from '@/components/link';
import { Megaphone, AlertTriangle, Settings2 } from 'lucide-react';
import { requirePermission, can } from '@/lib/auth';
import { listOptions } from '@/lib/reference';
import { acquisitionReport, marketingAccounts } from '@/lib/acquisition-engine';
import { SPEND_CHANNELS, UNATTRIBUTED } from '@/lib/acquisition';
import { formatMoney } from '@/lib/utils';
import { PageHeader, StatCard, SelectField, EmptyState } from '@/components/ui';
import { SaveButton } from '@/components/forms';
import { BarList } from '@/components/chart';

export const metadata = { title: 'تكلفة اكتساب العميل' };
export const dynamic = 'force-dynamic';

/**
 * تكلفة اكتساب العميل — الشاشة التي تقرّر أين يوضع المال الإعلاني.
 *
 * **وطرفاها من مصدرين لكلٍّ سيّدُه:** الإنفاق من دفتر الأستاذ كما قيّده
 * المحاسب، والليدز من القمع. ولا خانةَ إدخالٍ ثالثة: رقمان لشيء واحد
 * يختلفان ولا يُعرف أيّهما الصحيح.
 *
 * **ولماذا لم تظهر قبل اليوم:** القسمة كانت تربط القناة برمز الحساب،
 * وحسابات المحاسب المرحَّلة بلا رموز — فوقع إنفاق المكتب كلُّه في «غير
 * منسوب». والعلاج جدولُ الضبط في آخر الشاشة: يُضبط مرة واحدة على الحساب.
 */
export default async function AcquisitionPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; branch?: string; mapped?: string }>;
}) {
  const user = await requirePermission('canViewTeamAnalytics');
  const params = await searchParams;

  const now = new Date();
  const year = Number(params.year) || now.getUTCFullYear();
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  const branch = params.branch || null;

  const [report, accounts, branches] = await Promise.all([
    acquisitionReport({ from, to, branch }),
    can(user, 'canManageAccounting') ? marketingAccounts({ from, to }) : Promise.resolve([]),
    listOptions('branch'),
  ]);

  const { summary } = report;
  const years = [year + 1, year, year - 1, year - 2, year - 3].filter((y) => y >= 2022);

  /** «غير مقيس» تُعرض `—` لا صفرًا: الصفر يعني «أُنفق ولم يأتِ أحد» */
  const na = (value: number | null, render: (v: number) => string) =>
    value === null ? '—' : render(value);

  return (
    <div className="space-y-6">
      <PageHeader
        title="تكلفة اكتساب العميل"
        subtitle="ما أنفقه المكتب على كل قناة مقسومًا على من جاء منها — لا على من اشترى وحده"
      >
        <Link href="/analytics" className="btn-secondary">
          التحليلات
        </Link>
      </PageHeader>

      {/* ── المدى ────────────────────────────────────────────── */}
      <form method="get" className="card card-pad grid gap-4 sm:grid-cols-3">
        <SelectField
          label="السنة"
          name="year"
          defaultValue={String(year)}
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
        />
        <SelectField
          label="الفرع"
          name="branch"
          defaultValue={branch ?? ''}
          options={branches}
          placeholder="— كل الفروع —"
          hint="الفروع بدأت ٢٠٢٦ — وما قبلها بلا فرع"
        />
        <div className="flex items-end">
          <button type="submit" className="btn-primary">
            اعرض
          </button>
        </div>
      </form>

      {params.mapped && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          ضُبطت قناة الإنفاق لـ<b className="nums"> {params.mapped} </b>حسابًا — والأرقام أعلاه
          أُعيد حسابها.
        </div>
      )}

      {/* ── الخلاصة ──────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="الإنفاق التسويقي" value={formatMoney(summary.spend)} />
        <StatCard label="ليدز" value={String(summary.leads)} />
        <StatCard
          label="تكلفة الليد"
          value={na(summary.costPerLead, formatMoney)}
          hint="الإنفاق ÷ كل من تواصل"
        />
        <StatCard
          label="تكلفة العميل المكتسب"
          value={na(summary.costPerWon, formatMoney)}
          hint={`${summary.won} عميلًا اشترى فعلًا`}
        />
      </div>

      {/**
        * **وما لم يُنسب يُصرَخ به لا يُخفى.**
        *
        * إنفاقٌ خارج القسمة يجعل تكلفة الليد أقلّ من حقيقتها — فيبدو الإعلان
        * أرخص ممّا هو، وعلى هذا الرقم يُزاد الإنفاق.
        */}
      {report.unattributedSpend > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            إنفاقٌ تسويقيّ بلا قناة: {formatMoney(report.unattributedSpend)}
          </p>
          <p className="mt-1 text-xs leading-relaxed">
            هذا المبلغ <b>خارج القسمة</b>، فتكلفةُ الليد أعلاه أقلّ من حقيقتها. وحساباتُه:{' '}
            {report.unmapped.map((a) => `${a.name} (${formatMoney(a.amount)})`).join(' · ')}.
            {can(user, 'canManageAccounting') && ' اضبط قناة كلٍّ منها في جدول آخر الصفحة.'}
          </p>
        </div>
      )}

      {/* ── القنوات ──────────────────────────────────────────── */}
      <section className="card card-pad">
        <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-800">
          <Megaphone className="h-4 w-4 text-brand-600" />
          كل قناة بتكلفتها
        </h2>
        <p className="mb-4 text-xs leading-relaxed text-slate-500">
          <b>تكلفة الليد</b> تُقسم على كل من تواصل — لا على من اشترى وحده، وإلا بدا الإعلان
          أرخص ممّا هو. و<b>تكلفة العميل المكتسب</b> تقسم نفس الإنفاق على من دفع فعلًا.
          و<b>العائد</b> إيرادُ ما سُلّم من القناة ÷ إنفاقها.
        </p>

        {summary.rows.length === 0 ? (
          <EmptyState
            title="لا إنفاق ولا ليدز في هذا المدى"
            description="ارفع دفتر السنة وشيت الليدز من «ترحيل تاريخ المكتب»"
            actionHref="/settings/import/history"
            actionLabel="ترحيل تاريخ المكتب"
          />
        ) : (
          <>
            <BarList
              rows={summary.rows
                .filter((r) => r.leads > 0)
                .map((r) => ({
                  key: r.channel,
                  label: r.label,
                  value: r.leads,
                  display: `${r.leads} ليدًا`,
                  // ★ ومع كل شريط رقمُه — والمعنى لا يعتمد على الطول وحده
                  hint:
                    r.costPerLead === null
                      ? 'لا إنفاق منسوب لهذه القناة'
                      : `تكلفة الليد ${formatMoney(r.costPerLead)}`,
                  tone: r.channel === UNATTRIBUTED ? ('warn' as const) : ('default' as const),
                }))}
              emptyLabel="لا ليدز في هذا المدى"
            />
            <div className="mt-4 overflow-x-auto">
              <table className="tbl tbl-wide">
                <thead>
                  <tr>
                    <th>القناة</th>
                    <th className="text-left">الإنفاق</th>
                    <th className="text-center">ليدز</th>
                    <th className="text-center">اشترى</th>
                    <th className="text-center">التحويل</th>
                    <th className="text-left">تكلفة الليد</th>
                    <th className="text-left">تكلفة العميل</th>
                    <th className="text-left">الإيراد</th>
                    <th className="text-center">العائد</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((row) => (
                    <tr key={row.channel} className={row.channel === UNATTRIBUTED ? 'bg-amber-50' : ''}>
                      <td className="font-medium">{row.label}</td>
                      <td className="nums text-left">{formatMoney(row.spend)}</td>
                      <td className="nums text-center">{row.leads || '—'}</td>
                      <td className="nums text-center">{row.won || '—'}</td>
                      <td className="nums text-center">
                        {na(row.conversionPct, (v) => `${v}٪`)}
                      </td>
                      <td className="nums text-left">{na(row.costPerLead, formatMoney)}</td>
                      <td className="nums text-left">{na(row.costPerWon, formatMoney)}</td>
                      <td className="nums text-left">{formatMoney(row.revenue)}</td>
                      <td className="nums text-center">{na(row.roas, (v) => `${v}×`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* ── شهرًا بشهر ───────────────────────────────────────── */}
      {report.monthly.length > 0 && (
        <section className="card card-pad">
          <h2 className="mb-1 font-semibold text-slate-800">شهرًا بشهر</h2>
          <p className="mb-4 text-xs leading-relaxed text-slate-500">
            <b>الاتجاه أهمّ من اللحظة.</b> شهرٌ ارتفعت فيه تكلفة الليد وحده قد يكون موسمًا؛
            وثلاثةٌ متتالية قرارٌ يُتّخذ.
          </p>
          <div className="overflow-x-auto">
            <table className="tbl tbl-wide">
              <thead>
                <tr>
                  <th>الشهر</th>
                  <th>القناة</th>
                  <th className="text-left">الإنفاق</th>
                  <th className="text-center">ليدز</th>
                  <th className="text-center">اشترى</th>
                  <th className="text-left">تكلفة الليد</th>
                </tr>
              </thead>
              <tbody>
                {report.monthly.map((row) => (
                  <tr key={`${row.period}|${row.channel}`}>
                    <td className="nums">{row.period}</td>
                    <td>{row.label}</td>
                    <td className="nums text-left">{row.spend ? formatMoney(row.spend) : '—'}</td>
                    <td className="nums text-center">{row.leads || '—'}</td>
                    <td className="nums text-center">{row.won || '—'}</td>
                    <td className="nums text-left">
                      {row.leads > 0 && row.spend > 0
                        ? formatMoney(Math.round((row.spend / row.leads) * 100) / 100)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── ضبط القنوات ─────────────────────────────────────── */}
      {can(user, 'canManageAccounting') && accounts.length > 0 && (
        <form method="post" action="/api/save" className="card card-pad">
          <input type="hidden" name="entity" value="account.adChannel" />
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-800">
            <Settings2 className="h-4 w-4 text-brand-600" />
            قناة كل حساب — تُضبط مرة واحدة
          </h2>
          {/**
            * **مرة واحدة على الحساب لا في كل قيد** — القاعدة نفسها التي حكمت
            * تصنيف الإنفاق: «الإيجار» إيجارٌ في كل قيد، وسؤالُ المحاسب عنه
            * آلاف المرات يُنتج آلاف الفرص للخطأ.
            */}
          <p className="mb-4 text-xs leading-relaxed text-slate-500">
            حسابات <b>المصروفات البيعية والتسويقية</b> وحدها تظهر هنا — ووضعُ قناةٍ على
            حساب الإيجار يقسم إيجارَ المكتب على ليدز جوجل. والمبلغ بجانب كلٍّ هو ما وقع
            عليه في {year}، فتعرف أيَّها يستحقّ الضبط.
          </p>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الحساب</th>
                  <th className="text-left">أُنفق في {year}</th>
                  <th className="w-64">القناة</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td>{account.name}</td>
                    <td className="nums text-left">
                      {account.amount ? formatMoney(account.amount) : '—'}
                    </td>
                    <td>
                      {/**
                        * **ومعرّفُ الحساب في اسم الخانة** لا في حقل مخفيّ —
                        * القاعدة التي أنقذت شاشة الموازنة من الكتابة فوق
                        * حسابٍ لم يُقصد.
                        */}
                      <select
                        name={`ch_${account.id}`}
                        defaultValue={account.adChannel ?? ''}
                        className="input"
                        aria-label={`قناة ${account.name}`}
                      >
                        <option value="">— بلا قناة —</option>
                        {SPEND_CHANNELS.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <SaveButton>احفظ القنوات</SaveButton>
          </div>
        </form>
      )}
    </div>
  );
}
