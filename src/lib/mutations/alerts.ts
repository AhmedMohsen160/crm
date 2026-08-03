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
 * التنبيهات.
 *
 * جزء من وحدة التعديلات المقسَّمة بالمجال — انظر `src/lib/mutations/index.ts`.
 */

// ═══════════════════════════════════════════════════════════════
//  التنبيهات (§١٢)
// ═══════════════════════════════════════════════════════════════

/** يعلّم تنبيهًا — أو كل تنبيهات صاحبه — مقروءًا */
export async function markNotificationsRead(fd: FormData, user: SessionUser, id?: string) {
  const scope = str(fd, 'scope');

  if (scope === 'all') {
    await db.notification.updateMany({
      // **المستخدم نفسه وحده**: لا يعلّم أحد تنبيهات غيره
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return '/notifications?saved=1';
  }

  if (!id) throw new MutationError('معرّف التنبيه مفقود');
  await db.notification.updateMany({
    where: { id, userId: user.id },
    data: { readAt: new Date() },
  });
  return '/notifications';
}

/**
 * يفحص أحداث §١٢ الثمانية ويكتب ما استحقّ.
 *
 * يُستدعى عادةً من مؤقّت خارجي، ومن الشاشة عند الحاجة. **آمن التكرار.**
 */
export async function runNotifications(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageSettings')) {
    throw new MutationError('تشغيل الفحص لمن يملك إدارة الإعدادات');
  }

  const results = await runAllEvents();
  const written = results.reduce((s, r) => s + r.written, 0);
  await auditEvent(user.id, 'create', 'Notification', 'run', `فحص التنبيهات: ${written} رسالة`);
  return `/notifications?saved=1&written=${written}`;
}
