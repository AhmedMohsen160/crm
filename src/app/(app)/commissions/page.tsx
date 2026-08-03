import Link from '@/components/link';
import { TrendingUp, Target, Wallet, Users, Lock } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser, can } from '@/lib/auth';
import { computePeriod, netEntitlement } from '@/lib/commission-engine';
import { periodOf, periodLabel, shiftPeriod, targetProgress, periodRange } from '@/lib/commission';
import { formatMoney } from '@/lib/utils';
import { PageHeader, StatCard, Badge, EmptyState, FormField } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'نسبي' };
export const dynamic = 'force-dynamic';

/**
 * شاشة «نسبي» (§٦ من مواصفة النسب).
 *
 * ما يراه كل مستخدم:
 *   - **الأدمن:** ما حصّله هذا الشهر · شريحته · **كم يتبقى للشريحة التالية**
 *     · ما استحقّه · تفصيل بالمشروع
 *   - **المدير:** نسب فريقه فردًا فردًا · حصته هو من كل واحد منهم
 *   - **الإدارة:** إجمالي عبء النسب على الشركة
 *
 * الأرقام **مشتقة** — تُحسب من المشاريع المحصَّلة لحظة فتح الشاشة، فلا
 * تحتاج زر «احسب» ولا تتقادم.
 */
