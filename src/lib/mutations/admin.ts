import 'server-only';
import { MutationError, requireOwn, readDeadline } from './base';
import { db } from '@/lib/db';
import { can, hashPassword, verifyPassword, type SessionUser } from '@/lib/auth';
import { str, num, date, fullName } from '@/lib/utils';
import { logActivity, readEntityLink, linkPath, type EntityLink } from '@/lib/actions/helpers';
import { auditEvent, auditDiff } from '@/lib/audit';
import { PERMISSION_KEYS } from '@/lib/permissions';
import { SETTING_DEFINITIONS } from '@/lib/settings-defs';
import { findOrCreateClient } from '@/lib/clients';
import { normalizePhone } from '@/lib/phone';
import {
  nextLeadCode,
  nextClientCode,
  nextProjectCode,
  nextFreelancerCode,
  nextJournalCode,
} from '@/lib/sequence';
import { checkBalance, fiscalMonth, monthRange, spreadAnnual } from '@/lib/accounting';
import {
  postEntry,
  voidEntry,
  isPeriodClosed,
  toBase,
  draftRevenueOnDelivery,
  draftCollection,
  draftFreelancerPayment,
  draftCommissionAccrual,
  draftMonthlyDepreciation,
} from '@/lib/ledger';
import {
  cleanName,
  isHeaderRow,
  mergeKey,
  mergeMultiValue,
  parseRateCell,
  parseRatingCell,
} from '@/lib/freelancers';
import { syncStepPayment, recordFreelancerUse, resolveFreelancerRate } from '@/lib/freelancer-engine';
import { importLeadSheet, importSalesSheet } from '@/lib/import-legacy';
import { runAllEvents } from '@/lib/notification-engine';
import { freezeProjectCost, stepWeightedPages } from '@/lib/project-costing';
import { priceForProject, discountLimitOf, discountRatio } from '@/lib/pricing';
import { rebuildPeriod, reverseProjectCommission } from '@/lib/commission-engine';
import { periodOf } from '@/lib/commission';
import { allSettings } from '@/lib/reference';
import {
  PROJECT_STATUSES,
  performerRole,
  allowedTransitions,
  revenueMonthKey,
  endOfToday,
  type ProjectStatus,
} from '@/lib/projects';
import { LEAD_STATUSES, LEAD_CLOSED_STATUSES, type LeadStatus } from '@/lib/constants';

/**
 * كل عمليات الحفظ في النظام.
 *
 * تُستدعى من مسارات /api عبر إرسال نموذج عادي (POST) ثم تحويل إلى صفحة
 * النتيجة. اخترنا هذا الأسلوب بدل Server Actions لأن رحلة الـ Server Action
 * كانت تتعطّل أحيانًا في المتصفح: يُحفظ السجل على الخادم خلال أجزاء من
 * الثانية، لكن الواجهة تبقى معلّقة ولا تنتقل ولا تعرض ما حُفظ. الأسلوب
 * التقليدي يعمل في كل مرة، ويعمل أيضًا لو تعطّل الجافاسكربت.
 *
 * كل دالة تُعيد المسار الذي ننتقل إليه بعد الحفظ.
 */



/**
 * الإدارة — المستخدمون والأدوار والقوائم والأهداف والإعدادات وتكلفة الموظفين.
 *
 * جزء من وحدة التعديلات المقسَّمة بالمجال — انظر `src/lib/mutations/index.ts`.
 */

// ═══════════════════════════════════════════════════════════════
//  المستخدمون
// ═══════════════════════════════════════════════════════════════

/**
 * يتحقّق أنه سيبقى في النظام **شخص واحد على الأقل يستطيع إدارة المستخدمين**.
 * بلا هذا الفحص يمكن قفل الجميع خارج شاشة الإدارة بتعديل واحد لا رجعة فيه.
 */
async function assertAdminSurvives(excludeUserId: string) {
  const remaining = await db.user.count({
    where: {
      active: true,
      id: { not: excludeUserId },
      roleRef: { canManageUsers: true },
    },
  });
  if (remaining === 0) {
    throw new MutationError(
      'يجب أن يبقى مستخدم نشط واحد على الأقل يملك صلاحية «إدارة المستخدمين»'
    );
  }
}

