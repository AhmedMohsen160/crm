import Link from '@/components/link';
import { TrendingUp, Users, Target, Sparkles, AlertTriangle } from 'lucide-react';
import { requirePermission, can } from '@/lib/auth';
import { listOptions } from '@/lib/reference';
import {
  workModeMargins,
  sellerPerformance,
  channelPerformance,
  funnel,
  clientValue,
  producerPerformance,
  yearlyTrend,
} from '@/lib/analytics';
import { yearRange, monthRange, fiscalMonth } from '@/lib/accounting';
import { formatMoney } from '@/lib/utils';
import { PageHeader, StatCard, Badge, EmptyState } from '@/components/ui';
import { BarList, ColumnChart, Funnel, HeroNumber, NumbersDetails } from '@/components/chart';

export const metadata = { title: 'التحليلات' };
export const dynamic = 'force-dynamic';

const pct = (v: number) => `${(v * 100).toFixed(1)}٪`;

/**
 * التحليلات (§١٣).
 *
 * ترتيب الشاشة يتبع أهمية السؤال لا سهولة الحساب: **«هامش كل نمط تشغيل»**
 * أولًا، لأن المواصفة تصفه بأنه «السؤال الاستراتيجي الوحيد الذي لا تستطيع
 * الإدارة الإجابة عنه اليوم» وسببُ وجود المنظومة كلها.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; line?: string; scope?: string }>;
}) {
  const user = await requirePermission('canViewTeamAnalytics');
  const { year: requestedYear, line, scope } = await searchParams;

  const seesCompany = can(user, 'canViewCompanyAnalytics');
  const year = Number(requestedYear) || new Date().getFullYear();
  const monthly = scope === 'month';
  const range = monthly ? monthRange(fiscalMonth(new Date())) : yearRange(year);

  const [modes, sellers, channels, steps, clients, producers, trend, serviceLines] =
    await Promise.all([
      workModeMargins({ from: range.start, to: range.end }, { serviceLine: line ?? null }),
      sellerPerformance({ from: range.start, to: range.end }),
      seesCompany ? channelPerformance({ from: range.start, to: range.end }) : Promise.resolve([]),
      funnel({ from: range.start, to: range.end }),
      clientValue({ from: range.start, to: range.end }),
      seesCompany ? producerPerformance({ from: range.start, to: range.end }) : Promise.resolve([]),
      seesCompany ? yearlyTrend([year - 3, year - 2, year - 1, year]) : Promise.resolve([]),
      listOptions('service_line'),
    ]);

  const totalRevenue = modes.rows.reduce((s, m) => s + m.revenue, 0);
  const best = modes.rows[0];
  const human = modes.rows.find((m) => m.workMode === 'human_full');
  const ai = modes.rows.filter((m) => m.workMode.startsWith('mtpe'));
  const aiMargin =
    ai.length > 0
      ? ai.reduce((s, m) => s + m.loadedMargin, 0) /
        Math.max(1, ai.reduce((s, m) => s + m.revenue, 0))
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="التحليلات"
        subtitle={monthly ? 'الشهر الحالي' : `سنة ${year}`}
      >
        <Link
          href={`/analytics?${monthly ? `year=${year}` : 'scope=month'}`}
          className="btn-secondary"
        >
          {monthly ? 'اعرض السنة' : 'اعرض الشهر'}
        </Link>
      </PageHeader>

      <form method="get" className="flex flex-wrap items-end gap-3">
        {monthly && <input type="hidden" name="scope" value="month" />}
        {!monthly && (
          <div>
            <label className="label" htmlFor="year">
              السنة
            </label>
            <input id="year" name="year" type="number" defaultValue={year} dir="ltr" className="input w-32" />
          </div>
        )}
        <div>
          <label className="label" htmlFor="line">
            خط الخدمة
          </label>
          <select id="line" name="line" defaultValue={line ?? ''} className="input w-auto">
            <option value="">كل الخطوط</option>
            {serviceLines.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          عرض
        </button>
      </form>

      {/* ══ أهم تقرير في المنظومة ══════════════════════════════ */}
      <section>
        <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-slate-900">
          <Sparkles className="h-5 w-5 text-brand-600" />
          هامش كل نمط تشغيل
        </h2>
        <p className="mb-4 text-sm text-slate-600">
          بالتكلفة <b>المستوعبة</b> لا الفعلية — أي بعد تحميل كل نمط نصيبَه من
          المصروف غير المباشر، موزَّعًا بالصفحات الموزونة.
          {line && ' على خط الخدمة المحدَّد وحده.'}
        </p>

        {modes.rows.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<Sparkles className="h-10 w-10" />}
              title="لا مشاريع مسلَّمة في هذا المدى"
              description="التقرير يقارن الأنماط على المشاريع المسلَّمة بتكلفتها المجمَّدة."
            />
          </div>
        ) : (
          <>
            {/* الحكم أولًا بالأرقام الثلاثة التي تُتّخذ بها القرارات */}
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <HeroNumber
                label="أعلى نمط هامشًا مستوعبًا"
                value={best ? pct(best.loadedMarginPct) : '—'}
                hint={best?.label}
                tone={best && best.loadedMarginPct > 0 ? 'good' : 'default'}
              />
              <HeroNumber
                label="إيراد المسلَّم في المدى"
                value={formatMoney(totalRevenue)}
                hint={`${modes.rows.reduce((s, m) => s + m.projects, 0)} مشروعًا مسلَّمًا`}
              />
              <HeroNumber
                label="العبء غير المباشر المحمَّل"
                value={formatMoney(modes.overheadAbsorbed)}
                hint="موزَّعًا بالصفحات الموزونة — يُضبط من إعدادات النظام"
              />
            </div>

            <div className="card card-pad">
              <p className="mb-3 text-xs font-medium text-slate-500">
                الهامش المستوعب لكل نمط — والشريط بطوله من الأعلى
              </p>
              <BarList
                rows={modes.rows.map((row) => ({
                  key: row.workMode,
                  label: row.label,
                  value: Math.max(0, row.loadedMarginPct),
                  display: pct(row.loadedMarginPct),
                  hint: `${row.projects} مشروعًا · ${formatMoney(row.revenue)}`,
                  tone: row.loadedMarginPct >= 0.25 ? 'good' : row.loadedMarginPct >= 0 ? 'warn' : 'bad',
                }))}
                max={Math.max(...modes.rows.map((r) => Math.max(0, r.loadedMarginPct)), 0.5)}
              />
            </div>

            <NumbersDetails>
            <div className="card table-wrap">
              <table className="tbl tbl-wide">
                <thead>
                  <tr>
                    <th>النمط</th>
                    <th>مشاريع</th>
                    <th>صفحات</th>
                    <th>الإيراد</th>
                    <th>تكلفة مباشرة</th>
                    <th>تكلفة مستوعبة</th>
                    <th>هامش مباشر</th>
                    <th>هامش مستوعب</th>
                    <th>سعر الصفحة</th>
                    <th>تكلفة الصفحة</th>
                  </tr>
                </thead>
                <tbody>
                  {modes.rows.map((row) => (
                    <tr key={row.workMode}>
                      <td className="font-medium text-slate-800">{row.label}</td>
                      <td className="nums">{row.projects}</td>
                      <td className="nums text-slate-600">{row.pages}</td>
                      <td className="nums">{formatMoney(row.revenue)}</td>
                      <td className="nums text-slate-600">{formatMoney(row.directCost)}</td>
                      <td className="nums text-slate-600">{formatMoney(row.loadedCost)}</td>
                      <td className="nums">{pct(row.directMarginPct)}</td>
                      <td
                        className={`nums font-semibold ${
                          row.loadedMarginPct >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {pct(row.loadedMarginPct)}
                      </td>
                      <td className="nums text-xs text-slate-500">{row.revenuePerPage}</td>
                      <td className="nums text-xs text-slate-500">{row.costPerPage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </NumbersDetails>

            {/* الحكم — لا الأرقام وحدها */}
            {human && aiMargin !== null && (
              <div
                className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
                  aiMargin > human.loadedMarginPct
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-rose-200 bg-rose-50 text-rose-900'
                }`}
              >
                {aiMargin > human.loadedMarginPct ? (
                  <>
                    <b>أنماط الذكاء الاصطناعي توفّر فعلًا:</b> هامشها المستوعب{' '}
                    <b className="nums">{pct(aiMargin)}</b> مقابل{' '}
                    <b className="nums">{pct(human.loadedMarginPct)}</b> للترجمة البشرية
                    الكاملة.
                  </>
                ) : (
                  <>
                    <b>الجهد يُنقل ولا يُوفَّر:</b> هامش أنماط الذكاء الاصطناعي
                    المستوعب <b className="nums">{pct(aiMargin)}</b> ولم يتجاوز
                    الترجمة البشرية الكاملة (<b className="nums">{pct(human.loadedMarginPct)}</b>).
                    راجع أجور المراجعة أو تسعير هذه الأنماط.
                  </>
                )}
              </div>
            )}

            {modes.unassigned > 0 && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <b className="nums">{modes.unassigned}</b> مشروعًا بلا نمط تشغيل
                  مسجَّل — خارج هذه المقارنة. أسنِد نمطها ليصير التقرير كاملًا.
                </span>
              </p>
            )}
            <p className="mt-2 text-xs text-slate-400">
              العبء غير المباشر المحمَّل في هذا المدى:{' '}
              <b className="nums">{formatMoney(modes.overheadAbsorbed)}</b> — يُضبط من
              «إعدادات النظام ← المصروف الشهري غير المباشر».
            </p>
          </>
        )}
      </section>

      {/* ══ القمع وقيمة العميل ═════════════════════════════════ */}
      <section className="card card-pad">
        <h2 className="mb-1 flex items-center gap-2 section-title">
          <Target className="h-4 w-4 text-brand-600" />
          قمع المبيعات
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          العمود الأخير هو <b>الفاقد</b> عند كل مرحلة — وهو ما يُعالَج، لا العدد.
        </p>
        <Funnel steps={steps.map((s) => ({ stage: s.stage, count: s.count }))} />
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="عملاء تعاملوا في المدى"
          value={String(clients.clients)}
          hint={`${clients.repeatClients} منهم متكرر · ${pct(clients.repeatPct)}`}
          icon={<Users className="h-5 w-5" />}
          accent="violet"
        />
        <StatCard
          label="متوسط قيمة العميل"
          value={formatMoney(clients.avgValue)}
          hint={`${clients.avgOrdersPerClient} طلب لكل عميل`}
          accent="brand"
        />
        <StatCard
          label="إجمالي الإيراد المسلَّم"
          value={formatMoney(totalRevenue)}
          hint={best ? `أعلى هامش: ${best.label}` : undefined}
          icon={<TrendingUp className="h-5 w-5" />}
          accent="emerald"
        />
      </div>

      {/* ══ أداء أدمن المبيعات ═════════════════════════════════ */}
      <section>
        <h2 className="mb-3 section-title">أداء أدمن المبيعات</h2>
        <div className="card card-pad mb-3">
          <p className="mb-3 text-xs font-medium text-slate-500">
            الإيراد المحقَّق — ومعه معدل التحويل و<b>متوسط زمن الرد الأول</b>
          </p>
          <BarList
            rows={sellers.map((s) => ({
              key: s.userId,
              label: s.name,
              value: s.revenue,
              display: formatMoney(s.revenue),
              hint: [
                s.leads > 0 ? `تحويل ${pct(s.conversionPct)}` : 'بلا ليدز',
                s.avgFirstReplyHours === null
                  ? 'زمن الرد غير مقيس'
                  : `الرد الأول ${s.avgFirstReplyHours} س`,
              ].join(' · '),
            }))}
            emptyLabel="لا نشاط في هذا المدى"
          />
        </div>
        <NumbersDetails>
        <div className="card table-wrap">
          <table className="tbl tbl-wide">
            <thead>
              <tr>
                <th>الأدمن</th>
                <th>ليدز</th>
                <th>فائزة</th>
                <th>معدل التحويل</th>
                <th>زمن الرد الأول</th>
                <th>مشاريع</th>
                <th>الإيراد</th>
                <th>متوسط الطلب</th>
                <th>معلّق التحصيل</th>
              </tr>
            </thead>
            <tbody>
              {sellers.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-sm text-slate-400">
                    لا نشاط في هذا المدى
                  </td>
                </tr>
              )}
              {sellers.map((s) => (
                <tr key={s.userId}>
                  <td className="font-medium text-slate-800">{s.name}</td>
                  <td className="nums">{s.leads}</td>
                  <td className="nums">{s.won}</td>
                  <td className="nums font-semibold">{s.leads > 0 ? pct(s.conversionPct) : '—'}</td>
                  <td className="nums text-slate-600">
                    {s.avgFirstReplyHours === null ? '—' : `${s.avgFirstReplyHours} س`}
                  </td>
                  <td className="nums">{s.projects}</td>
                  <td className="nums">{formatMoney(s.revenue)}</td>
                  <td className="nums text-slate-600">{formatMoney(s.avgOrder)}</td>
                  <td className="nums text-amber-700">{formatMoney(s.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </NumbersDetails>
        <p className="mt-2 text-xs text-slate-400">
          فارق معدل التحويل داخل الفريق الواحد هو سبب وجود هذا الجدول — وهو ما
          يُدرَّب عليه، لا ما يُعاقَب به.
        </p>
      </section>

      {/* ══ القنوات والاكتساب ══════════════════════════════════ */}
      {seesCompany && channels.length > 0 && (
        <section>
          <h2 className="mb-1 section-title">القنوات وتكلفة الاكتساب</h2>
          <p className="mb-3 text-xs text-slate-500">
            الإنفاق مقروء من <b>دفتر الأستاذ</b> (حسابات الإعلانات المدفوعة) لا من
            إدخال يدوي — فالرقم يطابق ما صُرف فعلًا.
          </p>
          <div className="card card-pad mb-3">
            <p className="mb-3 text-xs font-medium text-slate-500">
              الإيراد لكل قناة — والعائد على الإنفاق بجانبه
            </p>
            <BarList
              rows={channels.map((c) => ({
                key: c.channel,
                label: c.label,
                value: c.revenue,
                display: formatMoney(c.revenue),
                // القناة بلا عملاء لا CAC لها — والصفر هنا كذبة
                hint:
                  c.cac === null
                    ? `${c.leads} ليدًا · لا بيانات لتكلفة الاكتساب`
                    : `تكلفة الاكتساب ${formatMoney(c.cac)}${c.roas === null ? '' : ` · عائد ${c.roas}×`}`,
                tone: c.roas === null ? 'default' : c.roas >= 3 ? 'good' : c.roas >= 1 ? 'warn' : 'bad',
              }))}
            />
          </div>
          <NumbersDetails>
          <div className="card table-wrap">
            <table className="tbl tbl-wide">
              <thead>
                <tr>
                  <th>القناة</th>
                  <th>ليدز</th>
                  <th>فائزة</th>
                  <th>معدل التحويل</th>
                  <th>الإيراد</th>
                  <th>الإنفاق</th>
                  <th>CAC</th>
                  <th>ROAS</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.channel}>
                    <td className="font-medium text-slate-800">{c.label}</td>
                    <td className="nums">{c.leads}</td>
                    <td className="nums">{c.won}</td>
                    <td className="nums">{c.leads > 0 ? pct(c.conversionPct) : '—'}</td>
                    <td className="nums">{formatMoney(c.revenue)}</td>
                    <td className="nums text-slate-600">
                      {c.spend > 0 ? formatMoney(c.spend) : '—'}
                    </td>
                    <td className="nums font-semibold">
                      {/* بلا عملاء لا CAC — والصفر هنا كذبة */}
                      {c.cac === null ? (
                        <span className="text-xs text-slate-400">لا بيانات</span>
                      ) : (
                        formatMoney(c.cac)
                      )}
                    </td>
                    <td className="nums">
                      {c.roas === null ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        `${c.roas}×`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </NumbersDetails>
        </section>
      )}

      {/* ══ المنتِجون ══════════════════════════════════════════ */}
      {seesCompany && producers.length > 0 && (
        <section>
          <h2 className="mb-3 section-title">أداء المنتِجين</h2>
          <div className="card card-pad mb-3">
            <p className="mb-3 text-xs font-medium text-slate-500">
              الصفحات الموزونة المنتَجة — والالتزام بالمواعيد بجانب كل اسم
            </p>
            <BarList
              rows={producers
                // من لم ينتج صفحةً واحدة في المدى **غير مقيس** — يبقى في
                // الجدول ولا يُرسم له شريطٌ فارغ يُطيل الشاشة بلا معنى
                .filter((p) => p.weightedPages > 0)
                .slice(0, 12)
                .map((p) => ({
                key: p.userId,
                label: p.name,
                value: p.weightedPages,
                display: p.weightedPages.toLocaleString('en-US'),
                hint:
                  p.onTime.onTime + p.onTime.late === 0
                    ? 'لا مواعيد مسجَّلة'
                    : `التزام ${pct(p.onTime.rate)}`,
                tone:
                  p.onTime.onTime + p.onTime.late === 0
                    ? 'default'
                    : p.onTime.rate >= 0.9
                      ? 'good'
                      : p.onTime.rate >= 0.7
                        ? 'warn'
                        : 'bad',
              }))}
              emptyLabel="لا إنتاج مسجَّل في هذا المدى"
            />
          </div>
          <NumbersDetails>
          <div className="card table-wrap">
            <table className="tbl tbl-wide">
              <thead>
                <tr>
                  <th>المنتِج</th>
                  <th>مشاريع</th>
                  <th>صفحات موزونة</th>
                  <th>الإيراد</th>
                  <th>الهامش</th>
                  <th>ROI</th>
                  <th>استيعاب الطاقة</th>
                  <th>الالتزام بالمواعيد</th>
                  <th>ملاحظات/١٠٠ صفحة</th>
                </tr>
              </thead>
              <tbody>
                {producers.map((p) => (
                  <tr key={p.userId}>
                    <td className="font-medium text-slate-800">{p.name}</td>
                    <td className="nums">{p.projects}</td>
                    <td className="nums">{p.weightedPages}</td>
                    <td className="nums">{formatMoney(p.revenue)}</td>
                    <td className="nums">{p.revenue > 0 ? pct(p.marginPct) : '—'}</td>
                    <td className="nums">{p.roi > 0 ? `${p.roi.toFixed(2)}×` : '—'}</td>
                    <td className="nums">
                      {p.absorption === null ? (
                        <span className="text-xs text-slate-400">لا طاقة مسجَّلة</span>
                      ) : (
                        pct(p.absorption)
                      )}
                    </td>
                    <td className="nums">
                      {p.onTime.onTime + p.onTime.late === 0 ? (
                        // المقام صفر: لا مشروع له موعد مسجَّل — لا ١٠٠٪ كاذبة
                        <span className="text-xs text-slate-400">لا مواعيد</span>
                      ) : (
                        pct(p.onTime.rate)
                      )}
                    </td>
                    <td className="nums text-slate-600">{p.qaPer100}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </NumbersDetails>
        </section>
      )}

      {/* ══ الاتجاه السنوي ═════════════════════════════════════ */}
      {seesCompany && trend.length > 0 && (
        <section>
          <h2 className="mb-3 section-title">الاتجاه على أربع سنوات</h2>
          <div className="card card-pad mb-3">
            <ColumnChart
              columns={trend.map((t) => ({
                key: String(t.year),
                label: String(t.year),
                value: t.revenue,
                display: formatMoney(t.revenue).replace(/\s?ج\.م/, ''),
                muted: t.incomplete,
              }))}
            />
            <p className="mt-3 text-xs text-slate-400">
              العمود <b>المخطَّط</b> سنةٌ ناقصة البيانات — يُعرض ولا يُحذف، ولا يُقارَن به نمو.
            </p>
          </div>
          <NumbersDetails>
          <div className="card table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>السنة</th>
                  <th>ليدز</th>
                  <th>مشاريع</th>
                  <th>الإيراد</th>
                  <th>الهامش</th>
                  <th>متوسط الطلب</th>
                  <th>النمو</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((t) => (
                  <tr key={t.year} className={t.incomplete ? 'bg-amber-50/50' : undefined}>
                    <td className="font-medium text-slate-800">
                      {t.year}
                      {t.incomplete && (
                        <Badge className="mr-2 border-amber-200 bg-amber-50 text-amber-700">
                          ناقصة
                        </Badge>
                      )}
                    </td>
                    <td className="nums">{t.leads}</td>
                    <td className="nums">{t.projects}</td>
                    <td className="nums">{formatMoney(t.revenue)}</td>
                    <td className="nums">{t.revenue > 0 ? pct(t.marginPct) : '—'}</td>
                    <td className="nums text-slate-600">{formatMoney(t.avgOrder)}</td>
                    <td className="nums">
                      {t.growth === null ? (
                        '—'
                      ) : t.growthReliable ? (
                        <span className={t.growth >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                          {pct(t.growth)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400" title="مقارنة بسنة ناقصة">
                          غير موثوق
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </NumbersDetails>
          <p className="mt-2 text-xs text-slate-500">
            السنة المعلَّمة <b>«ناقصة»</b> لا تصلح خط أساس (§١٤): بياناتها لم
            تُسجَّل كاملة، والنمو المقارَن بها يضلّل. نقولها هنا بدل أن نعرض
            رقمًا يبدو صحيحًا.
          </p>
        </section>
      )}
    </div>
  );
}
