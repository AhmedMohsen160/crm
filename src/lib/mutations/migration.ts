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
import { importAccountingSheet, summaryLine } from '@/lib/import-accounting-engine';
import { isBlankLine } from '@/lib/import-accounting';
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
 * ترحيل الملفات القديمة.
 *
 * جزء من وحدة التعديلات المقسَّمة بالمجال — انظر `src/lib/mutations/index.ts`.
 */

// ═══════════════════════════════════════════════════════════════
//  ترحيل الملفات القديمة (§١٤)
// ═══════════════════════════════════════════════════════════════

/**
 * يستورد ملف الليدز أو المبيعات.
 *
 * **آمن التكرار:** الصف المُرحَّل سابقًا يُتخطّى بمفتاحه، فيمكن لصق الملف
 * كاملًا مرة بعد مرة كلما نما، بلا أن يتضاعف شيء.
 */
export async function importLegacySheet(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageSettings')) {
    throw new MutationError('الترحيل لمدير النظام ومن يملك إدارة الإعدادات');
  }

  const source = str(fd, 'source');
  if (source !== 'leads' && source !== 'sales') {
    throw new MutationError('نوع الملف غير معروف');
  }

  const raw = str(fd, 'rows');
  if (!raw) throw new MutationError('ألصق صفوف الملف أولًا');

  const rows = raw.split(/\r?\n/).filter((line) => line.trim());
  if (rows.length > 4000) {
    throw new MutationError('الدفعة أكبر من ٤٠٠٠ صف — قسّمها حتى لا ينقطع الطلب');
  }

  const options = {
    defaultBranch: str(fd, 'defaultBranch'),
    // قاعدة انقلاب مارس ٢٠٢٦ لا تُطبَّق إلا بطلب صريح — تعميمها يقلب
    // كل تاريخ يومه الثالث
    fixMarchFlip: fd.get('fixMarchFlip') !== null,
    actor: user,
  };

  const summary =
    source === 'leads'
      ? await importLeadSheet(rows, options)
      : await importSalesSheet(rows, options);

  await auditEvent(
    user.id,
    'create',
    source === 'leads' ? 'Lead' : 'Project',
    'import',
    `ترحيل ${source}: ${summary.leads} ليد · ${summary.projects} مشروع · ${summary.review} للمراجعة`
  );

  const params = new URLSearchParams({
    source,
    ...Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, String(v)])),
  });
  return `/settings/import?${params.toString()}`;
}

/**
 * يُرحّل دفتر المحاسب — ورقة «Journal Entry» كما هي.
 *
 * **صلاحيته `canManageAccounting` لا `canManageSettings`:** هذه قيودٌ تدخل
 * الدفتر، ومن يملك الدفتر هو من يُدخلها.
 *
 * وقيود الدفعة تُكتب **مسوّدات** افتراضيًّا: الدفتر لا يُكتب من ظهر
 * المحاسب (§٤)، والترحيل الفوري خيارٌ يُطلب صراحةً.
 */
export async function importAccountingLedger(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageAccounting')) {
    throw new MutationError('ترحيل الدفتر لمن يملك إدارة الدفاتر المحاسبية');
  }

  const raw = str(fd, 'rows');
  if (!raw) throw new MutationError('ألصق صفوف ورقة القيود أولًا');

  /**
   * ورقة المحاسب تمتدّ آلاف الصفوف تحت البيانات، وفيها **مسلسل بلا محتوى**
   * (صيغة تملأ العمود الأول). فالحدّ يُقاس بصفوف البيانات وحدها، وإلا رُدّت
   * ورقةٌ فيها خمسة آلاف قيد لأنّ تحتها ثلاثة آلاف صفٍّ فارغ.
   */
  const lineCount = raw
    .split(/\r?\n/)
    .filter((line) => line.trim() && !isBlankLine(line.split('\t'))).length;
  if (lineCount > 8000) {
    throw new MutationError('الدفعة أكبر من ٨٠٠٠ سطر بيانات — ألصقها شهرًا شهرًا');
  }

  const summary = await importAccountingSheet(raw, {
    actorId: user.id,
    post: fd.get('post') !== null,
  });

  await auditEvent(user.id, 'create', 'JournalEntry', 'import', `ترحيل الدفتر: ${summaryLine(summary)}`);

  const params = new URLSearchParams({
    source: 'accounting',
    rows: String(summary.rows),
    accounts: String(summary.accounts),
    costCenters: String(summary.costCenters),
    entries: String(summary.entries),
    lines: String(summary.lines),
    skipped: String(summary.skipped),
    stopped: String(summary.unbalancedLines),
    batches: String(summary.unbalancedBatches),
    failed: String(summary.errors.length),
  });
  if (summary.unknownBranches.length) params.set('branches', summary.unknownBranches.join('، '));
  if (summary.unknownAdmins.length) params.set('admins', summary.unknownAdmins.join('، '));
  return `/settings/import?${params.toString()}`;
}

/** يحسم صفًّا في قائمة المراجعة: صُحّح ورُحّل، أو استُبعد بقرار صريح */
export async function resolveMigrationRow(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageSettings')) throw new MutationError('لا صلاحية');
  if (!id) throw new MutationError('معرّف الصف مفقود');

  const action = str(fd, 'action') ?? 'skip';
  const note = str(fd, 'note');

  if (action === 'skip' && !note) {
    // الاستبعاد قرار — والقرار بلا سبب لا يُراجَع بعد شهر
    throw new MutationError('سبب الاستبعاد مطلوب');
  }

  await db.migrationReview.update({
    where: { id },
    data: {
      status: action === 'resolve' ? 'resolved' : 'skipped',
      resolvedAt: new Date(),
      resolvedById: user.id,
      note,
    },
  });
  await auditEvent(user.id, 'update', 'MigrationReview', id, action);
  return '/settings/import/review?saved=1';
}
