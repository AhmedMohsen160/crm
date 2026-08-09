import 'server-only';
import { db } from './db';
import { nextClientCode, nextProjectCode } from './sequence';
import {
  settleMonth,
  bucketClientName,
  periodLabel,
  round2,
  settleTag,
  isGenericCenter,
  clientNameOfCenter,
  type MonthSettlement,
} from './settlement';
import { ownerFor, type OwnerRule } from './client-merge';
import { nameKeyOf } from './import-sales';
import { listOptions } from './reference';

/**
 * تسوية شيت المبيعات على دفتر المحاسب — ما يكتب في القاعدة.
 *
 * ── القاعدة التي أقرّها أحمد حرفيًّا ──────────────────────────
 *
 * > «أرقام شيت المحاسب قطعًا صحيحة… والمطلوب توزيع هذه الواردات على
 * >  العملاء وتسوية الأرقام… ولا نريد رصد فجوة، بل التسوية أفضل وهي
 * >  منطقية… بالتناسب مع ما رُصد لكل عميل.»
 *
 * **فالدفتر هو الحقيقة المالية، وشيت المبيعات ناقصٌ لا خاطئ.** والفارق
 * بينهما عملاءُ لم يُرصدوا ومشترياتٌ متكرّرة لم تُسجَّل — لا مالٌ مفقود.
 *
 * ── وثلاث طبقات بالترتيب ─────────────────────────────────────
 *
 * ١) **العميل الذي سمّاه المحاسب يأخذ رقمه بالضبط.** مراكز الربحية في
 *    الدفتر أسماءُ عملاء: «مشروع دار يتخيلون»، «مشروع قرآن هاوس»،
 *    «مشروع مركز سلام». وهذه ثلثا الإيراد — تدخل بأرقامها لا بتقدير.
 *
 * ٢) **وما بقي على مركزٍ عامّ يُوزَّع بالتناسب** على من رصدهم الشيت في
 *    ذلك الشهر. بالتناسب لا بالتساوي: احتمال أن يكون العميل الكبير صاحبَ
 *    المشتريات غير المرصودة أعلى، والتساوي يقلب أوزان العملاء وترتيبهم.
 *
 * ٣) **وشهرٌ بلا عميل واحد يُنشأ له عميل شهريّ مجمَّع** باسمه الصريح.
 *    التوزيع بالتناسب يحتاج عملاءَ ليُنسَب إليهم، ونسبةُ إيراد مارس إلى
 *    عميلٍ اشترى في نوفمبر تجعل سجلَّه كذبًا يُبنى عليه تصنيفه.
 *
 * ── وما لا يُسوَّى ────────────────────────────────────────────
 *
 * · **فروق العملة ليست بيعًا.** حسابُها من نوع الإيراد في شجرة المحاسب،
 *   لكنه ربحُ صرفٍ لا مشترياتِ عميل — ونسبتُه إلى عميل تكذب على سجلّه.
 * · **وشهرٌ صامتٌ في الدفتر لا يُسوَّى.** الصمت ليس رقمًا، وتصفيرُ ما رصده
 *   الشيت لأن الدفتر ساكت يمحو بيعًا حدث فعلًا.
 * · **ولا تُحسب نسب مبيعات على المبالغ المسوّاة** — وإلا استحقّ الموظفون
 *   نسبًا عن مالٍ نسبه النظام إليهم ولم يبعه أحد.
 */

export type SettlementReport = {
  years: number[];
  /** عملاء أنشأهم الدفتر بأسمائهم — مراكز الربحية */
  namedClients: number;
  namedProjects: number;
  namedAmount: number;
  /** عملاء شهريّون مجمَّعون — شهورٌ لم يرصد فيها الشيت أحدًا */
  bucketClients: number;
  bucketAmount: number;
  /** مشاريع الشيت التي وُسِّعت بالتناسب */
  scaledProjects: number;
  scaledFrom: number;
  scaledTo: number;
  /** شهورٌ رصد فيها الشيت ولم يرصد الدفتر — تبقى كما هي وتُقال */
  monthsWithoutLedger: string[];
  months: MonthSettlement[];
};

/**
 * يسحب تسوية سنةٍ ويردّ الأرقام كما رصدها الشيت.
 *
 * **والردّ قبل الحذف**: مشاريع الشيت الموسَّعة تُستعاد من `preSettleTotal`
 * أولًا، ثم تُحذف ما أنشأته التسوية. ولو عُكس الترتيب لبقيت أرقامٌ موسَّعة
 * بلا ما يشرحها.
 */
export async function rollbackSettlement(year: number): Promise<{ restored: number; removed: number }> {
  const scaled = await db.project.findMany({
    where: { revenueMonth: { startsWith: `${year}-` }, preSettleTotal: { not: null } },
    select: { id: true, preSettleTotal: true },
  });
  for (const p of scaled) {
    await db.project.update({
      where: { id: p.id },
      data: {
        netTotal: p.preSettleTotal!,
        collectedAmount: p.preSettleTotal!,
        preSettleTotal: null,
      },
    });
  }

  const tag = settleTag(year);
  const removed = await db.project.deleteMany({ where: { importTag: tag } });
  const orphans = await db.client.findMany({
    where: { importTag: tag, projects: { none: {} }, leads: { none: {} } },
    select: { id: true },
  });
  await db.client.deleteMany({ where: { id: { in: orphans.map((c) => c.id) } } });

  return { restored: scaled.length, removed: removed.count };
}

