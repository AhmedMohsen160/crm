import Link from '@/components/link';
import {
  Factory,
  AlertTriangle,
  CalendarClock,
  Gauge,
  TrendingUp,
  TrendingDown,
  Users,
  ShieldCheck,
} from 'lucide-react';
import { db } from '@/lib/db';
import { can, type SessionUser } from '@/lib/auth';
import { ACTIVE_STATUSES, REVENUE_STATUSES, isOverdue } from '@/lib/projects';
import {
  onTimeRate,
  growthPct,
  operatingRatio,
  operatingRoi,
  costPerPage,
  rankProducers,
} from '@/lib/ops-metrics';
import { qualitySummary, DEFAULT_WORDS_PER_PAGE, DEFAULT_PENALTY_PER_ERROR } from '@/lib/quality';
import { allSettings } from '@/lib/reference';
import { formatMoney, formatDate } from '@/lib/utils';
import { PageHeader, StatCard, Badge, EmptyState } from '@/components/ui';
import { BarList } from '@/components/chart';

/**
 * لوحة التشغيل — لمن يُسند ولا يبيع.
 *
 * **الأرقام التي تخصّ عمله لا عمل غيره.** كان مدير المشاريع يفتح لوحةً
 * مبنيّة لأدمن المبيعات: مسار مبيعات وقيمة صفقات وترتيب البائعين — أرقامٌ
 * لا يملك منها قرارًا، ولا يصحّ أن يراها أصلًا. فصارت لوحته تسأل أسئلته هو:
 * **هل سلّمنا في الموعد · كم أنجزنا · هل تقدّمنا عن الشهر الماضي · ما الذي
 * ينتظر الإسناد الآن · وكم يكلّف التشغيل مما نبيعه.**
 *
 * والمال يظهر له **تكلفةً لا سعرًا**: تكلفة التشغيل وعائدها ونسبتها من
 * المبيعات — بإذن الإدارة الصريح — بلا أن يُكشَف له سعرُ بيع مشروع بعينه.
 */
