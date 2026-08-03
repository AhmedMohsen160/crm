import 'server-only';
import { MutationError, requireOwn, readDeadline } from './base';
import { db } from '@/lib/db';
import { can, hashPassword, verifyPassword, type SessionUser } from '@/lib/auth';
import { str, num, date, fullName } from '@/lib/utils';
import { logActivity, readEntityLink, linkPath, type EntityLink } from '@/lib/actions/helpers';
import { auditEvent, auditDiff } from '@/lib/audit';
import { fillFromLastYear } from '@/lib/budget-engine';
import { checkClassification } from '@/lib/branch-economics';
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
 * المحاسبة.
 *
 * جزء من وحدة التعديلات المقسَّمة بالمجال — انظر `src/lib/mutations/index.ts`.
 */

// ═══════════════════════════════════════════════════════════════
//  المحاسبة (docs/FINANCE-SPEC.md)
// ═══════════════════════════════════════════════════════════════

/** حساب في الشجرة — يُضاف ويُعدَّل من الشاشة بلا نشر */
export async function saveAccount(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageAccounting')) {
    throw new MutationError('إدارة شجرة الحسابات للمحاسب ومدير النظام');
  }

  const name = str(fd, 'name');
  if (!name) throw new MutationError('اسم الحساب مطلوب');

  const parentId = str(fd, 'parentId');
  const parent = parentId
    ? await db.account.findUnique({ where: { id: parentId } })
    : null;
  if (parentId && !parent) throw new MutationError('الحساب الأب غير موجود');

  // النوع والبند يُورَثان من الأب — فلا يوجد حساب مصروف تحت شجرة الإيراد
  const type = parent?.type ?? str(fd, 'type');
  if (!type) throw new MutationError('نوع الحساب مطلوب');

  const data = {
    name,
    nameEn: str(fd, 'nameEn'),
    code: str(fd, 'code'),
    type,
    expenseGroup: parent?.expenseGroup ?? str(fd, 'expenseGroup'),
    level: parent ? parent.level + 1 : 1,
    parentId: parentId ?? null,
    isPostable: fd.get('isPostable') !== null,
    active: fd.get('active') !== null,
    notes: str(fd, 'notes'),
  };

  if (!id) {
    const created = await db.account.create({ data });
    // الأب صار تجميعيًا بمجرد أن صار له ابن — وإلا وقعت قيود على فرعين
    if (parent?.isPostable) {
      await db.account.update({ where: { id: parent.id }, data: { isPostable: false } });
    }
    await auditEvent(user.id, 'create', 'Account', created.id, name);
    return `/finance/accounts?saved=1`;
  }

  const existing = await db.account.findUnique({ where: { id } });
  if (!existing) throw new MutationError('الحساب غير موجود');

  // حساب عليه قيود لا يتحوّل إلى تجميعي — ترحيلاته تصير يتيمة في التقارير
  if (existing.isPostable && !data.isPostable) {
    const used = await db.journalLine.count({ where: { accountId: id } });
    if (used > 0) {
      throw new MutationError(`عليه ${used} سطر قيد — لا يصير تجميعيًا. عطّله إن أردت إيقافه.`);
    }
  }

  await db.account.update({ where: { id }, data });
  await auditDiff(user.id, 'Account', id, existing, data);
  return `/finance/accounts?saved=1`;
}

/** مركز تكلفة = حساب + مشروع */
export async function saveCostCenter(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');

  const name = str(fd, 'name');
  if (!name) throw new MutationError('اسم مركز التكلفة مطلوب');

  const data = {
    name,
    project: str(fd, 'project'),
    active: fd.get('active') !== null,
  };

  if (!id) {
    await db.costCenter.create({ data });
  } else {
    await db.costCenter.update({ where: { id }, data });
  }
  await auditEvent(user.id, id ? 'update' : 'create', 'CostCenter', id ?? name, name);
  return '/finance/accounts?saved=1';
}

