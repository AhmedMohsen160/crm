import 'server-only';
import { db } from './db';
import {
  parseRow,
  groupEntries,
  isHeaderLine,
  isBlankLine,
  summaryLine,
  COLUMNS,
  EXPENSE_GROUPS,
  COST_CENTER_ALIASES,
  SALES_ADMIN_ALIASES,
  type AccountingRow,
  type ImportSummary,
  type RowError,
} from './import-accounting';

/**
 * محرّك ترحيل دفتر المحاسب — ما يلمس القاعدة.
 *
 * **آمن التكرار.** كل قيد يحمل مفتاح مصدره (`sourceType='accounting_import'`
 * و`sourceId`)، فإلصاق الورقة كاملةً مرةً بعد مرة لا يضاعف قيدًا واحدًا.
 * وهذا مقصود: الدفتر ينمو كل يوم، والمطلوب أن يُلصق كله كلما نما.
 *
 * **ولا يمسّ ما بعد الترحيل.** القيد الذي عدّله المحاسب في النظام لا
 * يُعاد كتابته من الورقة، ولا يُحذف قيدٌ أبدًا.
 */

/** يقسّم النص الملصوق أسطرًا وخانات */
function toCells(text: string): { cells: string[]; line: number; raw: string }[] {
  return text
    .split(/\r?\n/)
    .map((raw, index) => ({ raw, line: index + 1, cells: raw.split('\t') }))
    .filter((row) => row.raw.trim() !== '');
}

/**
 * شجرة الحسابات تُبنى **من القيود نفسها**.
 *
 * ورقة المحاسب تحمل المسار الكامل على كل سطر (رئيسي ← فرعي ← فرعي ← ختامي)،
 * فلا حاجة لإلصاق شجرة الحسابات على حدة: تُشتقّ من الدفتر وهي مضمونة
 * المطابقة له — شجرةٌ تُلصق وحدها قد تُخالف ما وقع عليه القيد فعلًا.
 *
 * والورقة الأخيرة وحدها **قابلة للترحيل**؛ وما فوقها تجميعٌ لا يقع عليه قيد.
 */
async function ensureAccountPath(
  path: string[],
  type: string,
  expenseGroup: string | null,
  cache: Map<string, string>,
  counters: { created: number }
): Promise<string> {
  let parentId: string | null = null;
  let key = '';

  for (const [index, name] of path.entries()) {
    key = key ? `${key} › ${name}` : name;
    const cached = cache.get(key);
    const isLeaf = index === path.length - 1;

    if (cached) {
      parentId = cached;
      continue;
    }

    // المطابقة بالاسم الإنجليزي وأبيه — لا بالاسم وحده: «الرواتب» تتكرّر
    // تحت المجموعات الثلاث، وثلاثتها حسابات مختلفة
    let account: { id: string } | null = await db.account.findFirst({
      where: { nameEn: name, parentId },
      select: { id: true },
    });

    if (!account) {
      account = await db.account.create({
        data: {
          name,
          nameEn: name,
          type,
          expenseGroup: type === 'expense' ? expenseGroup : null,
          level: index + 1,
          parentId,
          isPostable: isLeaf,
          // الإهلاك مصروف غير نقدي — يُستبعد من التعادل النقدي (§١٠٫٢)
          isCash: !/depreciation/i.test(name),
        },
        select: { id: true },
      });
      counters.created += 1;
    }

    cache.set(key, account.id);
    parentId = account.id;
  }

  return parentId as string;
}

async function ensureCostCenter(
  rawName: string,
  rawProject: string | null,
  cache: Map<string, string>,
  counters: { created: number }
): Promise<string> {
  // المركز نفسه بالعربية في النظام وبالإنجليزية في الورقة — لا يُنشأ مرتين
  const alias = COST_CENTER_ALIASES[`${rawName}|${rawProject ?? ''}`];
  const name = alias?.name ?? rawName;
  const project = alias?.project ?? rawProject;

  const key = `${name}|${project ?? ''}`;
  const cached = cache.get(key);
  if (cached) return cached;

  // `project` قد يكون فارغًا، والمفتاح المركّب لا يقبل الفراغ في upsert
  let center: { id: string } | null = await db.costCenter.findFirst({
    where: { name, project },
    select: { id: true },
  });
  if (!center) {
    center = await db.costCenter.create({ data: { name, project }, select: { id: true } });
    counters.created += 1;
  }
  cache.set(key, center.id);
  return center.id;
}

