/**
 * محاسبة الفروع وتوزيع التكلفة المركزية — القواعد الخالصة.
 *
 * الفلسفة في ستّ جمل (§١٦ من المواصفة):
 *   ١) **التكلفة المركزية ثابتة** — منها يأتي كل الرفع التشغيلي وكل خطر
 *      الطاقة العاطلة.
 *   ٢) الفرع يُحمَّل بنسبة **معيارية مثبَّتة** من إيراده، لا بنسبة متحرّكة
 *      شهريًا — لأن التخطيط لا يقوم على متغيّر مجهول.
 *   ٣) الفرق بين المُحمَّل والفعلي **لا يُوزَّع** — يبقى في المركز مؤشرًا
 *      صريحًا على مستوى الاستيعاب.
 *   ٤) **مؤشران لا واحد**: المساهمة لقرار البقاء، والصافي المحمَّل للتارجت.
 *      وخلطهما يقتل فروعًا رابحة.
 *   ٥) التارجت **يُشتقّ من التعادل** ولا يُخترع.
 *   ٦) القيد الحقيقي على التوسّع هو **الطاقة** لا النقد.
 *
 * ولا رقم واحد مثبَّت في هذا الملف: كل المعاملات تصل كوسائط من الإعدادات.
 */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════
//  ١ · التصنيفات
// ═══════════════════════════════════════════════════════════════

/**
 * **تصنيفات الإنفاق** — وهي ما يحدّد أين يقع كل جنيه (§٣).
 *
 * كانت تُحمل على **مركز التكلفة**، وهو خلطٌ لبُعدين: مركز التكلفة عند
 * المحاسب مشروعٌ مستمرّ تُقاس ربحيته، لا وعاءٌ لتصنيف الإنفاق. فانتقلت إلى
 * **الحساب** — يُصنَّف «الإيجار» مرة واحدة ولا يُسأل عنه في كل قيد.
 */
export const SPEND_KINDS = {
  production: 'الإنتاج والتشغيل المركزي',
  central_marketing: 'التسويق المؤسسي',
  general_admin: 'الإدارة العامة',
  branch_direct: 'مصاريف الفرع الذاتية',
} as const;
export type SpendKind = keyof typeof SPEND_KINDS;
export const SPEND_KIND_KEYS = Object.keys(SPEND_KINDS) as SpendKind[];

/** شرحٌ بلغة العمل لكل تصنيف — يُعرض في شاشة الإعدادات لا في الكود وحده */
export const SPEND_KIND_HINTS: Record<SpendKind, string> = {
  production:
    'تشغيلٌ يخدم الفروع كلها: أجور الإنتاج المركزي وأدواته وتراخيصه',
  central_marketing:
    'تسويق العلامة كلها: الموقع وتحسين الظهور والمحتوى — لا إعلانَ منطقةِ فرع',
  general_admin:
    'إدارةٌ عامة تخدم الشركة: الإدارة العليا والمالية والقانونية والمقر الرئيسي',
  branch_direct:
    'يخصّ فرعًا واحدًا: إيجاره وأدمن مبيعاته وعمولاته ونثرياته وإعلان منطقته',
};

/** الثلاثة الأولى هي **الكتلة المشتركة** — ثابتة لا تتحرّك بحجم المبيعات */
export const SHARED_KINDS: SpendKind[] = [
  'production',
  'central_marketing',
  'general_admin',
];

export function isShared(kind: string | null | undefined): boolean {
  return SHARED_KINDS.includes(kind as SpendKind);
}

export const BRANCH_TYPES = {
  retail: 'تجزئة أفراد',
  corporate: 'مؤسسي',
  production_hub: 'مركز إنتاج',
} as const;
export type BranchType = keyof typeof BRANCH_TYPES;

export const BRANCH_STATUSES = {
  planning: 'قيد التخطيط',
  ramp_up: 'قيد التشغيل التدريجي',
  active: 'نشط',
  downsized: 'مقلَّص',
  closed: 'مغلق',
} as const;
export type BranchStatus = keyof typeof BRANCH_STATUSES;

/** مراحل النضج — كلٌّ لها معامل تحميل يُضبط من الإعدادات لا هنا */
export const MATURITY_STAGES = {
  foundation: 'تأسيس',
  launch: 'إطلاق',
  growth: 'نمو',
  mature: 'نضج',
} as const;
export type MaturityStage = keyof typeof MATURITY_STAGES;
export const MATURITY_STAGE_KEYS = Object.keys(MATURITY_STAGES) as MaturityStage[];

/**
 * مؤشرات قياس كل مرحلة (§١١).
 *
 * فرع التأسيس **يُقاس بالنشاط لا بالإيراد**: قياسه بالإيراد في شهره الأول
 * حكمٌ على شيء لم يبدأ بعد.
 */
export const STAGE_METRICS: Record<MaturityStage, string> = {
  foundation: 'عدد الطلبات · الشراكات المفتوحة · التقييمات المحلية — لا الإيراد',
  launch: 'الإيراد مع مؤشرات النشاط',
  growth: 'الإيراد',
  mature: 'الإيراد والربحية',
};