/**
 * قيد يومية — يُحفظ **مسوَّدةً** دائمًا، ويُرحَّل بفعل منفصل.
 *
 * الفصل مقصود: المحاسب يكتب ويراجع ثم يقرر. والتوازن يُفحص عند الحفظ
 * ليصحّح فورًا، **وعند الترحيل** أيضًا لأنه الباب الذي لا يُتجاوز.
 */
export async function saveJournalEntry(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageAccounting')) {
    throw new MutationError('تحرير القيود للمحاسب ومدير النظام');
  }

  const entryDate = date(fd, 'date') ?? new Date();
  const period = fiscalMonth(entryDate);
  if (await isPeriodClosed(period)) {
    throw new MutationError(`فترة ${period} مغلقة — لا تحرير فيها`);
  }

  const description = str(fd, 'description');
  if (!description) throw new MutationError('بيان القيد مطلوب');

  // السطور تصل مرقّمة: lines[0][accountId] ...
  const lines: {
    accountId: string;
    debit: number;
    credit: number;
    currency: string;
    fxRate: number;
    memo: string | null;
    branch: string | null;
    costCenterId: string | null;
    salesAdminId: string | null;
    trafficSource: string | null;
    translationType: string | null;
  }[] = [];

  for (let i = 0; i < 40; i += 1) {
    const accountId = str(fd, `lines[${i}][accountId]`);
    if (!accountId) continue;
    const debit = num(fd, `lines[${i}][debit]`) ?? 0;
    const credit = num(fd, `lines[${i}][credit]`) ?? 0;
    if (debit === 0 && credit === 0) continue;

    lines.push({
      accountId,
      debit,
      credit,
      currency: str(fd, `lines[${i}][currency]`) ?? 'EGP',
      fxRate: num(fd, `lines[${i}][fxRate]`) ?? 1,
      memo: str(fd, `lines[${i}][memo]`),
      branch: str(fd, `lines[${i}][branch]`),
      costCenterId: str(fd, `lines[${i}][costCenterId]`),
      salesAdminId: str(fd, `lines[${i}][salesAdminId]`),
      trafficSource: str(fd, `lines[${i}][trafficSource]`),
      translationType: str(fd, `lines[${i}][translationType]`),
    });
  }

  const balance = checkBalance(lines);
  if (!balance.balanced || balance.problems.length > 0) {
    throw new MutationError(balance.problems.join(' · '));
  }

  // ── قواعد تصنيف الفروع ١ و٢ و٣ — تُفرض عند الحفظ ────────────
  // كل جنيه مصروف يقع في **واحدة** من ثلاث فئات ولا يقع في اثنتين.
  // وبندٌ يخالف يُرفض هنا لا يُصحَّح لاحقًا: تصحيحه بعد الترحيل يحتاج قيدًا
  // عكسيًا، وتركه يُفسد التحميل وقائمة كل فرع.
  await assertBranchClassification(lines);

  const header = {
    date: entryDate,
    period,
    docType: str(fd, 'docType') ?? 'journal',
    docNumber: str(fd, 'docNumber'),
    description,
    projectId: str(fd, 'projectId'),
  };

  const lineData = lines.map((l, i) => ({
    accountId: l.accountId,
    debit: l.debit,
    credit: l.credit,
    currency: l.currency,
    fxRate: l.fxRate,
    // بالعملة الأساس — **بسعر اليوم مخزَّنًا**، فلا تتغيّر أرباح الماضي
    debitBase: toBase(l.debit, l.fxRate),
    creditBase: toBase(l.credit, l.fxRate),
    memo: l.memo,
    branch: l.branch,
    costCenterId: l.costCenterId,
    salesAdminId: l.salesAdminId,
    trafficSource: l.trafficSource,
    translationType: l.translationType,
    sortOrder: i,
  }));

  if (!id) {
    const created = await db.journalEntry.create({
      data: {
        ...header,
        code: await nextJournalCode(entryDate),
        status: 'draft',
        createdById: user.id,
        lines: { create: lineData },
      },
    });
    await auditEvent(user.id, 'create', 'JournalEntry', created.id, description);
    return `/finance/journal/${created.id}`;
  }

  const existing = await db.journalEntry.findUnique({ where: { id } });
  if (!existing) throw new MutationError('القيد غير موجود');
  // القيد المرحَّل لا يُعدَّل — يُلغى بقيد عكسي أو يُلغى بسبب صريح
  if (existing.status === 'posted') {
    throw new MutationError('القيد مرحَّل — لا يُعدَّل. ألغِه بسبب صريح ثم حرّر بديلًا.');
  }

  await db.journalLine.deleteMany({ where: { entryId: id } });
  await db.journalEntry.update({
    where: { id },
    data: { ...header, lines: { create: lineData } },
  });
  await auditDiff(user.id, 'JournalEntry', id, existing, header);
  return `/finance/journal/${id}`;
}