export default async function OpsDashboard({ user }: { user: SessionUser }) {
  const seesCost = can(user, 'canViewCostIndicator');

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [settings, thisMonth, lastMonth, waiting, running, overdueRows, producers] =
    await Promise.all([
      allSettings(),
    db.project.findMany({
      where: { status: { in: REVENUE_STATUSES }, deliveredAt: { gte: monthStart } },
      select: {
        id: true,
        code: true,
        title: true,
        deliveredAt: true,
        deadline: true,
        weightedPages: true,
        pages: true,
        qaIssues: true,
        isRework: true,
        unitsTranslated: true,
        primaryProducerId: true,
        // التكلفة تُقرأ فقط لمن يملك مؤشرها — ولا تُرسل لغيره (§٣ بند ٢)
        ...(seesCost ? { costTotal: true, netTotal: true } : {}),
      },
    }),
    db.project.findMany({
      where: {
        status: { in: REVENUE_STATUSES },
        deliveredAt: { gte: prevStart, lt: monthStart },
      },
      select: { weightedPages: true, pages: true },
    }),
    db.project.count({ where: { status: 'pending_assignment' } }),
    db.project.findMany({
      where: { status: { in: ACTIVE_STATUSES } },
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        deadline: true,
        deliveredAt: true,
        primaryProducer: { select: { name: true } },
      },
      orderBy: { deadline: 'asc' },
      take: 200,
    }),
    db.project.findMany({
      where: { status: 'pending_assignment' },
      select: { id: true, code: true, title: true, createdAt: true, deadline: true },
      orderBy: { createdAt: 'asc' },
      take: 8,
    }),
    db.project.groupBy({
      by: ['primaryProducerId'],
      where: { status: { in: REVENUE_STATUSES }, deliveredAt: { gte: monthStart } },
      _count: { _all: true },
      _sum: { weightedPages: true },
    }),
  ]);

  const punctual = onTimeRate(thisMonth);
  const pagesNow = thisMonth.reduce((s, p) => s + (p.weightedPages || p.pages || 0), 0);
  const pagesPrev = lastMonth.reduce((s, p) => s + (p.weightedPages || p.pages || 0), 0);
  const growth = growthPct(pagesNow, pagesPrev);

  const late = running.filter(isOverdue);

  // تكلفة التشغيل وعائده — لمن يملك مؤشر التكلفة وحده
  const costTotal = seesCost
    ? thisMonth.reduce((s, p) => s + ((p as { costTotal?: number }).costTotal ?? 0), 0)
    : 0;
  const soldTotal = seesCost
    ? thisMonth.reduce((s, p) => s + ((p as { netTotal?: number }).netTotal ?? 0), 0)
    : 0;
  const ratio = operatingRatio(costTotal, soldTotal);
  const roi = operatingRoi(soldTotal, costTotal);
  const perPage = costPerPage(costTotal, pagesNow);

  /**
   * الجودة — **كثافة الملاحظات لكل ألف كلمة، لا عددُها المجرّد**.
   * التفصيل ولماذا في `src/lib/quality.ts`. والعقوبة إعدادٌ يضبطه المكتب.
   */
  const wordsPerPage = Number(settings.words_per_page) || DEFAULT_WORDS_PER_PAGE;
  const penalty = Number(settings.quality_penalty_per_error) || DEFAULT_PENALTY_PER_ERROR;
  const quality = qualitySummary(
    thisMonth.map((p) => ({
      qaIssues: p.qaIssues ?? 0,
      pages: p.pages ?? 0,
      words: p.unitsTranslated ? p.unitsTranslated * wordsPerPage : null,
      isRework: p.isRework ?? false,
    })),
    { wordsPerPage, penaltyPerError: penalty }
  );

  const producerIds = producers.map((p) => p.primaryProducerId).filter(Boolean) as string[];
  const names = producerIds.length
    ? new Map(
        (
          await db.user.findMany({
            where: { id: { in: producerIds } },
            select: { id: true, name: true },
          })
        ).map((u) => [u.id, u.name])
      )
    : new Map<string, string>();

  // جودة كل منفِّذ على حدة — بنفس القاعدة، فلا يختلف معنى الرقم بين شاشتين
  const qualityOf = new Map<string, ReturnType<typeof qualitySummary>>();
  for (const id of new Set(producerIds)) {
    qualityOf.set(
      id,
      qualitySummary(
        thisMonth
          .filter((p) => p.primaryProducerId === id)
          .map((p) => ({
            qaIssues: p.qaIssues ?? 0,
            pages: p.pages ?? 0,
            words: p.unitsTranslated ? p.unitsTranslated * wordsPerPage : null,
            isRework: p.isRework ?? false,
          })),
        { wordsPerPage, penaltyPerError: penalty }
      )
    );
  }

  const board = rankProducers(
    producers
      .filter((p) => p.primaryProducerId)
      .map((p) => ({
        userId: p.primaryProducerId!,
        userName: names.get(p.primaryProducerId!) ?? '—',
        pages: Math.round(p._sum.weightedPages ?? 0),
        projects: p._count._all,
      }))
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`أهلًا ${user.name.split(' ')[0]}`}
        subtitle="لوحة التشغيل — ما أنجزه فريقك هذا الشهر وما ينتظره الآن"
      />

      {/* ما يحتاج تدخّلًا الآن — بالأحمر لأنه فعلٌ لا خبر */}
      {(waiting > 0 || late.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {waiting > 0 && (
            <Link
              href="/production"
              className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 transition-colors hover:bg-rose-100"
            >
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>
                <b className="nums">{waiting}</b> مشروع ينتظر الإسناد — لم يبدأ تنفيذه بعد
              </span>
            </Link>
          )}
          {late.length > 0 && (
            <Link
              href="/projects?alerts=1&view=list"
              className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 transition-colors hover:bg-rose-100"
            >
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>
                <b className="nums">{late.length}</b> مشروع تجاوز موعد تسليمه
              </span>
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="التسليم في الموعد"
          value={punctual.rate === null ? '—' : `${punctual.rate}٪`}
          hint={
            punctual.rate === null
              ? 'لا مشروع بموعدٍ سُلّم هذا الشهر'
              : `${punctual.onTime} في الموعد · ${punctual.late} متأخر`
          }
          accent={punctual.rate === null ? 'slate' : punctual.rate >= 90 ? 'emerald' : 'amber'}
        />
        <StatCard
          label="صفحات موزونة هذا الشهر"
          value={Math.round(pagesNow)}
          hint={
            growth === null
              ? pagesPrev === 0 && pagesNow > 0
                ? 'أول شهر مقيس — لا مقارنة'
                : 'لا قياس للشهر الماضي'
              : `${growth > 0 ? '+' : ''}${growth}٪ عن الشهر الماضي (${Math.round(pagesPrev)})`
          }
          accent={growth === null ? 'slate' : growth >= 0 ? 'emerald' : 'rose'}
        />
        <StatCard
          label="مشاريع جارية"
          value={running.length}
          hint={`${waiting} تنتظر الإسناد`}
          accent="brand"
        />
        {seesCost ? (
          <StatCard
            label="تكلفة التشغيل هذا الشهر"
            value={formatMoney(costTotal)}
            hint={perPage === null ? 'بلا صفحات مقيسة' : `${perPage} للصفحة الموزونة`}
            accent="slate"
          />
        ) : (
          <StatCard label="سُلّم هذا الشهر" value={thisMonth.length} accent="emerald" />
        )}
      </div>

      <section className="card card-pad">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
          <ShieldCheck className="h-4 w-4 text-brand-600" />
          الجودة هذا الشهر
        </h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-slate-500">درجة الجودة</p>
            <p className="mt-1 flex items-center gap-2 text-2xl font-bold text-slate-900 nums">
              {quality.score === null ? '—' : quality.score}
              {quality.band && (
                <Badge
                  className={
                    quality.band.tone === 'good'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : quality.band.tone === 'warn'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-rose-200 bg-rose-50 text-rose-700'
                  }
                >
                  {quality.band.label}
                </Badge>
              )}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {quality.score === null ? 'لا حجم مقيس هذا الشهر' : 'من مئة'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">ملاحظات لكل ألف كلمة</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 nums">
              {quality.density === null ? '—' : quality.density}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              الهدف {Number(settings.quality_target_density) || 1} — والمعيار الصناعي
              يقيس الخطأ بحجمه
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">سُلّم بلا ملاحظة واحدة</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 nums">
              {quality.cleanPct === null ? '—' : `${quality.cleanPct}٪`}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {quality.measured} مشروعًا مقيسًا من {quality.projects}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">رجع للتصحيح</p>
            <p
              className={`mt-1 text-2xl font-bold nums ${
                quality.reworkPct === null
                  ? 'text-slate-400'
                  : quality.reworkPct > 0
                    ? 'text-rose-600'
                    : 'text-emerald-600'
              }`}
            >
              {quality.reworkPct === null ? '—' : `${quality.reworkPct}٪`}
            </p>
            {/* الخطأ الذي أفلت أغلى من عشرةٍ أمسكتها المراجعة */}
            <p className="mt-1 text-xs text-slate-400">
              {quality.reworked} مشروعًا بعد التسليم
            </p>
          </div>
        </div>
      </section>

      {seesCost && (
        <section className="card card-pad">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
            <Gauge className="h-4 w-4 text-brand-600" />
            عائد التشغيل هذا الشهر
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-500">نسبة التشغيل من المبيعات</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 nums">
                {ratio === null ? '—' : `${ratio}٪`}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {ratio === null ? 'بلا مبيعات مقيسة' : 'ما يأكله التشغيل من كل جنيه مبيعات'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">عائد كل جنيه تشغيل</p>
              <p
                className={`mt-1 flex items-center gap-1 text-2xl font-bold nums ${
                  roi === null ? 'text-slate-400' : roi >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {roi === null ? (
                  '—'
                ) : (
                  <>
                    {roi >= 0 ? (
                      <TrendingUp className="h-5 w-5" />
                    ) : (
                      <TrendingDown className="h-5 w-5" />
                    )}
                    {roi}٪
                  </>
                )}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {roi === null
                  ? 'تكلفة صفر تعني «لم تُسجَّل» لا «مجّانًا»'
                  : 'الإيراد ناقص التكلفة على التكلفة'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">حجم ما سُلّم</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 nums">
                {formatMoney(soldTotal)}
              </p>
              <p className="mt-1 text-xs text-slate-400">{thisMonth.length} مشروعًا</p>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card card-pad">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
            <Users className="h-4 w-4 text-brand-600" />
            حجم كل منفِّذ هذا الشهر
          </h2>
          {board.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              لا تسليمات هذا الشهر بعد
            </p>
          ) : (
            <BarList
              rows={board.map((b) => ({
                key: b.userId,
                label: `${b.rank}. ${b.userName}`,
                value: b.pages,
                display: `${b.pages} صفحة موزونة`,
                // «غير مقيس» تُعرض شرطةً لا صفرًا — الفرق حكمٌ في حقّ إنسان
                hint: `${b.projects} مشروعًا · جودة ${
                  qualityOf.get(b.userId)?.score ?? '—'
                }`,
              }))}
            />
          )}
        </section>

        <section className="card card-pad">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
            <Factory className="h-4 w-4 text-rose-500" />
            ينتظر الإسناد
            {overdueRows.length > 0 && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700 nums">
                {waiting}
              </span>
            )}
          </h2>
          {overdueRows.length === 0 ? (
            <EmptyState
              icon={<CalendarClock className="h-8 w-8" />}
              title="لا شيء ينتظر"
              description="كل المشاريع أُسندت — القائمة نظيفة."
            />
          ) : (
            <ul className="space-y-2">
              {overdueRows.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/production/${p.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg p-2 hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800">
                        {p.title}
                      </span>
                      <span className="block text-[11px] text-slate-400" dir="ltr">
                        {p.code}
                      </span>
                    </span>
                    {p.deadline && (
                      <Badge
                        className={
                          p.deadline.getTime() < Date.now()
                            ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                        }
                      >
                        {formatDate(p.deadline)}
                      </Badge>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
