/**
 * المشروع — الكائن المحوري (§4.3 و§٦).
 *
 * ملف خالٍ من أي أثر جانبي: الحالات وقواعد الانتقال وحقل التنبيه ورصيد
 * العميل. يُستورد في الخادم والمتصفح والاختبارات معًا.
 */

import type { Permission } from './permissions';

// ── الحالات الثماني (§٦) ───────────────────────────────────────

export const PROJECT_STATUSES = {
  pending_assignment: 'قيد الإسناد',
  in_progress: 'قيد التنفيذ',
  in_review: 'قيد المراجعة',
  ready: 'جاهز للتسليم',
  delivered: 'سُلّم',
  collected: 'محصَّل',
  rework: 'مُعاد للتعديل',
  cancelled: 'ملغى',
} as const;

export type ProjectStatus = keyof typeof PROJECT_STATUSES;

/** المسار الرئيسي بالترتيب — تُبنى منه لوحة التشغيل */
export const PROJECT_FLOW: ProjectStatus[] = [
  'pending_assignment',
  'in_progress',
  'in_review',
  'ready',
  'delivered',
  'collected',
];

/** حالتان جانبيتان خارج المسار */
export const PROJECT_SIDE_STATUSES: ProjectStatus[] = ['rework', 'cancelled'];

export const PROJECT_STATUS_ORDER: ProjectStatus[] = [
  ...PROJECT_FLOW,
  ...PROJECT_SIDE_STATUSES,
];

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  pending_assignment: 'bg-slate-100 text-slate-700 border-slate-300',
  in_progress: 'bg-blue-100 text-blue-700 border-blue-300',
  in_review: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  ready: 'bg-sky-100 text-sky-700 border-sky-300',
  delivered: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  collected: 'bg-teal-100 text-teal-800 border-teal-300',
  rework: 'bg-amber-100 text-amber-800 border-amber-300',
  cancelled: 'bg-slate-100 text-slate-400 border-slate-200',
};

/**
 * **الاعتراف بالإيراد بالحالة** (§٣ بند ٤).
 * لا إيراد ولا تكلفة في أي تقرير مالي إلا لمشروع `سُلّم` أو `محصَّل`.
 * الملغى والمعاد وقيد التنفيذ خارج التقارير المالية تمامًا.
 */
export const REVENUE_STATUSES: ProjectStatus[] = ['delivered', 'collected'];

export function countsAsRevenue(status: string): boolean {
  return REVENUE_STATUSES.includes(status as ProjectStatus);
}

/** شرط Prisma جاهز: ما يدخل التقارير المالية وحده */
export const REVENUE_FILTER = { status: { in: REVENUE_STATUSES } };

/** المشاريع الحيّة على لوحة التشغيل — الملغى والمحصَّل خارجها */
export const ACTIVE_STATUSES: ProjectStatus[] = [
  'pending_assignment',
  'in_progress',
  'in_review',
  'ready',
  'rework',
];

// ── قواعد الانتقال (§٦) ────────────────────────────────────────

export type TransitionRule = {
  to: ProjectStatus;
  /** الصلاحية التي يملكها صاحب الانتقال */
  permission?: Permission;
  /** حقول لا يصحّ الانتقال بدونها */
  requires?: { field: string; label: string }[];
};

/**
 * من كل حالة، إلى أين يجوز الانتقال ومن يملكه وما شرطه.
 * **الإلغاء متاح من كل حالة حيّة** — والمشروع لا يُمحى، يخرج من التقارير فقط.
 */
export const TRANSITIONS: Record<ProjectStatus, TransitionRule[]> = {
  pending_assignment: [
    {
      to: 'in_progress',
      permission: 'canAssignProduction',
      requires: [
        { field: 'workMode', label: 'نمط التشغيل' },
        { field: 'primaryProducerId', label: 'المنتِج الرئيسي' },
      ],
    },
    { to: 'cancelled' },
  ],
  in_progress: [
    { to: 'in_review', permission: 'canAssignProduction' },
    { to: 'ready', permission: 'canAssignProduction' },
    { to: 'cancelled' },
  ],
  in_review: [
    { to: 'ready', permission: 'canAssignProduction' },
    { to: 'in_progress', permission: 'canAssignProduction' },
    { to: 'cancelled' },
  ],
  ready: [
    { to: 'delivered', permission: 'canAssignProduction' },
    { to: 'in_progress', permission: 'canAssignProduction' },
    { to: 'cancelled' },
  ],
  delivered: [
    {
      to: 'collected',
      permission: 'canRecordCollection',
      requires: [{ field: 'collectedAmount', label: 'المبلغ المحصَّل' }],
    },
    { to: 'rework', permission: 'canAssignProduction' },
  ],
  // المحصَّل نهاية المسار: لا يعود إلا بإعادة للتعديل تُنشئ أثرها في السجل
  collected: [{ to: 'rework', permission: 'canAssignProduction' }],
  rework: [{ to: 'in_progress', permission: 'canAssignProduction' }, { to: 'cancelled' }],
  cancelled: [],
};