export async function saveUser(fd: FormData, admin: SessionUser, id?: string) {
  if (!can(admin, 'canManageUsers')) {
    throw new MutationError('ليس لديك صلاحية إدارة المستخدمين');
  }

  const name = str(fd, 'name');
  const password = str(fd, 'password');
  const roleId = str(fd, 'roleId');
  const branch = str(fd, 'branch');
  const reportsToId = str(fd, 'reportsToId');
  const isProducer = fd.get('isProducer') === 'on';

  /**
   * **المنفِّذ الداخلي** — مترجم أو مراجع يُسنَد إليه العمل ولا يدخل النظام.
   *
   * مدير المشاريع يكتب أنّ دعاء راجعت مراجعةً مكثفة، فتُحسب تكلفتها وتُقاس
   * طاقتها ويظهر أداؤها في التحليلات — بلا بريد ولا كلمة مرور ولا دور.
   * إلزامه بحساب دخول يعني إمّا حسابًا وهميًا لا يُستعمل، وإمّا ألّا يُسجَّل
   * عمله أصلًا. وكلاهما أسوأ.
   */
  const canLogin = fd.get('canLogin') !== 'off';

  if (canLogin && !roleId) throw new MutationError('الدور مطلوب لمن يدخل النظام');
  const role = roleId ? await db.role.findUnique({ where: { id: roleId } }) : null;
  if (roleId && !role) throw new MutationError('الدور المختار غير موجود');

  const hrData = {
    departmentId: str(fd, 'departmentId'),
    hireDate: date(fd, 'hireDate'),
    employmentType: str(fd, 'employmentType') ?? 'full_time',
    nationalId: str(fd, 'nationalId'),
    payMethod: str(fd, 'payMethod'),
    bankAccount: str(fd, 'bankAccount'),
  };

  if (!id) {
    const email = str(fd, 'email')?.toLowerCase() ?? null;

    if (!name) throw new MutationError('الاسم مطلوب');
    if (canLogin) {
      if (!email || !password) throw new MutationError('البريد وكلمة المرور مطلوبان لمن يدخل النظام');
      if (password.length < 8) throw new MutationError('كلمة المرور يجب ألا تقل عن 8 أحرف');
    }
    // البريد اختياري للمنفِّذ، وإن كُتب فلا يتكرّر — قد يُمنح دخولًا لاحقًا
    if (email && (await db.user.findUnique({ where: { email } }))) {
      throw new MutationError('هذا البريد الإلكتروني مستخدم بالفعل');
    }

    const created = await db.user.create({
      data: {
        name,
        email,
        canLogin,
        passwordHash: canLogin && password ? await hashPassword(password) : null,
        roleId: roleId ?? null,
        branch,
        reportsToId,
        // المنفِّذ الداخلي منتِج بطبعه — وإلا لما سُجِّل أصلًا
        isProducer: canLogin ? isProducer : true,
        phone: str(fd, 'phone'),
        jobTitle: str(fd, 'jobTitle'),
        ...hrData,
      },
    });
    await auditEvent(
      admin.id,
      'create',
      'User',
      created.id,
      `${created.name} — ${role?.label ?? 'منفِّذ داخلي'}`
    );
    return '/settings/users';
  }

  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) throw new MutationError('المستخدم غير موجود');

  // الحقل معطَّل في الشاشة عند تعديل النفس، فلا يصل في النموذج — نُبقيه كما هو
  const active = admin.id === id ? existing.active : fd.get('active') === 'on';

  if (admin.id === id && roleId !== existing.roleId) {
    throw new MutationError('لا يمكنك تغيير دورك بنفسك');
  }
  if (admin.id === id && !canLogin) {
    throw new MutationError('لا يمكنك إلغاء دخولك أنت — لن تعود تفتح الشاشة');
  }
  if (reportsToId === id) throw new MutationError('لا يمكن أن يتبع المستخدم نفسه');
  if (reportsToId && (await reportsToCreatesCycle(id, reportsToId))) {
    throw new MutationError('هذا الاختيار يُنشئ حلقة في التسلسل الإداري');
  }
  // إن كان هذا الحساب أحد مَن يديرون المستخدمين، فلا نجرّده إلا ويبقى غيره
  if (existing.roleId) {
    const wasAdmin = await db.role.findUnique({
      where: { id: existing.roleId },
      select: { canManageUsers: true },
    });
    // نزع الدور أو الدخول أو التنشيط — كلّها تُخرجه من مديري المستخدمين
    if (wasAdmin?.canManageUsers && (!role?.canManageUsers || !active || !canLogin)) {
      await assertAdminSurvives(id);
    }
  }
  if (password && password.length < 8) {
    throw new MutationError('كلمة المرور يجب ألا تقل عن 8 أحرف');
  }

  const email = str(fd, 'email')?.toLowerCase() ?? null;
  if (email && email !== existing.email) {
    const taken = await db.user.findUnique({ where: { email } });
    if (taken) throw new MutationError('هذا البريد الإلكتروني مستخدم بالفعل');
  }
  // من يدخل النظام لا يُترك بلا كلمة مرور: منحُ الدخول لمنفِّذ يلزمه واحدة
  if (canLogin && !existing.passwordHash && !password) {
    throw new MutationError('امنحه كلمة مرور ليدخل النظام');
  }
  if (canLogin && !email) throw new MutationError('البريد مطلوب لمن يدخل النظام');

  const after = {
    name: name ?? existing.name,
    email,
    canLogin,
    phone: str(fd, 'phone'),
    jobTitle: str(fd, 'jobTitle'),
    roleId: roleId ?? null,
    branch,
    reportsToId,
    isProducer: canLogin ? isProducer : true,
    active,
    ...hrData,
  };

  await db.user.update({
    where: { id },
    data: {
      ...after,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    },
  });
  await auditDiff(admin.id, 'User', id, existing, after);
  return '/settings/users';
}

