import 'server-only';
import { db } from './db';
import { allSettings } from './reference';
import { absorptionRate, roiDirect, onTimeRate } from './costing';
import { cac, roas, yoyGrowth, round2, monthRange, yearRange } from './accounting';
import { isIncompleteYear } from './migration';
import { REVENUE_FILTER } from './projects';

/**
 * التحليلات (§١٣).
 *
 * كلها **مشتقة من السجلات** — لا جدول ملخّصات يتقادم. والقاعدة الحاكمة:
 * حين لا توجد بيانات كافية نقولها صراحةً، ولا نعرض صفرًا يوهم بأن الرقم
 * صفر. الصفر إجابة، و«لا بيانات» إجابة أخرى.
 */

// الجمع بالقرش الصحيح — لا بـ`+` على الجنيهات (راجع `money.ts`)
import { sumBy } from './money';

export type Range = { from: Date; to: Date };

// ── أهم تقرير في المنظومة: هامش كل نمط تشغيل ───────────────────

export type WorkModeMargin = {
  workMode: string;
  label: string;
  projects: number;
  pages: number;
  weightedPages: number;
  revenue: number;
  /** التكلفة المباشرة كما جُمّدت على المشاريع */
  directCost: number;
  /** التكلفة **المستوعبة**: المباشرة + نصيبها من المصروف غير المباشر */
  loadedCost: number;
  directMargin: number;
  directMarginPct: number;
  loadedMargin: number;
  loadedMarginPct: number;
  roiDirect: number;
  roiLoaded: number;
  /** متوسط سعر الصفحة — يفسّر فرق الهامش: سعرًا أم تكلفة */
  revenuePerPage: number;
  costPerPage: number;
};

/**
 * **«هامش كل نمط تشغيل»** — السؤال الاستراتيجي الذي تصفه المواصفة بأنه سبب
 * وجود المنظومة كلها:
 *
 * > «يقارن هامش الترجمة البشرية الكاملة بهامش المراجعة المكثفة والخفيفة بعد
 * >  الذكاء الاصطناعي على نفس خط الخدمة. **إن لم يرتفع الهامش في أنماط
 * >  الذكاء الاصطناعي فالشركة تنقل الجهد ولا توفّره.** استخدم فيه التكلفة
 * >  المستوعبة لا الفعلية.»
 *
 * التكلفة المستوعبة = المباشرة + نصيب النمط من المصروف غير المباشر، موزَّعًا
 * **بالصفحات الموزونة** لا بعدد المشاريع: مشروع بمئة صفحة يستهلك من طاقة
 * الشركة أضعاف ما يستهلكه مشروع بصفحتين.
 */
export async function workModeMargins(
  range: Range,
  options: { serviceLine?: string | null } = {}
): Promise<{ rows: WorkModeMargin[]; overheadAbsorbed: number; unassigned: number }> {
  const [projects, modes, settings] = await Promise.all([
    db.project.findMany({
      where: {
        ...REVENUE_FILTER,
        deliveredAt: { gte: range.from, lt: range.to },
        ...(options.serviceLine ? { serviceLine: options.serviceLine } : {}),
      },
      select: {
        id: true,
        workMode: true,
        pages: true,
        weightedPages: true,
        netTotal: true,
        costTotal: true,
      },
    }),
    db.listItem.findMany({
      where: { listName: 'work_mode' },
      select: { value: true, label: true },
    }),
    allSettings(),
  ]);

  const label = new Map(modes.map((m) => [m.value, m.label]));
  const monthlyOverhead = Number(settings.monthly_overhead) || 0;
  const months = Math.max(
    1,
    (range.to.getFullYear() - range.from.getFullYear()) * 12 +
      (range.to.getMonth() - range.from.getMonth())
  );
  const overhead = monthlyOverhead * months;

  const totalWeighted = projects.reduce((s, p) => s + (p.weightedPages ?? 0), 0);

  const grouped = new Map<string, typeof projects>();
  let unassigned = 0;
  for (const project of projects) {
    if (!project.workMode) {
      unassigned += 1;
      continue;
    }
    grouped.set(project.workMode, [...(grouped.get(project.workMode) ?? []), project]);
  }

  const rows: WorkModeMargin[] = [];
  for (const [workMode, list] of grouped) {
    const pages = list.reduce((s, p) => s + (p.pages ?? 0), 0);
    const weighted = list.reduce((s, p) => s + (p.weightedPages ?? 0), 0);
    const revenue = sumBy(list, (p) => p.netTotal ?? 0);
    const directCost = sumBy(list, (p) => p.costTotal ?? 0);

    // نصيب النمط من المصروف غير المباشر — بالصفحات الموزونة
    const share = totalWeighted > 0 ? weighted / totalWeighted : 0;
    const loadedCost = round2(directCost + overhead * share);

    rows.push({
      workMode,
      label: label.get(workMode) ?? workMode,
      projects: list.length,
      pages: round2(pages),
      weightedPages: round2(weighted),
      revenue,
      directCost,
      loadedCost,
      directMargin: round2(revenue - directCost),
      directMarginPct: revenue > 0 ? (revenue - directCost) / revenue : 0,
      loadedMargin: round2(revenue - loadedCost),
      loadedMarginPct: revenue > 0 ? (revenue - loadedCost) / revenue : 0,
      roiDirect: roiDirect(revenue, directCost),
      // هنا نستخدم التكلفة المستوعبة مباشرة: نصيب النمط من العبء محسوب
      // بالصفحات الموزونة أعلاه، وهو أدقّ من قسمة العبء بنسبة الإيراد
      roiLoaded: loadedCost > 0 ? round2(revenue / loadedCost) : 0,
      revenuePerPage: pages > 0 ? round2(revenue / pages) : 0,
      costPerPage: pages > 0 ? round2(loadedCost / pages) : 0,
    });
  }

  rows.sort((a, b) => b.loadedMarginPct - a.loadedMarginPct);
  return { rows, overheadAbsorbed: round2(overhead), unassigned };
}

