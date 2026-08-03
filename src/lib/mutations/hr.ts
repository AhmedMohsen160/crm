import 'server-only';
import { MutationError } from './base';
import { db } from '@/lib/db';
import { can, type SessionUser } from '@/lib/auth';
import { str, num, date } from '@/lib/utils';
import { auditEvent, auditDiff } from '@/lib/audit';
import { COMPONENT_KIND_KEYS, periodOf } from '@/lib/hr';
import { buildPayroll } from '@/lib/hr-engine';

/**
 * الموارد البشرية.
 *
 * **الأجر بنودٌ بتاريخ سريان لا رقمًا واحدًا**، و**كشف الشهر لقطة تُجمَّد عند
 * الاعتماد**. كلاهما لنفس السبب الذي جُمِّدت به تكلفة المشروع عند التسليم:
 * زيادةٌ تُقرَّر اليوم لا تُعيد كتابة ما صُرف الشهر الماضي.
 */

// ── الأقسام ────────────────────────────────────────────────────

export async function saveDepartment(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageHr')) throw new MutationError('إدارة الأقسام لمن يدير الموارد البشرية');

  const name = str(fd, 'name');
  if (!name) throw new MutationError('اسم القسم مطلوب');

  const parentId = str(fd, 'parentId');
  if (parentId && parentId === id) throw new MutationError('القسم لا يتبع نفسه');
  if (id && parentId && (await createsCycle(id, parentId))) {
    throw new MutationError('هذا الاختيار يُنشئ حلقة في الشجرة التنظيمية');
  }

  const data = {
    name,
    code: str(fd, 'code'),
    parentId,
    managerId: str(fd, 'managerId'),
    branch: str(fd, 'branch'),
    costCenterId: str(fd, 'costCenterId'),
    sortOrder: Math.round(num(fd, 'sortOrder') ?? 0),
    notes: str(fd, 'notes'),
    active: fd.get('active') !== 'off',
  };

  if (!id) {
    const created = await db.department.create({ data });
    await auditEvent(user.id, 'create', 'Department', created.id, name);
    return '/hr/departments';
  }

  const existing = await db.department.findUnique({ where: { id } });
  if (!existing) throw new MutationError('القسم غير موجود');
  await db.department.update({ where: { id }, data });
  await auditDiff(user.id, 'Department', id, existing, data);
  return '/hr/departments';
}

/** هل يجعل هذا الاختيار القسمَ تابعًا لأحد فروعه؟ */
async function createsCycle(deptId: string, parentId: string): Promise<boolean> {
  let current: string | null = parentId;
  const seen = new Set<string>();
  while (current) {
    if (current === deptId) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    const next: { parentId: string | null } | null = await db.department.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    current = next?.parentId ?? null;
  }
  return false;
}

// ── بنود الأجر ─────────────────────────────────────────────────

/**
 * بند أجر — أساسي أو بدل أو حافز أو استقطاع.
 *
 * **لا يُعدَّل بند سارٍ بل يُنهى ويُنشأ خلفه.** تعديل مبلغ بندٍ ساري المفعول
 * يُعيد كتابة كشوف الشهور الماضية بأثر رجعي، وهو ما لا يقبله محاسب ولا موظف.
 */
export async function saveSalaryComponent(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageHr')) throw new MutationError('لا صلاحية');

  const userId = str(fd, 'userId');
  if (!userId) throw new MutationError('الموظف مطلوب');

  const kind = str(fd, 'kind') ?? '';
  if (!COMPONENT_KIND_KEYS.includes(kind as never)) throw new MutationError('نوع البند غير معروف');

  const label = str(fd, 'label');
  if (!label) throw new MutationError('اسم البند مطلوب');

  const amount = num(fd, 'amount');
  if (amount === null || amount < 0) throw new MutationError('المبلغ مطلوب ولا يكون سالبًا');

  const isPercent = fd.get('isPercent') === 'on';
  if (isPercent && kind === 'basic') {
    throw new MutationError('الأساسي مبلغ لا نسبة — النسب تُحسب عليه');
  }
  if (isPercent && amount > 100) throw new MutationError('النسبة لا تتجاوز مئة');

  const frequency = str(fd, 'frequency') === 'once' ? 'once' : 'monthly';
  const period = str(fd, 'period');
  if (frequency === 'once' && !period) {
    throw new MutationError('البند لمرة واحدة يلزمه شهرٌ محدَّد — وإلا لم يسرِ أبدًا');
  }

  const data = {
    userId,
    kind,
    label,
    amount,
    isPercent,
    frequency,
    period: frequency === 'once' ? period : null,
    effectiveFrom: date(fd, 'effectiveFrom') ?? new Date(),
    effectiveTo: date(fd, 'effectiveTo'),
    active: fd.get('active') !== 'off',
    notes: str(fd, 'notes'),
  };

  if (data.effectiveTo && data.effectiveTo < data.effectiveFrom) {
    throw new MutationError('تاريخ الانتهاء قبل تاريخ السريان');
  }

  if (!id) {
    const created = await db.salaryComponent.create({ data });
    await auditEvent(user.id, 'create', 'SalaryComponent', created.id, `${label} — ${amount}`);
    return `/hr/employees/${userId}`;
  }

  const existing = await db.salaryComponent.findUnique({ where: { id } });
  if (!existing) throw new MutationError('البند غير موجود');
  await db.salaryComponent.update({ where: { id }, data });
  await auditDiff(user.id, 'SalaryComponent', id, existing, data);
  return `/hr/employees/${userId}`;
}