export const ALLOCATION_BASES = {
  revenue: 'الإيراد',
  units: 'وحدات الإنتاج',
  orders: 'عدد الطلبات',
} as const;
export type AllocationBasis = keyof typeof ALLOCATION_BASES;

/**
 * أساس التوزيع **المرفوض** ولماذا.
 *
 * عدد الطلبات مرفوض هنا لا لأنه غير دقيق فحسب، بل لأن قيمة الطلب تتفاوت
 * أضعافًا بين فرع مؤسسي وفرع تجزئة — فالتوزيع به يُحمّل فرع التجزئة كلفةَ
 * مئات الشهادات كما يُحمّل الفرع المؤسسي كلفة عقدٍ واحد.
 */
export const REJECTED_BASIS: AllocationBasis = 'orders';

// ═══════════════════════════════════════════════════════════════
//  ٢ · قواعد التصنيف الإلزامية (§١٣)
// ═══════════════════════════════════════════════════════════════

/**
 * **تصنيف الإنفاق الساري** — من الحساب، إلا أن يتجاوزه السطر.
 *
 * مصدرُه الحساب لأن «الإيجار» إيجارٌ في كل قيد، وسؤالُ المحاسب عنه آلاف
 * المرات يُنتج آلاف الفرص للخطأ. والتجاوز على السطر للحالة الشاذّة وحدها:
 * إعلانٌ من حساب التسويق المؤسسي وُجّه لمنطقة فرع بعينه.
 */
export function effectiveSpendKind(
  lineKind: string | null | undefined,
  accountKind: string | null | undefined
): string | null {
  return lineKind || accountKind || null;
}

export type ClassificationInput = {
  /** تصنيف الإنفاق الساري — من `effectiveSpendKind` */
  kind: string | null | undefined;
  /** الفرع على السطر */
  branch: string | null | undefined;
  /** هل الحساب حساب مصروف أصلًا؟ */
  isExpense: boolean;
};

export type ClassificationCheck = { ok: true } | { ok: false; error: string };

/**
 * القواعد ١ و٢ و٣: كل بند مصروف يحمل تصنيفًا **واحدًا** فقط.
 *
 * والقاعدة الحاسمة التي تُفسد كل شيء لو اختلّت: **بندٌ مشترك لا يحمل فرعًا،
 * وبندٌ ذاتيّ لا يكون بلا فرع.** لأن الأول يعني أن الكتلة المشتركة صارت
 * تخصّ فرعًا، والثاني يعني أن مصاريف فرع دخلت الكتلة فتحمّلها الجميع.
 *
 * ومنها ينشأ منع الخلل المذكور في §٣: مصاريف مقر الفرع المركزي **ذاتيّته
 * وحده** ولا تدخل الكتلة، وإلا تحمّلت الفروع الأخرى نصيبًا من إيجاره.
 */
export function checkClassification(line: ClassificationInput): ClassificationCheck {
  if (!line.isExpense) return { ok: true };

  if (!line.kind) {
    return {
      ok: false,
      error:
        'حساب المصروف بلا تصنيف إنفاق — صنّفه مرة واحدة من «إعدادات المصاريف» ' +
        'ولن تُسأل عنه بعدها في قيد',
    };
  }
  if (!SPEND_KIND_KEYS.includes(line.kind as SpendKind)) {
    return { ok: false, error: `تصنيف الإنفاق «${line.kind}» غير معروف` };
  }

  if (isShared(line.kind) && line.branch) {
    return {
      ok: false,
      error:
        'بندٌ في الكتلة المشتركة لا يحمل فرعًا — وإلا صارت الكتلة تخصّ فرعًا بعينه. ' +
        'إن كان مصروفَ مقرٍّ فصنّفه «مصاريف الفرع الذاتية».',
    };
  }
  if (line.kind === 'branch_direct' && !line.branch) {
    return {
      ok: false,
      error:
        'بندٌ ذاتيّ يلزمه فرع — وإلا دخل الكتلة المشتركة فتحمّلته الفروع كلها.',
    };
  }

  return { ok: true };
}

/**
 * قاعدة الفصل الإعلانية (§٣ الفئة أ).
 *
 * الإعلان المدفوع الموجَّه لمنطقة الفرع = ذاتيّ. والتسويق المؤسسي (العلامة
 * وSEO والمحتوى) = مشترك. والخلط بينهما **يُفسد قياس كفاءة الفرع الإعلانية**
 * — وهي المؤشر الحاكم في §١٥٫٤.
 */
export function suggestAdKind(memo: string, hasBranch: boolean): SpendKind {
  if (hasBranch) return 'branch_direct';
  const text = memo ?? '';
  if (/سيو|seo|علامة|براند|محتوى|روابط|منصات|هوية/i.test(text)) return 'central_marketing';
  return 'central_marketing';
}

// ═══════════════════════════════════════════════════════════════
//  ٣ · المعدل المعياري (§٤)
// ═══════════════════════════════════════════════════════════════

