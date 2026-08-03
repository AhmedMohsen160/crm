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
 * المشاريع — الحفظ والحالات والإسناد وخطوات التنفيذ واعتماد الخصم.
 *
 * جزء من وحدة التعديلات المقسَّمة بالمجال — انظر `src/lib/mutations/index.ts`.
 */

// ═══════════════════════════════════════════════════════════════
//  الصفقات
// ═══════════════════════════════════════════════════════════════

export async function saveProject(fd: FormData, user: SessionUser, id?: string) {
  const pages = num(fd, 'pages');
  const wordCount = num(fd, 'wordCount');

  const data = {
    title: str(fd, 'title') ?? '',
    description: str(fd, 'description'),
    netTotal: num(fd, 'netTotal') ?? 0,
    currency: str(fd, 'currency') ?? 'EGP',
    unitPrice: num(fd, 'unitPrice'),
    serviceLine: str(fd, 'serviceLine'),
    sourceLang: str(fd, 'sourceLang'),
    targetLang: str(fd, 'targetLang'),
    wordCount: wordCount ? Math.round(wordCount) : null,
    pages,
    deposit: num(fd, 'deposit') ?? 0,
    isRush: fd.get('isRush') === 'on',
    ...readDeadline(fd),
    expectedCloseDate: date(fd, 'expectedCloseDate'),
    companyId: str(fd, 'companyId'),
    contactId: str(fd, 'contactId'),
    clientId: str(fd, 'clientId'),
  };
  if (!data.title) throw new MutationError('عنوان المشروع مطلوب');

  // سعر البيع لا يُعدَّل إلا بصلاحيته — والقيمة القادمة من نموذج لا يملكها
  // تُتجاهل بدل أن تُصفّر السعر
  if (!can(user, 'canViewSellPrice')) {
    delete (data as Partial<typeof data>).netTotal;
    delete (data as Partial<typeof data>).unitPrice;
    delete (data as Partial<typeof data>).deposit;
  }

  // الخصم: يُقبل ممّن يملك صلاحيته، ويُوقف المشروع إن تجاوز حدّ دوره
  const discountType = can(user, 'canDiscount') ? str(fd, 'discountType') : null;
  const discountValue = can(user, 'canDiscount') ? num(fd, 'discountValue') : null;
  let approvalPatch: Record<string, unknown> = {};

  if (discountType && discountType !== 'none' && discountValue) {
    const settings = await allSettings();
    const gross = (pages ?? 0) * (num(fd, 'unitPrice') ?? 0);
    const afterRush = data.isRush
      ? gross * (1 + (Number(settings.rush_surcharge) || 0))
      : gross;
    const limit = await discountLimitOf(user);
    const ratio = discountRatio({ type: discountType, value: discountValue }, afterRush);
    if (ratio > limit + 1e-9) {
      approvalPatch = { approvalState: 'pending', approvedById: null, approvedAt: null };
    }
  }

  /**
   * **الملكية المزدوجة**: مالكٌ رئيسي جلب الصفقة، ومالكٌ فرعي يخدمها.
   * والفرع فرعُ الخادم لا الجالب — الصفقة تُنسب لمن سلّم العميل.
   */
  const rawCoOwnerId = str(fd, 'coOwnerId');
  /** يُلغى المالك الفرعي إن ساوى الرئيسي — وإلا صار الشخص مديرَ نفسه في النسب */
  const resolveCoOwner = async (ownerId: string | null) => {
    const coOwnerId = rawCoOwnerId && rawCoOwnerId !== ownerId ? rawCoOwnerId : null;
    const branch = coOwnerId
      ? ((await db.user.findUnique({ where: { id: coOwnerId }, select: { branch: true } }))
          ?.branch ?? null)
      : null;
    return { coOwnerId, branch };
  };

  if (!id) {
    const ownerId = str(fd, 'ownerId') ?? user.id;
    const servicing = await resolveCoOwner(ownerId);
    const project = await db.project.create({
      data: {
        ...data,
        code: await nextProjectCode(),
        status: 'pending_assignment',
        branch: servicing.branch ?? user.branch,
        convertedAt: new Date(),
        ownerId,
        coOwnerId: servicing.coOwnerId,
      },
    });
    await logActivity({
      type: 'CREATED',
      title: 'مشروع جديد بانتظار الإسناد',
      detail: `${project.code} — ${project.title}`,
      userId: user.id,
      link: { projectId: project.id, companyId: project.companyId },
    });
    await auditEvent(user.id, 'create', 'Project', project.id, project.code ?? undefined);
    return `/projects/${project.id}`;
  }

  const existing = await db.project.findUnique({ where: { id } });
  if (!existing) throw new MutationError('المشروع غير موجود');
  requireOwn(existing.ownerId, user, 'ليس لديك صلاحية تعديل هذا المشروع');

  const nextOwnerId = str(fd, 'ownerId') ?? existing.ownerId;
  // النموذج الذي لا يحمل الحقل أصلًا لا يمسّ ملكيةً فرعية قائمة
  const servicing = fd.has('coOwnerId')
    ? await resolveCoOwner(nextOwnerId)
    : { coOwnerId: existing.coOwnerId, branch: null };

  const after = {
    ...data,
    ...(discountType ? { discountType: discountType === 'none' ? null : discountType } : {}),
    ...(discountValue !== null ? { discountValue } : {}),
    ...approvalPatch,
    ownerId: nextOwnerId,
    coOwnerId: servicing.coOwnerId,
    ...(servicing.branch ? { branch: servicing.branch } : {}),
  };
  await db.project.update({ where: { id }, data: after });
  await auditDiff(user.id, 'Project', id, existing, after);
  return `/projects/${id}`;
}

