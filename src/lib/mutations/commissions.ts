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
 * نسب المبيعات.
 *
 * جزء من وحدة التعديلات المقسَّمة بالمجال — انظر `src/lib/mutations/index.ts`.
 */

// ═══════════════════════════════════════════════════════════════
//  خطط نسب المبيعات — كل رقم فيها بيانات تُعدَّل من الشاشة
// ═══════════════════════════════════════════════════════════════

export async function saveCommissionScheme(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageSettings')) {
    throw new MutationError('ليس لديك صلاحية إدارة خطط النسب');
  }

  const name = str(fd, 'name');
  if (!name) throw new MutationError('اسم الخطة مطلوب');

  const data = {
    name,
    basis: str(fd, 'basis') === 'net' ? 'net' : 'collected',
    tierMode: str(fd, 'tierMode') === 'whole' ? 'whole' : 'progressive',
    effectiveFrom: date(fd, 'effectiveFrom') ?? new Date(),
    isDefault: fd.get('isDefault') === 'on',
    active: id ? fd.get('active') === 'on' : true,
  };

  if (!id) {
    const scheme = await db.commissionScheme.create({ data });
    // أول خطة تصير الافتراضية تلقائيًا، وإلا لم تُطبَّق على أحد
    const count = await db.commissionScheme.count();
    if (count === 1) {
      await db.commissionScheme.update({
        where: { id: scheme.id },
        data: { isDefault: true },
      });
    }
    await auditEvent(user.id, 'create', 'CommissionScheme', scheme.id, name);
    return '/settings/commissions?saved=1';
  }

  const existing = await db.commissionScheme.findUnique({ where: { id } });
  if (!existing) throw new MutationError('الخطة غير موجودة');

  await db.commissionScheme.update({ where: { id }, data });
  // خطة افتراضية واحدة فقط — وإلا صار الاختيار عشوائيًا
  if (data.isDefault) {
    await db.commissionScheme.updateMany({
      where: { id: { not: id } },
      data: { isDefault: false },
    });
  }
  await auditDiff(user.id, 'CommissionScheme', id, existing, data);
  return '/settings/commissions?saved=1';
}

export async function saveCommissionTier(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageSettings')) {
    throw new MutationError('ليس لديك صلاحية إدارة الشرائح');
  }

  const schemeId = str(fd, 'schemeId');
  if (!schemeId) throw new MutationError('الخطة مفقودة');

  const fromAmount = num(fd, 'fromAmount') ?? 0;
  const toAmount = num(fd, 'toAmount');
  const adminRate = num(fd, 'adminRate') ?? 0;
  const managerRate = num(fd, 'managerRate') ?? 0;

  if (fromAmount < 0) throw new MutationError('بداية الشريحة لا تكون سالبة');
  if (toAmount !== null && toAmount <= fromAmount) {
    throw new MutationError('نهاية الشريحة يجب أن تكون أكبر من بدايتها');
  }
  if (adminRate < 0 || adminRate > 1 || managerRate < 0 || managerRate > 1) {
    throw new MutationError('النسب تُكتب عشرية بين ٠ و١ (٠٫٠٣ تعني ٣٪)');
  }

  // شريحتان تبدآن من المبلغ نفسه تجعلان الاختيار غامضًا
  const clash = await db.commissionTier.findFirst({
    where: { schemeId, fromAmount, ...(id ? { id: { not: id } } : {}) },
  });
  if (clash) throw new MutationError('توجد شريحة تبدأ من هذا المبلغ بالفعل');

  const data = { schemeId, fromAmount, toAmount, adminRate, managerRate };

  if (!id) {
    const tier = await db.commissionTier.create({ data });
    await auditEvent(
      user.id,
      'create',
      'CommissionTier',
      tier.id,
      `${fromAmount} → ${toAmount ?? '∞'} = ${adminRate}/${managerRate}`
    );
  } else {
    const existing = await db.commissionTier.findUnique({ where: { id } });
    if (!existing) throw new MutationError('الشريحة غير موجودة');
    await db.commissionTier.update({ where: { id }, data });
    await auditDiff(user.id, 'CommissionTier', id, existing, data);
  }

  return '/settings/commissions?saved=1';
}

export async function saveCommissionAssignment(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageSettings')) {
    throw new MutationError('ليس لديك صلاحية إسناد الخطط');
  }

  const schemeId = str(fd, 'schemeId');
  const userId = str(fd, 'userId');
  if (!schemeId || !userId) throw new MutationError('الخطة والموظف مطلوبان');

  const assignment = await db.commissionAssignment.create({
    data: {
      schemeId,
      userId,
      effectiveFrom: date(fd, 'effectiveFrom') ?? new Date(),
    },
  });
  await auditEvent(user.id, 'create', 'CommissionAssignment', assignment.id, userId);
  return '/settings/commissions?saved=1';
}

/** إغلاق فترة — بعده لا تُعاد استحقاقاتها مهما عُدِّلت الخطط */
export async function closeCommissionPeriod(fd: FormData, user: SessionUser) {
  if (!can(user, 'canViewCompanyAnalytics')) {
    throw new MutationError('إغلاق الفترات للإدارة والماليات');
  }

  const period = str(fd, 'period');
  if (!period || !/^\d{4}-\d{2}$/.test(period)) throw new MutationError('الفترة غير صالحة');

  // نبني قبل الإغلاق حتى يُغلق الشهر على أحدث حساب
  await rebuildPeriod(period);

  await db.commissionPeriod.upsert({
    where: { period },
    update: { closedAt: new Date(), closedById: user.id, note: str(fd, 'note') },
    create: {
      period,
      closedAt: new Date(),
      closedById: user.id,
      note: str(fd, 'note'),
    },
  });
  await auditEvent(user.id, 'update', 'CommissionPeriod', period, 'إغلاق الفترة');
  return `/commissions?period=${period}`;
}