/**
 * `المعدل المعياري = إجمالي الكتلة المشتركة ÷ إجمالي إيراد الشركة`
 *
 * يعيد `null` بلا إيراد — لا صفرًا: معدَّل صفر يعني «لا تكلفة مركزية»، وهو
 * عكس الحقيقة تمامًا.
 */
export function deriveStandardRate(sharedMass: number, companyRevenue: number): number | null {
  if (!companyRevenue || companyRevenue <= 0) return null;
  return round4(sharedMass / companyRevenue);
}

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

/**
 * `نسبة التحميل المطبَّقة = المعدل المعياري × معامل النضج` (§٤٫٥)
 *
 * والمبرّر اقتصادي لا مجاملة: الكتلة قائمة ومدفوعة سلفًا، وطلبات الفرع
 * الجديد تُنفَّذ بطاقة مشتراة — فتكلفتها الحدّية على المركز تقارب الصفر.
 * تحميل فرع جديد كناضج يشوّه ربحيته ويرفع تارجته بلا مقابل اقتصادي.
 */
export function appliedRate(standardRate: number, maturityFactor: number): number {
  const factor = Math.max(0, Math.min(1, maturityFactor));
  return round4(Math.max(0, standardRate) * factor);
}

// ═══════════════════════════════════════════════════════════════
//  ٤ · طبقات قائمة دخل الفرع (§٥)
// ═══════════════════════════════════════════════════════════════

export type BranchInput = {
  code: string;
  name: string;
  /** المحصَّل لا المفوتر */
  revenue: number;
  /** مصاريف الفرع الذاتية شاملةً الإهلاك */
  directExpenses: number;
  /** الإهلاك ضمنها — يُستبعد من التعادل النقدي وحده */
  depreciation: number;
  commissions: number;
  appliedRate: number;
  maturityStage: string;
  orders?: number;
  adSpend?: number;
};

export type BranchResult = BranchInput & {
  /** الإيراد − الذاتية − العمولات */
  contribution: number;
  contributionPct: number | null;
  /** الإيراد × نسبة التحميل */
  allocated: number;
  /** المساهمة − التحميل */
  loadedNet: number;
  loadedNetPct: number | null;
  /** نسبة الإعلان من الإيراد — المؤشر الحاكم في §١٥٫٤ */
  adRatio: number | null;
  avgOrderValue: number | null;
};

/**
 * قائمة دخل الفرع بطبقاتها **بهذا الترتيب بالضبط**.
 *
 * الترتيب ليس تجميلًا: **هامش المساهمة يقع قبل التحميل** لأنه وحده ما يُبنى
 * عليه قرار الإغلاق، ووقوعه بعد التحميل يجعل القارئ يقرأ الرقم الخطأ.
 */
export function branchPL(input: BranchInput): BranchResult {
  const revenue = round2(input.revenue);
  const contribution = round2(revenue - input.directExpenses - input.commissions);
  const allocated = round2(revenue * input.appliedRate);
  const loadedNet = round2(contribution - allocated);

  return {
    ...input,
    revenue,
    contribution,
    contributionPct: revenue > 0 ? round4(contribution / revenue) : null,
    allocated,
    loadedNet,
    loadedNetPct: revenue > 0 ? round4(loadedNet / revenue) : null,
    adRatio: revenue > 0 && input.adSpend !== undefined ? round4(input.adSpend / revenue) : null,
    avgOrderValue: input.orders ? round2(revenue / input.orders) : null,
  };
}

export type CompanyResult = {
  revenue: number;
  totalContribution: number;
  sharedMass: number;
  /** المساهمة الكلية − الكتلة الفعلية = **الرقم الحقيقي الوحيد** */
  companyNet: number;
  companyNetPct: number | null;
  totalAllocated: number;
  /** المحمَّل − الكتلة الفعلية */
  recoveryVariance: number;
  /** الكتلة ÷ المعدل المعياري */
  fullRecoveryRevenue: number | null;
  /** كم يبعد الإيراد الحالي عن الاسترداد الكامل */
  distanceToFullRecovery: number | null;
  /** مجموع الأصفية + فرق الاسترداد − صافي الشركة — **يجب أن يساوي صفرًا** */
  reconciliation: number;
};

/**
 * خلاصة الشركة.
 *
 * **صافي الشركة يُحسب من المساهمات والكتلة الفعلية — لا من مجموع الأصفية
 * المحمَّلة.** لأن المحمَّل تقديرٌ معياري والكتلة واقع، والخلط بينهما يجعل
 * الشركة تُبلّغ ربحًا لم يحدث.
 */