/** إنهاء بند — لا حذفه: كشوف الماضي بُنيت عليه */
export async function endSalaryComponent(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageHr')) throw new MutationError('لا صلاحية');
  if (!id) throw new MutationError('معرّف البند مفقود');

  const component = await db.salaryComponent.findUnique({ where: { id } });
  if (!component) throw new MutationError('البند غير موجود');

  await db.salaryComponent.update({
    where: { id },
    data: { active: false, effectiveTo: date(fd, 'effectiveTo') ?? new Date() },
  });
  await auditEvent(user.id, 'update', 'SalaryComponent', id, `إنهاء ${component.label}`);
  return `/hr/employees/${component.userId}`;
}

// ── كشف الرواتب ────────────────────────────────────────────────

export async function runPayroll(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageHr')) throw new MutationError('لا صلاحية');

  const period = str(fd, 'period') ?? periodOf(new Date());
  if (!/^\d{4}-\d{2}$/.test(period)) throw new MutationError('الشهر بصيغة YYYY-MM');

  try {
    const result = await buildPayroll(period, user.id);
    await auditEvent(user.id, 'create', 'PayrollRun', result.runId, `كشف ${period} — ${result.count} موظفًا`);
    return `/hr/payroll?period=${period}&built=${result.count}`;
  } catch (error) {
    throw new MutationError(error instanceof Error ? error.message : 'تعذّر بناء الكشف');
  }
}

/**
 * اعتماد الكشف أو تسجيل صرفه.
 *
 * الاعتماد **يجمّد** الكشف فلا يُعاد بناؤه، والصرف يقفله. ولا يُرحَّل قيدٌ
 * للدفتر من هنا: الدفتر لا يُكتب من ظهر المحاسب (§٤)، وإنما يُولَّد له قيد
 * مسوّدة يراجعه.
 */
export async function decidePayroll(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageHr')) throw new MutationError('لا صلاحية');
  if (!id) throw new MutationError('معرّف الكشف مفقود');

  const run = await db.payrollRun.findUnique({ where: { id } });
  if (!run) throw new MutationError('الكشف غير موجود');

  const action = str(fd, 'action') ?? 'approve';

  if (action === 'approve') {
    if (run.status !== 'draft') throw new MutationError('الكشف معتمد سلفًا');
    if (run.totalNet <= 0) throw new MutationError('كشف بلا مبالغ لا يُعتمد');
    await db.payrollRun.update({
      where: { id },
      data: { status: 'approved', approvedAt: new Date(), approvedById: user.id },
    });
  } else if (action === 'pay') {
    if (run.status !== 'approved') throw new MutationError('يُعتمد الكشف قبل صرفه');
    await db.payrollRun.update({ where: { id }, data: { status: 'paid', paidAt: new Date() } });
  } else if (action === 'reopen') {
    if (run.status === 'paid') throw new MutationError('الكشف المصروف لا يُعاد فتحه');
    await db.payrollRun.update({
      where: { id },
      data: { status: 'draft', approvedAt: null, approvedById: null },
    });
  } else {
    throw new MutationError('إجراء غير معروف');
  }

  await auditEvent(user.id, 'update', 'PayrollRun', id, `${run.period}: ${action}`);
  return `/hr/payroll?period=${run.period}`;
}