export function allowedTransitions(status: string): TransitionRule[] {
  return TRANSITIONS[status as ProjectStatus] ?? [];
}

// ── حقل التنبيه — حارس البيانات (§4.3) ─────────────────────────

/**
 * يعيد **أول** سبب نقص في السجل، أو فراغًا. الترتيب مقصود ومطابق للمواصفة:
 * الأهم أولًا، فمن يرى تنبيهًا واحدًا يعرف ما يعالجه الآن.
 *
 * > «لا يُعتمد تقرير شهري وفيه تنبيه مفتوح.»
 */
export type AlertInput = {
  status: string;
  createdAt: Date | null;
  pages: number | null;
  netTotal: number | null;
  workMode: string | null;
  primaryProducerId: string | null;
  serviceLine: string | null;
  costTotal?: number | null;
  reviewerId?: string | null;
  reviewerCost?: number | null;
};

export function projectAlert(project: AlertInput): string {
  // الملغى خارج كل التقارير، فلا معنى لتنبيهه
  if (project.status === 'cancelled') return '';

  if (!project.createdAt) return 'تاريخ الاستلام مفقود';
  if (project.pages === null || project.pages === undefined) return 'عدد الصفحات مفقود';
  if (project.netTotal === null || project.netTotal === undefined) return 'السعر مفقود';

  // ما بعد هذا يخصّ التشغيل — لا يُطالَب به مشروع لم يُسند بعد
  const assigned = project.status !== 'pending_assignment';
  if (assigned && !project.workMode) return 'نمط التشغيل مفقود';
  if (assigned && !project.primaryProducerId) return 'المنتِج مفقود';

  if (!project.serviceLine) return 'خط الخدمة غير معرّف';

  if (assigned && project.costTotal !== undefined && !project.costTotal) {
    return 'التكلفة صفر (المنتِج غير مسجّل أو الأجر الخارجي ناقص)';
  }
  if (project.reviewerId && project.reviewerCost !== undefined && !project.reviewerCost) {
    return 'تكلفة المراجع صفر';
  }
  if (!project.netTotal) return 'السعر صفر';

  return '';
}

// ── مشتقات تُحسب عند القراءة لا تُخزَّن ────────────────────────

/** الرصيد = الإجمالي − المقدم − المحصَّل. مشتق بسيط، فلا يُخزَّن */
export function projectBalance(project: {
  netTotal: number;
  deposit: number;
  collectedAmount: number;
}): number {
  return project.netTotal - project.deposit - project.collectedAmount;
}

/** هل تجاوز المشروع موعده وهو ما زال حيًّا؟ */
export function isOverdue(project: { status: string; deadline: Date | null }): boolean {
  if (!project.deadline) return false;
  if (!ACTIVE_STATUSES.includes(project.status as ProjectStatus)) return false;
  return project.deadline.getTime() < Date.now();
}

/** مفتاح تجميع التقارير `YYYY-MM` */
export function revenueMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** نهاية اليوم — ما يضبطه زر «فوري» بضغطة واحدة */
export function endOfToday(now = new Date()): Date {
  const end = new Date(now);
  end.setHours(23, 59, 59, 0);
  return end;
}

// ── أنواع الخصم (§١٠) ──────────────────────────────────────────

export const DISCOUNT_TYPES = {
  none: 'بلا خصم',
  percent: 'نسبة مئوية',
  amount: 'مبلغ ثابت',
  volume: 'شريحة كمية',
  repeat_client: 'عميل متكرر',
} as const;

export type DiscountType = keyof typeof DISCOUNT_TYPES;

export const APPROVAL_STATES = {
  not_required: 'غير مطلوب',
  pending: 'بانتظار اعتماد',
  approved: 'معتمد',
  rejected: 'مرفوض',
} as const;

export type ApprovalState = keyof typeof APPROVAL_STATES;

export const SOURCING_TYPES = {
  internal: 'تشغيل داخلي',
  external: 'تشغيل خارجي',
  mixed: 'مختلط',
} as const;
