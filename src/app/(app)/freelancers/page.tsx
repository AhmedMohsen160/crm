import Link from '@/components/link';
import { Plus, Users, Upload, Wallet, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/db';
import { can, requireAnyPermission, requireUser } from '@/lib/auth';
import { listOptions } from '@/lib/reference';
import { FREELANCER_TIERS, RATE_UNITS, type FreelancerTier } from '@/lib/freelancers';
import { formatMoney } from '@/lib/utils';
import { PageHeader, Badge, EmptyState } from '@/components/ui';
import { FilterBar, SearchInput, FilterSelect, KeepParam } from '@/components/filters';

export const metadata = { title: 'الفريلانسرز' };
export const dynamic = 'force-dynamic';

/** لون الدرجة — المعتمد أخضر، الموقوف رمادي، وبينهما تدرّج */
const TIER_STYLE: Record<string, string> = {
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  trial: 'border-amber-200 bg-amber-50 text-amber-700',
  bench: 'border-slate-200 bg-slate-50 text-slate-600',
  suspended: 'border-slate-300 bg-slate-100 text-slate-400',
};

/**
 * سجل الفريلانسرز (§١١).
 *
 * الترشيح كله **في الخادم**: من لا يملك `canViewFreelancerCost` لا يصله
 * السعر في الحمولة أصلًا، ولا يُخفى في الواجهة.
 */
export default async function FreelancersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tier?: string; lang?: string; line?: string; review?: string }>;
}) {
  const { q, tier, lang, line, review } = await searchParams;
  const user = await requireAnyPermission('canViewFreelancerCost', 'canManageFreelancers');
  const seesCost = can(user, 'canViewFreelancerCost');
  const manages = can(user, 'canManageFreelancers');

  const started = Date.now();

  const where = {
    ...(tier ? { tier } : {}),
    ...(review === '1' ? { needsReview: true } : {}),
    ...(lang ? { langs: { contains: lang } } : {}),
    ...(line ? { specialisations: { contains: line } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { code: { contains: q } },
            { phone: { contains: q } },
            { email: { contains: q } },
          ],
        }
      : {}),
  };

  const [rows, total, needsReview, dueTotal, languages, serviceLines] = await Promise.all([
    db.freelancer.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        phone: true,
        langs: true,
        specialisations: true,
        tier: true,
        active: true,
        rating: true,
        projectsCount: true,
        needsReview: true,
        // **الحقل الحسّاس لا يُقرأ أصلًا لمن لا يملك صلاحيته**
        ...(seesCost ? { defaultRate: true, rateUnit: true, currency: true } : {}),
      },
      orderBy: [{ tier: 'asc' }, { projectsCount: 'desc' }, { name: 'asc' }],
      take: 100,
    }),
    db.freelancer.count(),
    db.freelancer.count({ where: { needsReview: true } }),
    can(user, 'canPayFreelancers')
      ? db.freelancerPayment.aggregate({ where: { status: 'due' }, _sum: { amount: true } })
      : Promise.resolve(null),
    listOptions('language'),
    listOptions('service_line'),
  ]);

  const elapsed = Date.now() - started;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="الفريلانسرز"
        subtitle={`${total} مترجمًا في السجل — المعتمدون هم الفريق الحقيقي والباقي مخزون مواهب`}
      >
        {can(user, 'canPayFreelancers') && (
          <Link href="/freelancers/payments" className="btn-secondary">
            <Wallet className="h-4 w-4" />
            المستحقات
            {dueTotal?._sum.amount ? ` · ${formatMoney(dueTotal._sum.amount)}` : ''}
          </Link>
        )}
        {manages && (
          <>
            <Link href="/freelancers/import" className="btn-secondary">
              <Upload className="h-4 w-4" />
              استيراد
            </Link>
            <Link href="/freelancers/new" className="btn-primary">
              <Plus className="h-4 w-4" />
              فريلانسر جديد
            </Link>
          </>
        )}
      </PageHeader>

      {needsReview > 0 && manages && (
        <Link
          href="/freelancers?review=1"
          className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <b>{needsReview}</b> سجلًا يحتاج مراجعة يدوية — جاء من الاستيراد بما لم يُحسم.
          </span>
        </Link>
      )}

      <FilterBar className="mb-4">
        <SearchInput defaultValue={q} placeholder="الاسم أو FL-0001 أو الهاتف" />
        <FilterSelect
          name="tier"
          defaultValue={tier}
          placeholder="كل الدرجات"
          options={Object.entries(FREELANCER_TIERS).map(([value, label]) => ({ value, label }))}
        />
        <FilterSelect name="lang" defaultValue={lang} placeholder="كل اللغات" options={languages} />
        <FilterSelect
          name="line"
          defaultValue={line}
          placeholder="كل التخصصات"
          options={serviceLines}
        />
        <KeepParam name="review" value={review} />
        <span className="text-xs text-slate-400">
          {rows.length} نتيجة في {elapsed} ملّي ثانية
        </span>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="لا فريلانسر بهذه المعايير"
          description="ألف اسم لا يُدخل يدويًا — استورد الملف دفعة واحدة ثم راجع ما لم يُحسم."
          actionHref={manages ? '/freelancers/import' : undefined}
          actionLabel="استيراد من ملف"
        />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>الرقم</th>
                <th>الاسم</th>
                <th>اللغات</th>
                <th>الدرجة</th>
                {seesCost && <th>السعر الافتراضي</th>}
                <th>التقييم</th>
                <th>مشاريع</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id} className={f.active ? undefined : 'opacity-50'}>
                  <td className="whitespace-nowrap text-xs text-slate-400" dir="ltr">
                    {f.code}
                  </td>
                  <td>
                    <Link href={`/freelancers/${f.id}`} className="link font-medium">
                      {f.name}
                    </Link>
                    {f.needsReview && (
                      <span className="mr-1 text-xs text-amber-600">يحتاج مراجعة</span>
                    )}
                    {f.phone && (
                      <span className="block text-xs text-slate-400" dir="ltr">
                        {f.phone}
                      </span>
                    )}
                  </td>
                  <td className="text-xs text-slate-500">{f.langs || '—'}</td>
                  <td>
                    <Badge className={TIER_STYLE[f.tier] ?? TIER_STYLE.bench}>
                      {FREELANCER_TIERS[f.tier as FreelancerTier] ?? f.tier}
                    </Badge>
                  </td>
                  {seesCost && (
                    <td className="nums">
                      {f.defaultRate ? (
                        <>
                          {formatMoney(f.defaultRate, f.currency ?? 'EGP')}
                          <span className="block text-xs text-slate-400">
                            / {RATE_UNITS[(f.rateUnit ?? 'page') as keyof typeof RATE_UNITS]}
                          </span>
                        </>
                      ) : (
                        // الفراغ ليس صفرًا: «لم يُتفق» لا «مجانًا»
                        <span className="text-xs text-amber-600">لم يُتفق</span>
                      )}
                    </td>
                  )}
                  <td className="nums text-slate-600">
                    {f.rating === null ? '—' : `${f.rating}/10`}
                  </td>
                  <td className="nums text-slate-500">{f.projectsCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
