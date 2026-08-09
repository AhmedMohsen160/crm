import 'server-only';
import { MutationError } from './base';
import { db } from '@/lib/db';
import { can, type SessionUser } from '@/lib/auth';
import { str } from '@/lib/utils';
import { auditEvent } from '@/lib/audit';
import { checkUpload } from '@/lib/files';
import { importLedgerWorkbook, ledgerTag, rollbackTag } from '@/lib/import-history-engine';
import { importSalesWorkbook, rollbackSalesTag } from '@/lib/import-sales-engine';
import { settleYears, rollbackSettlement } from '@/lib/settle-engine';
import { salesTag, isImportTag } from '@/lib/import-sales';
import { settleTag } from '@/lib/settlement';
import { wipeDemoData } from '@/lib/reset-engine';

/**
 * ترحيل تاريخ المكتب — دفاتر المحاسب وشيت المبيعات.
 *
 * الغاية كما قالها أحمد: **«لتكون كأن النظام مبنيّ من ٢٠٢٢»** — فيدخل
 * الموظفون فيجدوا تاريخهم كاملًا في مكانه ويُكملون عليه.
 *
 * **وثلاث خطوات بترتيبها لا تُقلَب:**
 *   ١) الدفتر — الحقيقة المالية.
 *   ٢) شيت المبيعات — العملاء والمشاريع.
 *   ٣) التسوية — تُبنى فوقهما، فتُعاد كلما أُعيد أحدُهما.
 */

/** ملفات الجداول وحدها — والحدّ عشرة ميجابايت فدفتر السنة يقارب ميجابايت */
const SHEET_TYPES: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/octet-stream': 'xlsx',
};
const MAX_SHEET_BYTES = 10 * 1024 * 1024;

function requireHistory(user: SessionUser) {
  /**
   * **صلاحيتان معًا لا واحدة.** هذا يكتب في الدفتر وفي سجل العملاء معًا —
   * ومن يملك أحدهما وحده لا يملك أن يقلب الآخر.
   */
  if (!can(user, 'canManageAccounting') || !can(user, 'canManageSettings')) {
    throw new MutationError('ترحيل تاريخ المكتب لمن يملك الدفاتر وإعدادات النظام معًا');
  }
}

async function readSheet(fd: FormData, field: string): Promise<Buffer> {
  const file = fd.get(field);
  if (!(file instanceof File)) throw new MutationError('اختر ملف الجدول أولًا');
  const check = checkUpload(file, SHEET_TYPES, MAX_SHEET_BYTES);
  if (!check.ok) throw new MutationError(check.error);
  return Buffer.from(await file.arrayBuffer());
}

/** أحمد مجلي مالك التجزئة، والمدير التنفيذي مالك العملاء القدامى */
async function readOwnerRule(fd: FormData, user: SessionUser) {
  const defaultOwnerId = str(fd, 'defaultOwnerId') ?? user.id;
  const executiveOwnerId = str(fd, 'executiveOwnerId') ?? defaultOwnerId;
  const owners = await db.user.count({ where: { id: { in: [defaultOwnerId, executiveOwnerId] } } });
  if (owners === 0) throw new MutationError('اختر مالك العملاء أولًا');
  return {
    defaultOwnerId,
    executiveOwnerId,
    // أسماءٌ إضافية للمدير التنفيذي — سطرٌ لكلٍّ، تُعدَّل من الشاشة
    executiveNames: (str(fd, 'executiveNames') ?? '')
      .split(/\r?\n/)
      .map((n) => n.trim())
      .filter(Boolean),
  };
}

/** يرحّل دفتر سنةٍ من ملفّه */
export async function importHistoryLedger(fd: FormData, user: SessionUser) {
  requireHistory(user);
  const year = Number(str(fd, 'year') ?? '');
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new MutationError('اكتب سنة الدفتر بأربعة أرقام');
  }

  const buffer = await readSheet(fd, 'file');
  const summary = await importLedgerWorkbook({ buffer, year, actorId: user.id });

  await auditEvent(
    user.id,
    'create',
    'JournalEntry',
    ledgerTag(year),
    `دفتر ${year}: ${summary.entries} قيدًا · ${summary.lines} سطرًا · ${summary.debit} مدين`
  );

  const params = new URLSearchParams({
    done: 'ledger',
    year: String(year),
    entries: String(summary.entries),
    lines: String(summary.lines),
    rows: String(summary.rows),
    skipped: String(summary.skipped),
    debit: String(summary.debit),
    credit: String(summary.credit),
    accounts: String(summary.accountsCreated),
    centers: String(summary.costCentersCreated),
    unbalanced: String(summary.unbalanced.length),
  });
  return `/settings/import/history?${params}`;
}