/** زر «فوري» يضبط الموعد نهاية اليوم بضغطة — بديلًا عن اختيار تاريخ */

/**
 * تحويل حالة المشروع — البوابة الوحيدة لتغيير الحالة.
 *
 * تفرض قواعد §٦ كاملة: الانتقال المسموح، والصلاحية التي تملكه، والحقول
 * التي لا يصحّ الانتقال بدونها. لا مسار آخر يكتب في `status`.
 */
export async function moveProject(fd: FormData, user: SessionUser, id: string) {
  const to = str(fd, 'status');
  if (!to) throw new MutationError('الحالة المطلوبة مفقودة');

  const project = await db.project.findUnique({ where: { id } });
  if (!project) throw new MutationError('المشروع غير موجود');
  if (project.status === to) return `/projects/${id}`;

  const rule = allowedTransitions(project.status).find((t) => t.to === to);
  if (!rule) {
    throw new MutationError(
      `لا يجوز الانتقال من «${
        PROJECT_STATUSES[project.status as ProjectStatus] ?? project.status
      }» إلى «${PROJECT_STATUSES[to as ProjectStatus] ?? to}»`
    );
  }
  if (rule.permission && !can(user, rule.permission)) {
    throw new MutationError('ليس لديك صلاحية هذا الانتقال');
  }

  // الخصم فوق الحد يجمّد المشروع حتى الاعتماد (§٦ و§١٠ بند ٤).
  // الإلغاء وحده يبقى متاحًا، وإلا عَلِق المشروع بلا مخرج لو رفض الجميع.
  if (project.approvalState === 'pending' && to !== 'cancelled') {
    throw new MutationError(
      'المشروع موقوف بانتظار اعتماد الخصم — لا ينتقل خطوة واحدة قبل الاعتماد'
    );
  }

  const now = new Date();
  const patch: Record<string, unknown> = { status: to };

  // الحقول القادمة مع الانتقال (المبلغ المحصَّل مثلًا) تُكتب قبل فحص شرطه
  const collectedAmount = num(fd, 'collectedAmount');
  if (collectedAmount !== null && collectedAmount !== undefined) {
    if (!can(user, 'canRecordCollection')) {
      throw new MutationError('ليس لديك صلاحية تسجيل التحصيل');
    }
    patch.collectedAmount = collectedAmount;
    patch.collectedAt = date(fd, 'collectedAt') ?? now;
  }
  const qaIssues = num(fd, 'qaIssues');
  if (qaIssues !== null && qaIssues !== undefined) patch.qaIssues = Math.round(qaIssues);

  const filled = (field: string) => {
    const value = patch[field] ?? (project as Record<string, unknown>)[field];
    return !(value === null || value === undefined || value === '' || value === 0);
  };

  for (const requirement of rule.requires ?? []) {
    // `anyOf`: يكفي واحد — المنفِّذ قد يكون موظفًا أو فريلانسرًا أو اسمًا خارجيًا
    const fields = requirement.anyOf ?? [requirement.field];
    if (!fields.some(filled)) {
      throw new MutationError(`${requirement.label} مطلوب قبل هذا الانتقال`);
    }
  }

  // الطوابع الزمنية تُبصم مرة واحدة ولا تُعاد
  if (to === 'in_progress' && !project.assignedAt) {
    patch.assignedAt = now;
    patch.projectManagerId = project.projectManagerId ?? user.id;
  }
  if (to === 'delivered') {
    patch.deliveredAt = project.deliveredAt ?? now;
    // الاعتراف بالإيراد يقع هنا (§٣ بند ٤)
    patch.revenueMonth = project.revenueMonth ?? revenueMonthKey(now);
  }
  if (to === 'collected') {
    patch.collectedAt = patch.collectedAt ?? project.collectedAt ?? now;
    patch.closedAt = project.closedAt ?? now;
  }
  if (to === 'rework') {
    patch.isRework = true;
  }
  if (to === 'cancelled') {
    patch.closedAt = now;
    patch.cancelReason = str(fd, 'cancelReason') ?? project.cancelReason;
    // الملغى يخرج من كل تقرير مالي — نمسح مفتاح الشهر ولا نمسح السجل
    patch.revenueMonth = null;
    if (!patch.cancelReason) throw new MutationError('سبب الإلغاء مطلوب');
  }

  await db.project.update({ where: { id }, data: patch });
  await auditDiff(user.id, 'Project', id, project, patch as Record<string, string | number | boolean | Date | null>);

  // ── أثر الحالة على الدفاتر ───────────────────────────────────
  // الاعتراف بالإيراد يقع عند التسليم (§٣ بند ٤) — ويصل المحاسبَ
  // **مسوَّدةً** يراجعها ويرحّلها. الدفتر لا يُكتب من ظهره.
  if (to === 'delivered') {
    await draftRevenueOnDelivery(id);
  }

  // ── أثر الحالة على نسب المبيعات ──────────────────────────────
  // النسبة تستحق **عند التحصيل**، وتُخصم إن استُرد المشروع أو أُلغي.
  if (to === 'collected') {
    const collectedAt = (patch.collectedAt as Date) ?? now;
    await rebuildPeriod(periodOf(collectedAt));
    // قيد **مسوَّدة** للمحاسب — الدفتر لا يُكتب إلا بيده
    await draftCollection(id);
  } else if (
    (to === 'cancelled' || to === 'rework') &&
    project.status === 'collected'
  ) {
    // قيد عكسي لا حذف — الأصل يبقى في السجل (§٣ بند ٥)
    await reverseProjectCommission(
      id,
      to === 'cancelled' ? 'إلغاء المشروع بعد التحصيل' : 'إعادة المشروع بعد التحصيل'
    );
  }

  await logActivity({
    type: 'STAGE_CHANGED',
    title: 'تغيّرت حالة المشروع',
    detail: `${PROJECT_STATUSES[project.status as ProjectStatus] ?? project.status} ← ${
      PROJECT_STATUSES[to as ProjectStatus] ?? to
    }`,
    userId: user.id,
    link: { projectId: id },
  });

  return `/projects/${id}`;
}

