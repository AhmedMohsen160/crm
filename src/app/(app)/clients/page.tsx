import Link from '@/components/link';
import { Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser, can, visibleUserIds } from '@/lib/auth';
import { teamClients } from '@/lib/clients';
import { periodRange } from '@/lib/client-segments';
import { listOptions } from '@/lib/reference';
import { formatMoney } from '@/lib/utils';
import { PageHeader, StatCard } from '@/components/ui';
import ClientsBoard, { type BoardClient } from '@/components/clients-board';

export const metadata = { title: 'العملاء' };
export const dynamic = 'force-dynamic';

/**
 * سجل العملاء.
 *
 * **العميل يتبع من باع له لا من كتب بطاقته.** كان الترشيح على `Client.ownerId`
 * وهو مَن أنشأ السجل، وبيانات المكتب استُوردت دفعةً واحدة فحملت البطاقات كلها
 * اسم المستورد — فيفتح مديرُ المبيعات الشاشة فلا يجد أحدًا، وفريقه قد باع
 * لعشرات. التفصيل في `teamClients`.
 *
 * والشاشة تجيب أسئلة الأدمن الأربعة بلا فتح بطاقة: **من عملائي · كم اشترى
 * كلٌّ منهم · متى آخر مرة · ومن يتابعه**. والتصنيف يقول ما يُفعل اليوم:
 * «متوقّف» اسمٌ يُتصل به، و«متكرّر» علاقةٌ تُصان.
 */
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    admin?: string;
    period?: string;
    segment?: string;
    type?: string;
    branch?: string;
    sort?: string;
    /** بعد حذفٍ نهائيّ — اسم من حُذف وجردُ ما مضى معه */
    purged?: string;
    line?: string;
  }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const seeAll = can(user, 'canViewAllLeads');
  const showValue = can(user, 'canViewSellPrice');
  /**
   * **من يُسند ولا يبيع يرى من قدّم لهم أعمالًا، لا جردَ عملاء المكتب.**
   * العميل يبلغه في بطاقة المشروع الذي نفّذه؛ أما سجلّ العلاقة التجارية
   * كاملًا فلا قرار له فيه.
   */
  const production = can(user, 'canAssignProduction') && !showValue;

  // النطاق نفسه الذي يحكم الليدز والمشاريع — هو ومن يتبعونه إداريًا
  const ownerIds = await visibleUserIds(user);
  const now = new Date();
  const { from, to } = periodRange(params.period, now);

  const [team, branches, result] = await Promise.all([
    // قائمة «فلترة حسب الأدمن»: من يراهم فعلًا لا كل الشركة
    db.user.findMany({
      where: { active: true, ...(ownerIds ? { id: { in: ownerIds } } : {}) },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    listOptions('branch'),
    teamClients({
      ownerIds,
      production,
      adminId: params.admin ?? null,
      from,
      to,
      branch: params.branch ?? null,
      type: params.type ?? null,
      segment: params.segment ?? null,
      term: params.q ?? null,
      sort: params.sort ?? null,
      showValue,
      now,
    }),
  ]);

  const rows: BoardClient[] = result.rows.map((c) => ({
    ...c,
    lastDealAt: c.lastDealAt?.toISOString() ?? null,
  }));

  const countOf = (key: string) => rows.filter((r) => r.segment === key).length;
  const dormant = countOf('dormant');
  const revenue = rows.reduce((s, r) => s + r.totalValue, 0);

  // الفلاتر المطبَّقة تُمرَّر كما هي فيبني بها البحث الفوري نفس الاستعلام
  const filters: Record<string, string> = {};
  for (const key of ['admin', 'period', 'segment', 'type', 'branch', 'sort'] as const) {
    if (params[key]) filters[key] = params[key]!;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="العملاء"
        subtitle={
          production
            ? 'العملاء الذين قدّمت لهم أعمالًا — من دخلت مشاريعهم التشغيل'
            : seeAll
              ? 'كل عملاء المكتب'
              : 'عملاء فريقك — من أتممت أنت أو أحد فريقك معهم بيعًا'
        }
      >
        <Link href="/clients/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          عميل جديد
        </Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="عملاء في نطاقك" value={result.total} accent="brand" />
        <StatCard label="متكرّرون" value={countOf('repeat')} accent="emerald" />
        <StatCard
          label="متوقّفون"
          value={dormant}
          hint="بلا تعامل منذ ١٢٠ يومًا"
          accent={dormant ? 'amber' : 'slate'}
        />
        {showValue ? (
          <StatCard
            label="مشترياتهم"
            value={formatMoney(revenue)}
            hint="ما سُلّم أو حُصّل"
            accent="brand"
          />
        ) : (
          <StatCard
            label="جدد"
            value={countOf('new')}
            accent="slate"
          />
        )}
      </div>

      {params.purged && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          حُذف «<b>{params.purged}</b>» نهائيًّا{params.line ? ` — ${params.line}` : ''}. والأثر في
          سجل التدقيق.
        </p>
      )}

      <ClientsBoard
        initialRows={rows}
        initialTotal={result.total}
        initialQuery={(params.q ?? '').trim()}
        filters={filters}
        branches={branches.map((b) => ({ value: b.value, label: b.label }))}
        team={team.map((t) => ({ value: t.id, label: t.name }))}
        seeAll={seeAll}
        showValue={showValue}
      />
    </div>
  );
}