/** هل يجعل هذا الاختيار المستخدمَ تابعًا لأحد مرؤوسيه؟ */
async function reportsToCreatesCycle(userId: string, managerId: string): Promise<boolean> {
  let current: string | null = managerId;
  const seen = new Set<string>();
  while (current) {
    if (current === userId) return true;
    if (seen.has(current)) return false; // حلقة قائمة أصلًا — لا نزيد عليها
    seen.add(current);
    const next: { reportsToId: string | null } | null = await db.user.findUnique({
      where: { id: current },
      select: { reportsToId: true },
    });
    current = next?.reportsToId ?? null;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
//  الأدوار والصلاحيات — §٥: تُنشأ وتُعدَّل من الشاشة بلا نشر جديد
// ═══════════════════════════════════════════════════════════════

export async function saveRole(fd: FormData, admin: SessionUser, id?: string) {
  if (!can(admin, 'canManageUsers')) {
    throw new MutationError('ليس لديك صلاحية إدارة الأدوار');
  }

  const label = str(fd, 'label');
  if (!label) throw new MutationError('اسم الدور مطلوب');

  // خريطة الصلاحيات تُبنى من قائمة المفاتيح نفسها — إضافة صلاحية جديدة
  // مستقبلًا تعمل هنا تلقائيًا بلا تعديل
  const permissions = Object.fromEntries(
    PERMISSION_KEYS.map((key) => [key, fd.get(key) === 'on'])
  ) as Record<(typeof PERMISSION_KEYS)[number], boolean>;

  const discountLimit = num(fd, 'discountLimit') ?? 0;
  if (discountLimit < 0 || discountLimit > 1) {
    throw new MutationError('حد الخصم يجب أن يكون بين ٠ و١ (٠٫١ تعني ١٠٪)');
  }

  if (!id) {
    const name = str(fd, 'name');
    if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) {
      throw new MutationError('المفتاح البرمجي يجب أن يكون إنجليزيًا صغيرًا بلا مسافات');
    }
    if (await db.role.findUnique({ where: { name } })) {
      throw new MutationError('هذا المفتاح مستخدم بالفعل');
    }
    const maxOrder = await db.role.aggregate({ _max: { sortOrder: true } });
    const created = await db.role.create({
      data: {
        name,
        label,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        discountLimit,
        ...permissions,
      },
    });
    await auditEvent(admin.id, 'create', 'Role', created.id, label);
    return '/settings/roles';
  }

  const existing = await db.role.findUnique({ where: { id } });
  if (!existing) throw new MutationError('الدور غير موجود');

  // نزع «إدارة المستخدمين» من دور يشغله آخرون قد يقفل الجميع خارج الشاشة
  if (existing.canManageUsers && !permissions.canManageUsers) {
    const stillAdmins = await db.user.count({
      where: { active: true, roleRef: { canManageUsers: true, id: { not: id } } },
    });
    if (stillAdmins === 0) {
      throw new MutationError(
        'هذا آخر دور يملك «إدارة المستخدمين» — أنشئ دورًا بديلًا قبل نزعها'
      );
    }
  }

  await db.role.update({ where: { id }, data: { label, discountLimit, ...permissions } });
  await auditDiff(admin.id, 'Role', id, existing, { label, discountLimit, ...permissions });
  return '/settings/roles';
}

// ═══════════════════════════════════════════════════════════════
//  القوائم المرجعية — §٩: قابلة للتعديل من الواجهة
// ═══════════════════════════════════════════════════════════════

export async function saveListItem(fd: FormData, admin: SessionUser, id?: string) {
  if (!can(admin, 'canManageSettings')) {
    throw new MutationError('ليس لديك صلاحية إدارة القوائم');
  }

  const listName = str(fd, 'listName');
  const label = str(fd, 'label');
  if (!listName || !label) throw new MutationError('اسم القائمة والعنوان مطلوبان');

  const extra = str(fd, 'extra');
  if (extra && !Number.isFinite(Number(extra))) {
    throw new MutationError('المعامل يجب أن يكون رقمًا');
  }
  const active = fd.get('active') === 'on';
  const sortOrder = num(fd, 'sortOrder') ?? 0;

  if (!id) {
    const value = str(fd, 'value');
    if (!value || !/^[a-z0-9_]+$/.test(value)) {
      throw new MutationError('المفتاح البرمجي يجب أن يكون إنجليزيًا صغيرًا بلا مسافات');
    }
    const clash = await db.listItem.findUnique({
      where: { listName_value: { listName, value } },
    });
    if (clash) throw new MutationError('هذا المفتاح موجود في القائمة بالفعل');

    const created = await db.listItem.create({
      data: { listName, value, label, extra, sortOrder, active: true },
    });
    await auditEvent(admin.id, 'create', 'ListItem', created.id, `${listName}: ${label}`);
    return `/settings/lists?list=${listName}`;
  }

  const existing = await db.listItem.findUnique({ where: { id } });
  if (!existing) throw new MutationError('العنصر غير موجود');

  // القيمة المخزّنة في السجلات القديمة لا تتغيّر أبدًا — نغيّر العرض فقط
  const after = { label, extra, sortOrder, active };
  await db.listItem.update({ where: { id }, data: after });
  await auditDiff(admin.id, 'ListItem', id, existing, after);
  return `/settings/lists?list=${existing.listName}`;
}

// ═══════════════════════════════════════════════════════════════
//  أهداف الفروع الشهرية — «التارجت يمكن تعديله» (قرار الإدارة)
// ═══════════════════════════════════════════════════════════════

export async function saveTargets(fd: FormData, admin: SessionUser) {
  if (!can(admin, 'canManageSettings')) {
    throw new MutationError('ليس لديك صلاحية تعديل الأهداف');
  }

  const period = str(fd, 'period');
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    throw new MutationError('الشهر غير صالح');
  }

  const branches = await db.listItem.findMany({
    where: { listName: 'branch' },
    select: { value: true, label: true },
  });

  for (const branch of branches) {
    const raw = fd.get(`target_${branch.value}`);
    if (raw === null) continue; // الفرع غير معروض في هذه الشاشة
    const amount = Number(String(raw).trim() || 0);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new MutationError(`هدف «${branch.label}» يجب أن يكون رقمًا موجبًا`);
    }

    const existing = await db.branchTarget.findUnique({
      where: { branch_period: { branch: branch.value, period } },
    });
    if (existing?.amount === amount) continue;

    await db.branchTarget.upsert({
      where: { branch_period: { branch: branch.value, period } },
      update: { amount },
      create: { branch: branch.value, period, amount },
    });
    await auditDiff(
      admin.id,
      'BranchTarget',
      `${branch.value}:${period}`,
      { amount: existing?.amount },
      { amount }
    );
  }

  return `/settings/targets?period=${period}&saved=1`;
}

