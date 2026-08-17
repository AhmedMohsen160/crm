import 'server-only';
import { db } from './db';
import {
  channelOfAccount,
  channelLabel,
  acquisitionSummary,
  UNATTRIBUTED,
  type ChannelInput,
  type AcquisitionSummary,
} from './acquisition';
import { sum } from './money';

/**
 * تكلفة اكتساب العميل — ما يقرأ القاعدة.
 *
 * **الطرفان من مصدرين لكلٍّ سيّدُه، ولا ثالث لهما:**
 *   · **المصروف** من دفتر الأستاذ — ما قيّده المحاسب تحت «مصاريف بيعية
 *     وتسويقية». لا خانةَ إدخالٍ ثانية ولا شيتَ حملاتٍ شهريّ: رقمان لشيء
 *     واحد يختلفان ولا يُعرف أيّهما الصحيح.
 *   · **الليدز** من شيت الليدز وما يُدخله الفريق بعده — وكلٌّ بقناته.
 *
 * والقسمة بينهما شهرًا بشهر وقناةً بقناة: إنفاقُ جوجل في مايو على ليدز
 * جوجل في مايو. **وهذا حرفيًّا ما طلبه أحمد.**
 *
 * ── ولماذا لم تظهر تكلفةُ عميلٍ واحد قبل اليوم ────────────────
 *
 * الحساب كان يربط القناة **برمز الحساب** (`exp_ads_google`)، ورموزُ الشجرة
 * المزروعة وحدها. وحسابات المحاسب المرحَّلة من دفاتره **بلا رموز**: اسمُها
 * «م. إشتركات في مجلات وإعلانات» و`Paid Advertising via Platforms Expenses`
 * ولا رمز لواحدٍ منها. فوقع إنفاقُ المكتب كلُّه في «غير منسوب».
 *
 * والعلاج حقلٌ على الحساب يُضبط **مرة واحدة** من شاشة شجرة الحسابات — لا
 * سؤالٌ يتكرّر في كل قيد.
 */

export type MonthlyChannelRow = {
  period: string;
  channel: string;
  label: string;
  spend: number;
  leads: number;
  won: number;
  revenue: number;
};

export type AcquisitionReport = {
  summary: AcquisitionSummary;
  /** شهرًا بشهر لكل قناة — وعليه يُقرأ اتجاه التكلفة لا لحظتُها */
  monthly: MonthlyChannelRow[];
  /** الشهور الداخلة في المدى، تصاعديًّا */
  periods: string[];
  /** إنفاقٌ تسويقيّ لم يُنسب لقناة — يُعرض ولا يُخفى */
  unattributedSpend: number;
  /** حسابات المصروف التسويقي التي لا قناة لها — بأسمائها ومبالغها */
  unmapped: { id: string; name: string; amount: number }[];
};

function periodOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * يبني التقرير عن مدى.
 *
 * **والفرع بُعدٌ اختياريّ**: الفروع بدأت ٢٠٢٦، وما قبلها بلا فرع — فترشيحٌ
 * بفرعٍ على سنةٍ سابقة يُخرج صفرًا صحيحًا لا خطأً.
 */