/** ترحيل قيد أو إلغاؤه — كلاهما فعل موقَّع باسم صاحبه */
export async function decideJournalEntry(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');
  if (!id) throw new MutationError('معرّف القيد مفقود');

  const action = str(fd, 'action') ?? 'post';

  try {
    if (action === 'void') {
      await voidEntry(id, user.id, str(fd, 'reason') ?? '');
      await auditEvent(user.id, 'update', 'JournalEntry', id, 'إلغاء القيد');
    } else {
      await postEntry(id, user.id);
      await auditEvent(user.id, 'update', 'JournalEntry', id, 'ترحيل القيد');
    }
  } catch (error) {
    throw new MutationError(error instanceof Error ? error.message : 'تعذّر تنفيذ الإجراء');
  }

  return `/finance/journal/${id}`;
}

/** إقفال شهر محاسبي — بعده لا تحرير ولا ترحيل ولا إلغاء */
export async function closeFiscalPeriod(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');

  const period = str(fd, 'period');
  if (!period || !/^\d{4}-\d{2}$/.test(period)) throw new MutationError('الفترة غير صالحة');

  const open = str(fd, 'action') === 'open';

  if (!open) {
    // المسوَّدة المعلّقة تعني عملًا لم يُراجَع — الإقفال فوقها يخفيه
    const drafts = await db.journalEntry.count({ where: { period, status: 'draft' } });
    if (drafts > 0) {
      throw new MutationError(
        `${drafts} قيدًا ما زال مسوَّدة في ${period} — رحّلها أو ألغِها قبل الإقفال`
      );
    }
  }

  await db.fiscalPeriod.upsert({
    where: { period },
    update: open
      ? { closedAt: null, closedById: null, note: str(fd, 'note') }
      : { closedAt: new Date(), closedById: user.id, note: str(fd, 'note') },
    create: {
      period,
      closedAt: open ? null : new Date(),
      closedById: open ? null : user.id,
      note: str(fd, 'note'),
    },
  });
  await auditEvent(
    user.id,
    'update',
    'FiscalPeriod',
    period,
    open ? 'إعادة فتح الفترة' : 'إقفال الفترة'
  );
  return `/finance/periods?saved=1`;
}

/** موازنة سنة — رأسها وحدها هنا، وبنودها في `saveBudgetLines` */
export async function saveBudget(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');

  const year = num(fd, 'year');
  if (!year || year < 2020 || year > 2100) throw new MutationError('السنة غير صالحة');

  const data = {
    year: Math.round(year),
    name: str(fd, 'name') ?? `موازنة ${Math.round(year)}`,
    notes: str(fd, 'notes'),
    status: str(fd, 'status') ?? 'draft',
  };

  if (!id) {
    const exists = await db.budget.findUnique({ where: { year: data.year } });
    if (exists) return `/finance/budget?year=${data.year}`;
    const created = await db.budget.create({ data });
    await auditEvent(user.id, 'create', 'Budget', created.id, data.name);
    return `/finance/budget?year=${data.year}`;
  }

  if (data.status === 'approved') {
    await db.budget.update({
      where: { id },
      data: { ...data, approvedById: user.id, approvedAt: new Date() },
    });
  } else {
    await db.budget.update({ where: { id }, data });
  }
  await auditEvent(user.id, 'update', 'Budget', id, data.name);
  return `/finance/budget?year=${data.year}`;
}

