import 'server-only';
import { db } from './db';
import {
  buildTree,
  employeeRoi,
  flattenTree,
  loadedHourlyCost,
  payrollTotals,
  payslip,
  periodRange,
  round2,
  tenureMonths,
  weightedScore,
  type Component,
  type Payslip,
} from './hr';
import { onTimeRate } from './costing';

/**
 * الموارد البشرية — ما يلمس القاعدة.
 *
 * تكلفة الموظف هنا **من هيكل أجره لا من خانة راتب واحدة**: الأساسي والبدلات
 * والحوافز. وهي التكلفة التي تُقاس عليها العوائد، فقسمة الإيراد على الأساسي
 * وحده تُظهر عائدًا أعلى مما هو.
 */

/** بنود أجر موظف كما تصل الدالة الخالصة */
async function componentsOf(userId: string): Promise<Component[]> {
  const rows = await db.salaryComponent.findMany({ where: { userId } });
  return rows.map((r) => ({
    kind: r.kind,
    label: r.label,
    amount: r.amount,
    isPercent: r.isPercent,
    frequency: r.frequency,
    period: r.period,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    active: r.active,
  }));
}

export async function payslipFor(userId: string, period: string): Promise<Payslip> {
  return payslip(await componentsOf(userId), period);
}

/** الشجرة التنظيمية بأعدادها */
export async function departmentTree() {
  const [departments, counts] = await Promise.all([
    db.department.findMany({
      where: { active: true },
      include: { manager: { select: { id: true, name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    db.user.groupBy({
      by: ['departmentId'],
      where: { active: true },
      _count: { _all: true },
    }),
  ]);

  const headcount = new Map(counts.map((c) => [c.departmentId ?? '', c._count._all]));
  const rows = departments.map((d) => ({ ...d, headcount: headcount.get(d.id) ?? 0 }));
  return { tree: buildTree(rows), flat: flattenTree(buildTree(rows)), unassigned: headcount.get('') ?? 0 };
}

export type EmployeeRow = {
  id: string;
  name: string;
  jobTitle: string | null;
  department: string | null;
  branch: string | null;
  canLogin: boolean;
  isProducer: boolean;
  active: boolean;
  hireDate: Date | null;
  tenure: number | null;
  employmentType: string | null;
  slip: Payslip;
};

/** كشف الموظفين مع أجورهم في شهر */
export async function employees(period: string, includeInactive = false): Promise<EmployeeRow[]> {
  const users = await db.user.findMany({
    where: includeInactive ? {} : { active: true },
    include: { department: { select: { name: true } } },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });

  const now = new Date();
  const rows: EmployeeRow[] = [];
  for (const user of users) {
    rows.push({
      id: user.id,
      name: user.name,
      jobTitle: user.jobTitle,
      department: user.department?.name ?? null,
      branch: user.branch,
      canLogin: user.canLogin,
      isProducer: user.isProducer,
      active: user.active,
      hireDate: user.hireDate,
      tenure: tenureMonths(user.hireDate, now),
      employmentType: user.employmentType,
      slip: await payslipFor(user.id, period),
    });
  }
  return rows;
}

export type PerformanceRow = {
  id: string;
  name: string;
  department: string | null;
  /** تكلفة الشهر المحمَّلة — الأساسي والبدلات والحوافز */
  cost: number;
  hourlyCost: number | null;
  /** الإيراد المنسوب من المشاريع المسلَّمة في الفترة */
  revenue: number;
  roi: number | null;
  /** صفحات موزونة أنتجها */
  weightedPages: number;
  projects: number;
  onTimePct: number | null;
  qaPer100: number | null;
  score: number | null;
};

/**
 * أداء الموظفين وعوائدهم في فترة.
 *
 * **الإيراد المنسوب لا الإيراد الكلي**: المشروع الذي شارك فيه ثلاثة يُنسب
 * إليهم بحصصهم لا كاملًا لكلّ منهم، وإلا صار مجموع «إيراد الموظفين» أضعاف
 * إيراد الشركة.
 *
 * وما لا يُقاس يُعاد `null` لا صفرًا: موظف بلا مشاريع في الفترة **غير مقيس**
 * لا «أداؤه صفر»، والفرق بينهما قرارٌ يُتّخذ في حق إنسان.
 */
export async function performance(params: {
  from: Date;
  to: Date;
  period: string;
}): Promise<PerformanceRow[]> {
  const [users, settings] = await Promise.all([
    db.user.findMany({
      where: { active: true },
      include: { department: { select: { name: true } }, staffCost: true },
      orderBy: { name: 'asc' },
    }),
    db.setting.findMany({ where: { key: { in: ['working_days'] } } }),
  ]);

  const workingDays = Number(settings.find((s) => s.key === 'working_days')?.value ?? 26) || 26;

  const rows: PerformanceRow[] = [];
  for (const user of users) {
    const slip = await payslipFor(user.id, params.period);

    // المشاريع المسلَّمة في الفترة التي كان منفِّذها الرئيسي
    const projects = await db.project.findMany({
      where: {
        primaryProducerId: user.id,
        status: { in: ['delivered', 'collected'] },
        deliveredAt: { gte: params.from, lte: params.to },
      },
      select: {
        netTotal: true,
        weightedPages: true,
        qaIssues: true,
        deadline: true,
        deliveredAt: true,
        reviewerId: true,
      },
    });

    const weightedPages = round2(projects.reduce((s, p) => s + (p.weightedPages ?? 0), 0));
    // المشروع الذي له مراجع يُنسب نصفه للمنفِّذ — حصة تشغيلية لا محاسبية
    const revenue = round2(
      projects.reduce((s, p) => s + (p.netTotal ?? 0) * (p.reviewerId ? 0.5 : 1), 0)
    );
    const qaIssues = projects.reduce((s, p) => s + (p.qaIssues ?? 0), 0);

    const timing = onTimeRate(
      projects.map((p) => ({ deadline: p.deadline, deliveredAt: p.deliveredAt }))
    );

    const cost = slip.gross;
    const hourlyCost = loadedHourlyCost({
      monthlyCost: cost,
      workingDays,
      hoursPerDay: 8,
      productiveRatio: user.staffCost?.productiveRatio ?? 0.7,
    });

    const roi = employeeRoi(revenue, cost);
    const qaPer100 = weightedPages > 0 ? round2((qaIssues / weightedPages) * 100) : null;

    rows.push({
      id: user.id,
      name: user.name,
      department: user.department?.name ?? null,
      cost,
      hourlyCost,
      revenue,
      roi,
      weightedPages,
      projects: projects.length,
      onTimePct: timing.rate,
      qaPer100,
      score: weightedScore([
        // العائد يُقيَّد بواحد صحيح فلا يبتلع موظفٌ استثنائيّ بقية المؤشرات
        { value: roi === null ? null : Math.max(0, Math.min(1, roi)), weight: 3 },
        { value: timing.rate, weight: 2 },
        { value: qaPer100 === null ? null : Math.max(0, 1 - qaPer100 / 10), weight: 1 },
      ]),
    });
  }

  return rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

export type OwnWork = {
  /** خطوات نفّذها في الفترة — عمله هو كما رصده مدير المشاريع */
  steps: {
    id: string;
    stepType: string;
    pages: number;
    weightedPages: number;
    projectId: string;
    projectCode: string | null;
    projectTitle: string;
    deliveredAt: Date | null;
  }[];
  weightedPages: number;
  projectCount: number;
  producedCount: number;
  reviewedCount: number;
  /** نسبة التسليم في الموعد — `null` حين لا مشروع مسلَّم يُقاس عليه */
  onTimePct: number | null;
  /** ملاحظات الجودة لكل مئة صفحة موزونة — `null` حين لا إنتاج */
  qaPer100: number | null;
};

/**
 * **عمل الشخص نفسه — بلا رقم تكلفة واحد.**
 *
 * هذه شاشة المترجم: «وجوده على النظام ليس شرطًا، لكن لو أراد رؤية أدائه
 * وتقدّمه ومشاريعه — دون عرض للتكلفات». فلا `cost` ولا `hourlyCost` ولا
 * `revenue` ولا `roi` في هذا النوع أصلًا، لا محجوبةً في الواجهة: الحقل الذي
 * لا يملكه المستخدم **لا يُبنى** (§٣ بند ٢).
 *
 * وما لا يُقاس يُعاد `null` لا صفرًا: شهرٌ بلا تسليم «غير مقيس» لا «صفر
 * التزام بالمواعيد».
 */
export async function ownWork(userId: string, from: Date, to: Date): Promise<OwnWork> {
  const [steps, produced, reviewed] = await Promise.all([
    db.projectStep.findMany({
      where: {
        performerId: userId,
        project: { deliveredAt: { gte: from, lte: to } },
      },
      select: {
        id: true,
        stepType: true,
        pages: true,
        weightedPages: true,
        projectId: true,
        project: { select: { code: true, title: true, deliveredAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    db.project.findMany({
      where: {
        primaryProducerId: userId,
        status: { in: ['delivered', 'collected'] },
        deliveredAt: { gte: from, lte: to },
      },
      select: { qaIssues: true, deadline: true, deliveredAt: true, weightedPages: true },
    }),
    db.project.count({
      where: {
        reviewerId: userId,
        status: { in: ['delivered', 'collected'] },
        deliveredAt: { gte: from, lte: to },
      },
    }),
  ]);

  const stepPages = round2(steps.reduce((s, x) => s + x.weightedPages, 0));
  const producedPages = round2(produced.reduce((s, p) => s + (p.weightedPages ?? 0), 0));
  // الخطوات أدقّ حين وُجدت؛ وإلا فالمشاريع التي كان منفِّذها الرئيسي
  const weightedPages = stepPages > 0 ? stepPages : producedPages;

  const qaIssues = produced.reduce((s, p) => s + (p.qaIssues ?? 0), 0);
  const timing = onTimeRate(
    produced.map((p) => ({ deadline: p.deadline, deliveredAt: p.deliveredAt }))
  );

  const projectIds = new Set(steps.map((s) => s.projectId));

  return {
    steps: steps.map((s) => ({
      id: s.id,
      stepType: s.stepType,
      pages: s.pages,
      weightedPages: s.weightedPages,
      projectId: s.projectId,
      projectCode: s.project.code,
      projectTitle: s.project.title,
      deliveredAt: s.project.deliveredAt,
    })),
    weightedPages,
    projectCount: projectIds.size,
    producedCount: produced.length,
    reviewedCount: reviewed,
    onTimePct: timing.rate,
    qaPer100: weightedPages > 0 ? round2((qaIssues / weightedPages) * 100) : null,
  };
}

/**
 * يبني كشف رواتب الشهر من هيكل الأجر الساري.
 *
 * البناء **يُعيد الكتابة على المسوّدة ولا يمسّ المعتمد**: كشفٌ اعتُمد صار
 * التزامًا، وإعادة بنائه تغيّر رقمًا وُعد به موظف.
 */
export async function buildPayroll(period: string, userId: string) {
  const existing = await db.payrollRun.findUnique({ where: { period } });
  if (existing && existing.status !== 'draft') {
    throw new Error('كشف هذا الشهر معتمد — لا يُعاد بناؤه');
  }

  const { end } = periodRange(period);
  const staff = await db.user.findMany({
    where: {
      active: true,
      // من انتهت خدمته قبل الشهر لا يدخل كشفه
      OR: [{ endDate: null }, { endDate: { gte: end } }],
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const slips: { userId: string; slip: Payslip }[] = [];
  for (const person of staff) {
    const slip = await payslipFor(person.id, period);
    // من لا أجر له لا يدخل الكشف — سطرٌ بصفر يُوهم بأن راتبه صفر
    if (slip.gross === 0 && slip.deductions === 0) continue;
    slips.push({ userId: person.id, slip });
  }

  const totals = payrollTotals(slips.map((s) => s.slip));

  const run = await db.payrollRun.upsert({
    where: { period },
    update: {
      totalBasic: totals.basic,
      totalAllowances: totals.allowances,
      totalIncentives: totals.incentives,
      totalDeductions: totals.deductions,
      totalNet: totals.net,
    },
    create: {
      period,
      status: 'draft',
      totalBasic: totals.basic,
      totalAllowances: totals.allowances,
      totalIncentives: totals.incentives,
      totalDeductions: totals.deductions,
      totalNet: totals.net,
    },
  });

  await db.payrollLine.deleteMany({ where: { runId: run.id } });
  await db.payrollLine.createMany({
    data: slips.map(({ userId: id, slip }) => ({
      runId: run.id,
      userId: id,
      basic: slip.basic,
      allowances: slip.allowances,
      incentives: slip.incentives,
      deductions: slip.deductions,
      net: slip.net,
      // اللقطة تُحفظ نصًّا: تعديلٌ لاحق على هيكل الأجر لا يغيّر ما صُرف
      breakdown: JSON.stringify(slip.lines),
    })),
  });

  return { runId: run.id, count: slips.length, totals };
}
