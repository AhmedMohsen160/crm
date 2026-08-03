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
 * المهام.
 *
 * جزء من وحدة التعديلات المقسَّمة بالمجال — انظر `src/lib/mutations/index.ts`.
 */

// ═══════════════════════════════════════════════════════════════
//  المهام
// ═══════════════════════════════════════════════════════════════

export async function saveTask(fd: FormData, user: SessionUser, id?: string) {
  const title = str(fd, 'title');
  if (!title) throw new MutationError('عنوان المهمة مطلوب');

  const link: EntityLink = readEntityLink(fd);
  const status = str(fd, 'status') ?? 'OPEN';
  const requested = str(fd, 'redirectTo');

  const common = {
    title,
    description: str(fd, 'description'),
    status,
    priority: str(fd, 'priority') ?? 'NORMAL',
    type: str(fd, 'type') ?? 'TODO',
    dueDate: date(fd, 'dueDate'),
    ...link,
  };

  if (!id) {
    const task = await db.task.create({
      data: {
        ...common,
        assigneeId: str(fd, 'assigneeId') ?? user.id,
        creatorId: user.id,
      },
    });
    await logActivity({
      type: 'TASK_CREATED',
      title: 'تمت إضافة مهمة',
      detail: task.title,
      userId: user.id,
      link,
    });
    return requested ?? linkPath(link);
  }

  const existing = await db.task.findUnique({ where: { id } });
  if (!existing) throw new MutationError('المهمة غير موجودة');
  const allowed =
    can(user, 'canViewAllLeads') || existing.assigneeId === user.id || existing.creatorId === user.id;
  if (!allowed) throw new MutationError('ليس لديك صلاحية التعديل على هذه المهمة');

  await db.task.update({
    where: { id },
    data: {
      ...common,
      assigneeId: str(fd, 'assigneeId'),
      completedAt: status === 'DONE' ? (existing.completedAt ?? new Date()) : null,
    },
  });

  await logActivity({ type: 'TASK_UPDATED', title: 'تم تعديل مهمة', userId: user.id, link });
  return requested ?? '/tasks';
}