// ── أداء أدمن المبيعات (§١٣) ───────────────────────────────────

export type SellerRow = {
  userId: string;
  name: string;
  branch: string | null;
  leads: number;
  won: number;
  conversionPct: number;
  /** متوسط زمن الرد الأول بالساعات — مؤشر §١٣ الصريح */
  avgFirstReplyHours: number | null;
  projects: number;
  revenue: number;
  avgOrder: number;
  collected: number;
  outstanding: number;
};

export async function sellerPerformance(range: Range): Promise<SellerRow[]> {
  const users = await db.user.findMany({
    where: { active: true },
    select: { id: true, name: true, branch: true },
  });

  const rows = await Promise.all(
    users.map(async (user) => {
      const [leads, won, projects, replies] = await Promise.all([
        db.lead.count({ where: { ownerId: user.id, createdAt: { gte: range.from, lt: range.to } } }),
        db.lead.count({
          where: { ownerId: user.id, status: 'WON', createdAt: { gte: range.from, lt: range.to } },
        }),
        db.project.findMany({
          where: {
            ownerId: user.id,
            ...REVENUE_FILTER,
            deliveredAt: { gte: range.from, lt: range.to },
          },
          select: { netTotal: true, deposit: true, collectedAmount: true },
        }),
        db.lead.findMany({
          where: {
            ownerId: user.id,
            createdAt: { gte: range.from, lt: range.to },
            firstReplyAt: { not: null },
          },
          select: { createdAt: true, firstReplyAt: true },
        }),
      ]);

      const revenue = sumBy(projects, (p) => p.netTotal ?? 0);
      const collected = round2(
        projects.reduce((s, p) => s + p.deposit + p.collectedAmount, 0)
      );

      // متوسط زمن الرد — من الليدز التي رُدّ عليها فعلًا فقط
      const gaps = replies
        .map((l) => (l.firstReplyAt!.getTime() - l.createdAt.getTime()) / 3_600_000)
        .filter((h) => h >= 0);
      const avgFirstReplyHours =
        gaps.length > 0 ? round2(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;

      return {
        userId: user.id,
        name: user.name,
        branch: user.branch,
        leads,
        won,
        conversionPct: leads > 0 ? won / leads : 0,
        avgFirstReplyHours,
        projects: projects.length,
        revenue,
        avgOrder: projects.length > 0 ? round2(revenue / projects.length) : 0,
        collected,
        outstanding: round2(Math.max(0, revenue - collected)),
      };
    })
  );

  return rows.filter((r) => r.leads > 0 || r.projects > 0).sort((a, b) => b.revenue - a.revenue);
}

// ── القمع والقنوات ─────────────────────────────────────────────

export type ChannelRow = {
  channel: string;
  label: string;
  leads: number;
  won: number;
  conversionPct: number;
  revenue: number;
  spend: number;
  cac: number | null;
  roas: number | null;
};

/**
 * القنوات مع تكلفة الاكتساب.
 *
 * الإنفاق يُقرأ من **دفتر الأستاذ** (حسابات الإعلانات المدفوعة) لا من إدخال
 * يدوي — فرقم الـCAC يطابق ما صُرف فعلًا في الشهر.
 */
export async function channelPerformance(range: Range): Promise<ChannelRow[]> {
  const [items, leads, projects, adSpend] = await Promise.all([
    db.listItem.findMany({ where: { listName: 'channel' }, select: { value: true, label: true } }),
    db.lead.groupBy({
      by: ['channel', 'status'],
      where: { createdAt: { gte: range.from, lt: range.to } },
      _count: true,
    }),
    db.project.groupBy({
      by: ['branch'],
      where: { ...REVENUE_FILTER, deliveredAt: { gte: range.from, lt: range.to } },
      _sum: { netTotal: true },
    }),
    db.journalLine.findMany({
      where: {
        entry: { status: 'posted', date: { gte: range.from, lt: range.to } },
        account: { systemKey: { in: ['exp_ads_google', 'exp_ads_facebook'] } },
      },
      include: { account: { select: { systemKey: true } } },
    }),
  ]);
  void projects;

  const spendByChannel: Record<string, number> = {
    google_ads: adSpend
      .filter((l) => l.account.systemKey === 'exp_ads_google')
      .reduce((s, l) => s + l.debitBase - l.creditBase, 0),
    meta_ads: adSpend
      .filter((l) => l.account.systemKey === 'exp_ads_facebook')
      .reduce((s, l) => s + l.debitBase - l.creditBase, 0),
  };

  const label = new Map(items.map((i) => [i.value, i.label]));

  const byChannel = new Map<string, { leads: number; won: number }>();
  for (const row of leads) {
    const key = row.channel ?? 'unknown';
    const entry = byChannel.get(key) ?? { leads: 0, won: 0 };
    entry.leads += row._count;
    if (row.status === 'WON') entry.won += row._count;
    byChannel.set(key, entry);
  }

  // إيراد القناة يُقرأ من مشاريع ليدزها — لا من الفرع
  const revenueRows = await db.project.findMany({
    where: { ...REVENUE_FILTER, deliveredAt: { gte: range.from, lt: range.to } },
    select: { netTotal: true, lead: { select: { channel: true } } },
  });
  const revenueByChannel = new Map<string, number>();
  for (const row of revenueRows) {
    const key = row.lead?.channel ?? 'unknown';
    revenueByChannel.set(key, (revenueByChannel.get(key) ?? 0) + (row.netTotal ?? 0));
  }

  const keys = new Set([...byChannel.keys(), ...revenueByChannel.keys()]);

  return [...keys]
    .map((channel) => {
      const entry = byChannel.get(channel) ?? { leads: 0, won: 0 };
      const revenue = round2(revenueByChannel.get(channel) ?? 0);
      const spend = round2(spendByChannel[channel] ?? 0);
      return {
        channel,
        label: label.get(channel) ?? (channel === 'unknown' ? 'غير محدد' : channel),
        leads: entry.leads,
        won: entry.won,
        conversionPct: entry.leads > 0 ? entry.won / entry.leads : 0,
        revenue,
        spend,
        // بلا عملاء لا يُقسَّم على صفر — «لا بيانات» لا صفر
        cac: cac(spend, entry.won),
        roas: roas(revenue, spend),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

// ── القمع من الليد إلى التحصيل ─────────────────────────────────

export async function funnel(range: Range) {
  const [leads, won, delivered, collected] = await Promise.all([
    db.lead.count({ where: { createdAt: { gte: range.from, lt: range.to } } }),
    db.lead.count({ where: { status: 'WON', createdAt: { gte: range.from, lt: range.to } } }),
    db.project.count({
      where: { status: { in: ['delivered', 'collected'] }, deliveredAt: { gte: range.from, lt: range.to } },
    }),
    db.project.count({
      where: { status: 'collected', collectedAt: { gte: range.from, lt: range.to } },
    }),
  ]);

  return [
    { stage: 'ليدز', count: leads },
    { stage: 'فائزة', count: won },
    { stage: 'مسلَّمة', count: delivered },
    { stage: 'محصَّلة', count: collected },
  ];
}

// ── تكرار العملاء وقيمتهم ──────────────────────────────────────

export async function clientValue(range: Range) {
  const projects = await db.project.findMany({
    where: { ...REVENUE_FILTER, deliveredAt: { gte: range.from, lt: range.to } },
    select: { clientId: true, netTotal: true },
  });

  const byClient = new Map<string, { count: number; revenue: number }>();
  for (const p of projects) {
    if (!p.clientId) continue;
    const row = byClient.get(p.clientId) ?? { count: 0, revenue: 0 };
    row.count += 1;
    row.revenue += p.netTotal ?? 0;
    byClient.set(p.clientId, row);
  }

  const clients = [...byClient.values()];
  const repeat = clients.filter((c) => c.count > 1);

  return {
    clients: clients.length,
    repeatClients: repeat.length,
    repeatPct: clients.length > 0 ? repeat.length / clients.length : 0,
    avgValue: clients.length > 0 ? round2(clients.reduce((s, c) => s + c.revenue, 0) / clients.length) : 0,
    avgOrdersPerClient:
      clients.length > 0 ? round2(clients.reduce((s, c) => s + c.count, 0) / clients.length) : 0,
  };
}

// ── أداء المنتِجين (§١٣) ───────────────────────────────────────

export async function producerPerformance(range: Range) {
  const [producers, settings] = await Promise.all([
    db.user.findMany({
      where: { active: true, isProducer: true },
      select: { id: true, name: true, staffCost: true },
    }),
    allSettings(),
  ]);
  const workingDays = Number(settings.working_days) || 26;

  return Promise.all(
    producers.map(async (producer) => {
      const projects = await db.project.findMany({
        where: {
          primaryProducerId: producer.id,
          ...REVENUE_FILTER,
          deliveredAt: { gte: range.from, lt: range.to },
        },
        select: {
          weightedPages: true,
          netTotal: true,
          costTotal: true,
          deadline: true,
          deliveredAt: true,
          qaIssues: true,
          isRework: true,
        },
      });

      const weighted = round2(projects.reduce((s, p) => s + (p.weightedPages ?? 0), 0));
      const revenue = round2(projects.reduce((s, p) => s + (p.netTotal ?? 0), 0));
      const cost = round2(projects.reduce((s, p) => s + (p.costTotal ?? 0), 0));
      const qaIssues = projects.reduce((s, p) => s + p.qaIssues, 0);
      const reworks = projects.filter((p) => p.isRework).length;

      const months = Math.max(
        1,
        (range.to.getFullYear() - range.from.getFullYear()) * 12 +
          (range.to.getMonth() - range.from.getMonth())
      );
      const capacity = (producer.staffCost?.dailyCapacity ?? 0) * workingDays * months;

      return {
        userId: producer.id,
        name: producer.name,
        projects: projects.length,
        weightedPages: weighted,
        revenue,
        cost,
        margin: round2(revenue - cost),
        marginPct: revenue > 0 ? (revenue - cost) / revenue : 0,
        roi: roiDirect(revenue, cost),
        // نسبة استيعاب الطاقة — الطاقة غير المستغَلة تكلفة صامتة
        // نسبة استيعاب الطاقة = المنجَز ÷ الطاقة المتاحة
        absorption: capacity > 0 ? round2(absorptionRate(weighted, capacity)) : null,
        onTime: onTimeRate(
          projects.map((p) => ({ deadline: p.deadline, deliveredAt: p.deliveredAt }))
        ),
        qaPer100: weighted > 0 ? round2((qaIssues / weighted) * 100) : 0,
        reworkPct: projects.length > 0 ? reworks / projects.length : 0,
      };
    })
  );
}

// ── الاتجاه السنوي ─────────────────────────────────────────────

export async function yearlyTrend(years: number[]) {
  return Promise.all(
    years.map(async (year) => {
      const { start, end } = yearRange(year);
      const [projects, leads] = await Promise.all([
        db.project.aggregate({
          where: { ...REVENUE_FILTER, deliveredAt: { gte: start, lt: end } },
          _sum: { netTotal: true, costTotal: true },
          _count: true,
        }),
        db.lead.count({ where: { createdAt: { gte: start, lt: end } } }),
      ]);

      const revenue = round2(projects._sum.netTotal ?? 0);
      const cost = round2(projects._sum.costTotal ?? 0);

      return {
        year,
        revenue,
        cost,
        margin: round2(revenue - cost),
        marginPct: revenue > 0 ? (revenue - cost) / revenue : 0,
        projects: projects._count,
        leads,
        avgOrder: projects._count > 0 ? round2(revenue / projects._count) : 0,
        // §١٤: ٢٠٢٤ ناقصة — لا تصلح خط أساس، ونقولها في التقرير نفسه
        incomplete: isIncompleteYear(year),
      };
    })
  ).then((rows) =>
    rows.map((row, i) => ({
      ...row,
      growth: i > 0 ? yoyGrowth(row.revenue, rows[i - 1].revenue) : null,
      // النمو المقارَن بسنة ناقصة لا معنى له
      growthReliable: i > 0 ? !rows[i - 1].incomplete && !row.incomplete : false,
    }))
  );
}

export { monthRange, yearRange };