/** إيراد الدفتر لسنةٍ مجزَّأً بالشهر ومركز الربحية — بلا فروق العملة */
async function ledgerRevenue(year: number) {
  const accounts = await db.account.findMany({
    where: { type: 'revenue' },
    select: { id: true, name: true },
  });
  // فروق العملة ربحُ صرفٍ لا بيعًا — ونسبتُها إلى عميل تكذب على سجلّه
  const ids = accounts.filter((a) => !/فروق العملة/.test(a.name)).map((a) => a.id);

  const lines = await db.journalLine.findMany({
    where: {
      accountId: { in: ids },
      entry: { period: { startsWith: `${year}-` }, status: 'posted' },
    },
    select: {
      debit: true,
      credit: true,
      costCenterId: true,
      costCenter: { select: { name: true } },
      entry: { select: { period: true } },
    },
  });

  /** الشهر ← { عام: مبلغ, بالاسم: Map<اسم المركز, {amount, centerId}> } */
  const byMonth = new Map<
    string,
    { generic: number; named: Map<string, { amount: number; centerId: string | null }> }
  >();

  for (const line of lines) {
    const period = line.entry.period;
    const net = line.credit - line.debit;
    if (net === 0) continue;
    const bucket = byMonth.get(period) ?? { generic: 0, named: new Map() };
    const center = line.costCenter?.name ?? null;
    if (isGenericCenter(center)) {
      bucket.generic += net;
    } else {
      const name = clientNameOfCenter(center!);
      const cell = bucket.named.get(name) ?? { amount: 0, centerId: line.costCenterId };
      cell.amount += net;
      bucket.named.set(name, cell);
    }
    byMonth.set(period, bucket);
  }

  /**
   * **والمركز الذي صافيه سالبٌ أو صفر يعود إلى العامّ.**
   *
   * ردُّ مبلغٍ لعميلٍ في شهرٍ يجعل صافيه سالبًا، ولا يُفتح له مشروعٌ بمبلغٍ
   * سالب. وتركُه معزولًا يترك ما رُدّ خارج الحساب كلّه — فيزيد مجموعُ
   * النظام على الدفتر بمقدار ما رُدّ. فيُضمّ إلى ما يُوزَّع.
   */
  for (const bucket of byMonth.values()) {
    for (const [name, cell] of [...bucket.named]) {
      if (cell.amount > 0) continue;
      bucket.generic += cell.amount;
      bucket.named.delete(name);
    }
  }

  return byMonth;
}