/** يرحّل شيت المبيعات كلَّه — كل سنةٍ بوسمها */
export async function importHistorySales(fd: FormData, user: SessionUser) {
  requireHistory(user);
  const buffer = await readSheet(fd, 'file');
  const rule = await readOwnerRule(fd, user);

  const only = (str(fd, 'years') ?? '')
    .split(/[,\s]+/)
    .map((y) => Number(y))
    .filter((y) => Number.isInteger(y) && y > 2000);

  const summary = await importSalesWorkbook({
    buffer,
    actorId: user.id,
    rule,
    onlyYears: only.length ? only : undefined,
  });

  await auditEvent(
    user.id,
    'create',
    'Project',
    'sales-import',
    `شيت المبيعات: ${summary.projects} مشروعًا · ${summary.leads} ليدًا · ${summary.clients} عميلًا`
  );

  const params = new URLSearchParams({
    done: 'sales',
    rows: String(summary.rows),
    clients: String(summary.clients),
    projects: String(summary.projects),
    leads: String(summary.leads),
    review: String(summary.review),
    years: summary.years.map((y) => `${y.year}:${y.projects}`).join(','),
    admins: summary.unmatchedAdmins.join('، '),
    branches: summary.unmatchedBranches.join('، '),
  });
  return `/settings/import/history?${params}`;
}

/** يبني التسوية فوق الدفتر والشيت — ويُعاد بناؤها كلّما أُعيد أحدُهما */
export async function runHistorySettlement(fd: FormData, user: SessionUser) {
  requireHistory(user);
  const rule = await readOwnerRule(fd, user);

  const years = (str(fd, 'years') ?? '')
    .split(/[,\s]+/)
    .map((y) => Number(y))
    .filter((y) => Number.isInteger(y) && y > 2000 && y < 2100);
  if (!years.length) throw new MutationError('اكتب سنوات التسوية — مثال: 2022 2023 2024 2025');

  const report = await settleYears({
    years,
    actorId: user.id,
    rule,
    fallbackBranch: str(fd, 'fallbackBranch') ?? 'mokattam',
  });

  await auditEvent(
    user.id,
    'update',
    'Project',
    'settlement',
    `تسوية ${years.join('، ')}: ${report.namedProjects} مشروعًا باسمه · ${report.scaledProjects} موسَّعًا`
  );

  const params = new URLSearchParams({
    done: 'settle',
    years: years.join(','),
    namedClients: String(report.namedClients),
    namedProjects: String(report.namedProjects),
    namedAmount: String(Math.round(report.namedAmount)),
    bucketClients: String(report.bucketClients),
    bucketAmount: String(Math.round(report.bucketAmount)),
    scaledProjects: String(report.scaledProjects),
    scaledFrom: String(Math.round(report.scaledFrom)),
    scaledTo: String(Math.round(report.scaledTo)),
    silent: report.monthsWithoutLedger.join('، '),
  });
  return `/settings/import/history?${params}`;
}

/**
 * يسحب وسمًا كاملًا.
 *
 * **ولا يُسحب إلا وسمُ ترحيلٍ بصيغته.** الوسم يأتي من الشاشة، وبلا هذا
 * الحارس تكفي كلمةٌ في خانةٍ لتمسح ما لم يُرحَّل أصلًا.
 */
export async function rollbackImportTag(fd: FormData, user: SessionUser) {
  requireHistory(user);
  const tag = str(fd, 'tag') ?? '';
  if (!isImportTag(tag)) throw new MutationError('وسمٌ غير معروف — لا يُسحب إلا ما رُحِّل');

  const year = Number(tag.slice(-4));
  let line = '';
  if (tag === ledgerTag(year)) {
    const out = await rollbackTag(tag);
    line = `${out.entries} قيدًا · ${out.accounts} حسابًا · ${out.costCenters} مركزًا`;
  } else if (tag === salesTag(year)) {
    const out = await rollbackSalesTag(tag);
    line = `${out.projects} مشروعًا · ${out.leads} ليدًا · ${out.clients} عميلًا`;
  } else if (tag === settleTag(year)) {
    const out = await rollbackSettlement(year);
    line = `رُدّ ${out.restored} مشروعًا إلى رقمه المرصود · وحُذف ${out.removed}`;
  }

  await auditEvent(user.id, 'delete', 'Project', tag, `سحبُ وسم «${tag}»: ${line}`);
  return `/settings/import/history?${new URLSearchParams({ done: 'rollback', tag, line })}`;
}

/**
 * الجملة التي تُكتب بالحرف قبل المسح.
 *
 * **ولا يكفي زرٌّ ولا مربّع تأكيد.** هذا يمسح سجلَّ عملاء بأكمله، وجملةٌ
 * تُكتب باليد لا تُضغط سهوًا ولا يُنقَر عليها مرورًا.
 */
export const RESET_PHRASE = 'امسح البيانات التجريبية';

/** يمسح ما زُرع لتجريب النظام — وما رُحِّل من ملفات المكتب لا يُمسّ */
export async function wipeDemoRecords(fd: FormData, user: SessionUser) {
  requireHistory(user);
  if (str(fd, 'confirm') !== RESET_PHRASE) {
    throw new MutationError(`اكتب «${RESET_PHRASE}» بالحرف لتأكيد المسح`);
  }
  if (str(fd, 'backupDone') !== 'yes') {
    throw new MutationError('نزّل النسخة الاحتياطية أولًا ثم أكّد أنك نزّلتها');
  }

  const counts = await wipeDemoData();
  const line =
    Object.entries(counts)
      .map(([label, n]) => `${label}: ${n}`)
      .join(' · ') || 'لا شيء تجريبيّ ليُمسح';

  await auditEvent(user.id, 'delete', 'Client', 'demo-reset', `مسحُ البيانات التجريبية — ${line}`);
  return `/settings/import/history?${new URLSearchParams({ done: 'reset', line })}`;
}
