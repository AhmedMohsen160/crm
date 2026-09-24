import { canOpenProject } from '../src/lib/projects.ts';
/**
 * اختبار مصفوفة الأدوار والصلاحيات — §٥ وما أقرّته الإدارة في المرحلة ١٤.
 *
 * **لماذا تُختبر مصفوفةُ بيانات؟** لأن كل سطر فيها قرارٌ إداري لا تفصيلٌ
 * تقني: «أدمن المبيعات لا يرى نسب زملائه» و«المحاسب لا يفتح الليدز» و«مدير
 * المبيعات يضيف أدمنز ولا يُعرّف الأدوار». وأي تعديل يكسر واحدًا منها يجب
 * أن يسقط هنا، لا أن يُكتشف حين يرى موظفٌ ما لا يحقّ له.
 *
 * التشغيل:  npm run test:permissions
 */
import {
  PERMISSIONS,
  PERMISSION_KEYS,
  PERMISSION_HINTS,
  DEFAULT_ROLES,
  hasPermission,
  hasAnyPermission,
  roleColor,
} from '../src/lib/permissions.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}

const roleOf = (name) => DEFAULT_ROLES.find((r) => r.name === name);
const holder = (permissions) => ({
  permissions: Object.fromEntries(PERMISSION_KEYS.map((k) => [k, permissions.includes(k)])),
});
const has = (roleName, key) => roleOf(roleName).permissions.includes(key);

console.log('مصفوفة الأدوار والصلاحيات\n');

// ── سلامة المصفوفة نفسها ─────────────────────────────────────

check(PERMISSION_KEYS.length === Object.keys(PERMISSIONS).length, 'المفاتيح مشتقّة من الجدول');
check(
  PERMISSION_KEYS.every((key) => typeof PERMISSION_HINTS[key] === 'string'),
  'كل صلاحية لها شرحٌ يظهر في شاشة الأدوار — لا خانة بلا تفسير'
);
check(
  new Set(DEFAULT_ROLES.map((r) => r.name)).size === DEFAULT_ROLES.length,
  'لا مفتاح دور مكرَّر'
);
check(
  new Set(DEFAULT_ROLES.map((r) => r.label)).size === DEFAULT_ROLES.length,
  'ولا اسم عربي مكرَّر — وإلا اختار المستخدم دورًا غير الذي قصده'
);
check(
  DEFAULT_ROLES.every((r) => r.permissions.every((p) => PERMISSION_KEYS.includes(p))),
  'لا دور يشير إلى صلاحية غير موجودة'
);
check(
  DEFAULT_ROLES.every((r) => (r.discountLimit ?? 0) >= 0 && (r.discountLimit ?? 0) <= 1),
  'حد الخصم بين صفر وواحد'
);

// ── الفحص نفسه ───────────────────────────────────────────────

check(hasPermission(holder(['canUseAi']), 'canUseAi'), 'الفحص يقبل ما مُنح');
check(!hasPermission(holder([]), 'canUseAi'), 'ويرفض ما لم يُمنح');
check(!hasPermission({ permissions: {} }, 'canUseAi'), 'وغياب المفتاح رفضٌ لا قبول');
check(
  hasAnyPermission(holder(['canManageRoles']), 'canManageUsers', 'canManageRoles'),
  'anyOf تكفيها واحدة'
);
check(!hasAnyPermission(holder([]), 'canManageUsers', 'canManageRoles'), 'وبلا أيٍّ منها ترفض');
check(typeof roleColor(99) === 'string', 'لون الشارة يعمل لأي ترتيب — الأدوار تُنشأ من الشاشة');

// ── المالك والمدير التنفيذي ──────────────────────────────────