export function companyRollup(params: {
  branches: BranchResult[];
  sharedMass: number;
  standardRate: number;
}): CompanyResult {
  const revenue = round2(params.branches.reduce((s, b) => s + b.revenue, 0));
  const totalContribution = round2(params.branches.reduce((s, b) => s + b.contribution, 0));
  const totalAllocated = round2(params.branches.reduce((s, b) => s + b.allocated, 0));
  const totalLoadedNet = round2(params.branches.reduce((s, b) => s + b.loadedNet, 0));

  const sharedMass = round2(params.sharedMass);
  const companyNet = round2(totalContribution - sharedMass);
  const recoveryVariance = round2(totalAllocated - sharedMass);

  const fullRecoveryRevenue =
    params.standardRate > 0 ? round2(sharedMass / params.standardRate) : null;

  return {
    revenue,
    totalContribution,
    sharedMass,
    companyNet,
    companyNetPct: revenue > 0 ? round4(companyNet / revenue) : null,
    totalAllocated,
    recoveryVariance,
    fullRecoveryRevenue,
    distanceToFullRecovery:
      fullRecoveryRevenue === null ? null : round2(fullRecoveryRevenue - revenue),
    // معادلة التحقّق (§٨): المساران مستقلّان، وتطابقهما هو الضمانة الوحيدة
    reconciliation: round2(totalLoadedNet + recoveryVariance - companyNet),
  };
}

/** أقصى فرقٍ يُحتمل كتقريب عشري — وما زاد عليه خطأ تصنيف لا انحراف */
export const RECONCILIATION_TOLERANCE = 0.01;

export function reconciles(result: CompanyResult): boolean {
  return Math.abs(result.reconciliation) <= RECONCILIATION_TOLERANCE;
}

export function recoveryLabel(variance: number): string {
  if (variance > 0) return 'فائض استرداد — الشركة فوق مستوى الاستيعاب';
  if (variance < 0) return 'عجز استرداد — تحت مستوى الاستيعاب أو استثمار متعمَّد في فرع جديد';
  return 'استرداد متوازن تمامًا';
}

// ═══════════════════════════════════════════════════════════════
//  ٥ · المؤشران — ومنع «دوامة الإغلاق» (§٦)
// ═══════════════════════════════════════════════════════════════

export const INDICATORS = {
  contribution: {
    key: 'contribution',
    label: 'هامش المساهمة',
    formula: 'الإيراد − المصاريف الذاتية − العمولة',
    usedFor: 'قرار البقاء أو الإغلاق أو التقليص · ترتيب أولوية الفروع · تقييم فرع جديد',
    notUsedFor: 'التارجت',
  },
  loadedNet: {
    key: 'loadedNet',
    label: 'الصافي المحمَّل',
    formula: 'هامش المساهمة − التحميل المركزي',
    usedFor: 'التارجت · التسعير · الربحية المقارنة · قرار الفرع القادم',
    notUsedFor: 'قرار الإغلاق',
  },
} as const;

export type ClosureAdvice = {
  /** هل يجوز التفكير في الإغلاق أصلًا؟ */
  safeToClose: boolean;
  severity: 'ok' | 'watch' | 'danger';
  headline: string;
  detail: string;
};

/**
 * رأي النظام في إغلاق فرع — **مبنيّ على المساهمة حصرًا**.
 *
 * الخطر الذي تمنعه هذه الدالة اسمه «دوامة الإغلاق»: التكلفة المركزية ثابتة
 * ولا تزول بإغلاق الفرع. فالفرع قد يظهر بصافي محمَّل سالب وهو يساهم بمبلغ
 * موجب كبير في تغطية المركز. وإغلاقه يعني:
 *   ١) خسارة مساهمته الموجبة فورًا
 *   ٢) إعادة توزيع نفس الكتلة على عدد أقل من الفروع
 *   ٣) ظهور الفرع التالي خاسرًا
 *   ٤) تكرار الدورة حتى انهيار الشركة
 */