// ═══════════════════════════════════════════════════════════════
//  اعتماد الخصم (§١٠ بند ٤)
// ═══════════════════════════════════════════════════════════════

/**
 * اعتماد الخصم أو رفضه.
 *
 * **ضابط رقابي بلا احتكاك:** المشروع الموقوف لا يتحرك خطوة واحدة حتى
 * يعتمده من يملك `canApproveDiscount`، والرفض يعيده لسعره بلا خصم بدل
 * تركه معلّقًا إلى الأبد.
 */
export async function decideApproval(fd: FormData, user: SessionUser, id: string) {
  if (!can(user, 'canApproveDiscount')) {
    throw new MutationError('ليس لديك صلاحية اعتماد الخصومات');
  }

  const project = await db.project.findUnique({ where: { id } });
  if (!project) throw new MutationError('المشروع غير موجود');
  if (project.approvalState !== 'pending') {
    throw new MutationError('هذا المشروع ليس بانتظار اعتماد');
  }

  const decision = str(fd, 'decision');
  const note = str(fd, 'approvalNote');
  const now = new Date();

  if (decision === 'approve') {
    const after = {
      approvalState: 'approved',
      approvedById: user.id,
      approvedAt: now,
      approvalNote: note,
    };
    await db.project.update({ where: { id }, data: after });
    await auditDiff(user.id, 'Project', id, project, after);
    await logActivity({
      type: 'STATUS_CHANGED',
      title: 'اعتُمد الخصم',
      detail: `${project.code} — بواسطة ${user.name}`,
      userId: user.id,
      link: { projectId: id },
    });
    return `/projects/${id}`;
  }

  if (decision === 'reject') {
    if (!note) throw new MutationError('سبب الرفض مطلوب');

    // الرفض يعيد السعر إلى ما قبل الخصم — لا يترك المشروع معلّقًا
    const restored = project.gross ?? project.netTotal;
    const after = {
      approvalState: 'rejected',
      approvedById: user.id,
      approvedAt: now,
      approvalNote: note,
      discountType: null,
      discountValue: null,
      netTotal: restored,
    };
    await db.project.update({ where: { id }, data: after });
    await auditDiff(user.id, 'Project', id, project, after);
    await logActivity({
      type: 'STATUS_CHANGED',
      title: 'رُفض الخصم',
      detail: `${project.code} — ${note}`,
      userId: user.id,
      link: { projectId: id },
    });
    return `/projects/${id}`;
  }

  throw new MutationError('قرار غير معروف');
}