export default async function CommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requireUser();
  const { period: requested } = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(requested ?? '') ? requested! : periodOf(new Date());

  const seesTeam = can(user, 'canViewTeamAnalytics');
  const seesCompany = can(user, 'canViewCompanyAnalytics');
  /**
   * **مبالغ استحقاق الآخرين ونسبهم صلاحية مستقلّة** (قرار الإدارة — المرحلة ١٤).
   * أدمن المبيعات يرى إنتاج زملائه وترتيبهم تحفيزًا، ولا يرى ما يقبضه أحد.
   * والترشيح هنا لا في المتصفح: صفٌّ لا يملكه لا يصل جهازه أصلًا (§٣ بند ٢).
   */
  const seesOthersCommission = can(user, 'canViewOthersCommission');

  const [summary, storedNet, target, clawbacks] = await Promise.all([
    computePeriod(period),
    netEntitlement(user.id, period),
    user.branch
      ? db.branchTarget.findUnique({
          where: { branch_period: { branch: user.branch, period } },
        })
      : Promise.resolve(null),
    // الخصومات — مشاريع حُصّلت في هذه الفترة ثم أُلغيت أو أُعيدت.
    // **مستخرجة من المشاريع لا من القيود**، فتبقى ظاهرة مهما أُعيد بناء
    // الفترة. والترشيح في الخادم: لا يُرسل صف خارج نطاق المستخدم.
    db.project.findMany({
      where: {
        collectedAt: { gte: periodRange(period).start, lt: periodRange(period).end },
        status: { in: ['cancelled', 'rework'] },
        ...(seesCompany
          ? {}
          : seesTeam
            ? { OR: [{ ownerId: user.id }, { owner: { reportsToId: user.id } }] }
            : { ownerId: user.id }),
      },
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        netTotal: true,
        deposit: true,
        collectedAmount: true,
        cancelReason: true,
        owner: { select: { name: true } },
      },
      orderBy: { closedAt: 'desc' },
    }),
  ]);

  // **الترشيح في الخادم:** لا يُرسل سطر خارج نطاق المستخدم ثم يُخفى
  const mine = summary.sellers.find((s) => s.userId === user.id) ?? null;
  // حصته من فريقه تُجمع من الصفقات لا من صفوف البائعين: قد يستحقّها عن صفقة
  // جلبها هو وخدمها غيره، ولو لم يكن مديره الإداري
  const myTeam = summary.sellers.filter((s) =>
    s.projects.some((p) => p.managerId === user.id)
  );
  const visible = !seesOthersCommission
    ? summary.sellers.filter((s) => s.userId === user.id)
    : seesCompany
      ? summary.sellers
      : seesTeam
        ? summary.sellers.filter(
            (s) => s.userId === user.id || s.projects.some((p) => p.managerId === user.id)
          )
        : summary.sellers.filter((s) => s.userId === user.id);

  const myManagerShare = myTeam.reduce(
    (sum, seller) =>
      sum +
      // نصيبه من حصة المدير عند هذا البائع = بقدر ما خدم من صفقاته هو
      (seller.projects.reduce((s, p) => s + p.collected, 0) > 0
        ? (seller.managerAmount *
            seller.projects
              .filter((p) => p.managerId === user.id)
              .reduce((s, p) => s + p.collected, 0)) /
          seller.projects.reduce((s, p) => s + p.collected, 0)
        : 0),
    0
  );
  const achieved = mine?.achieved ?? 0;
  const progress = target ? targetProgress(achieved, target.amount) : 0;

  // الفترة المفتوحة تُعرض **بالحساب الحيّ** حتى لا تتناقض البطاقة مع الجدول
  // تحتها، والمغلقة تُعرض بالقيود المحفوظة لأنها هي التي صُرفت.
  // المشروع المسترد خرج من الحساب الحيّ أصلًا، فلا يُخصم مرة ثانية.
  const myNet = summary.closed ? storedNet : (mine?.adminAmount ?? 0) + myManagerShare;

  return (
    <div className="space-y-6">
      <PageHeader title="نسبي" subtitle="ما حقّقته وما استحققته — محسوبًا من المحصَّل" />

      <div className="flex items-center justify-between gap-3">
        <Link href={`/commissions?period=${shiftPeriod(period, -1)}`} className="btn-secondary">
          → الشهر السابق
        </Link>
        <span className="font-semibold text-slate-800">
          {periodLabel(period)}
          {summary.closed && (
            <Badge className="mr-2 border-slate-300 bg-slate-100 text-slate-600">
              فترة مغلقة
            </Badge>
          )}
        </span>
        <Link href={`/commissions?period=${shiftPeriod(period, 1)}`} className="btn-secondary">
          الشهر التالي ←
        </Link>
      </div>

      {/* ── بطاقاتي ─────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="ما حصّلته هذا الشهر"
          value={formatMoney(achieved)}
          icon={<Wallet className="h-5 w-5" />}
          accent="brand"
        />
        <StatCard
          label="ما استحققته"
          value={formatMoney(myNet)}
          hint={mine ? `شريحتك ${(mine.currentAdminRate * 100).toFixed(1)}٪` : undefined}
          icon={<TrendingUp className="h-5 w-5" />}
          accent="emerald"
        />
        {mine?.remainingToNext !== null && mine?.remainingToNext !== undefined ? (
          <StatCard
            label="يتبقى للشريحة التالية"
            value={formatMoney(mine.remainingToNext)}
            hint={mine.nextTierAt ? `الشريحة التالية عند ${formatMoney(mine.nextTierAt)}` : ''}
            icon={<Target className="h-5 w-5" />}
            accent="amber"
          />
        ) : (
          <StatCard
            label="الشريحة"
            value={mine ? 'الأعلى' : '—'}
            hint={mine ? 'بلغت أعلى شريحة' : 'لا تحصيل بعد'}
            icon={<Target className="h-5 w-5" />}
            accent="slate"
          />
        )}
        {seesOthersCommission && myTeam.length > 0 ? (
          <StatCard
            label="حصتي من فريقي"
            value={formatMoney(myManagerShare)}
            hint={`${myTeam.length} بائع`}
            icon={<Users className="h-5 w-5" />}
            accent="violet"
          />
        ) : (
          <StatCard
            label="هدف الفرع"
            value={target ? formatMoney(target.amount) : 'غير مضبوط'}
            hint={target ? `المحقَّق ${Math.round(progress * 100)}٪` : 'يُضبط من الإعدادات'}
            icon={<Target className="h-5 w-5" />}
            accent="slate"
          />
        )}
      </div>

      {/* ── عتبة الاستحقاق الشخصية ─────────────────────────────
          «إذا تجاوز التارجت ياخد ٣٪ ومديره ٢٪» — وما دونها لا شيء.
          تُعرض صراحةً حتى يعرف الأدمن أين هو منها، لا أن يفاجأ بصفر. */}
      {mine?.target && mine.target > 0 && (
        <div
          className={`card card-pad ${
            mine.targetMet ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'
          }`}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-slate-700">
              عتبة استحقاقك
              <span className="mr-2 text-xs font-normal text-slate-500">
                {mine.targetMet
                  ? 'بلغتها — النسبة مستحقّة'
                  : 'ما دونها لا نسبة — لا لك ولا لمديرك'}
              </span>
            </span>
            <span className="nums text-slate-600">
              {formatMoney(achieved)} من {formatMoney(mine.target)}
              {!mine.targetMet && mine.remainingToTarget !== null && (
                <span className="mr-2 font-semibold text-amber-700">
                  يتبقى {formatMoney(mine.remainingToTarget)}
                </span>
              )}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${
                mine.targetMet ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(100, (achieved / mine.target) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {target && target.amount > 0 && (
        <div className="card card-pad">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">هدف فرعك هذا الشهر</span>
            <span className="nums text-slate-600">
              {formatMoney(achieved)} من {formatMoney(target.amount)} ·{' '}
              {Math.round(progress * 100)}٪
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ── تفصيل بالمشروع ──────────────────────────────────── */}
      {mine && mine.projects.length > 0 && (
        <section>
          <h2 className="mb-3 section-title">مشاريعي المحصَّلة هذا الشهر</h2>
          <div className="card table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الرقم</th>
                  <th>المشروع</th>
                  <th>المحصَّل</th>
                </tr>
              </thead>
              <tbody>
                {mine.projects.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap text-xs text-slate-400" dir="ltr">
                      {p.code}
                    </td>
                    <td>
                      <Link href={`/projects/${p.id}`} className="link">
                        {p.title}
                      </Link>
                    </td>
                    <td className="nums font-medium">{formatMoney(p.collected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── فريقي / الشركة ──────────────────────────────────── */}
      {seesOthersCommission && (seesTeam || seesCompany) && (
        <section>
          <h2 className="mb-3 section-title">
            {seesCompany ? 'كل الفريق' : 'فريقي'}
            <span className="mr-2 text-xs font-normal text-slate-400">
              إجمالي عبء النسب {formatMoney(summary.totalCommission)}
            </span>
          </h2>

          {visible.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<Wallet className="h-10 w-10" />}
                title="لا تحصيل في هذه الفترة"
                description="النسبة تُحتسب عند التحصيل — سجّل تحصيل مشروع مسلَّم لتظهر هنا."
              />
            </div>
          ) : (
            <div className="card table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>البائع</th>
                    <th>الخطة</th>
                    <th>المحصَّل</th>
                    <th>الشريحة</th>
                    <th>يستحق</th>
                    <th>مديره يستحق</th>
                    <th>يتبقى للشريحة التالية</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s) => (
                    <tr key={s.userId} className={s.userId === user.id ? 'bg-brand-50/40' : undefined}>
                      <td className="font-medium text-slate-800">
                        {s.userName}
                        {s.userId === user.id && (
                          <span className="mr-1 text-xs text-slate-400">(أنت)</span>
                        )}
                        {!s.managerId && (
                          <span className="block text-xs text-emerald-700">
                            مستقل — يأخذ النسبة كاملة
                          </span>
                        )}
                      </td>
                      <td className="text-xs text-slate-500">{s.schemeName ?? 'بلا خطة'}</td>
                      <td className="nums font-medium">{formatMoney(s.achieved)}</td>
                      <td className="nums text-slate-600">
                        {(s.currentAdminRate * 100).toFixed(1)}٪
                      </td>
                      <td className="nums font-semibold text-emerald-700">
                        {formatMoney(s.adminAmount)}
                      </td>
                      <td className="nums text-slate-600">
                        {s.managerAmount > 0 ? (
                          <>
                            {formatMoney(s.managerAmount)}
                            {s.managerName && (
                              <span className="block text-xs text-slate-400">
                                {s.managerName}
                              </span>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="nums text-xs text-slate-500">
                        {s.remainingToNext !== null
                          ? formatMoney(s.remainingToNext)
                          : 'أعلى شريحة'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {!seesOthersCommission && can(user, 'canViewLeaderboard') && (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          استحقاقات زملائك ونسبهم لا تُعرض لك.{' '}
          <Link href={`/leaderboard?period=${period}`} className="link font-medium">
            لوحة الترتيب
          </Link>{' '}
          تعرض ما حقّقه الفريق ومركزك بينهم.
        </p>
      )}

      {/* ── ما خرج من الحساب ────────────────────────────────── */}
      {clawbacks.length > 0 && (
        <section>
          <h2 className="mb-3 section-title text-rose-700">
            خرج من حساب هذه الفترة
            <span className="mr-2 text-xs font-normal text-slate-400">
              مشاريع حُصّلت ثم أُلغيت أو أُعيدت — نسبتها مخصومة
            </span>
          </h2>
          <div className="card table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الرقم</th>
                  <th>المشروع</th>
                  {(seesTeam || seesCompany) && <th>البائع</th>}
                  <th>ما كان محصَّلًا</th>
                  <th>المآل</th>
                  <th>السبب</th>
                </tr>
              </thead>
              <tbody>
                {clawbacks.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap text-xs text-slate-400" dir="ltr">
                      {p.code}
                    </td>
                    <td>
                      <Link href={`/projects/${p.id}`} className="link">
                        {p.title}
                      </Link>
                    </td>
                    {(seesTeam || seesCompany) && (
                      <td className="text-slate-700">{p.owner?.name ?? '—'}</td>
                    )}
                    <td className="nums text-rose-700">
                      {formatMoney(Math.min(p.netTotal, p.deposit + p.collectedAmount))}
                    </td>
                    <td>
                      <Badge className="border-rose-200 bg-rose-50 text-rose-700">
                        {p.status === 'cancelled' ? 'ملغى' : 'أُعيد للتنفيذ'}
                      </Badge>
                    </td>
                    <td className="text-xs text-slate-500">{p.cancelReason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── إغلاق الفترة ────────────────────────────────────── */}
      {seesCompany && !summary.closed && (
        <section className="card card-pad">
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-800">
            <Lock className="h-4 w-4 text-slate-500" />
            إغلاق {periodLabel(period)}
          </h2>
          <p className="mb-4 text-sm text-slate-600">
            الإغلاق يثبّت استحقاقات الشهر كما هي الآن. بعده لا يغيّرها تعديل خطة
            ولا شريحة ولا تحصيل متأخر — وهو ما يجعل كشف الرواتب قابلًا للمراجعة.
          </p>
          <form method="post" action="/api/save" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="entity" value="commissionPeriod.close" />
            <input type="hidden" name="period" value={period} />
            <input type="hidden" name="back" value={`/commissions?period=${period}`} />
            <FormField label="ملاحظة (اختياري)" name="note" placeholder="مثال: صُرفت مع رواتب الشهر" />
            <SaveButton>إغلاق الفترة</SaveButton>
          </form>
        </section>
      )}

      <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
        الاستحقاق <b>مشتق لا مُدخَل</b>: يُحسب من المشاريع المحصَّلة في هذه الفترة كل
        مرة تُفتح فيها الشاشة. لا إدخال يدوي، ولا رقم يُعدَّل — ما يُصحَّح هو المشروع
        نفسه. والمشروع المسترد يخرج من الحساب ويظهر في «خرج من حساب هذه الفترة»
        بسببه، ولا يُحذف من النظام أبدًا.
      </p>
    </div>
  );
}
