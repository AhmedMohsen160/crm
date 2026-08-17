/**
 * حساب نسب المبيعات — المعادلة وحدها، بلا قاعدة بيانات ولا شبكة.
 *
 * كل رقم هنا يصل **كوسيط**: الشرائح والنسب وطريقة الاحتساب كلها بيانات
 * تُعدَّل من الشاشة (`CommissionScheme`). لا رقم واحد مكتوب في هذا الملف.
 *
 * يُختبر رقمًا برقم في `tests/commission.mjs` — وفيه الأمثلة الحرفية التي
 * أقرّتها الإدارة في `COMMISSION-SPEC.md`.
 */

export type CommissionTier = {
  /** بداية الشريحة (شامل) */
  fromAmount: number;
  /** نهاية الشريحة (غير شامل) — null تعني «فما فوق» */
  toAmount: number | null;
  /** نسبة الأدمن صاحب المبيعة */
  adminRate: number;
  /** نسبة مديره المباشر */
  managerRate: number;
};

/**
 * طريقة احتساب الشريحة عند تجاوزها:
 *   `progressive` — كل شريحة على الجزء الواقع فيها (المطبَّق افتراضيًا)
 *   `whole`       — الشريحة المحققة تُطبَّق على المبلغ كله
 */
export type TierMode = 'progressive' | 'whole';

export type CommissionResult = {
  /** ما يستحقه الأدمن */
  adminAmount: number;
  /** ما يستحقه مديره المباشر */
  managerAmount: number;
  /** الشريحة التي بلغها (فهرس في المصفوفة المرتّبة) */
  tierIndex: number;
  /** النسبة الحدّية للأدمن عند هذا المستوى */
  currentAdminRate: number;
  currentManagerRate: number;
  /** عتبة الشريحة التالية — null إن كان في الأعلى */
  nextTierAt: number | null;
  /** كم يتبقى لبلوغ الشريحة التالية */
  remainingToNext: number | null;
  /** هل بلغ عتبة استحقاقه؟ true دائمًا حين لا عتبة له */
  targetMet: boolean;
  /** كم يتبقى لبلوغ العتبة — null حين لا عتبة أو حين بلغها */
  remainingToTarget: number | null;
};

/** يرتّب الشرائح تصاعديًا ويتجاهل المشوّه منها */
export function sortTiers(tiers: CommissionTier[]): CommissionTier[] {
  return [...tiers]
    .filter((t) => Number.isFinite(t.fromAmount) && t.fromAmount >= 0)
    .sort((a, b) => a.fromAmount - b.fromAmount);
}

/** الشريحة التي يقع فيها مبلغ ما */
function tierIndexFor(sorted: CommissionTier[], amount: number): number {
  let index = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (amount >= sorted[i].fromAmount) index = i;
    else break;
  }
  return index;
}

/**
 * يحسب استحقاق الأدمن ومديره على إجمالي محقَّق في فترة.
 *
 * **قاعدة «من لا مدير له يأخذ النسبة كاملة»:** حين لا يوجد مدير مباشر،
 * يستحق الأدمن حصته وحصة المدير معًا — لأن العمل كله عمله. مثالها الحيّ:
 * محمد بكري في مدينة نصر بلا أدمن تحته ولا مدير فوقه، فيأخذ الخمسة كاملة.
 * وعند انضمام أدمن إليه يصير هو مديرَه فتنطبق القسمة تلقائيًا بلا كود جديد.
 *
 * **وعتبة الاستحقاق (`target`):** ما دونها لا شيء البتّة — لا للأدمن ولا
 * لمديره. لأن النسبة مكافأةُ تجاوزٍ لا أجرُ حضور، وتخفيضها تحت العتبة يُلغي
 * معنى العتبة أصلًا.
 */