// ═══════════════════════════════════════════════════════════════
//  الإسناد وخطوات التنفيذ (§٧.٢)
// ═══════════════════════════════════════════════════════════════

/**
 * إسناد مشروع: نمط التشغيل والمصدر والمنتِج والمراجع.
 *
 * **معيار القبول ≤١٥ ثانية** — أربعة حقول أغلبها قوائم. عند الحفظ تُحسب
 * التكلفة وتُجمَّد، وينتقل المشروع إلى «قيد التنفيذ» إن اكتملت شروطه.
 */
export async function assignProject(fd: FormData, user: SessionUser, id: string) {
  if (!can(user, 'canAssignProduction')) {
    throw new MutationError('ليس لديك صلاحية إسناد الإنتاج');
  }

  const project = await db.project.findUnique({ where: { id } });
  if (!project) throw new MutationError('المشروع غير موجود');
  if (project.status === 'cancelled') {
    throw new MutationError('المشروع ملغى — لا يُسند');
  }

  const workMode = str(fd, 'workMode');
  const sourcing = str(fd, 'sourcing') ?? 'internal';
  const primaryProducerId = str(fd, 'primaryProducerId');
  const reviewerId = str(fd, 'reviewerId');
  const external = sourcing === 'external' || sourcing === 'mixed';
  const primaryFreelancerId = external ? str(fd, 'primaryFreelancerId') : null;
  const reviewerFreelancerId = str(fd, 'reviewerFreelancerId');
  let reviewerRate = num(fd, 'reviewerRate');
  let externalName = str(fd, 'externalName');
  let externalRate = num(fd, 'externalRate');

  if (!workMode) throw new MutationError('نمط التشغيل مطلوب');

  // «مختلط» يحتاج الاثنين معًا — وإلا فهو ليس مختلطًا
  if (sourcing === 'mixed' && (!primaryProducerId || (!primaryFreelancerId && !externalName))) {
    throw new MutationError('التشغيل المختلط يحتاج منفِّذًا داخليًا ومنفِّذًا خارجيًا معًا');
  }
  if (sourcing === 'external') {
    if (!primaryFreelancerId && !externalName) {
      throw new MutationError('اختر الفريلانسر أو اكتب اسم المنفِّذ الخارجي');
    }
  } else if (sourcing === 'internal' && !primaryProducerId) {
    throw new MutationError(`${performerRole(workMode)} مطلوب`);
  }

  // المراجع الخارجي يجلب سعره كذلك
  if (reviewerFreelancerId && reviewerRate === null) {
    const resolvedReviewer = await resolveFreelancerRate(reviewerFreelancerId, {
      langFrom: project.sourceLang,
      langTo: project.targetLang,
      serviceLine: project.serviceLine,
      stepType: 'heavy_review',
    });
    reviewerRate = resolvedReviewer.rate;
  }

  // اختيار فريلانسر مسجَّل يجلب سعره لهذا الزوج (§١١ بند ٥)
  if (primaryFreelancerId) {
    const resolved = await resolveFreelancerRate(primaryFreelancerId, {
      langFrom: project.sourceLang,
      langTo: project.targetLang,
      serviceLine: project.serviceLine,
    });
    externalName = resolved.name || externalName;
    if (externalRate === null) externalRate = resolved.rate;
  }

  const after = {
    workMode,
    sourcing,
    primaryProducerId: sourcing === 'external' ? null : primaryProducerId,
    primaryFreelancerId,
    reviewerId,
    reviewerFreelancerId,
    reviewerRate: reviewerFreelancerId ? reviewerRate : null,
    externalName: external ? externalName : null,
    externalRate: external ? externalRate : null,
    // مدير المشاريع يُختار صراحةً — ومن لم يُختر يبقى مسؤولية من أسند
    projectManagerId: str(fd, 'projectManagerId') ?? project.projectManagerId ?? user.id,
    assignedAt: project.assignedAt ?? new Date(),
  };

  await db.project.update({ where: { id }, data: after });
  await auditDiff(user.id, 'Project', id, project, after);

  // التكلفة تُحسب فور الإسناد فيرى مدير المشاريع أثر قراره حالًا
  await freezeProjectCost(id);

  if (primaryFreelancerId && primaryFreelancerId !== project.primaryFreelancerId) {
    await recordFreelancerUse(primaryFreelancerId);
  }

  // الانتقال إلى «قيد التنفيذ» يمرّ بالبوابة نفسها فتُفحص قواعد §٦
  if (project.status === 'pending_assignment' || project.status === 'rework') {
    const move = new FormData();
    move.set('status', 'in_progress');
    await moveProject(move, user, id);
  }

  await logActivity({
    type: 'STAGE_CHANGED',
    title: 'أُسند المشروع',
    detail: `${project.code} — ${sourcing === 'external' ? 'تشغيل خارجي' : 'تشغيل داخلي'}`,
    userId: user.id,
    link: { projectId: id },
  });

  return `/projects/${id}`;
}

