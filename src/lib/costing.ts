/**
 * معادلات §٨ — منفَّذة حرفيًا.
 *
 * > «نفّذها حرفيًا. كل رقم فيها مقصود.»
 *
 * ملف خالٍ من أي أثر جانبي ولا يلمس قاعدة البيانات، ليُختبر رقمًا برقم
 * (`npm run test:costing`) قبل أن يمسّ مشروعًا حقيقيًا. كل ما يحتاجه يصله
 * كوسيط: المعاملات من `ListItem`، والإعدادات من `Setting`.
 */

// ═══════════════════════════════════════════════════════════════
//  الوحدة الأساسية — الصفحة الموزونة
// ═══════════════════════════════════════════════════════════════

/**
 * `weighted_pages = MAX(min_weighted_unit, pages × mode_factor × line_factor)`
 *
 * **لماذا الحد الأدنى:** من ينجز ١٢ شهادة ميلاد في اليوم يبذل جهدًا إداريًا
 * في التبديل بين المستندات لا يبذله من ينجز ملفًا واحدًا بنفس عدد الكلمات.
 */
export function weightedPages(
  pages: number,
  modeFactor: number,
  lineFactor: number,
  minWeightedUnit = 1
): number {
  const raw = pages * modeFactor * lineFactor;
  return Math.max(minWeightedUnit, raw);
}

// ═══════════════════════════════════════════════════════════════
//  التكلفة
// ═══════════════════════════════════════════════════════════════

export type StaffRate = {
  monthlySalary: number;
  /** نسبة الوقت المنتج فعلًا من وقت الدوام */
  productiveRatio: number;
  /** الصفحات الموزونة التي ينجزها في اليوم */
  dailyCapacity: number;
};

/**
 * `standard_cost_per_weighted_page =
 *      (monthly_salary ÷ working_days × productive_ratio) ÷ daily_capacity`
 *
 * يرجع صفرًا حين تكون البيانات ناقصة بدل أن يقسم على صفر — والصفر يفجّر
 * تنبيهًا مفتوحًا لاحقًا، فلا يمرّ صامتًا كهامش ١٠٠٪.
 */
export function standardCostPerWeightedPage(rate: StaffRate, workingDays: number): number {
  if (!rate.monthlySalary || !workingDays || !rate.dailyCapacity) return 0;
  const perDay = (rate.monthlySalary / workingDays) * rate.productiveRatio;
  return perDay / rate.dailyCapacity;
}

/** `step_cost_internal = step.weighted_pages × standard_cost_per_weighted_page` */
export function internalStepCost(weighted: number, costPerWeightedPage: number): number {
  return weighted * costPerWeightedPage;
}

/**
 * `step_cost_external = step.pages × resolved_rate`
 *
 * **الصفحات الخام لا الموزونة** — الفريلانسر يُحاسَب بالصفحة كما اتُّفق معه،
 * والمعامل يخصّ قياس الجهد الداخلي لا ما ندفعه له.
 */
export function externalStepCost(pages: number, rate: number | null | undefined): number {
  if (!rate || !Number.isFinite(rate)) return 0;
  return pages * rate;
}

/**
 * تكلفة المراجع حين لا توجد خطوات صريحة:
 *   `reviewer_cost = pages × review_factor × line_factor × standard_cost(reviewer)`
 *
 * **صفر في ثلاث حالات، وكلها منع احتساب مزدوج:**
 *   ١) لا مراجع مسمّى
 *   ٢) المراجع = المنتِج نفسه
 *   ٣) نمط التشغيل أصلًا مراجعة أو تدقيق — المراجعة محتسَبة في النمط
 */
export function reviewerCost(params: {
  pages: number;
  reviewerId: string | null;
  primaryProducerId: string | null;
  /** هل نمط التشغيل نفسه مراجعة أو تدقيق؟ */
  workModeIsReview: boolean;
  reviewFactor: number;
  lineFactor: number;
  reviewerCostPerWeightedPage: number;
}): number {
  if (!params.reviewerId) return 0;
  if (params.reviewerId === params.primaryProducerId) return 0;
  if (params.workModeIsReview) return 0;

  const weighted = params.pages * params.reviewFactor * params.lineFactor;
  return weighted * params.reviewerCostPerWeightedPage;
}

// ═══════════════════════════════════════════════════════════════
//  التسعير
// ═══════════════════════════════════════════════════════════════

export type DiscountInput = {
  type: string | null;
  value: number | null;
};

export type PricingSettings = {
  rushSurcharge: number;
  minOrderValue: number;
};

export type PricingResult = {
  gross: number;
  afterRush: number;
  discount: number;
  netTotal: number;
};

/**
 * ```
 * gross      = pages × unit_price
 * after_rush = gross × (1 + rush_surcharge) إن كان مستعجلًا
 * discount   = حسب discount_type
 * net_total  = MAX(min_order_value, after_rush − discount)
 * ```
 */