/**
 * بنود الموازنة دفعةً واحدة.
 *
 * الشاشة تعرض حسابًا واحدًا بأشهره الاثني عشر، أو مبلغًا سنويًا يُوزَّع.
 * **الصفر يُحذف لا يُخزَّن**: مستهدف صفر ومستهدف غير مضبوط شيء واحد، وتخزينه
 * يملأ الجدول بلا معنى.
 */
export async function saveBudgetLines(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');

  const budgetId = str(fd, 'budgetId');
  const accountId = str(fd, 'accountId');
  if (!budgetId || !accountId) throw new MutationError('الموازنة أو الحساب مفقود');

  const budget = await db.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new MutationError('الموازنة غير موجودة');
  if (budget.status === 'approved') {
    throw new MutationError('الموازنة معتمدة — أعِدها إلى «قيد الإعداد» لتعديلها');
  }

  const branch = str(fd, 'branch');
  const annual = num(fd, 'annual');

  let amounts: number[];
  if (annual !== null && annual !== undefined) {
    amounts = spreadAnnual(annual);
  } else {
    amounts = Array.from({ length: 12 }, (_, i) => num(fd, `month[${i + 1}]`) ?? 0);
  }

  // نمسح ثم نكتب: المفتاح المركّب يحمل حقلًا يقبل الفراغ (الفرع)، وتعامل
  // القواعد مع NULL في المفاتيح الفريدة غير موحّد — والمسح يجعل النتيجة
  // واحدة في SQLite وPostgreSQL معًا.
  await db.budgetLine.deleteMany({ where: { budgetId, accountId, branch: branch ?? null } });

  const rows = amounts
    .map((amount, i) => ({ budgetId, accountId, month: i + 1, branch: branch ?? null, amount }))
    // المستهدف صفر ومستهدف غير مضبوط شيء واحد — فلا يُخزَّن
    .filter((row) => row.amount !== 0);

  if (rows.length > 0) await db.budgetLine.createMany({ data: rows });

  await auditEvent(user.id, 'update', 'Budget', budgetId, `مستهدف حساب ${accountId}`);
  return `/finance/budget?year=${budget.year}&account=${accountId}`;
}

/** أصل ثابت — تكلفته ونسبته وشهر بدء إهلاكه */
export async function saveFixedAsset(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');

  const name = str(fd, 'name');
  const cost = num(fd, 'cost');
  const annualRate = num(fd, 'annualRate');
  if (!name) throw new MutationError('اسم الأصل مطلوب');
  if (!cost || cost <= 0) throw new MutationError('تكلفة الأصل مطلوبة');
  if (annualRate === null || annualRate < 0 || annualRate > 1) {
    throw new MutationError('نسبة الإهلاك بين صفر وواحد (٠٫٢٥ = ٢٥٪)');
  }

  const purchaseDate = date(fd, 'purchaseDate') ?? new Date();

  const data = {
    name,
    category: str(fd, 'category') ?? 'other',
    cost,
    annualRate,
    salvageValue: num(fd, 'salvageValue') ?? 0,
    purchaseDate,
    startPeriod: str(fd, 'startPeriod') ?? fiscalMonth(purchaseDate),
    branch: str(fd, 'branch'),
    notes: str(fd, 'notes'),
    active: fd.get('active') !== null,
  };

  if (!id) {
    const created = await db.fixedAsset.create({
      data: { ...data, accumulated: num(fd, 'accumulated') ?? 0 },
    });
    await auditEvent(user.id, 'create', 'FixedAsset', created.id, name);
  } else {
    const existing = await db.fixedAsset.findUnique({ where: { id } });
    if (!existing) throw new MutationError('الأصل غير موجود');
    // المجمّع لا يُعدَّل من الشاشة — يبنيه الترحيل الشهري وحده
    await db.fixedAsset.update({ where: { id }, data });
    await auditDiff(user.id, 'FixedAsset', id, existing, data);
  }
  return '/finance/assets?saved=1';
}