/**
 * خطوة تنفيذ. الصفحات الموزونة والتكلفة تُحسبان وتُخزَّنان وقت الحفظ، فلا
 * يتغيّر تاريخ التكاليف بتغيّر معامل لاحقًا.
 */
export async function saveStep(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canAssignProduction')) {
    throw new MutationError('ليس لديك صلاحية إضافة خطوات');
  }

  const projectId = str(fd, 'projectId');
  if (!projectId) throw new MutationError('معرّف المشروع مفقود');

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, serviceLine: true },
  });
  if (!project) throw new MutationError('المشروع غير موجود');

  const stepType = str(fd, 'stepType');
  const pages = num(fd, 'pages') ?? 0;
  if (!stepType) throw new MutationError('نوع الخطوة مطلوب');
  if (pages <= 0) throw new MutationError('عدد صفحات الخطوة مطلوب');

  const costSource = str(fd, 'costSource') === 'external' ? 'external' : 'internal';
  const performerId = costSource === 'internal' ? str(fd, 'performerId') : null;
  const freelancerId = costSource === 'external' ? str(fd, 'freelancerId') : null;
  let externalName = costSource === 'external' ? str(fd, 'externalName') : null;
  let externalRate = costSource === 'external' ? num(fd, 'externalRate') : null;
  let rateUnit = str(fd, 'rateUnit') ?? 'page';
  const rateUnits = costSource === 'external' ? num(fd, 'rateUnits') : null;

  if (costSource === 'internal' && !performerId) {
    throw new MutationError('منفِّذ الخطوة مطلوب');
  }
  if (costSource === 'external' && !freelancerId && !externalName) {
    throw new MutationError('اختر الفريلانسر أو اكتب اسم المنفِّذ الخارجي');
  }

  // اختيار فريلانسر مسجَّل يجلب سعره لهذا الزوج تلقائيًا (§١١ بند ٥)،
  // ولا يُلغي رقمًا كتبه المستخدم صراحةً — هو الذي يعرف اتفاق اليوم.
  if (freelancerId) {
    const projectLangs = await db.project.findUnique({
      where: { id: projectId },
      select: { sourceLang: true, targetLang: true },
    });
    const resolved = await resolveFreelancerRate(freelancerId, {
      langFrom: projectLangs?.sourceLang,
      langTo: projectLangs?.targetLang,
      serviceLine: project.serviceLine,
      stepType,
    });
    externalName = resolved.name || externalName;
    if (externalRate === null) {
      externalRate = resolved.rate;
      rateUnit = resolved.rateUnit;
    }
  }

  const weighted = await stepWeightedPages({
    stepType,
    serviceLine: project.serviceLine,
    pages,
  });

  const data = {
    projectId,
    stepType,
    performerId,
    freelancerId,
    externalName,
    externalRate,
    rateUnit,
    rateUnits,
    costSource,
    pages,
    weightedPages: weighted,
    // التكلفة تُحسب في المحرّك بعد الحفظ لتشمل راتب المنفِّذ الحالي
    cost: 0,
    notes: str(fd, 'notes'),
    sortOrder: num(fd, 'sortOrder') ?? 0,
  };

  let stepId = id;
  let previousFreelancerId: string | null = null;

  if (!id) {
    const step = await db.projectStep.create({ data });
    stepId = step.id;
    await auditEvent(user.id, 'create', 'ProjectStep', step.id, `${stepType} — ${pages} صفحة`);
  } else {
    const existing = await db.projectStep.findUnique({ where: { id } });
    if (!existing) throw new MutationError('الخطوة غير موجودة');
    previousFreelancerId = existing.freelancerId;
    await db.projectStep.update({ where: { id }, data });
    await auditDiff(user.id, 'ProjectStep', id, existing, data);
  }

  const breakdown = await freezeProjectCost(projectId);

  // **سطر الاستحقاق يُنشأ عند الإسناد لا عند التسليم** (§١١ بند ٨):
  // الالتزام نشأ لحظة تكليفه، فيجب أن يظهر في حساب الدائنين فورًا.
  if (stepId) {
    const stepCost = breakdown?.stepCosts.find((s) => s.id === stepId)?.cost ?? 0;
    await syncStepPayment({
      stepId,
      freelancerId,
      projectId,
      amount: stepCost,
      currency: str(fd, 'currency') ?? 'EGP',
      dueDate: date(fd, 'dueDate'),
    });
  }

  if (freelancerId && freelancerId !== previousFreelancerId) {
    await recordFreelancerUse(freelancerId);
  }

  return `/projects/${projectId}`;
}