export function priceProject(params: {
  pages: number;
  unitPrice: number;
  isRush: boolean;
  discount: DiscountInput;
  settings: PricingSettings;
}): PricingResult {
  const gross = params.pages * params.unitPrice;
  const afterRush = params.isRush ? gross * (1 + params.settings.rushSurcharge) : gross;

  let discount = 0;
  const value = params.discount.value ?? 0;
  switch (params.discount.type) {
    case 'percent':
    case 'volume':
    case 'repeat_client':
      // النسب كلها تُخزَّن عشرية: ٠٫١ تعني ١٠٪
      discount = afterRush * value;
      break;
    case 'amount':
      discount = value;
      break;
    default:
      discount = 0;
  }

  const netTotal = Math.max(params.settings.minOrderValue, afterRush - discount);
  return { gross, afterRush, discount, netTotal };
}

/**
 * يقرأ خانات الخصم كما تصل من الشاشة — **والنسبة تُكتب مئويّة**.
 *
 * كانت خانة النسبة في شاشة المشروع تطلب `0.1` لتعني ١٠٪، وشاشة عرض السعر
 * تطلب `10` لنفس المعنى. شاشتان بوحدتين: من كتب `10` في الأولى منح خصم
 * **ألف بالمئة**. فصارت مئويّةً في الشاشتين، وتُحوَّل هنا إلى النسبة
 * العشرية التي يخزّنها النظام — فلا تتغيّر دلالة رقمٍ محفوظ ولا حساب خصمٍ
 * ماضٍ، والتغيير عند حدّ النموذج وحده.
 *
 * ويُقبل `value` (الاسم القديم) حين لا تصل `percent` — فلا ينكسر نموذج لم
 * يُحدَّث بعد.
 */
export function readDiscountFields(input: {
  type?: string | null;
  /** نسبة مئويّة: ١٠ تعني ١٠٪ */
  percent?: number | null;
  /** مبلغ ثابت، أو نسبة عشرية من النماذج القديمة */
  value?: number | null;
}): { type: string | null; value: number | null } {
  const type = input.type && input.type !== 'none' ? input.type : null;
  if (!type) return { type: null, value: null };

  if (type === 'percent' && input.percent !== null && input.percent !== undefined) {
    return { type, value: input.percent / 100 };
  }
  return { type, value: input.value ?? null };
}

/**
 * الخصم كنسبة من الإجمالي قبل الخصم — لمقارنته بحدّ الدور (§١٠ بند ٤).
 *
 * **الخصم بمبلغ ثابت يُحوَّل إلى نسبة**، وإلا أفلت من الحد بمجرد كتابته
 * مبلغًا: من حدّه ١٠٪ على ألف جنيه يستطيع كتابة «خصم ٥٠٠» فيتجاوزه صامتًا.
 */
export function discountRatio(discount: DiscountInput, afterRush: number): number {
  if (!discount.type || discount.type === 'none' || !discount.value) return 0;
  if (discount.type === 'amount') {
    return afterRush > 0 ? discount.value / afterRush : 0;
  }
  return discount.value;
}

/** `balance = net_total − deposit − collected_amount` */
export function balanceOf(netTotal: number, deposit: number, collected: number): number {
  return netTotal - deposit - collected;
}

// ═══════════════════════════════════════════════════════════════
//  الهامش
// ═══════════════════════════════════════════════════════════════

export type MarginResult = {
  costTotal: number;
  margin: number;
  marginPct: number;
};

/**
 * `cost_total = Σ(step costs)` أو `(producer_cost + reviewer_cost)` إن لم توجد خطوات.
 * `margin = net_total − cost_total` · `margin_pct = margin ÷ net_total`
 */
export function marginOf(netTotal: number, costTotal: number): MarginResult {
  const margin = netTotal - costTotal;
  return {
    costTotal,
    margin,
    marginPct: netTotal === 0 ? 0 : margin / netTotal,
  };
}

// ═══════════════════════════════════════════════════════════════
//  الإيراد المنسوب
// ═══════════════════════════════════════════════════════════════

export type Attribution = { userId: string; amount: number };

/**
 * توزيع `net_total` على المنفِّذين:
 *   - إن وُجدت خطوات: بنسبة `weighted_pages` لكل منفِّذ
 *   - وإلا إن وُجد مراجع: المنتِج × `producer_share` والمراجع × `reviewer_share`
 *   - وإلا: كامل `net_total` للمنتِج الرئيسي
 *
 * **المجموع يساوي `net_total` بالضبط** (اختبار ١٢). القسمة العشرية تترك
 * كسورًا ضائعة، فنُسند الفارق كله إلى آخر مستفيد — لا نتركه يتبخّر.
 */