export function closureAdvice(branch: BranchResult): ClosureAdvice {
  if (branch.contribution > 0 && branch.loadedNet < 0) {
    return {
      safeToClose: false,
      severity: 'danger',
      headline: 'لا يُغلق — مساهمته موجبة',
      detail:
        `هذا الفرع يساهم بـ${fmt(branch.contribution)} في تغطية التكلفة المركزية، ` +
        'وصافيه المحمَّل سالب لأن التحميل تقدير معياري لا مصروف يزول بإغلاقه. ' +
        '**التكلفة المركزية ثابتة ولا تزول بإغلاق الفرع** — وإغلاقه يخسر مساهمته ' +
        'ويعيد توزيع نفس الكتلة على فروع أقل، فيظهر الفرع التالي خاسرًا.',
    };
  }

  if (branch.contribution <= 0) {
    return {
      safeToClose: true,
      severity: 'danger',
      headline: 'مساهمته غير موجبة — يستحق قرارًا',
      detail:
        `الفرع لا يغطّي مصاريفه الذاتية وعمولاته (${fmt(branch.contribution)}). ` +
        'هنا وحده يصحّ بحث الإغلاق أو التقليص — وقبله راجع الإعلان والمصاريف الذاتية.',
    };
  }

  if (branch.loadedNet < 0) {
    return {
      safeToClose: false,
      severity: 'watch',
      headline: 'يُتابَع — تحت التارجت لا تحت التعادل',
      detail: 'المساهمة موجبة والصافي المحمَّل سالب: المطلوب رفع الإيراد لا الإغلاق.',
    };
  }

  return {
    safeToClose: false,
    severity: 'ok',
    headline: 'رابح بالمؤشرين',
    detail: 'يغطّي مصاريفه الذاتية ونصيبه من التكلفة المركزية معًا.',
  };
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// ═══════════════════════════════════════════════════════════════
//  ٦ · العمولات القافزة (§٩)
// ═══════════════════════════════════════════════════════════════

export type CommissionTier = { fromAmount: number; rate: number };
export const TIER_MODES = {
  cliff: 'قافزة — الشريحة تُطبَّق على الكل',
  marginal: 'تراكمية — كل شريحة على جزئها',
} as const;
export type TierMode = keyof typeof TIER_MODES;

/**
 * نسبة العمولة عند مستوى إيراد.
 *
 * **البنية القافزة مختارة عن قصد** ولا يُقترح تغييرها: العمولة هنا تعويض عن
 * راتب أساسي منخفض لا أداة تحفيز هامشي، والقفزة عند العتبة تعمل قوةَ جذب
 * نحو رقم بعينه. والنظام يدعم البنيتين، والافتراضي `cliff`.
 */
export function commissionRate(tiers: CommissionTier[], revenue: number): number {
  const sorted = sortTiers(tiers);
  let rate = 0;
  for (const tier of sorted) {
    if (revenue >= tier.fromAmount) rate = tier.rate;
    else break;
  }
  return rate;
}

export function sortTiers(tiers: CommissionTier[]): CommissionTier[] {
  return [...tiers]
    .filter((t) => Number.isFinite(t.fromAmount) && t.fromAmount >= 0)
    .sort((a, b) => a.fromAmount - b.fromAmount);
}

/** مبلغ العمولة بالنمطين — القافز يضرب النسبة في الكل، والتراكمي بالشرائح */
export function commissionAmount(
  tiers: CommissionTier[],
  revenue: number,
  mode: TierMode = 'cliff'
): number {
  if (!Number.isFinite(revenue) || revenue <= 0) return 0;
  const sorted = sortTiers(tiers);
  if (!sorted.length) return 0;

  if (mode === 'cliff') return round2(revenue * commissionRate(sorted, revenue));

  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    const from = sorted[i].fromAmount;
    if (revenue <= from) break;
    const to = sorted[i + 1]?.fromAmount ?? Infinity;
    total += (Math.min(revenue, to) - from) * sorted[i].rate;
  }
  return round2(total);
}

/** العتبة التالية وكم يتبقّى لها — القفزة هي ما يجذب نحوها */
export function nextTier(
  tiers: CommissionTier[],
  revenue: number
): { at: number; rate: number; remaining: number; gain: number } | null {
  const sorted = sortTiers(tiers);
  const next = sorted.find((t) => t.fromAmount > revenue);
  if (!next) return null;
  const current = commissionRate(sorted, revenue);
  return {
    at: next.fromAmount,
    rate: next.rate,
    remaining: round2(next.fromAmount - revenue),
    // المكسب من بلوغ العتبة: النسبة الجديدة على الكل ناقص الحالية على الكل
    gain: round2(next.fromAmount * next.rate - next.fromAmount * current),
  };
}

export const OVERRIDE_BASES = {
  per_branch: 'على كل فرع منفردًا',
  aggregate: 'على مجموع نطاق المدير',
} as const;
export type OverrideBasis = keyof typeof OVERRIDE_BASES;

/**
 * أوفررايد الإدارة.
 *
 * الفرق بين الأساسين **جوهري لأنه يغيّر الشريحة المطبَّقة**: مجموعُ ثلاثة
 * فروع قد يبلغ شريحةً لا يبلغها أيٌّ منها وحده.
 */
export function overrideAmount(
  tiers: CommissionTier[],
  branchRevenues: number[],
  basis: OverrideBasis,
  mode: TierMode = 'cliff'
): number {
  if (basis === 'aggregate') {
    const total = branchRevenues.reduce((s, r) => s + r, 0);
    return commissionAmount(tiers, total, mode);
  }
  return round2(branchRevenues.reduce((s, r) => s + commissionAmount(tiers, r, mode), 0));
}

/** قواعد الاستحقاق التي يفرضها النظام (§٩٫٣) — للعرض والتوثيق */
export const ENTITLEMENT_RULES = [
  { key: 'collected', label: 'الأساس: المحصَّل لا المفوتر', detail: 'لا عمولة على فاتورة لم تُحصَّل' },
  { key: 'deadline', label: 'حدّ زمني للتحصيل', detail: 'ما لم يُحصَّل خلال المدة المعرَّفة يسقط استحقاقه' },
  { key: 'clawback', label: 'الاسترداد', detail: 'المردودات والملفات المرفوضة تُخصم من عمولة الفترة التالية' },
  { key: 'gate', label: 'بوابة التسجيل', detail: 'ما لم يُسجَّل في النظام لا يُحتسب — الحافز أداة فرض الانضباط' },
  { key: 'ownership', label: 'ملكية العميل', detail: 'العميل من حملة مموَّلة مركزيًا يُميَّز عن الذاتي' },
  { key: 'attribution', label: 'الإسناد', detail: 'العميل للفرع الذي فتح الملف لا الذي سلّمه' },
] as const;