check(
  roleOf('owner').permissions.length === PERMISSION_KEYS.length,
  'المالك الرئيسي: لا شيء محجوب عنه'
);
check(roleOf('executive_director') !== undefined, 'دور المدير التنفيذي موجود');
check(
  !has('executive_director', 'canManageRoles') && !has('executive_director', 'canManageSettings'),
  'المدير التنفيذي: تعريف الأدوار وإعدادات النظام تبقى للمالك'
);
/**
 * **والحذف النهائيّ ثالثُها.** قالها أحمد: «تكون لمدير النظام فقط» — فهي
 * للمالك ومدير النظام وحدهما، وتُمنح لغيرهما من شاشة الأدوار متى قرّر.
 */
check(
  !has('executive_director', 'canPurgeRecords'),
  '★ **والحذف النهائيّ للمالك ومدير النظام وحدهما** — «تكون لمدير النظام فقط»'
);
check(
  has('owner', 'canPurgeRecords') && has('system_admin', 'canPurgeRecords'),
  'وهما يملكانه'
);
check(
  !has('sales_manager', 'canPurgeRecords') &&
    !has('finance', 'canPurgeRecords') &&
    !has('project_manager', 'canPurgeRecords'),
  'ولا يملكه مدير المبيعات ولا المحاسب ولا مدير المشاريع'
);
check(
  has('executive_director', 'canManageUsers') &&
    has('executive_director', 'canManageHr') &&
    has('executive_director', 'canViewCompanyAnalytics') &&
    has('executive_director', 'canManageAccounting'),
  'وما عداهما يديره كاملًا — الأقسام كلها تحته'
);
check(
  roleOf('executive_director').permissions.length === PERMISSION_KEYS.length - 3,
  'وحُجبت عنه ثلاثُ صلاحيات بالضبط لا أكثر — الأدوار والإعدادات والحذف النهائيّ'
);

// ── مدير المبيعات وأدمن المبيعات ─────────────────────────────

check(
  has('sales_manager', 'canManageUsers'),
  'مدير المبيعات يضيف أدمنز'
);
check(
  !has('sales_manager', 'canManageRoles'),
  'ولا يُعرّف الأدوار — الصلاحيتان منفصلتان عمدًا'
);
check(
  has('sales_manager', 'canViewOthersCommission') && has('sales_manager', 'canViewLeaderboard'),
  'ويرى نسب فريقه وترتيبهم'
);

check(
  !has('sales_admin', 'canViewOthersCommission'),
  'أدمن المبيعات لا يرى نسب زملائه — القيد الوحيد على رؤيته'
);
check(
  has('sales_admin', 'canViewLeaderboard'),
  'ويرى لوحة الترتيب: منافسةٌ على المحقَّق لا على الأجر'
);
check(
  !has('sales_admin', 'canManageRoles') && !has('sales_admin', 'canManageUsers'),
  'ولا يُنشئ دورًا ولا مستخدمًا'
);
check(
  has('sales_admin', 'canViewTeamLeads') && has('sales_admin', 'canViewTeamAnalytics'),
  'ويرى ليدز الفريق وتحليلاته كما يرى مديره'
);
// القاعدة التي أقرّها أحمد: يرى ما يراه مديره **إلا** النسب والأدوار
const managerOnly = roleOf('sales_manager').permissions.filter(
  (p) => !roleOf('sales_admin').permissions.includes(p)
);
check(
  managerOnly.every((p) =>
    ['canViewOthersCommission', 'canManageUsers', 'canApproveDiscount'].includes(p)
  ),
  'الفارق بين المدير وأدمنه محصورٌ في النسب وإضافة المستخدمين واعتماد الخصم',
  managerOnly.join('، ')
);

// ── المحاسب ──────────────────────────────────────────────────

check(
  !has('finance', 'canViewAllLeads') && !has('finance', 'canViewTeamLeads'),
  'المحاسب لا يفتح سجلات الليدز — «هو يتعامل فقط مع العملاء»'
);
check(has('finance', 'canViewLeadStats'), 'ويعرف أعدادها وتكلفتها إجمالًا');
check(
  has('finance', 'canViewCompanyAnalytics') &&
    has('finance', 'canManageAccounting') &&
    has('finance', 'canViewStaffSalary') &&
    has('finance', 'canManageHr'),
  'وما عدا الليدز يراه كاملًا ليفهم التشغيل'
);