export function computeCommission(params: {
  /** الإجمالي المحقَّق في الفترة (المحصَّل عادةً) */
  total: number;
  tiers: CommissionTier[];
  mode: TierMode;
  /** هل له مدير مباشر يستحق حصته؟ */
  hasManager: boolean;
  /** عتبة الاستحقاق — فارغة تعني بلا عتبة */
  target?: number | null;
}): CommissionResult {
  const sorted = sortTiers(params.tiers);

  const target =
    typeof params.target === 'number' && Number.isFinite(params.target) && params.target > 0
      ? params.target
      : null;
  const total = Number.isFinite(params.total) ? params.total : 0;
  const targetMet = target === null || total >= target;

  const empty: CommissionResult = {
    adminAmount: 0,
    managerAmount: 0,
    tierIndex: 0,
    currentAdminRate: 0,
    currentManagerRate: 0,
    nextTierAt: null,
    remainingToNext: null,
    targetMet,
    remainingToTarget: target !== null && !targetMet ? round2(target - Math.max(0, total)) : null,
  };

  if (sorted.length === 0 || !Number.isFinite(params.total) || params.total <= 0) {
    return empty;
  }

  // دون العتبة: نُبقي الشريحة والنسبة ظاهرتين ليعرف كم يبعد، والمبلغ صفر
  if (!targetMet) {
    const reachedTier = sorted[tierIndexFor(sorted, params.total)];
    const after = sorted[tierIndexFor(sorted, params.total) + 1] ?? null;
    return {
      ...empty,
      tierIndex: tierIndexFor(sorted, params.total),
      currentAdminRate: reachedTier.adminRate,
      currentManagerRate: reachedTier.managerRate,
      nextTierAt: after ? after.fromAmount : null,
      remainingToNext: after ? Math.max(0, round2(after.fromAmount - params.total)) : null,
    };
  }

  const index = tierIndexFor(sorted, params.total);
  const tier = sorted[index];

  let adminAmount = 0;
  let managerAmount = 0;

  if (params.mode === 'whole') {
    // الشريحة المحققة تبتلع المبلغ كله
    adminAmount = params.total * tier.adminRate;
    managerAmount = params.total * tier.managerRate;
  } else {
    // تصاعدية جزئية: كل شريحة على الجزء الواقع فيها
    for (let i = 0; i <= index; i++) {
      const current = sorted[i];
      const upper = current.toAmount ?? Infinity;
      const sliceStart = current.fromAmount;
      const sliceEnd = Math.min(params.total, upper);
      const slice = Math.max(0, sliceEnd - sliceStart);
      if (slice === 0) continue;
      adminAmount += slice * current.adminRate;
      managerAmount += slice * current.managerRate;
    }
  }

  // من لا مدير له يستحق الحصتين معًا
  if (!params.hasManager) {
    adminAmount += managerAmount;
    managerAmount = 0;
  }

  const next = sorted[index + 1] ?? null;

  return {
    adminAmount: round2(adminAmount),
    managerAmount: round2(managerAmount),
    tierIndex: index,
    currentAdminRate: tier.adminRate,
    currentManagerRate: tier.managerRate,
    nextTierAt: next ? next.fromAmount : null,
    remainingToNext: next ? Math.max(0, round2(next.fromAmount - params.total)) : null,
    targetMet,
    remainingToTarget: null,
  };
}

/**
 * يوزّع مبلغ الاستحقاق على المشاريع التي صنعته، بنسبة ما حصّله كل مشروع.
 *
 * **لماذا التوزيع أصلًا:** كل استحقاق يجب أن يكون متتبَّعًا إلى مشروعه، فإن
 * استُرد مشروع عرفنا كم نعكس بالضبط. والمجموع يساوي الاستحقاق **بالضبط** —
 * فارق التقريب يذهب لآخر سطر.
 */
export function splitByProject(
  amount: number,
  projects: { projectId: string; collected: number }[]
): { projectId: string; amount: number }[] {
  const positive = projects.filter((p) => p.collected > 0);
  const total = positive.reduce((s, p) => s + p.collected, 0);
  if (total <= 0 || positive.length === 0) return [];

  const rows = positive.map((p) => ({
    projectId: p.projectId,
    amount: round2((amount * p.collected) / total),
  }));

  const sum = rows.reduce((s, r) => s + r.amount, 0);
  const diff = round2(amount - sum);
  if (diff !== 0) {
    rows[rows.length - 1] = {
      ...rows[rows.length - 1],
      amount: round2(rows[rows.length - 1].amount + diff),
    };
  }
  return rows;
}

// ═══════════════════════════════════════════════════════════════
//  الملكية المزدوجة — مالكٌ رئيسي جلب الصفقة وفرعيٌّ يخدمها
// ═══════════════════════════════════════════════════════════════

/** مشروع في الفترة، ومعه من يستحق حصة المدير عنه هو بعينه */
/**
 * المبلغ الذي تُحسب عليه النسبة من مشروعٍ مسَّته التسوية.
 *
 * **لا نسبة على مالٍ نسبه النظام ولم يبعه أحد.** التسوية توسّع مبالغ الشيت
 * لتبلغ ما رصده دفتر المحاسب — وما زادته مشترياتٌ لم يرصدها الشيت، لا صفقةٌ
 * أتمّها موظف. فالبائع يستحقّ على ما سجّله هو:
 *
 *   · **مشروعٌ أنشأته التسوية** (`settle-YYYY`) — لا بائع له أصلًا فلا نسبة.
 *   · **مشروعٌ وسّعته التسوية** — النسبة على `preSettleTotal`، رقمِه المرصود
 *     قبل التوسيع.
 *   · **وما لم تمسّه** يمرّ كما هو.
 *
 * وكانت القاعدة مكتوبةً في تعليقٍ ولا يطبّقها الكود: تكفي أول خطة نسبٍ
 * تُسنَد ليستحقّ الفريق نسبًا على ١٬٤٨٤ مشروعًا موسَّعًا و١٥٥ مُنشأً.
 */
export function commissionableAmount(project: {
  amount: number;
  importTag?: string | null;
  preSettleTotal?: number | null;
}): number {
  if (project.importTag?.startsWith('settle-')) return 0;
  if (project.preSettleTotal !== null && project.preSettleTotal !== undefined) {
    return Math.min(project.amount, project.preSettleTotal);
  }
  return project.amount;
}