/**
 * تسليم المشروع مع ملاحظات الجودة (§٧.٢).
 * التكلفة تُجمَّد هنا نهائيًا — بعدها لا يغيّرها تعديل راتب أو معامل.
 */
export async function deliverProject(fd: FormData, user: SessionUser, id: string) {
  if (!can(user, 'canAssignProduction')) {
    throw new MutationError('ليس لديك صلاحية التسليم');
  }

  const qaIssues = num(fd, 'qaIssues') ?? 0;
  const folderUrl = str(fd, 'folderUrl');

  /**
   * **بوابة الرصد** (§١٢٫١ من مواصفة الفروع): لا يُقفل طلب دون وحداته.
   *
   * والوحدتان منفصلتان لأن الطاقة تتوقّف عند ما تستوعبه المراجعة لا عند سرعة
   * الترجمة. وتُملآن من الصفحات تلقائيًا فلا يُبطأ عمل الكاونتر — والرصد
   * اللاحق يتسرّب دائمًا، فمكانه لحظة التسليم لا متابعة المدير.
   */
  const existing = await db.project.findUnique({
    where: { id },
    select: { pages: true, reviewerId: true, reviewerFreelancerId: true },
  });
  const pages = existing?.pages ?? null;
  const translated = num(fd, 'unitsTranslated') ?? pages;
  if (translated === null) {
    throw new MutationError('عدد الوحدات المترجَمة مطلوب قبل التسليم — الرصد اللاحق يتسرّب');
  }
  const hasReviewer = Boolean(existing?.reviewerId || existing?.reviewerFreelancerId);
  const reviewed = num(fd, 'unitsReviewed') ?? (hasReviewer ? translated : 0);

  await db.project.update({
    where: { id },
    data: {
      qaIssues: Math.max(0, Math.round(qaIssues)),
      folderUrl,
      unitsTranslated: Math.max(0, translated),
      unitsReviewed: Math.max(0, reviewed),
    },
  });

  const move = new FormData();
  move.set('status', 'delivered');
  const destination = await moveProject(move, user, id);

  // التجميد بعد الانتقال، فيلتقط الحالة النهائية
  await freezeProjectCost(id);
  return destination;
}