export async function acquisitionReport(params: {
  from: Date;
  to: Date;
  branch?: string | null;
}): Promise<AcquisitionReport> {
  const { from, to, branch } = params;

  // ── ١ · الإنفاق من الدفتر ────────────────────────────────────
  const spendLines = await db.journalLine.findMany({
    where: {
      entry: { date: { gte: from, lte: to }, status: 'posted' },
      account: { type: 'expense', expenseGroup: 'selling_marketing' },
      ...(branch ? { branch } : {}),
    },
    select: {
      debitBase: true,
      creditBase: true,
      /**
       * **وقناةُ السطر تعلو على قناة حسابه.** دفتر ٢٠٢٦ يضع جوجل وفيسبوك
       * في حسابٍ واحد (`Paid Advertising via Platforms Expenses`)،
       * والتمييز بينهما في بيان القيد. فمن فرّقهما بيدِه على السطر لا
       * يُهدَر عملُه.
       */
      trafficSource: true,
      entry: { select: { date: true } },
      account: { select: { id: true, name: true, code: true, adChannel: true } },
    },
  });

  const spendByChannel = new Map<string, number>();
  const spendByMonth = new Map<string, number>();
  const unmapped = new Map<string, { id: string; name: string; amount: number }>();

  for (const line of spendLines) {
    const net = (line.debitBase ?? 0) - (line.creditBase ?? 0);
    if (net === 0) continue;
    const channel =
      line.trafficSource ?? channelOfAccount(line.account.code, line.account.adChannel);

    spendByChannel.set(channel, (spendByChannel.get(channel) ?? 0) + net);
    const key = `${periodOf(line.entry.date)}|${channel}`;
    spendByMonth.set(key, (spendByMonth.get(key) ?? 0) + net);

    if (channel === UNATTRIBUTED) {
      const seen = unmapped.get(line.account.id);
      if (seen) seen.amount += net;
      else
        unmapped.set(line.account.id, {
          id: line.account.id,
          name: line.account.name,
          amount: net,
        });
    }
  }

  // ── ٢ · الليدز من القمع ──────────────────────────────────────
  const leadRows = await db.lead.groupBy({
    by: ['channel', 'status'],
    where: { createdAt: { gte: from, lte: to }, ...(branch ? { branch } : {}) },
    _count: true,
  });

  const leadsByChannel = new Map<string, { leads: number; won: number }>();
  for (const row of leadRows) {
    const channel = row.channel ?? UNATTRIBUTED;
    const cell = leadsByChannel.get(channel) ?? { leads: 0, won: 0 };
    cell.leads += row._count;
    if (row.status === 'WON') cell.won += row._count;
    leadsByChannel.set(channel, cell);
  }

  /**
   * الشهريّ للّيدز — بالقراءة لا بالتجميع في القاعدة.
   *
   * `groupBy` لا يعرف الشهر في SQLite، والعدد بالآلاف لا بالملايين — فقراءةُ
   * تاريخِ كلٍّ وقناتِه أرخصُ من استعلامٍ لكل شهر.
   */
  const leadDates = await db.lead.findMany({
    where: { createdAt: { gte: from, lte: to }, ...(branch ? { branch } : {}) },
    select: { createdAt: true, channel: true, status: true },
  });
  const leadsByMonth = new Map<string, { leads: number; won: number }>();
  for (const lead of leadDates) {
    const key = `${periodOf(lead.createdAt)}|${lead.channel ?? UNATTRIBUTED}`;
    const cell = leadsByMonth.get(key) ?? { leads: 0, won: 0 };
    cell.leads += 1;
    if (lead.status === 'WON') cell.won += 1;
    leadsByMonth.set(key, cell);
  }

  /**
   * ── ٣ · الإيراد المعترَف به لكل قناة ─────────────────────────
   *
   * **وقناةُ المشروع من ليده، فإن لم يكن فمن ليدِ عميله.**
   *
   * الشيتان مصدران منفصلان: شيت المبيعات يفتح المشاريع، وشيت الليدز
   * يفتح الاستفسارات — ولا يربط أحدُهما مشروعًا بليدٍ بعينه. فألفٌ ومئةٌ
   * وسبعةٌ وأربعون مشروعًا في ٢٠٢٦ **بلا ليد**، ولو وقفنا عندها لكان
   * الإيراد صفرًا في كل قناة ولا عائدَ إنفاقٍ يُقرأ.
   *
   * **والرابط الصحيح بطاقةُ العميل**: الليد التصق بها بالهاتف، والمشروع
   * يقع عليها — فقناةُ العميل هي قناةُ من جاء به.
   */
  const revenueRows = await db.project.findMany({
    where: {
      status: { in: ['delivered', 'collected'] },
      deliveredAt: { gte: from, lte: to },
      ...(branch ? { branch } : {}),
    },
    select: {
      netTotal: true,
      deliveredAt: true,
      lead: { select: { channel: true } },
      client: {
        select: {
          leads: {
            where: { channel: { not: null } },
            select: { channel: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      },
    },
  });
  const revenueByChannel = new Map<string, number>();
  const revenueByMonth = new Map<string, number>();
  for (const project of revenueRows) {
    const channel =
      project.lead?.channel ?? project.client?.leads[0]?.channel ?? UNATTRIBUTED;
    revenueByChannel.set(channel, (revenueByChannel.get(channel) ?? 0) + (project.netTotal ?? 0));
    if (project.deliveredAt) {
      const key = `${periodOf(project.deliveredAt)}|${channel}`;
      revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + (project.netTotal ?? 0));
    }
  }

  // ── ٤ · التجميع ──────────────────────────────────────────────
  const channels = new Set<string>([
    ...spendByChannel.keys(),
    ...leadsByChannel.keys(),
    ...revenueByChannel.keys(),
  ]);

  const rows: ChannelInput[] = [...channels].map((channel) => ({
    channel,
    label: channelLabel(channel),
    spend: spendByChannel.get(channel) ?? 0,
    leads: leadsByChannel.get(channel)?.leads ?? 0,
    won: leadsByChannel.get(channel)?.won ?? 0,
    revenue: revenueByChannel.get(channel) ?? 0,
  }));

  const periods = [
    ...new Set([...spendByMonth.keys(), ...leadsByMonth.keys()].map((k) => k.split('|')[0])),
  ].sort();

  const monthly: MonthlyChannelRow[] = [];
  for (const period of periods) {
    for (const channel of channels) {
      const key = `${period}|${channel}`;
      const spend = spendByMonth.get(key) ?? 0;
      const lead = leadsByMonth.get(key);
      if (!spend && !lead?.leads) continue;
      monthly.push({
        period,
        channel,
        label: channelLabel(channel),
        spend,
        leads: lead?.leads ?? 0,
        won: lead?.won ?? 0,
        revenue: revenueByMonth.get(key) ?? 0,
      });
    }
  }

  return {
    summary: acquisitionSummary(rows),
    monthly,
    periods,
    unattributedSpend: spendByChannel.get(UNATTRIBUTED) ?? 0,
    unmapped: [...unmapped.values()].sort((a, b) => b.amount - a.amount),
  };
}

/**
 * حسابات المصروف التسويقي وقنواتها — لشاشة الضبط.
 *
 * **ويُعرض معها ما وقع عليها فعلًا**، فيعرف الضابطُ أيَّها يستحقّ قناةً:
 * حسابٌ بلا قيدٍ واحد لا يُشغل البال.
 */
export async function marketingAccounts(params: { from: Date; to: Date }) {
  const accounts = await db.account.findMany({
    where: { type: 'expense', expenseGroup: 'selling_marketing' },
    select: { id: true, name: true, code: true, adChannel: true, isPostable: true },
    orderBy: { name: 'asc' },
  });
  if (accounts.length === 0) return [];

  const totals = await db.journalLine.groupBy({
    by: ['accountId'],
    where: {
      accountId: { in: accounts.map((a) => a.id) },
      entry: { date: { gte: params.from, lte: params.to }, status: 'posted' },
    },
    _sum: { debitBase: true, creditBase: true },
  });
  const byId = new Map(
    totals.map((t) => [t.accountId, (t._sum.debitBase ?? 0) - (t._sum.creditBase ?? 0)])
  );

  return accounts
    .map((a) => ({ ...a, amount: byId.get(a.id) ?? 0 }))
    .sort((a, b) => b.amount - a.amount);
}

/** إجمالي الإنفاق التسويقي في المدى — للتحقّق من أن القسمة لم تُسقط شيئًا */
export async function marketingSpendTotal(from: Date, to: Date): Promise<number> {
  const lines = await db.journalLine.findMany({
    where: {
      entry: { date: { gte: from, lte: to }, status: 'posted' },
      account: { type: 'expense', expenseGroup: 'selling_marketing' },
    },
    select: { debitBase: true, creditBase: true },
  });
  return sum(lines.map((l) => (l.debitBase ?? 0) - (l.creditBase ?? 0)));
}