/**
 * توليد القيود المقترحة عن فترة.
 *
 * يمسح المشغّل ويقترح ما لم يُقترح بعد: إيراد كل مشروع سُلّم · تحصيل كل
 * مشروع حُصّل · صرف كل مستحق فريلانسر · استحقاق العمولات · إهلاك الشهر.
 *
 * **كلها مسوَّدات.** الدفتر لا يُكتب إلا بيد المحاسب.
 */
export async function generateDraftEntries(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');

  const period = str(fd, 'period');
  if (!period || !/^\d{4}-\d{2}$/.test(period)) throw new MutationError('الفترة غير صالحة');
  if (await isPeriodClosed(period)) throw new MutationError(`فترة ${period} مغلقة`);

  const { start, end } = monthRange(period);
  let created = 0;

  const delivered = await db.project.findMany({
    where: { deliveredAt: { gte: start, lt: end }, status: { not: 'cancelled' } },
    select: { id: true },
  });
  for (const project of delivered) {
    if (await draftRevenueOnDelivery(project.id)) created += 1;
  }

  const collected = await db.project.findMany({
    where: { collectedAt: { gte: start, lt: end }, status: 'collected' },
    select: { id: true },
  });
  for (const project of collected) {
    if (await draftCollection(project.id)) created += 1;
  }

  const payments = await db.freelancerPayment.findMany({
    where: { status: 'paid', paidAt: { gte: start, lt: end } },
    select: { id: true },
  });
  for (const payment of payments) {
    if (await draftFreelancerPayment(payment.id)) created += 1;
  }

  if (await draftCommissionAccrual(period)) created += 1;
  if (await draftMonthlyDepreciation(period)) created += 1;

  await auditEvent(user.id, 'create', 'JournalEntry', period, `توليد مقترحات: ${created}`);
  return `/finance/journal?period=${period}&generated=${created}`;
}

// ═══════════════════════════════════════════════════════════════
//  بناء الموازنة — الخطوات السبع
// ═══════════════════════════════════════════════════════════════

/**
 * يملأ الموازنة من فعليّ العام الماضي (الخطوتان ١ و٢).
 *
 * الملء **يحترم الموسمية** ولا يكتب فوق ما ضُبط يدويًا إلا بطلب صريح: من
 * قضى ساعةً في ضبط شهور حسابٍ لا يجوز أن يمسحها زرٌّ بضغطة.
 */
export async function fillBudgetFromHistory(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');

  const year = Math.round(num(fd, 'year') ?? new Date().getFullYear());
  const growthPct = num(fd, 'growthPct') ?? 0;
  if (growthPct < -100) throw new MutationError('نسبة نمو أقل من −١٠٠٪ لا معنى لها');

  const overwrite = fd.get('overwrite') === 'on';
  const result = await fillFromLastYear({ year, growthPct, overwrite, userId: user.id });

  await auditEvent(
    user.id,
    'update',
    'Budget',
    String(year),
    `ملء من ${year - 1} بنمو ${growthPct}% — ${result.filled} حسابًا`
  );
  return `/finance/budget/plan?year=${year}&filled=${result.filled}&skipped=${result.skipped}`;
}

