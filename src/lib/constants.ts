// ═══════════════════════════════════════════════════════════════
//  القوائم الثابتة في النظام + ترجمتها للعربية
//  عدّل هنا لو أردت تغيير المراحل أو الحالات
// ═══════════════════════════════════════════════════════════════

// ⚠️ الأدوار لم تعد هنا. صارت **بيانات** في جدول `Role` تُنشأ وتُعدَّل من
// شاشة «الأدوار والصلاحيات» بلا نشر جديد (§٥). الافتراضات الابتدائية في
// `src/lib/permissions.ts`، والفحص دائمًا `can(user, 'permission')`.

// ── مراحل الصفقة (Pipeline) ────────────────────────────────────
export const DEAL_STAGES = {
  NEW: 'جديدة',
  QUOTED: 'أُرسل عرض السعر',
  NEGOTIATION: 'تفاوض',
  WON: 'تم الفوز ✅',
  LOST: 'خسارة ❌',
} as const;
export type DealStage = keyof typeof DEAL_STAGES;

export const DEAL_STAGE_ORDER: DealStage[] = ['NEW', 'QUOTED', 'NEGOTIATION', 'WON', 'LOST'];

export const DEAL_STAGE_COLORS: Record<DealStage, string> = {
  NEW: 'bg-slate-100 text-slate-700 border-slate-300',
  QUOTED: 'bg-blue-100 text-blue-700 border-blue-300',
  NEGOTIATION: 'bg-amber-100 text-amber-800 border-amber-300',
  WON: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  LOST: 'bg-rose-100 text-rose-700 border-rose-300',
};

// النسبة الافتراضية لاحتمال إغلاق الصفقة في كل مرحلة
export const STAGE_DEFAULT_PROBABILITY: Record<DealStage, number> = {
  NEW: 20,
  QUOTED: 50,
  NEGOTIATION: 75,
  WON: 100,
  LOST: 0,
};

// ── مراحل الليد — §4.2 من المواصفة ─────────────────────────────
// جديد ← تم التواصل ← عرض سعر ← تفاوض ← فائز / خاسر
export const LEAD_STATUSES = {
  NEW: 'جديد',
  CONTACTED: 'تم التواصل',
  QUOTED: 'عرض سعر',
  NEGOTIATION: 'تفاوض',
  WON: 'فائز',
  LOST: 'خاسر',
} as const;
export type LeadStatus = keyof typeof LEAD_STATUSES;

export const LEAD_STATUS_ORDER: LeadStatus[] = [
  'NEW',
  'CONTACTED',
  'QUOTED',
  'NEGOTIATION',
  'WON',
  'LOST',
];

/** المراحل التي تُغلق الليد — تبصم closedAt */
export const LEAD_CLOSED_STATUSES: LeadStatus[] = ['WON', 'LOST'];

export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  NEW: 'bg-slate-100 text-slate-700 border-slate-300',
  CONTACTED: 'bg-blue-100 text-blue-700 border-blue-300',
  QUOTED: 'bg-sky-100 text-sky-700 border-sky-300',
  NEGOTIATION: 'bg-amber-100 text-amber-800 border-amber-300',
  WON: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  LOST: 'bg-rose-100 text-rose-700 border-rose-300',
};

/** أنواع العميل */
export const CLIENT_TYPES = {
  individual: 'فرد',
  company: 'شركة',
} as const;
export type ClientType = keyof typeof CLIENT_TYPES;

// ── المهام ─────────────────────────────────────────────────────
export const TASK_STATUSES = {
  OPEN: 'مفتوحة',
  IN_PROGRESS: 'قيد التنفيذ',
  DONE: 'منجزة',
  CANCELLED: 'ملغاة',
} as const;
export type TaskStatus = keyof typeof TASK_STATUSES;

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  OPEN: 'bg-slate-100 text-slate-700 border-slate-300',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 border-blue-300',
  DONE: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  CANCELLED: 'bg-slate-100 text-slate-400 border-slate-200',
};

export const TASK_PRIORITIES = {
  LOW: 'منخفضة',
  NORMAL: 'عادية',
  HIGH: 'عالية',
  URGENT: 'عاجلة 🔥',
} as const;
export type TaskPriority = keyof typeof TASK_PRIORITIES;

