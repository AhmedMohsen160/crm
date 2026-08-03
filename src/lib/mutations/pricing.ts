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
 * قائمة الأسعار.
 *
 * جزء من وحدة التعديلات المقسَّمة بالمجال — انظر `src/lib/mutations/index.ts`.
 */

// ═══════════════════════════════════════════════════════════════
//  قائمة الأسعار (§١٠ بند ١)
// ═══════════════════════════════════════════════════════════════

export async function savePriceItem(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageSettings')) {
    throw new MutationError('ليس لديك صلاحية إدارة قائمة الأسعار');
  }

  const serviceLine = str(fd, 'serviceLine');
  const langFrom = str(fd, 'langFrom');
  const langTo = str(fd, 'langTo');
  const unitPrice = num(fd, 'unitPrice');

  if (!serviceLine || !langFrom || !langTo) {
    throw new MutationError('خط الخدمة وزوج اللغات مطلوبة');
  }
  if (!unitPrice || unitPrice <= 0) throw new MutationError('سعر الصفحة مطلوب');

  const effectiveFrom = date(fd, 'effectiveFrom') ?? new Date();

  const data = {
    serviceLine,
    langFrom,
    langTo,
    unitPrice,
    currency: str(fd, 'currency') ?? 'EGP',
    minOrder: num(fd, 'minOrder'),
    effectiveFrom,
    active: fd.get('active') === 'on' || !id,
    notes: str(fd, 'notes'),
  };

  if (!id) {
    // البند الجديد **يُضاف** ولا يستبدل القديم — أسعار الماضي تبقى كما هي
    const item = await db.priceListItem.create({ data });
    await auditEvent(
      user.id,
      'create',
      'PriceListItem',
      item.id,
      `${serviceLine} ${langFrom}→${langTo} = ${unitPrice}`
    );
  } else {
    const existing = await db.priceListItem.findUnique({ where: { id } });
    if (!existing) throw new MutationError('البند غير موجود');
    await db.priceListItem.update({ where: { id }, data });
    await auditDiff(user.id, 'PriceListItem', id, existing, data);
  }

  return '/settings/prices?saved=1';
}