export type AttributableProject = {
  projectId: string;
  collected: number;
  /**
   * مستحقّ حصة المدير عن هذا المشروع:
   *   • المالك الرئيسي حين تكون الصفقة مخدومةً من غيره
   *   • وإلا فالمدير المباشر للبائع
   *   • و`null` حين لا هذا ولا ذاك
   */
  managerId: string | null;
};

export type ShareRow = {
  userId: string;
  /** admin = حصة البائع · manager = حصة من فوقه في هذه الصفقة */
  role: 'admin' | 'manager';
  projectId: string;
  amount: number;
};

/**
 * يوزّع حصتي الأدمن والمدير على المشاريع، **ولكل مشروع مديرُه هو**.
 *
 * لماذا لكل مشروع مديرُه: صفقةٌ جلبها مدير المبيعات وخدمتها نورا تُعطي نورا
 * حصة الأدمن ومديرَ المبيعات حصةَ المدير — وإن لم يكن مديرها الإداري. وقد
 * تكون لنورا في الشهر نفسه صفقاتٌ من عندها تذهب حصةُ مديرها فيها لمديرها
 * الإداري. فالإسناد لا يستقيم على مستوى الشخص، وإنما على مستوى الصفقة.
 *
 * **ومشروع بلا مستحقٍّ للحصة الثانية تعود حصتُه للبائع** — امتدادٌ لقاعدة «من
 * لا مدير له يأخذ النسبة كاملة» إلى مستوى الصفقة الواحدة.
 *
 * المجموع محفوظ بالضبط: `Σ rows = adminAmount + managerAmount`.
 */
export function attributeShares(params: {
  sellerId: string;
  adminAmount: number;
  managerAmount: number;
  projects: AttributableProject[];
}): ShareRow[] {
  const weights = params.projects.map((p) => ({
    projectId: p.projectId,
    collected: p.collected,
  }));
  const managerOf = new Map(params.projects.map((p) => [p.projectId, p.managerId]));

  // نجمّع في خريطة لأن حصةً بلا مستحقٍّ تُضاف إلى سطر الأدمن نفسه
  const merged = new Map<string, ShareRow>();
  const add = (row: ShareRow) => {
    if (row.amount === 0) return;
    const key = `${row.userId}|${row.role}|${row.projectId}`;
    const found = merged.get(key);
    if (found) found.amount = round2(found.amount + row.amount);
    else merged.set(key, { ...row });
  };

  for (const row of splitByProject(params.adminAmount, weights)) {
    add({ userId: params.sellerId, role: 'admin', projectId: row.projectId, amount: row.amount });
  }

  for (const row of splitByProject(params.managerAmount, weights)) {
    const managerId = managerOf.get(row.projectId) ?? null;
    add(
      managerId
        ? { userId: managerId, role: 'manager', projectId: row.projectId, amount: row.amount }
        : { userId: params.sellerId, role: 'admin', projectId: row.projectId, amount: row.amount }
    );
  }

  return [...merged.values()];
}

// ═══════════════════════════════════════════════════════════════
//  لوحة الترتيب — «منافسة دومًا لأعلى سكور ومراكز مرتّبة»
// ═══════════════════════════════════════════════════════════════

export type Ranked<T> = T & { rank: number };

/**
 * يرتّب تنازليًا ويمنح المركز، **والمتساويان يشتركان في المركز** ثم يقفز
 * التالي. أن يُفصل بين متساويين بترتيب الحروف أو بترتيب الإدخال ظلمٌ يراه
 * الموظف في شاشةٍ غرضُها التحفيز.
 */
export function rankBy<T>(rows: T[], score: (row: T) => number): Ranked<T>[] {
  const sorted = [...rows].sort((a, b) => score(b) - score(a));
  const out: Ranked<T>[] = [];
  let rank = 0;
  let previous: number | null = null;

  for (const [index, row] of sorted.entries()) {
    const value = score(row);
    if (previous === null || value !== previous) {
      rank = index + 1;
      previous = value;
    }
    out.push({ ...row, rank });
  }
  return out;
}

/** وسام المراكز الثلاثة الأولى — وما بعدها بلا وسام */
export function medal(rank: number): string | null {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** نسبة بلوغ الهدف — للعرض في شاشة «نسبي» */
export function targetProgress(achieved: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.min(1, achieved / target);
}

/** `YYYY-MM` من تاريخ */
export function periodOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function periodLabel(period: string): string {
  const months = [
    'يناير',
    'فبراير',
    'مارس',
    'أبريل',
    'مايو',
    'يونيو',
    'يوليو',
    'أغسطس',
    'سبتمبر',
    'أكتوبر',
    'نوفمبر',
    'ديسمبر',
  ];
  const [y, m] = period.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return period;
  return `${months[m - 1]} ${y}`;
}

export function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  return periodOf(new Date(y, m - 1 + delta, 1));
}

/** بداية ونهاية الفترة كتاريخين — للاستعلام */
export function periodRange(period: string): { start: Date; end: Date } {
  const [y, m] = period.split('-').map(Number);
  return {
    start: new Date(y, m - 1, 1, 0, 0, 0, 0),
    end: new Date(y, m, 1, 0, 0, 0, 0),
  };
}