/** يطابق أدمن المبيعات بالاسم — ولا يُنشئ مستخدمًا أبدًا */
async function adminIndex(): Promise<Map<string, string>> {
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true } });
  const map = new Map<string, string>();
  for (const user of users) {
    map.set(normalizeName(user.name), user.id);
    // الاسم الأول والأخير — الدفتر يكتب «Mohamed Elsawy» والنظام «الصاوي»
    const parts = normalizeName(user.name).split(' ').filter(Boolean);
    if (parts.length > 1) map.set(parts[parts.length - 1], user.id);
  }
  return map;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}

export type AccountingImportOptions = {
  actorId: string;
  /** ترحيل القيود فورًا، أو إبقاؤها مسوّدات يراجعها المحاسب */
  post: boolean;
};

/**
 * يُرحّل دفعةً من دفتر المحاسب.
 *
 * الترتيب مقصود: الحسابات ومراكز التكلفة أولًا (فالقيد لا يقع بلا حساب)،
 * ثم القيود، ثم الموقوف إلى قائمة المراجعة.
 */
export async function importAccountingSheet(
  text: string,
  options: AccountingImportOptions
): Promise<ImportSummary> {
  const raw = toCells(text);
  const rows: AccountingRow[] = [];
  const errors: RowError[] = [];
  let skipped = 0;

  for (const item of raw) {
    if (isHeaderLine(item.cells) || isBlankLine(item.cells)) {
      skipped += 1;
      continue;
    }
    if (item.cells.length < COLUMNS.length - 4) {
      errors.push({ line: item.line, raw: item.raw, reason: 'عدد الأعمدة أقلّ من المتوقَّع' });
      continue;
    }
    const parsed = parseRow(item.cells, item.line);
    if ('reason' in parsed) {
      // صفوف بلا مبلغ شائعة في ذيل الورقة — تُتخطّى بلا ضجيج
      if (parsed.reason.includes('بلا مبلغ')) skipped += 1;
      else errors.push(parsed);
      continue;
    }
    rows.push(parsed);
  }

  const { entries, unbalanced } = groupEntries(rows);

  const accountCache = new Map<string, string>();
  const centerCache = new Map<string, string>();
  const accountCounter = { created: 0 };
  const centerCounter = { created: 0 };
  const admins = await adminIndex();

  const unknownBranches = new Set<string>();
  const unknownAdmins = new Set<string>();
  let writtenEntries = 0;
  let writtenLines = 0;

  for (const entry of entries) {
    const sourceId = entry.key;
    // ما رُحّل لا يُرحَّل مرتين — ولا يُعاد كتابته إن عدّله المحاسب
    const existing = await db.journalEntry.findFirst({
      where: { sourceType: 'accounting_import', sourceId },
      select: { id: true },
    });
    if (existing) continue;

    const lines: {
      accountId: string;
      debit: number;
      credit: number;
      debitBase: number;
      creditBase: number;
      branch: string | null;
      costCenterId: string | null;
      salesAdminId: string | null;
      trafficSource: string | null;
      translationType: string | null;
      memo: string | null;
      sortOrder: number;
    }[] = [];

    for (const [index, row] of entry.rows.entries()) {
      const accountId = await ensureAccountPath(
        row.path,
        row.accountType,
        row.expenseGroup,
        accountCache,
        accountCounter
      );

      const costCenterId = row.costCenterName
        ? await ensureCostCenter(row.costCenterName, row.costCenterProject, centerCache, centerCounter)
        : null;

      if (row.branchRaw) unknownBranches.add(row.branchRaw);

      let salesAdminId: string | null = null;
      if (row.salesAdmin) {
        const arabic = SALES_ADMIN_ALIASES[row.salesAdmin];
        salesAdminId =
          admins.get(normalizeName(row.salesAdmin)) ??
          (arabic ? (admins.get(normalizeName(arabic)) ?? null) : null);
        if (!salesAdminId) unknownAdmins.add(row.salesAdmin);
      }

      lines.push({
        accountId,
        debit: round2(row.debit),
        credit: round2(row.credit),
        // الدفتر بالجنيه أصلًا — أعمدة الدولار فيه للعرض لا للترحيل
        debitBase: round2(row.debit),
        creditBase: round2(row.credit),
        branch: row.branch,
        costCenterId,
        salesAdminId,
        trafficSource: row.trafficSource,
        translationType: row.translationType,
        memo: row.units ? `وحدات: ${row.units}` : null,
        sortOrder: index,
      });
    }

    /**
     * **القرش الأخير يذهب لآخر سطر.**
     *
     * ورقة المحاسب تحمل كسورًا أطول من قرشين (`232157.3010000007`)، والمال
     * قرشان لا أكثر. فالتقريب يترك فارقًا لا يتجاوز نصف قرش في القيد
     * الواحد، لكنه يتراكم عبر ألفَي قيد فيُخرج **ميزان المراجعة** عن
     * التوازن — والميزان المختلّ يقول «الخلل في الترحيل» وهو محقّ.
     *
     * فيُسوَّى الفارق على آخر سطر، وهي القاعدة نفسها المتبعة في توزيع
     * النسب على المشاريع. وما تجاوز نصف قرش لا يُسوَّى — ذاك خللٌ حقيقي
     * وقد أُوقف قبل الوصول إلى هنا.
     */
    const debitSum = round2(lines.reduce((sum, l) => sum + l.debit, 0));
    const creditSum = round2(lines.reduce((sum, l) => sum + l.credit, 0));
    const residue = round2(debitSum - creditSum);
    if (residue !== 0 && Math.abs(residue) <= 0.01) {
      const last = lines[lines.length - 1];
      if (last.credit > 0) {
        last.credit = round2(last.credit + residue);
        last.creditBase = last.credit;
      } else {
        last.debit = round2(last.debit - residue);
        last.debitBase = last.debit;
      }
    }

    await db.journalEntry.create({
      data: {
        date: entry.date,
        period: entry.period,
        docType: entry.docType,
        docNumber: entry.docNumber,
        description: entry.description,
        status: options.post ? 'posted' : 'draft',
        createdById: options.actorId,
        postedById: options.post ? options.actorId : null,
        postedAt: options.post ? new Date() : null,
        sourceType: 'accounting_import',
        sourceId,
        lines: { create: lines },
      },
    });

    writtenEntries += 1;
    writtenLines += lines.length;
  }

  // الموقوف يذهب للمراجعة بفارقه مكتوبًا — ولا يدخل الدفتر
  for (const batch of unbalanced) {
    const key = `${batch.period}:${batch.firstSerial}-${batch.lastSerial}`;
    const seen = await db.migrationReview.findFirst({
      where: { source: 'accounting', raw: key },
      select: { id: true },
    });
    if (seen) continue;
    await db.migrationReview.create({
      data: {
        source: 'accounting',
        raw: key,
        reason:
          `دفعة ${batch.lines} سطرًا في ${batch.period} لم تتوازن — ` +
          `الفارق ${batch.difference.toLocaleString('ar-EG')} (${batch.reason}). ` +
          'صحّح ورقة المحاسب ثم أعِد الإلصاق.',
      },
    });
  }

  for (const error of errors.slice(0, 200)) {
    const seen = await db.migrationReview.findFirst({
      where: { source: 'accounting', raw: error.raw },
      select: { id: true },
    });
    if (seen) continue;
    await db.migrationReview.create({
      data: { source: 'accounting', rowNo: error.line, raw: error.raw, reason: error.reason },
    });
  }

  return {
    rows: rows.length,
    accounts: accountCounter.created,
    costCenters: centerCounter.created,
    entries: writtenEntries,
    lines: writtenLines,
    skipped,
    unbalancedBatches: unbalanced.length,
    unbalancedLines: unbalanced.reduce((sum, b) => sum + b.lines, 0),
    unknownBranches: [...unknownBranches],
    unknownAdmins: [...unknownAdmins],
    errors,
  };
}

export { summaryLine, EXPENSE_GROUPS };
