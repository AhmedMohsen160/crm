import 'server-only';
import { db } from './db';
import { allSettings } from './reference';
import {
  weightedPages,
  standardCostPerWeightedPage,
  internalStepCost,
  externalStepCost,
  reviewerCost,
  marginOf,
  attributeRevenue,
  type Attribution,
} from './costing';

/**
 * تطبيق معادلات §٨ على مشروع حقيقي.
 *
 * يجمع ما تحتاجه المعادلات من قاعدة البيانات — المعاملات من `ListItem`
 * والإعدادات من `Setting` والرواتب من `StaffCost` — ثم ينادي دوال
 * `costing.ts` الخالصة. الحساب هنا، والمعادلة هناك، فتُختبر المعادلة وحدها.
 *
 * النتيجة **تُجمَّد على المشروع**: تغيير راتب أو معامل بعد التسليم لا يُعيد
 * كتابة هامش الشهر الماضي.
 */

/** أنماط التشغيل التي هي أصلًا مراجعة أو تدقيق — لا تُحتسب مراجعة فوقها */
const REVIEW_WORK_MODES = ['review_human', 'proofread'];

export type CostBreakdown = {
  weightedPages: number;
  costInternal: number;
  costExternal: number;
  costTotal: number;
  margin: number;
  marginPct: number;
  attribution: Attribution[];
  /** تكلفة كل خطوة — تُكتب على الخطوة عند التجميد */
  stepCosts: { id: string; cost: number }[];
  /** أسباب نقص تمنع الثقة بالرقم — تُعرض ولا تُخفى */
  warnings: string[];
};

async function factorOf(listName: string, value: string | null, fallback = 1) {
  if (!value) return fallback;
  const item = await db.listItem.findUnique({
    where: { listName_value: { listName, value } },
    select: { extra: true },
  });
  const parsed = Number(item?.extra);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function staffRateOf(userId: string | null) {
  if (!userId) return null;
  return db.staffCost.findUnique({ where: { userId } });
}

/**
 * يحسب تكلفة المشروع وهامشه وإيراده المنسوب **بلا كتابة**.
 * تُستخدم للعرض الحيّ قبل الحفظ (مؤشر التكلفة) وللتجميد عند التسليم.
 */
export async function computeProjectCost(projectId: string): Promise<CostBreakdown | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { steps: true },
  });
  if (!project) return null;

  const settings = await allSettings();
  const workingDays = Number(settings.working_days) || 26;
  const minUnit = Number(settings.min_weighted_unit) || 1;
  const producerShare = Number(settings.producer_share) || 0.7;
  const reviewerShare = Number(settings.reviewer_share) || 0.3;

  const warnings: string[] = [];
  const pages = project.pages ?? 0;

  const [lineFactor, modeFactor, reviewFactor] = await Promise.all([
    factorOf('service_line', project.serviceLine),
    factorOf('work_mode', project.workMode),
    factorOf('step_type', 'heavy_review', 0.33),
  ]);

  const totalWeighted = weightedPages(pages, modeFactor, lineFactor, minUnit);

  let costInternal = 0;
  let costExternal = 0;
  const stepCosts: { id: string; cost: number }[] = [];

  // ── الحالة أ: خطوات صريحة ────────────────────────────────────
  if (project.steps.length > 0) {
    for (const step of project.steps) {
      let cost = 0;
      if (step.costSource === 'external') {
        cost = externalStepCost(step.pages, step.externalRate);
        costExternal += cost;
        if (!cost && step.pages > 0) {
          warnings.push(`خطوة «${step.stepType}» خارجية بلا أجر مسجَّل — تكلفتها صفر`);
        }
      } else {
        const rate = await staffRateOf(step.performerId);
        const perPage = rate ? standardCostPerWeightedPage(rate, workingDays) : 0;
        cost = internalStepCost(step.weightedPages, perPage);
        costInternal += cost;
        if (!perPage && step.weightedPages > 0) {
          warnings.push('منفِّذ خطوة بلا تكلفة مسجَّلة — تكلفتها صفر');
        }
      }
      stepCosts.push({ id: step.id, cost });
    }
  } else {
    // ── الحالة ب: منتِج رئيسي (ومراجع اختياري) بلا خطوات ───────
    if (project.sourcing === 'external') {
      const cost = externalStepCost(pages, project.externalRate);
      costExternal += cost;
      if (!cost && pages > 0) {
        // اختبار ١٦: صفر **مع تنبيه مفتوح** لا هامش ١٠٠٪ صامت
        warnings.push('تشغيل خارجي بلا أجر مسجَّل — التكلفة صفر والهامش غير موثوق');
      }
    } else if (project.primaryProducerId) {
      const rate = await staffRateOf(project.primaryProducerId);
      const perPage = rate ? standardCostPerWeightedPage(rate, workingDays) : 0;
      costInternal += internalStepCost(totalWeighted, perPage);
      if (!perPage) {
        warnings.push('المنتِج بلا تكلفة مسجَّلة — التكلفة صفر والهامش غير موثوق');
      }
    }

    // تكلفة المراجع — بشروط منع الاحتساب المزدوج الثلاثة
    if (project.reviewerId) {
      const reviewerRate = await staffRateOf(project.reviewerId);
      const reviewerPerPage = reviewerRate
        ? standardCostPerWeightedPage(reviewerRate, workingDays)
        : 0;
      costInternal += reviewerCost({
        pages,
        reviewerId: project.reviewerId,
        primaryProducerId: project.primaryProducerId,
        workModeIsReview: REVIEW_WORK_MODES.includes(project.workMode ?? ''),
        reviewFactor,
        lineFactor,
        reviewerCostPerWeightedPage: reviewerPerPage,
      });
    }
  }

  const { costTotal, margin, marginPct } = marginOf(
    project.netTotal,
    costInternal + costExternal
  );

  const attribution = attributeRevenue({
    netTotal: project.netTotal,
    steps: project.steps.map((s) => ({
      performerId: s.performerId,
      weightedPages: s.weightedPages,
    })),
    primaryProducerId: project.primaryProducerId,
    reviewerId: project.reviewerId,
    producerShare,
    reviewerShare,
  });

  return {
    weightedPages: totalWeighted,
    costInternal,
    costExternal,
    costTotal,
    margin,
    marginPct,
    attribution,
    stepCosts,
    warnings,
  };
}