export function attributeRevenue(params: {
  netTotal: number;
  steps: { performerId: string | null; weightedPages: number }[];
  primaryProducerId: string | null;
  reviewerId: string | null;
  producerShare: number;
  reviewerShare: number;
}): Attribution[] {
  const { netTotal } = params;

  // ١) خطوات صريحة — التوزيع بنسبة الجهد الموزون
  const named = params.steps.filter((s) => s.performerId && s.weightedPages > 0);
  if (named.length > 0) {
    const totalWeighted = named.reduce((s, x) => s + x.weightedPages, 0);
    const byUser = new Map<string, number>();
    for (const step of named) {
      const id = step.performerId!;
      byUser.set(id, (byUser.get(id) ?? 0) + step.weightedPages);
    }
    const entries = [...byUser.entries()];
    const result: Attribution[] = entries.map(([userId, weighted]) => ({
      userId,
      amount: round2((netTotal * weighted) / totalWeighted),
    }));
    return settleRemainder(result, netTotal);
  }

  // ٢) منتِج ومراجع — القسمة المعيارية
  if (params.primaryProducerId && params.reviewerId && params.reviewerId !== params.primaryProducerId) {
    const result: Attribution[] = [
      { userId: params.primaryProducerId, amount: round2(netTotal * params.producerShare) },
      { userId: params.reviewerId, amount: round2(netTotal * params.reviewerShare) },
    ];
    return settleRemainder(result, netTotal);
  }

  // ٣) المنتِج وحده
  if (params.primaryProducerId) {
    return [{ userId: params.primaryProducerId, amount: netTotal }];
  }

  return [];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** يُسند فارق التقريب إلى آخر مستفيد فيصير المجموع مطابقًا تمامًا */
function settleRemainder(list: Attribution[], target: number): Attribution[] {
  if (list.length === 0) return list;
  const sum = list.reduce((s, a) => s + a.amount, 0);
  const diff = round2(target - sum);
  if (diff === 0) return list;
  const copy = [...list];
  copy[copy.length - 1] = {
    ...copy[copy.length - 1],
    amount: round2(copy[copy.length - 1].amount + diff),
  };
  return copy;
}

// ═══════════════════════════════════════════════════════════════
//  التكلفتان — لا تخلطهما
// ═══════════════════════════════════════════════════════════════

/**
 * `absorption_rate = absorbed_cost ÷ actual_cost`
 *
 * - `actual_cost`   = ما يُدفع للموظف سواء عمل أم لا — **هي المستخدمة في ROI**
 * - `absorbed_cost` = مجموع تكاليف المشاريع المسلَّمة — تُستخدم في هامش المشروع
 *
 * تحت ٦٠٪ = طاقة غير مستغَلة: نقص إسناد، أو عمل لم يُسجَّل، أو
 * `daily_capacity` مبالغ فيه.
 */
export function absorptionRate(absorbedCost: number, actualCost: number): number {
  if (!actualCost) return 0;
  return absorbedCost / actualCost;
}

export function actualCostOfStaff(rate: StaffRate): number {
  return rate.monthlySalary * rate.productiveRatio;
}

export function roiDirect(attributedRevenue: number, actualCost: number): number {
  if (!actualCost) return 0;
  return attributedRevenue / actualCost;
}

export function roiLoaded(params: {
  attributedRevenue: number;
  actualCost: number;
  monthlyOverhead: number;
  referenceMonthlyRevenue: number;
}): number {
  const overheadFactor = params.referenceMonthlyRevenue
    ? params.monthlyOverhead / params.referenceMonthlyRevenue
    : 0;
  const allocatedOverhead = params.attributedRevenue * overheadFactor;
  const denominator = params.actualCost + allocatedOverhead;
  if (!denominator) return 0;
  return params.attributedRevenue / denominator;
}

// ═══════════════════════════════════════════════════════════════
//  الزمن
// ═══════════════════════════════════════════════════════════════

/**
 * `on_time_rate = COUNT(ملتزم) ÷ (COUNT(ملتزم) + COUNT(متأخر))`
 *
 * **المقام حرج:** المشروع بلا موعد يخرج من البسط والمقام معًا، وإلا ظهر
 * الجميع متأخرين (اختبار ١٧).
 */
export function onTimeRate(
  projects: { deadline: Date | null; deliveredAt: Date | null }[]
): { rate: number; onTime: number; late: number; excluded: number } {
  let onTime = 0;
  let late = 0;
  let excluded = 0;

  for (const p of projects) {
    if (!p.deadline || !p.deliveredAt) {
      excluded++;
      continue;
    }
    if (p.deliveredAt.getTime() <= p.deadline.getTime()) onTime++;
    else late++;
  }

  const denominator = onTime + late;
  return { rate: denominator === 0 ? 0 : onTime / denominator, onTime, late, excluded };
}

export function cycleTimeHours(createdAt: Date, deliveredAt: Date | null): number | null {
  if (!deliveredAt) return null;
  return (deliveredAt.getTime() - createdAt.getTime()) / 3_600_000;
}
