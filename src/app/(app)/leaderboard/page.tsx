import Link from '@/components/link';
import { Trophy, Wallet, Users } from 'lucide-react';
import { requirePermission, can, canAny, visibleUserIds } from '@/lib/auth';
import { computePeriod } from '@/lib/commission-engine';
import { periodOf, periodLabel, shiftPeriod, rankBy, medal } from '@/lib/commission';
import { formatMoney } from '@/lib/utils';
import { PageHeader, StatCard, EmptyState, Badge } from '@/components/ui';

export const metadata = { title: 'لوحة الترتيب' };
export const dynamic = 'force-dynamic';

/**
 * لوحة ترتيب المبيعات — «منافسة دومًا لأعلى سكور ومراكز مرتّبة من الأول
 * للثاني للثالث».
 *
 * **ما تعرضه: المحقَّق. وما لا تعرضه: ما يقبضه أحد.** والفرق مقصود — أدمن
 * المبيعات يرى أين هو من زملائه ولا يرى نسبهم، فتبقى المنافسة على الإنتاج
 * لا على الأجر. ومن يملك `canViewOthersCommission` يرى عمودًا زائدًا فيه
 * الاستحقاق، لأنه يراه في شاشة «نسبي» أصلًا.
 *
 * والترشيح في الخادم: صفوف الاستحقاق لا تُبنى أصلًا لمن لا يملك رؤيتها.
 *
 * **واللوحة لوحةُ فريقٍ لا لوحةُ شركة.** كان كل من يفتحها يرى كل من باع في
 * الشركة — فيرى مديرُ المبيعات أرقام فريقٍ آخر، ويرى أرقامَ من ليس بائعًا
 * أصلًا فتختلط المنافسة. فصار النطاق نطاقَ الرؤية نفسه (هو ومن يتبعونه)،
 * ولا يراها كاملةً إلا من يملك تحليلات الشركة أو دفاترها: المالك والمدير
 * التنفيذي والمحاسب.
 */
export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requirePermission('canViewLeaderboard');
  const { period: requested } = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(requested ?? '') ? requested! : periodOf(new Date());

  const summary = await computePeriod(period);
  const seesCommission = can(user, 'canViewOthersCommission');

  // من يرى الشركة كلها: تحليلاتها أو دفاترها. وما عداه يرى نطاقه وحده.
  const seesEveryone = canAny(user, 'canViewCompanyAnalytics', 'canManageAccounting');
  const scopeIds = seesEveryone ? null : await visibleUserIds(user);
  const inScope = (userId: string) => scopeIds === null || scopeIds.includes(userId);

  const rows = rankBy(
    summary.sellers.filter((s) => inScope(s.userId)).map((s) => ({
      userId: s.userId,
      userName: s.userName,
      achieved: s.achieved,
      deals: s.projects.length,
      target: s.target,
      targetMet: s.targetMet,
      // لا يُرسل المبلغ لمن لا يملك رؤيته — لا يُخفى في المتصفح
      entitlement: seesCommission ? s.adminAmount : null,
    })),
    (r) => r.achieved
  );

  const me = rows.find((r) => r.userId === user.id) ?? null;
  const podium = rows.slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHeader
        title="لوحة الترتيب"
        subtitle="ما حقّقه الفريق هذا الشهر — بالمحصَّل فعلًا لا بالمُباع"
      />

      <div className="flex items-center justify-between gap-3">
        <Link href={`/leaderboard?period=${shiftPeriod(period, -1)}`} className="btn-secondary">
          → الشهر السابق
        </Link>
        <span className="font-semibold text-slate-800">{periodLabel(period)}</span>
        <Link href={`/leaderboard?period=${shiftPeriod(period, 1)}`} className="btn-secondary">
          الشهر التالي ←
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="مركزي"
          value={me ? `${me.rank} من ${rows.length}` : '—'}
          hint={me ? (medal(me.rank) ?? 'واصِل') : 'لا تحصيل لك بعد هذا الشهر'}
          icon={<Trophy className="h-5 w-5" />}
          accent={me && me.rank <= 3 ? 'amber' : 'slate'}
        />
        <StatCard
          label="ما حقّقته"
          value={formatMoney(me?.achieved ?? 0)}
          hint={me ? `${me.deals} صفقة محصَّلة` : undefined}
          icon={<Wallet className="h-5 w-5" />}
          accent="brand"
        />
        <StatCard
          label="إجمالي الفريق"
          value={formatMoney(summary.totalAchieved)}
          hint={`${rows.length} بائعًا حصّل هذا الشهر`}
          icon={<Users className="h-5 w-5" />}
          accent="emerald"
        />
      </div>

      {podium.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {podium.map((row) => (
            <div
              key={row.userId}
              className={`card card-pad text-center ${
                row.userId === user.id ? 'border-brand-300 bg-brand-50/50' : ''
              }`}
            >
              <p className="text-3xl">{medal(row.rank)}</p>
              <p className="mt-1 font-bold text-slate-800">{row.userName}</p>
              <p className="nums mt-1 text-lg font-semibold text-emerald-700">
                {formatMoney(row.achieved)}
              </p>
              <p className="text-xs text-slate-500">{row.deals} صفقة</p>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Trophy className="h-10 w-10" />}
            title="لا تحصيل في هذا الشهر بعد"
            description="الترتيب يُبنى على المحصَّل فعلًا — سجّل تحصيل مشروع مسلَّم ليظهر الفريق هنا."
          />
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>المركز</th>
                <th>البائع</th>
                <th>المحصَّل</th>
                <th>الصفقات</th>
                <th>العتبة</th>
                {seesCommission && <th>يستحق</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.userId}
                  className={row.userId === user.id ? 'bg-brand-50/40' : undefined}
                >
                  <td className="nums font-bold text-slate-700">
                    {medal(row.rank) ?? row.rank}
                  </td>
                  <td className="font-medium text-slate-800">
                    {row.userName}
                    {row.userId === user.id && (
                      <span className="mr-1 text-xs text-slate-400">(أنت)</span>
                    )}
                  </td>
                  <td className="nums font-semibold">{formatMoney(row.achieved)}</td>
                  <td className="nums text-slate-600">{row.deals}</td>
                  <td>
                    {row.target ? (
                      <Badge
                        className={
                          row.targetMet
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700'
                        }
                      >
                        {row.targetMet ? 'بلغ العتبة' : 'دون العتبة'}
                      </Badge>
                    ) : (
                      /* «غير مقيس» تُعرض شرطة لا صفرًا — والفرق قرارٌ في حق إنسان */
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  {seesCommission && (
                    <td className="nums text-emerald-700">
                      {formatMoney(row.entitlement ?? 0)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
        الترتيب بالمحصَّل فعلًا لا بالمُباع، فلا يتقدّم من باع ولم يُحصّل. والمتساويان
        يشتركان في المركز نفسه. والصفقة التي جلبها غيرك وخدمتها أنت تُحسب لك، وصفقتك
        التي خدمها غيرك تُحسب له — فالترتيب على الخدمة لا على الاسم.
      </p>
    </div>
  );
}
