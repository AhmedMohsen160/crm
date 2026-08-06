/**
 * صلاحيات النظام — §٥ من مواصفة فاست ترانس وما أُضيف بعدها.
 *
 * قاعدة ملزمة: **الكود يفحص الصلاحية لا اسم الدور.**
 *   ✅  can(user, 'canViewSellPrice')
 *   ❌  user.role === 'sales_admin'
 *
 * السبب: الأدوار بيانات تُنشأ وتُعدَّل من الشاشة بلا نشر جديد. أي شرط
 * مبني على اسم دور يتعطّل فور إنشاء الإدارة دورًا جديدًا.
 */

export const PERMISSIONS = {
  canCreateLead: 'إنشاء ليد',
  canViewAllLeads: 'رؤية كل الليدز',
  canViewTeamLeads: 'رؤية ليدز الفريق',
  canConvertProject: 'تحويل ليد إلى مشروع',
  canViewSellPrice: 'رؤية سعر البيع',
  canDiscount: 'منح خصم',
  canApproveDiscount: 'اعتماد خصم',
  canAssignProduction: 'إسناد الإنتاج',
  canViewFreelancerCost: 'رؤية تكلفة الفريلانسر',
  canViewStaffSalary: 'رؤية رواتب الموظفين',
  canViewCostIndicator: 'رؤية مؤشر التكلفة',
  canRecordCollection: 'تسجيل التحصيل',
  canManageFreelancers: 'إدارة الفريلانسرز',
  canPayFreelancers: 'دفع مستحقات الفريلانسرز',
  canManageAccounting: 'إدارة الدفاتر المحاسبية',
  canManageUsers: 'إدارة المستخدمين',
  canManageRoles: 'إنشاء الأدوار وتعديلها',
  canManageSettings: 'إدارة الإعدادات',
  canViewCompanyAnalytics: 'تحليلات الشركة',
  canViewTeamAnalytics: 'تحليلات الفريق',
  canViewLeaderboard: 'لوحة ترتيب المبيعات',
  canViewOthersCommission: 'رؤية نسب الآخرين',
  canViewLeadStats: 'إحصاءات الليدز بلا سجلاتها',
  canUseEmail: 'بريد النظام',
  canUseAi: 'المساعد الذكي',
  canManageHr: 'إدارة الموارد البشرية',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

/** شرح مختصر يظهر في شاشة الأدوار لتوضيح أثر كل صلاحية */
export const PERMISSION_HINTS: Record<Permission, string> = {
  canCreateLead: 'تسجيل عميل محتمل جديد',
  canViewAllLeads: 'يرى سجلات كل الفروع والفرق',
  canViewTeamLeads: 'يرى سجلات من يتبعونه إداريًا فقط',
  canConvertProject: 'تحويل الليد الفائز إلى مشروع',
  canViewSellPrice: 'رؤية السعر المُباع به — يُحجب عن مدير المشاريع عمدًا',
  canDiscount: 'منح خصم في حدود دوره',
  canApproveDiscount: 'اعتماد خصم تجاوز الحد',
  canAssignProduction: 'إسناد المشاريع للمنتِجين والمراجعين',
  canViewFreelancerCost: 'رؤية أجر الفريلانسر',
  canViewStaffSalary: 'رؤية رواتب الموظفين — لمدير النظام والإدارة فقط',
  canViewCostIndicator: 'رؤية مؤشر التكلفة المجرّد عند الإسناد',
  canRecordCollection: 'تسجيل تحصيل المبالغ من العملاء',
  canManageFreelancers: 'إضافة الفريلانسرز وتعديل بياناتهم',
  canPayFreelancers: 'تأكيد صرف مستحقات الفريلانسرز',
  canManageAccounting: 'تحرير قيود اليومية وترحيلها وإقفال الشهور',
  canManageUsers: 'إضافة المستخدمين وإسناد الأدوار الموجودة إليهم',
  canManageRoles: 'إنشاء دور جديد أو تغيير صلاحياته — منفصلة عن إدارة المستخدمين عمدًا',
  canManageSettings: 'تعديل الإعدادات والقوائم وقائمة الأسعار',
  canViewCompanyAnalytics: 'تحليلات الشركة كاملة',
  canViewTeamAnalytics: 'تحليلات فريقه',
  canViewLeaderboard: 'ترتيب زملائه بالمبيعات — تحفيزًا بلا كشف نسب أحد',
  canViewOthersCommission: 'مبالغ استحقاق غيره ونسبهم — تُحجب عن الأدمن',
  canViewLeadStats: 'أعداد الليدز وتكلفتها إجماليًا بلا فتح سجلاتها',
  canUseEmail: 'قراءة بريد الصناديق المتاحة له والرد عليها',
  canUseAi: 'سؤال المساعد الذكي وصياغة الردود — بحدود ما يراه هو',
  canManageHr: 'الأقسام وهياكل الأجر وكشوف الرواتب وتقارير الأداء',
};

/** نطاق ما يراه المستخدم من السجلات */
export type Scope = 'all' | 'team' | 'self';

/** أي كائن يحمل خريطة صلاحيات — يعمل في الخادم والمتصفح معًا */
export type PermissionHolder = { permissions: Record<Permission, boolean> };

/**
 * الفحص الوحيد المسموح به. موجود هنا لا في `auth.ts` لأن `auth.ts` خادمي
 * صرف، ومكوّنات الواجهة تحتاج الفحص نفسه.
 */
export function hasPermission(user: PermissionHolder, permission: Permission): boolean {
  return user.permissions[permission] === true;
}

export function hasAnyPermission(
  user: PermissionHolder,
  ...permissions: Permission[]
): boolean {
  return permissions.some((p) => hasPermission(user, p));
}

/**
 * لون شارة الدور مشتقًا من ترتيبه — يعمل مع أي دور جديد تنشئه الإدارة
 * بلا تعديل كود.
 */
const ROLE_PALETTE = [
  'bg-violet-100 text-violet-700 border-violet-300',
  'bg-indigo-100 text-indigo-700 border-indigo-300',
  'bg-blue-100 text-blue-700 border-blue-300',
  'bg-sky-100 text-sky-700 border-sky-300',
  'bg-teal-100 text-teal-700 border-teal-300',
  'bg-amber-100 text-amber-800 border-amber-300',
  'bg-slate-100 text-slate-700 border-slate-300',
];

export function roleColor(sortOrder: number): string {
  return ROLE_PALETTE[Math.max(0, sortOrder - 1) % ROLE_PALETTE.length];
}

/**
 * الأدوار الافتراضية ومصفوفتها (§٥ وما أقرّته الإدارة بعدها) — بيانات ابتدائية
 * فقط: كل خانة هنا تُعدَّل من شاشة الأدوار بلا نشر.
 *
 * **التسلسل الإداري:** المالك الرئيسي ← المدير التنفيذي ← مدير المبيعات ومدير
 * المشاريع ← الأدمنز والمنفِّذون. والتسلسل نفسه بياناتٌ في `User.reportsToId`
 * لا في هذا الجدول: هذه أدوارٌ (ماذا يرى) لا مواقعُ (لمن يتبع).
 */
export const DEFAULT_ROLES: {
  name: string;
  label: string;
  sortOrder: number;
  permissions: Permission[];
  /** أقصى خصم بلا اعتماد (§١٠ بند ٤) — يُعدَّل من شاشة الأدوار */
  discountLimit?: number;
}[] = [
  {
    // المالك الرئيسي — أحمد محسن. لا شيء محجوب عنه.
    name: 'owner',
    label: 'المالك الرئيسي',
    sortOrder: 1,
    discountLimit: 1,
    permissions: [...PERMISSION_KEYS],
  },
  {
    /**
     * المدير التنفيذي — يتبع له مدير المبيعات ومدير التشغيل، ويدير الأقسام
     * كلها. حُجبت عنه **صلاحيتان** فقط: تعريف الأدوار وتعديل إعدادات النظام،
     * فهما تُعيدان تشكيل النظام نفسه لا تشغيله. وتُمنحان من الشاشة متى قرّر
     * المالك.
     */
    name: 'executive_director',
    label: 'المدير التنفيذي',
    sortOrder: 2,
    discountLimit: 1,
    permissions: PERMISSION_KEYS.filter(
      (key) => key !== 'canManageRoles' && key !== 'canManageSettings'
    ),
  },
  {
    name: 'system_admin',
    label: 'مدير النظام',
    sortOrder: 3,
    discountLimit: 1,
    permissions: [...PERMISSION_KEYS],
  },
  {
    name: 'executive',
    label: 'الإدارة',
    sortOrder: 4,
    discountLimit: 1,
    permissions: [
      'canViewAllLeads',
      'canViewSellPrice',
      'canApproveDiscount',
      'canViewFreelancerCost',
      'canViewStaffSalary',
      'canViewCostIndicator',
      'canViewCompanyAnalytics',
      'canViewTeamAnalytics',
      'canViewLeaderboard',
      'canViewOthersCommission',
      'canViewLeadStats',
      'canUseAi',
      'canManageHr',
    ],
  },
  {
    /**
     * مدير المبيعات — **يضيف أدمنز** ويتابع مبيعاتهم ويقارن أداءهم. وله صفقاته
     * الخاصة التي يملكها ملكية رئيسية ويخدمها أدمنٌ تحته.
     * `canManageUsers` بلا `canManageRoles`: يضيف الناس ولا يعيد تعريف الأدوار.
     */
    name: 'sales_manager',
    label: 'مدير مبيعات',
    sortOrder: 5,
    discountLimit: 0.2,
    permissions: [
      'canCreateLead',
      'canViewTeamLeads',
      'canConvertProject',
      'canViewSellPrice',
      'canDiscount',
      'canApproveDiscount',
      'canRecordCollection',
      'canManageUsers',
      'canViewTeamAnalytics',
      'canViewLeaderboard',
      'canViewOthersCommission',
      'canUseEmail',
      'canUseAi',
    ],
  },
  {
    /**
     * أدمن المبيعات — يرى ما يراه مديره **إلا مبالغ استحقاق زملائه ونسبهم**،
     * ولا يُعرّف دورًا ولا يضيف مستخدمًا. ويرى لوحة الترتيب: منافسةٌ على
     * الصدارة بالأرقام المحقَّقة، لا كشفٌ لما يقبضه أحد.
     */
    name: 'sales_admin',
    label: 'أدمن مبيعات',
    sortOrder: 6,
    discountLimit: 0.1,
    permissions: [
      'canCreateLead',
      'canViewTeamLeads',
      'canConvertProject',
      'canViewSellPrice',
      'canDiscount',
      'canRecordCollection',
      'canViewTeamAnalytics',
      'canViewLeaderboard',
      'canUseEmail',
      'canUseAi',
    ],
  },
  {
    name: 'project_manager',
    label: 'مدير مشاريع',
    sortOrder: 7,
    /**
     * لا يرى سعر البيع عمدًا — حتى لا يُبنى قرار الإسناد على قيمة الطلب.
     *
     * **ولا يرى الليدز ولا سجلّ العملاء.** كان يحمل `canViewAllLeads` ليصل
     * إلى المشاريع كلها فيُسندها، فحمل معها جردَ الليدز والعملاء وأرقامَ
     * مبيعات الفرق. والوصولُ إلى المشاريع صار من `canAssignProduction`
     * نفسها (`projectFilter`)، فسقطت الحاجة إلى الصلاحية الواسعة.
     *
     * ومن أرادت له الإدارة أن يُدخل ليدزه بجانب عمله، مُنح `canCreateLead`
     * من شاشة الأدوار — فتظهر له الشاشة بسجلاته هو وحدها.
     */
    permissions: [
      'canAssignProduction',
      'canViewFreelancerCost',
      'canViewCostIndicator',
      'canManageFreelancers',
      'canViewTeamAnalytics',
      'canUseEmail',
      'canUseAi',
    ],
  },
  {
    /**
     * المترجم — **وجوده على النظام ليس شرطًا**: مدير المشاريع يرصد من نفّذ
     * ومن راجع، فتُحسب التكلفة وتُقاس الطاقة بلا حساب له. وحين يُفتح له حساب
     * فلشيء واحد: أن يرى أداءه هو ومشاريعه هو — **بلا أي رقم تكلفة**.
     * ولذلك دورٌ بلا صلاحية واحدة: شاشة «أدائي» لا تحتاج إلى إذن، تحتاج
     * فقط إلى أن يكون الداخل هو صاحبها.
     */
    name: 'translator',
    label: 'مترجم',
    sortOrder: 8,
    permissions: [],
  },
  {
    /**
     * المحاسب — «يرى كل حاجة حتى يفهم كامل التشغيل ما عدا الجزء الخاص
     * بالليدز». فلا `canViewAllLeads` ولا `canViewTeamLeads`، وله بدلًا منهما
     * `canViewLeadStats`: الأعداد والتكلفة والأسعار إجمالًا بلا فتح سجل أحد.
     */
    name: 'finance',
    label: 'ماليات',
    sortOrder: 9,
    permissions: [
      'canViewSellPrice',
      'canViewFreelancerCost',
      'canViewStaffSalary',
      'canViewCostIndicator',
      'canRecordCollection',
      'canPayFreelancers',
      'canManageAccounting',
      'canViewCompanyAnalytics',
      'canViewTeamAnalytics',
      'canViewOthersCommission',
      'canViewLeadStats',
      'canManageHr',
      'canUseAi',
    ],
  },
  {
    name: 'coordinator',
    label: 'منسق',
    sortOrder: 10,
    permissions: ['canViewAllLeads'],
  },
];