/** يحسب ثم **يجمّد** النتيجة على المشروع */
export async function freezeProjectCost(projectId: string): Promise<CostBreakdown | null> {
  const result = await computeProjectCost(projectId);
  if (!result) return null;

  // تكلفة كل خطوة تُكتب عليها، فيرى المستخدم توزيع التكلفة لا رقمًا واحدًا
  for (const step of result.stepCosts) {
    await db.projectStep.update({ where: { id: step.id }, data: { cost: step.cost } });
  }

  await db.project.update({
    where: { id: projectId },
    data: {
      weightedPages: result.weightedPages,
      costInternal: result.costInternal,
      costExternal: result.costExternal,
      costTotal: result.costTotal,
      margin: result.margin,
      marginPct: result.marginPct,
      costedAt: new Date(),
    },
  });
  return result;
}

/** الصفحات الموزونة لخطوة واحدة — يُنادى عند حفظ الخطوة */
export async function stepWeightedPages(params: {
  stepType: string;
  serviceLine: string | null;
  pages: number;
}): Promise<number> {
  const settings = await allSettings();
  const minUnit = Number(settings.min_weighted_unit) || 1;
  const [modeFactor, lineFactor] = await Promise.all([
    factorOf('step_type', params.stepType),
    factorOf('service_line', params.serviceLine),
  ]);
  return weightedPages(params.pages, modeFactor, lineFactor, minUnit);
}

// ═══════════════════════════════════════════════════════════════
//  مؤشر التكلفة المجرّد — الاستثناء المقصود في §٥
// ═══════════════════════════════════════════════════════════════

/**
 * رقمان مجرّدان يظهران لمدير المشاريع عند اختيار الإسناد:
 *
 *     تقدير التكلفة الداخلية: ٣٤٠ · تكلفة هذا الفريلانسر: ٥٠٠
 *
 * **بلا أي إشارة إلى راتب أحد** — لا اسم ولا نسبة ولا مصدر. الغرض المنصوص
 * عليه: ألا يتخذ أهم قرار تكلفة يومي وهو أعمى. يحتاج `canViewCostIndicator`.
 */
export type CostIndicator = {
  internal: number | null;
  external: number | null;
};

export async function costIndicator(params: {
  projectId: string;
  producerId?: string | null;
  externalRate?: number | null;
}): Promise<CostIndicator> {
  const project = await db.project.findUnique({
    where: { id: params.projectId },
    select: { pages: true, serviceLine: true, workMode: true },
  });
  if (!project) return { internal: null, external: null };

  const settings = await allSettings();
  const workingDays = Number(settings.working_days) || 26;
  const minUnit = Number(settings.min_weighted_unit) || 1;
  const pages = project.pages ?? 0;

  const [lineFactor, modeFactor] = await Promise.all([
    factorOf('service_line', project.serviceLine),
    factorOf('work_mode', project.workMode),
  ]);
  const weighted = weightedPages(pages, modeFactor, lineFactor, minUnit);

  const rate = await staffRateOf(params.producerId ?? null);
  const internal = rate
    ? Math.round(internalStepCost(weighted, standardCostPerWeightedPage(rate, workingDays)))
    : null;

  const external = params.externalRate
    ? Math.round(externalStepCost(pages, params.externalRate))
    : null;

  return { internal, external };
}