// ═══════════════════════════════════════════════════════════════
//  إعدادات النظام — §٩
// ═══════════════════════════════════════════════════════════════

export async function saveSettings(fd: FormData, admin: SessionUser) {
  if (!can(admin, 'canManageSettings')) {
    throw new MutationError('ليس لديك صلاحية إدارة الإعدادات');
  }

  const group = str(fd, 'group');
  const definitions = SETTING_DEFINITIONS.filter((d) => !group || d.group === group);

  for (const def of definitions) {
    const raw =
      def.kind === 'boolean'
        ? fd.get(def.key) === 'on'
          ? 'true'
          : 'false'
        : (str(fd, def.key) ?? def.value);

    if (def.kind !== 'boolean' && def.kind !== 'text' && !Number.isFinite(Number(raw))) {
      throw new MutationError(`«${def.label}» يجب أن يكون رقمًا`);
    }

    const existing = await db.setting.findUnique({ where: { key: def.key } });
    if (existing?.value === raw) continue;

    await db.setting.upsert({
      where: { key: def.key },
      update: { value: raw },
      create: { key: def.key, value: raw, label: def.label },
    });
    await auditDiff(
      admin.id,
      'Setting',
      def.key,
      { value: existing?.value },
      { value: raw }
    );
  }

  return `/settings/system?saved=1${group ? `&group=${encodeURIComponent(group)}` : ''}`;
}