/** هل سقط استحقاق العمولة لتأخّر التحصيل؟ */
export function withinCollectionDeadline(
  deliveredAt: Date | null,
  collectedAt: Date | null,
  deadlineDays: number
): boolean {
  if (!collectedAt) return false;
  if (!deliveredAt || deadlineDays <= 0) return true;
  const days = (collectedAt.getTime() - deliveredAt.getTime()) / 86_400_000;
  return days <= deadlineDays;
}

// ═══════════════════════════════════════════════════════════════
//  ٧ · التعادل والتارجت (§١٠)
// ═══════════════════════════════════════════════════════════════

export type BreakEven = {
  /** ١ − نسبة التحميل − نسبة العمولة */
  relativeMargin: number;
  /** الذاتية ÷ الهامش النسبي — والقسمة لا الضرب */
  loaded: number | null;
  /** (الذاتية − الإهلاك) ÷ (١ − نسبة العمولة) */
  cash: number | null;
};

/**
 * نقطتا التعادل.
 *
 * **الخطأ الشائع الذي تمنعه هذه الدالة:** نسبة التحميل تُحسب على **الإيراد**
 * لا على المصاريف. فالتعادل ناتج **قسمةٍ** على (١ − النسب)، لا **ضربِ**
 * المصاريف في (١ + النسبة). والفرق بينهما كبير ويُنتج تعادلًا **أقلّ من
 * الحقيقي دائمًا** — أي تارجتًا أدنى من المطلوب وعمولةً تُصرف قبل أوانها.
 *
 * وتعود `null` حين يبلغ مجموع النسب واحدًا أو يتجاوزه: عندها **لا يوجد حجم
 * مبيعات يُحقّق التعادل**، والمشكلة في السعر أو في النسب لا في الحجم. ورقمٌ
 * ضخم في الخانة يخفي هذا المعنى.
 */
export function breakEven(params: {
  directExpenses: number;
  depreciation: number;
  appliedRate: number;
  commissionRate: number;
}): BreakEven {
  const relativeMargin = round4(1 - params.appliedRate - params.commissionRate);
  const cashDenominator = round4(1 - params.commissionRate);

  return {
    relativeMargin,
    loaded: relativeMargin > 0 ? round2(params.directExpenses / relativeMargin) : null,
    cash:
      cashDenominator > 0
        ? round2(Math.max(0, params.directExpenses - params.depreciation) / cashDenominator)
        : null,
  };
}

export type Targets = {
  /** = التعادل المحمَّل — لا عمولة تحته */
  floor: number | null;
  target: number | null;
  stretch: number | null;
};

/** التارجت **يُشتقّ ولا يُخترع** — ثلاث طبقات فوق التعادل المحمَّل */
export function deriveTargets(
  loadedBreakEven: number | null,
  targetFactor: number,
  stretchFactor: number
): Targets {
  if (loadedBreakEven === null) return { floor: null, target: null, stretch: null };
  return {
    floor: round2(loadedBreakEven),
    target: round2(loadedBreakEven * Math.max(1, targetFactor)),
    stretch: round2(loadedBreakEven * Math.max(1, stretchFactor)),
  };
}

/**
 * أثر تكلفة ثابتة جديدة على العتبة.
 *
 * `ارتفاع العتبة = التكلفة الجديدة ÷ الهامش النسبي`
 *
 * ولولا هذا لحصلت على **فرع أكبر بربح أقلّ وعمولة أعلى**: زدت مصروفًا ولم
 * ترفع العتبة، فصُرفت العمولة على إيراد لم يعد يكفي.
 */
export function thresholdImpact(newFixedCost: number, relativeMargin: number): number | null {
  if (relativeMargin <= 0) return null;
  return round2(newFixedCost / relativeMargin);
}

/** تعادل الشركة = (الكتلة + مجموع الذاتية) ÷ (١ − متوسط نسبة العمولة) */
export function companyBreakEven(params: {
  sharedMass: number;
  totalDirect: number;
  avgCommissionRate: number;
}): number | null {
  const denominator = round4(1 - params.avgCommissionRate);
  if (denominator <= 0) return null;
  return round2((params.sharedMass + params.totalDirect) / denominator);
}

/** هامش الأمان = (الفعلي − التعادل) ÷ الفعلي */
export function safetyMargin(actualRevenue: number, companyBE: number | null): number | null {
  if (companyBE === null || !actualRevenue || actualRevenue <= 0) return null;
  return round4((actualRevenue - companyBE) / actualRevenue);
}

/** نسبة تحقيق المستهدف — وتعود `null` بلا مستهدف مضبوط لا صفرًا */
export function achievement(revenue: number, target: number | null): number | null {
  if (target === null || target <= 0) return null;
  return round4(revenue / target);
}