/** تصنيف الحساب ثابتًا أو متغيّرًا (الخطوتان ٣ و٤) */
export async function saveAccountBehaviour(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');

  const year = Math.round(num(fd, 'year') ?? new Date().getFullYear());
  let changed = 0;

  for (const [key, value] of fd.entries()) {
    const match = key.match(/^behaviour\[(.+)\]$/);
    if (!match) continue;
    const raw = String(value);
    // الفراغ تصنيفٌ صالح: يعني «لم يُحسم بعد» ويظهر سؤالًا في الشاشة
    const behaviour = raw === 'fixed' || raw === 'variable' ? raw : null;
    await db.account.update({ where: { id: match[1] }, data: { costBehavior: behaviour } });
    changed += 1;
  }

  await auditEvent(user.id, 'update', 'Account', 'behaviour', `تصنيف ${changed} حسابًا`);
  return `/finance/budget/plan?year=${year}&classified=${changed}`;
}

/** نسبة الطوارئ وملاحظات المنهج (الخطوة ٦) */
export async function saveBudgetPlanSettings(fd: FormData, user: SessionUser) {
  if (!can(user, 'canManageAccounting')) throw new MutationError('لا صلاحية');

  const year = Math.round(num(fd, 'year') ?? new Date().getFullYear());
  const contingencyPct = num(fd, 'contingencyPct') ?? 0;
  if (contingencyPct < 0 || contingencyPct > 100) {
    throw new MutationError('نسبة الطوارئ بين صفر ومئة');
  }

  const data = {
    contingencyPct,
    method: str(fd, 'method'),
    planNotes: str(fd, 'planNotes'),
  };

  await db.budget.upsert({
    where: { year },
    update: data,
    create: { year, name: `موازنة ${year}`, status: 'draft', ...data },
  });
  await auditEvent(user.id, 'update', 'Budget', String(year), `طوارئ ${contingencyPct}%`);
  return `/finance/budget/plan?year=${year}&saved=1`;
}

// ═══════════════════════════════════════════════════════════════
//  تصنيف الفروع — القواعد ١ و٢ و٣
// ═══════════════════════════════════════════════════════════════

/**
 * يمنع حفظ قيد فيه بند مصروف بتصنيف مختلّ.
 *
 * الرفض هنا **مقصود ولو أبطأ الإدخال**: بندٌ مشترك يحمل فرعًا يجعل الكتلة
 * تخصّ فرعًا بعينه، وبندٌ ذاتيّ بلا فرع يدخل الكتلة فتتحمّله الفروع كلها.
 * وكلاهما يُفسد قائمة كل فرع لا قائمة واحد.
 *
 * ولا يُفرض إلا حين تكون مراكز التكلفة مصنَّفة أصلًا: مكتبٌ لم يُعدّ الموديول
 * بعد لا تُقفل عليه شاشة القيود.
 */
async function assertBranchClassification(
  lines: { accountId: string; costCenterId: string | null; branch: string | null }[]
) {
  const configured = await db.costCenter.count({ where: { kind: { not: 'branch_direct' } } });
  if (configured === 0) return;

  const accounts = await db.account.findMany({
    where: { id: { in: [...new Set(lines.map((l) => l.accountId))] } },
    select: { id: true, type: true, name: true },
  });
  const typeOf = new Map(accounts.map((a) => [a.id, a.type]));
  const nameOf = new Map(accounts.map((a) => [a.id, a.name]));

  const centres = await db.costCenter.findMany({
    where: { id: { in: lines.map((l) => l.costCenterId).filter(Boolean) as string[] } },
    select: { id: true, kind: true },
  });
  const kindOf = new Map(centres.map((c) => [c.id, c.kind]));

  for (const line of lines) {
    const check = checkClassification({
      kind: line.costCenterId ? kindOf.get(line.costCenterId) : null,
      branch: line.branch,
      isExpense: typeOf.get(line.accountId) === 'expense',
    });
    if (!check.ok) {
      throw new MutationError(`«${nameOf.get(line.accountId) ?? 'بند'}»: ${check.error}`);
    }
  }
}