/** المستخدم يغيّر كلمة مروره بنفسه */
export async function changeOwnPassword(fd: FormData, user: SessionUser) {
  const current = str(fd, 'currentPassword');
  const next = str(fd, 'newPassword');
  const confirm = str(fd, 'confirmPassword');

  if (!current || !next || !confirm) throw new MutationError('كل الحقول مطلوبة');
  if (next.length < 8) throw new MutationError('كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف');
  if (next !== confirm) throw new MutationError('كلمتا المرور الجديدتان غير متطابقتين');

  const record = await db.user.findUnique({ where: { id: user.id } });
  if (!record?.passwordHash || !(await verifyPassword(current, record.passwordHash))) {
    throw new MutationError('كلمة المرور الحالية غير صحيحة');
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next) },
  });
  return '/settings/password?saved=1';
}

// ═══════════════════════════════════════════════════════════════
//  تكلفة الموظفين — لمن يملك canViewStaffSalary وحده
// ═══════════════════════════════════════════════════════════════

export async function saveStaffCost(fd: FormData, user: SessionUser) {
  if (!can(user, 'canViewStaffSalary')) {
    throw new MutationError('رواتب الموظفين لمدير النظام والإدارة فقط');
  }

  const producers = await db.user.findMany({
    where: { isProducer: true },
    select: { id: true, name: true },
  });

  for (const producer of producers) {
    const salary = num(fd, `salary_${producer.id}`);
    const ratio = num(fd, `ratio_${producer.id}`);
    const capacity = num(fd, `capacity_${producer.id}`);
    if (salary === null && ratio === null && capacity === null) continue;

    if ((ratio ?? 0) < 0 || (ratio ?? 0) > 1) {
      throw new MutationError(`نسبة الإنتاج لـ«${producer.name}» يجب أن تكون بين ٠ و١`);
    }

    const existing = await db.staffCost.findUnique({ where: { userId: producer.id } });
    const after = {
      monthlySalary: salary ?? existing?.monthlySalary ?? 0,
      productiveRatio: ratio ?? existing?.productiveRatio ?? 0.7,
      dailyCapacity: capacity ?? existing?.dailyCapacity ?? 4,
    };

    await db.staffCost.upsert({
      where: { userId: producer.id },
      update: after,
      create: { userId: producer.id, ...after },
    });
    // القيم نفسها لا تُقيَّد في السجل إلا إن تغيّرت فعلًا
    await auditDiff(user.id, 'StaffCost', producer.id, existing ?? {}, after);
  }

  return '/settings/staff-costs?saved=1';
}