export const TASK_PRIORITY_COLORS: Record<TaskPriority, string> = {
  LOW: 'bg-slate-100 text-slate-600 border-slate-300',
  NORMAL: 'bg-sky-100 text-sky-700 border-sky-300',
  HIGH: 'bg-orange-100 text-orange-700 border-orange-300',
  URGENT: 'bg-rose-100 text-rose-700 border-rose-300',
};

export const TASK_TYPES = {
  CALL: 'مكالمة',
  EMAIL: 'بريد إلكتروني',
  MEETING: 'اجتماع',
  FOLLOW_UP: 'متابعة',
  TODO: 'مهمة عامة',
} as const;
export type TaskType = keyof typeof TASK_TYPES;

// ── خاص بمكتب الترجمة ──────────────────────────────────────────
export const SERVICE_TYPES = [
  'ترجمة معتمدة',
  'ترجمة قانونية',
  'ترجمة طبية',
  'ترجمة تقنية',
  'ترجمة مالية',
  'ترجمة فورية',
  'ترجمة تتبعية',
  'تدقيق ومراجعة',
  'توطين محتوى',
  'دبلجة وترجمة مرئية',
  'تفريغ صوتي',
  'خدمة أخرى',
] as const;

export const LANGUAGES = [
  'العربية',
  'الإنجليزية',
  'الفرنسية',
  'الألمانية',
  'الإسبانية',
  'الإيطالية',
  'الروسية',
  'التركية',
  'الصينية',
  'اليابانية',
  'الكورية',
  'الفارسية',
  'العبرية',
  'الأردية',
  'الهندية',
] as const;

/**
 * وحدات التسعير في بنود عرض السعر.
 *
 * `WORD_250` هي **وحدة المكتب الفعلية**: الصفحة القياسية ٢٥٠ كلمة مصدر
 * (§١ من المواصفة). التسعير بالكلمة يعطي رقمًا صغيرًا يربك العميل، والتسعير
 * بـ«صفحة» بلا تعريف يفتح خلافًا على ما هي الصفحة — فالوحدة تحمل تعريفها.
 */
export const UNITS = {
  WORD_250: 'صفحة (٢٥٠ كلمة)',
  WORD: 'كلمة',
  PAGE: 'صفحة',
  HOUR: 'ساعة',
  MINUTE: 'دقيقة',
  PROJECT: 'مشروع',
} as const;

/** عدد الكلمات في الصفحة القياسية — واحدٌ عبر النظام كلّه */
export const WORDS_PER_STANDARD_PAGE = 250;

/** الوحدات التي تُقاس بالكلمات — تُعرض معها أداة التحويل */
export const WORD_BASED_UNITS: string[] = ['WORD', 'WORD_250'];
export type Unit = keyof typeof UNITS;

export const CURRENCIES = ['EGP', 'USD', 'EUR', 'SAR', 'AED', 'GBP'] as const;

export const CURRENCY_LABELS: Record<string, string> = {
  EGP: 'جنيه مصري',
  USD: 'دولار أمريكي',
  EUR: 'يورو',
  SAR: 'ريال سعودي',
  AED: 'درهم إماراتي',
  GBP: 'جنيه إسترليني',
};

export const LEAD_SOURCES = [
  'الموقع الإلكتروني',
  'فيسبوك',
  'إنستجرام',
  'لينكدإن',
  'واتساب',
  'مكالمة واردة',
  'توصية عميل',
  'معرض / فعالية',
  'زيارة مباشرة',
  'إعلان مدفوع',
  'مصدر آخر',
] as const;

export const INDUSTRIES = [
  'مكاتب محاماة',
  'قطاع طبي',
  'سفارات وقنصليات',
  'جهات حكومية',
  'شركات مقاولات',
  'بنوك ومؤسسات مالية',
  'تعليم وجامعات',
  'تقنية وبرمجيات',
  'سياحة وسفر',
  'إعلام ونشر',
  'أفراد',
  'قطاع آخر',
] as const;

export const QUOTE_STATUSES = {
  DRAFT: 'مسودة',
  SENT: 'مُرسل',
  ACCEPTED: 'مقبول',
  REJECTED: 'مرفوض',
  EXPIRED: 'منتهي',
} as const;
export type QuoteStatus = keyof typeof QUOTE_STATUSES;

export const QUOTE_STATUS_COLORS: Record<QuoteStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-300',
  SENT: 'bg-blue-100 text-blue-700 border-blue-300',
  ACCEPTED: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  REJECTED: 'bg-rose-100 text-rose-700 border-rose-300',
  EXPIRED: 'bg-amber-100 text-amber-800 border-amber-300',
};