/** يجد العميل باسمه أو ينشئه — مفتاحه اسمُه، فليس له رقم في الدفتر */
async function clientByName(
  name: string,
  ownerId: string,
  actorId: string,
  tag: string,
  branch: string | null,
  type: 'individual' | 'company'
): Promise<{ id: string; created: boolean }> {
  const key = nameKeyOf(name);
  const existing = await db.client.findUnique({
    where: { phoneNormalized: key },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const made = await db.client.create({
    data: {
      code: await nextClientCode(),
      name,
      phone: name,
      phoneNormalized: key,
      type,
      companyName: type === 'company' ? name : null,
      firstBranch: branch,
      createdById: actorId,
      ownerId,
      importTag: tag,
      notes: 'أُنشئ من دفتر المحاسب — لا رقم له في الدفتر',
    },
    select: { id: true },
  });
  return { id: made.id, created: true };
}

/**
 * يسوّي سنواتٍ كاملة.
 *
 * **والترتيب لازم**: الدفتر وشيت المبيعات يدخلان أولًا، ثم تُبنى التسوية
 * فوقهما. وإعادةُ رفع الشيت تمحو التسوية بالضرورة — فتُعاد بعده.
 */
export async function settleYears(params: {
  years: number[];
  actorId: string;
  rule: OwnerRule;
  /** فرعُ العميل الشهريّ المجمَّع حين لا يرصد الشيت أحدًا */
  fallbackBranch?: string;
}): Promise<SettlementReport> {
  const branchOptions = await listOptions('branch');
  const branchLabel = (value: string | null) =>
    branchOptions.find((b) => b.value === value)?.label ?? 'فاست ترانس';
  const fallbackBranch = params.fallbackBranch ?? 'mokattam';

  const report: SettlementReport = {
    years: [...params.years].sort(),
    namedClients: 0,
    namedProjects: 0,
    namedAmount: 0,
    bucketClients: 0,
    bucketAmount: 0,
    scaledProjects: 0,
    scaledFrom: 0,
    scaledTo: 0,
    monthsWithoutLedger: [],
    months: [],
  };

  for (const year of report.years) {
    await rollbackSettlement(year);
    const tag = settleTag(year);
    const ledger = await ledgerRevenue(year);

    // مشاريع الشيت لهذه السنة — هي وعاءُ التوزيع بالتناسب
    const recorded = await db.project.findMany({
      where: {
        revenueMonth: { startsWith: `${year}-` },
        importTag: { startsWith: 'sales-' },
        netTotal: { gt: 0 },
      },
      select: { id: true, revenueMonth: true, netTotal: true, branch: true, clientId: true },
    });
    const byMonth = new Map<string, typeof recorded>();
    for (const p of recorded) {
      const list = byMonth.get(p.revenueMonth!) ?? [];
      list.push(p);
      byMonth.set(p.revenueMonth!, list);
    }

    const periods = [...new Set([...ledger.keys(), ...byMonth.keys()])].sort();

    for (const period of periods) {
      const book = ledger.get(period);
      const rows = byMonth.get(period) ?? [];

      // ── الطبقة الأولى: العميل الذي سمّاه المحاسب يأخذ رقمه بالضبط ──
      for (const [name, cell] of book?.named ?? []) {
        const owner = ownerFor(name, params.rule);
        const client = await clientByName(name, owner, params.actorId, tag, null, 'company');
        if (client.created) report.namedClients += 1;

        // مركز الربحية يشير إلى عميله — وهو ما أُنشئ الحقل من أجله
        if (cell.centerId) {
          await db.costCenter.updateMany({
            where: { id: cell.centerId, clientId: null },
            data: { clientId: client.id },
          });
        }

        const date = new Date(`${period}-28T00:00:00.000Z`);
        await db.project.create({
          data: {
            code: await nextProjectCode(date),
            title: `${name} — ${periodLabel(period)}`,
            status: 'collected',
            netTotal: round2(cell.amount),
            collectedAmount: round2(cell.amount),
            clientId: client.id,
            ownerId: owner,
            createdAt: date,
            convertedAt: date,
            deliveredAt: date,
            collectedAt: date,
            closedAt: date,
            revenueMonth: period,
            importTag: tag,
            description:
              'إيراد الشهر كما رصده دفتر المحاسب على مركز ربحية هذا العميل — لا تقديرَ فيه',
          },
        });
        report.namedProjects += 1;
        report.namedAmount = round2(report.namedAmount + cell.amount);
      }

      // ── الطبقة الثانية والثالثة: ما بقي على مركزٍ عامّ ──
      const generic = book ? round2(book.generic) : null;
      const dominant =
        rows.length > 0
          ? [...rows.reduce((m, r) => m.set(r.branch, (m.get(r.branch) ?? 0) + r.netTotal), new Map<string | null, number>())]
              .sort((a, b) => b[1] - a[1])[0][0]
          : fallbackBranch;

      const month = settleMonth({
        period,
        branch: dominant ?? fallbackBranch,
        branchLabel: branchLabel(dominant ?? fallbackBranch),
        ledger: generic,
        rows: rows.map((r) => ({ key: r.id, amount: r.netTotal })),
      });
      report.months.push(month);

      if (month.state === 'no_ledger') {
        if (rows.length > 0) report.monthsWithoutLedger.push(period);
        continue;
      }

      if (month.bucket) {
        const owner = params.rule.defaultOwnerId;
        const client = await clientByName(
          month.bucket.name,
          owner,
          params.actorId,
          tag,
          dominant ?? fallbackBranch,
          'individual'
        );
        if (client.created) report.bucketClients += 1;
        const date = new Date(`${period}-28T00:00:00.000Z`);
        await db.project.create({
          data: {
            code: await nextProjectCode(date),
            title: `${month.bucket.name}`,
            status: 'collected',
            netTotal: round2(month.bucket.amount),
            collectedAmount: round2(month.bucket.amount),
            clientId: client.id,
            ownerId: owner,
            branch: dominant ?? fallbackBranch,
            createdAt: date,
            convertedAt: date,
            deliveredAt: date,
            collectedAt: date,
            closedAt: date,
            revenueMonth: period,
            importTag: tag,
            description:
              'تجميعُ إيراد الشهر من دفتر المحاسب — شهرٌ لم يرصد شيت المبيعات فيه عميلًا بعينه',
          },
        });
        report.bucketAmount = round2(report.bucketAmount + month.bucket.amount);
        continue;
      }

      if (month.state === 'settled') {
        for (const row of month.rows) {
          const original = rows.find((r) => r.id === row.key);
          if (!original) continue;
          await db.project.update({
            where: { id: row.key },
            data: {
              preSettleTotal: original.netTotal,
              netTotal: row.settled,
              collectedAmount: row.settled,
            },
          });
          report.scaledProjects += 1;
          report.scaledFrom = round2(report.scaledFrom + original.netTotal);
          report.scaledTo = round2(report.scaledTo + row.settled);
        }
      }
    }
  }

  return report;
}

/** اسم العميل الشهريّ المجمَّع — يُعاد تصديرُه لتقرأه الشاشة */
export { bucketClientName };
