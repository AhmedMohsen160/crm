/**
 * الصلاحيات الثماني عشرة — §٥ من مواصفة فاست ترانس.
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
  canManageSettings: 'إدارة الإعدادات',
  canViewCompanyAnalytics: 'تحليلات الشركة',
  canViewTeamAnalytics: 'تحليلات الفريق',
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
  canManageUsers: 'إضافة المستخدمين وتعديل أدوارهم',
  canManageSettings: 'تعديل الإعدادات والقوائم وقائمة الأسعار',
  canViewCompanyAnalytics: 'تحليلات الشركة كاملة',
  canViewTeamAnalytics: 'تحليلات فريقه',
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

/** الأدوار السبعة الافتراضية والمصفوفة كما في §٥ — بيانات ابتدائية فقط */
export const DEFAULT_ROLES: {
  name: string;
  label: string;
  sortOrder: number;
  permissions: Permission[];
  /** أقصى خصم بلا اعتماد (§١٠ بند ٤) — يُعدَّل من شاشة الأدوار */
  discountLimit?: number;
}[] = [
  {
    name: 'system_admin',
    label: 'مدير النظام',
    sortOrder: 1,
    discountLimit: 1,
    permissions: [...PERMISSION_KEYS],
  },
  {
    name: 'executive',
    label: 'الإدارة',
    sortOrder: 2,
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
    ],
  },
  {
    name: 'sales_manager',
    label: 'مدير مبيعات',
    sortOrder: 3,
    discountLimit: 0.2,
    permissions: [
      'canCreateLead',
      'canViewTeamLeads',
      'canConvertProject',
      'canViewSellPrice',
      'canDiscount',
      'canApproveDiscount',
      'canRecordCollection',
      'canViewTeamAnalytics',
    ],
  },
  {
    name: 'sales_admin',
    label: 'أدمن مبيعات',
    sortOrder: 4,
    discountLimit: 0.1,
    permissions: [
      'canCreateLead',
      'canConvertProject',
      'canViewSellPrice',
      'canDiscount',
      'canRecordCollection',
    ],
  },
  {
    name: 'project_manager',
    label: 'مدير مشاريع',
    sortOrder: 5,
    // لا يرى سعر البيع عمدًا — حتى لا يُبنى قرار الإسناد على قيمة الطلب
    permissions: [
      'canViewAllLeads',
      'canAssignProduction',
      'canViewFreelancerCost',
      'canViewCostIndicator',
      'canManageFreelancers',
      'canViewTeamAnalytics',
    ],
  },
  {
    name: 'finance',
    label: 'ماليات',
    sortOrder: 6,
    permissions: [
      'canViewSellPrice',
      'canViewFreelancerCost',
      'canRecordCollection',
      'canPayFreelancers',
      'canManageAccounting',
      'canViewCompanyAnalytics',
    ],
  },
  {
    name: 'coordinator',
    label: 'منسق',
    sortOrder: 7,
    permissions: ['canViewAllLeads'],
  },
];