// ═══════════════════════════════════════════════════════════════
//  ٨ · قيود ما قبل فتح فرع (§١١٫٢)
// ═══════════════════════════════════════════════════════════════

export type PreOpenCheck = {
  /** (تجهيز + تأمين) + (العجز الشهري المتوقّع × شهور الوصول للتعادل) */
  cashBurn: number;
  /** كم ترتفع نقطة تعادل الشركة بسببه */
  breakEvenImpact: number | null;
  /** هل تغطّي الطاقة الشاغرة مستهدفه؟ */
  capacityCovers: boolean;
  capacityGap: number;
  warnings: string[];
};

export function preOpenCheck(params: {
  setupCost: number;
  monthlyDeficit: number;
  monthsToBreakEven: number;
  relativeMargin: number;
  expectedMonthlyRevenue: number;
  spareCapacityUnits: number;
  unitsPerRevenue: number;
  cashReserve: number;
}): PreOpenCheck {
  const cashBurn = round2(
    params.setupCost + Math.max(0, params.monthlyDeficit) * Math.max(0, params.monthsToBreakEven)
  );
  const monthlyFixed = params.monthlyDeficit;
  const breakEvenImpact = thresholdImpact(monthlyFixed, params.relativeMargin);

  const neededUnits = round2(params.expectedMonthlyRevenue * params.unitsPerRevenue);
  const capacityGap = round2(neededUnits - params.spareCapacityUnits);

  const warnings: string[] = [];
  if (params.cashReserve > 0 && cashBurn > params.cashReserve) {
    warnings.push(
      `الاستنزاف النقدي المتوقّع ${fmt(cashBurn)} يتجاوز الاحتياطي المتاح ${fmt(params.cashReserve)}`
    );
  }
  if (capacityGap > 0) {
    warnings.push(
      `الطاقة الشاغرة لا تغطّي مستهدف الفرع — ينقص ${fmt(capacityGap)} وحدة شهريًا. ` +
        'والقيد الحقيقي على التوسّع هو الطاقة لا النقد.'
    );
  }
  if (breakEvenImpact === null) {
    warnings.push('الهامش النسبي صفر أو سالب — لا يوجد حجم مبيعات يُحقّق التعادل بهذه النسب');
  }

  return {
    cashBurn,
    breakEvenImpact,
    capacityCovers: capacityGap <= 0,
    capacityGap: Math.max(0, capacityGap),
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════
//  ٩ · الطاقة الإنتاجية (§١٢)
// ═══════════════════════════════════════════════════════════════

export type CapacitySnapshot = {
  unitsTranslated: number;
  unitsReviewed: number;
  capacity: number;
  /** الإنتاج الفعلي ÷ الطاقة */
  utilization: number | null;
  /** الكتلة الإنتاجية ÷ الوحدات — ينخفض مع الاستغلال ويقيس الرفع التشغيلي */
  costPerUnit: number | null;
  /** الطاقة الشاغرة بالوحدات */
  spare: number;
  /** **القيد يقع عند أصغر الطرفين** — والمراجعة هي القيد غالبًا */
  bottleneck: 'translation' | 'review' | 'none';
};

/**
 * لقطة الطاقة.
 *
 * **الوحدتان منفصلتان عمدًا**: دمجهما يُخفي القيد الحقيقي — الطاقة تتوقّف
 * عند ما تستوعبه المراجعة البشرية لا عند سرعة الترجمة.
 */
export function capacitySnapshot(params: {
  unitsTranslated: number;
  unitsReviewed: number;
  translationCapacity: number;
  reviewCapacity: number;
  productionMass: number;
}): CapacitySnapshot {
  const capacity = Math.min(params.translationCapacity, params.reviewCapacity);
  const produced = params.unitsTranslated;

  const translationLoad =
    params.translationCapacity > 0 ? params.unitsTranslated / params.translationCapacity : 0;
  const reviewLoad = params.reviewCapacity > 0 ? params.unitsReviewed / params.reviewCapacity : 0;

  let bottleneck: CapacitySnapshot['bottleneck'] = 'none';
  if (reviewLoad > translationLoad && reviewLoad > 0) bottleneck = 'review';
  else if (translationLoad > 0) bottleneck = 'translation';

  return {
    unitsTranslated: round2(params.unitsTranslated),
    unitsReviewed: round2(params.unitsReviewed),
    capacity: round2(capacity),
    utilization: capacity > 0 ? round4(produced / capacity) : null,
    costPerUnit: produced > 0 ? round2(params.productionMass / produced) : null,
    spare: round2(Math.max(0, capacity - produced)),
    bottleneck,
  };
}

export type CapacityAlert = { level: 'ok' | 'warn' | 'urgent'; message: string };

/**
 * مُشغِّل التعيين (§١٢٫٢).
 *
 * ينبّه **قبل** بلوغ الاستغلال ١٠٠٪، لأن مهلة وصول المنتِج الجديد إلى
 * إنتاجيته الكاملة تُقاس بأسابيع. ومؤشّرا زمن التسليم والتأخير **يسبقان أي
 * حساب وحدات** — هما الإنذار المبكر الحقيقي.
 */
export function capacityAlert(params: {
  utilization: number | null;
  utilizationThreshold: number;
  lateRate: number | null;
  lateThreshold: number;
  avgTurnaroundDays: number | null;
  turnaroundThreshold: number;
}): CapacityAlert {
  if (params.lateRate !== null && params.lateRate >= params.lateThreshold) {
    return {
      level: 'urgent',
      message: `نسبة التأخير ${(params.lateRate * 100).toFixed(0)}% بلغت حدّها — الطاقة تضيق. ابدأ التعيين الآن`,
    };
  }
  if (params.avgTurnaroundDays !== null && params.avgTurnaroundDays >= params.turnaroundThreshold) {
    return {
      level: 'urgent',
      message: `متوسط زمن التسليم ${params.avgTurnaroundDays.toFixed(1)} يومًا تجاوز الحدّ — إنذار مبكر لسقف الطاقة`,
    };
  }
  if (params.utilization !== null && params.utilization >= params.utilizationThreshold) {
    return {
      level: 'warn',
      message: `الاستغلال ${(params.utilization * 100).toFixed(0)}% — ابدأ التعيين قبل بلوغ السقف، فالمنتِج الجديد يحتاج أسابيع`,
    };
  }
  return { level: 'ok', message: 'الطاقة تستوعب الحمل الحالي' };
}

// ═══════════════════════════════════════════════════════════════
//  ١٠ · المؤشر الحاكم: نسبة الإعلان (§١٥٫٤)
// ═══════════════════════════════════════════════════════════════

export type AdTrendVerdict = {
  falling: boolean;
  verdict: string;
  detail: string;
};

/**
 * نسبة الإعلان من إيراد الفرع **يجب أن تنخفض شهريًا**.
 *
 * ثباتها يعني أن الفرع **يستأجر إيرادًا ولا يبني أصلًا** — والأصل هو ما
 * يستمر بعد توقّف الإنفاق: قاعدة عملاء متكرّرة، وحضور محلي، وشراكات إحالة.
 */
export function adTrend(ratios: (number | null)[]): AdTrendVerdict {
  const usable = ratios.filter((r): r is number => r !== null);
  if (usable.length < 3) {
    return {
      falling: false,
      verdict: 'غير مقيس',
      detail: 'يلزم ثلاثة شهور على الأقل للحكم على الاتجاه',
    };
  }

  const first = usable.slice(0, Math.ceil(usable.length / 2));
  const last = usable.slice(-Math.ceil(usable.length / 2));
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const falling = avg(last) < avg(first);

  return {
    falling,
    verdict: falling ? 'تنخفض — الفرع يبني أصلًا' : 'ثابتة أو ترتفع',
    detail: falling
      ? 'الاعتماد على الإعلان يتراجع، وهو ما يُقاس به بناء قاعدة العملاء.'
      : 'الفرع **يستأجر إيرادًا ولا يبني أصلًا** — الأصل ما يستمر بعد توقّف الإنفاق.',
  };
}

// ═══════════════════════════════════════════════════════════════
//  ١١ · القواعد الإلزامية على النظام (§١٣) — للعرض والتدقيق
// ═══════════════════════════════════════════════════════════════

export const VALIDATION_RULES = [
  { n: 1, rule: 'كل بند مصروف بتصنيف واحد فقط — لا بلا تصنيف ولا مزدوج', kind: 'حظر الحفظ' },
  { n: 2, rule: 'مصاريف مقر الفرع المركزي `branch_direct` ولا تدخل الكتلة أبدًا', kind: 'حظر الحفظ' },
  { n: 3, rule: 'الإعلان الموجَّه لمنطقة فرع ذاتيّ · التسويق المؤسسي مشترك', kind: 'حظر الحفظ' },
  { n: 4, rule: 'معادلة التحقّق تساوي صفرًا عند الإقفال', kind: 'حظر الإقفال' },
  { n: 5, rule: 'كل تقرير فرع يعرض المساهمة **و** الصافي المحمَّل معًا', kind: 'قيد عرض' },
  { n: 6, rule: 'شاشات الإغلاق تُبنى على المساهمة حصرًا مع تحذير صريح', kind: 'قيد عرض' },
  { n: 7, rule: 'فرق الاسترداد لا يُوزَّع على الفروع', kind: 'قيد منطق' },
  { n: 8, rule: 'العمولة على المحصَّل لا المفوتر', kind: 'قيد منطق' },
  { n: 9, rule: 'الطلب لا يُقفل دون تسجيل وحداته', kind: 'حظر الإقفال' },
  { n: 10, rule: 'الشهر المقفل لا يُعدَّل — التصحيح بقيد عكسي موثَّق', kind: 'حظر التعديل' },
  { n: 11, rule: 'كل معامل في الإعدادات بسجلّ تغييرات', kind: 'تدقيق' },
  { n: 12, rule: 'تغيير أي معامل يعيد اشتقاق التعادل والتارجت تلقائيًا', kind: 'قيد منطق' },
] as const;