// ── المترجم ──────────────────────────────────────────────────

check(roleOf('translator') !== undefined, 'دور المترجم موجود');
check(
  roleOf('translator').permissions.length === 0,
  'المترجم بلا صلاحية واحدة: شاشة «أدائي» لا تحتاج إذنًا بل صاحبها'
);
check(
  !has('translator', 'canViewSellPrice') && !has('translator', 'canViewFreelancerCost'),
  'ولا يرى سعرًا ولا تكلفة — الشرط الصريح في طلب الإدارة'
);

// ── مدير المشاريع ────────────────────────────────────────────

check(
  has('project_manager', 'canAssignProduction') && has('project_manager', 'canViewTeamAnalytics'),
  'مدير المشاريع يُسند ويرى إنتاجية فريقه'
);
check(
  !has('project_manager', 'canViewSellPrice'),
  'ولا يرى سعر البيع — حتى لا يُبنى قرار الإسناد على قيمة الطلب'
);

// ── لا دور بلا مالكٍ لصلاحية حرجة ────────────────────────────

for (const key of ['canManageUsers', 'canManageRoles', 'canManageSettings', 'canManageAccounting']) {
  check(
    DEFAULT_ROLES.some((r) => r.permissions.includes(key)),
    `صلاحية «${PERMISSIONS[key]}» يملكها دورٌ افتراضي واحد على الأقل`
  );
}


// ═══════════════════════════════════════════════════════════════
//  بابُ صفحة المشروع
// ═══════════════════════════════════════════════════════════════

/**
 * **بابُ الصفحة هو بابُ القائمة نفسه.**
 *
 * كانت القائمة تفتح لمن يملك `canAssignProduction` والصفحة تفحص
 * `canViewAllLeads` وحدها — فيرى مديرُ المشاريع المشروعَ في القائمة ويُسنده،
 * ثم يضغط ليبدأ التنفيذ فتقول له الصفحة «الصفحة غير موجودة». وهو مأذونٌ
 * يبحث عمّا لا يجده.
 */
const PROJECT = {
  ownerId: 'magly',
  projectManagerId: 'tarek',
  primaryProducerId: 'doaa',
  reviewerId: null,
};

check(
  canOpenProject({ id: 'tarek', seesAll: true }, PROJECT),
  '★ **من يُسند يفتح المشروع** — والقائمة والصفحة ببابٍ واحد'
);
check(
  canOpenProject({ id: 'magly', seesAll: false, scopeIds: ['magly', 'yahia'] }, PROJECT),
  'ومالكُ المشروع يفتحه'
);
check(
  canOpenProject({ id: 'sales_manager', seesAll: false, scopeIds: ['sales_manager', 'magly'] }, PROJECT),
  'ومديرُ مالكِه يفتحه بنطاق فريقه'
);
check(
  canOpenProject({ id: 'tarek', seesAll: false }, PROJECT),
  '★ **ومن أُسند إليه المشروع يفتحه** — الإسنادُ بلا وصولٍ طريقٌ مسدود'
);
check(
  canOpenProject({ id: 'doaa', seesAll: false }, PROJECT),
  'والمنفِّذُ المسنَد إليه كذلك'
);
check(
  !canOpenProject({ id: 'stranger', seesAll: false, scopeIds: ['stranger'] }, PROJECT),
  'ومن لا يملكه ولا أُسند إليه ولا يرى الكلّ لا يفتحه'
);
check(
  !canOpenProject({ id: 'yahia', seesAll: false, scopeIds: ['yahia'] }, PROJECT),
  'وأدمنٌ آخر في الفريق نفسه لا يفتح مشروع زميله — نطاقُه نفسُه'
);

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
