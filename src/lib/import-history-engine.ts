import 'server-only';
import { db } from './db';
import { readWorkbook, type CellValue } from './xlsx';
import {
  findHeader,
  parseArabicLedgerRow,
  accountTypeOf,
  matchKey,
  cleanText,
  parseArabicAmount,
  type ArabicLedgerRow,
} from './import-ledger-ar';
import { groupBatches, settleRounding, round2 } from './ledger-batches';

/**
 * ترحيل دفاتر المكتب القديمة إلى النظام — ما يكتب في القاعدة.
 *
 * الغاية كما قالها أحمد: **«لتكون كأن النظام مبنيّ من ٢٠٢٢»** — فيدخل
 * الموظفون فيجدوا تاريخهم كاملًا في مكانه، ويُكملون عليه.
 *
 * ── أربع قواعد تحكم كل ما هنا ─────────────────────────────────
 *
 * ١) **ما لا يتوازن لا يدخل الدفتر ولا يُجبَر.** القيود تُجمَّع بالرصيد
 *    الجاري — أوراق المحاسب مسطَّحة بلا أرقام قيود صالحة — وما لم يتوازن
 *    يُعاد دفعةً موقوفة بفارقها المكتوب.
 *
 * ٢) **كل ما يدخل موسوم.** `importTag = "ledger-2022"`، فتُسحب سنةٌ كاملة
 *    بضغطة إن خرجت خطأً بلا أن تمسّ ما أُدخل من الشاشات.
 *
 * ٣) **آمنُ التكرار.** إعادة ترحيل سنةٍ تمسح ما وسمَته أولًا ثم تكتب —
 *    فلا يتضاعف قيدٌ لأن الملف رُفع مرتين.
 *
 * ٤) **الشجرة تُبنى من الدفتر نفسه.** كل مستوى يُنشأ تحت أبيه بالاسم كما
 *    كتبه المحاسب، ويُعاد استعمال الموجود بمطابقةٍ مطبَّعة. فلا شجرتان.
 */

export type LedgerImportSummary = {
  year: number;
  /** صفوف قُرئت وصفوف أُوقفت */
  rows: number;
  skipped: number;
  /** قيود مكتوبة وسطورها */
  entries: number;
  lines: number;
  debit: number;
  credit: number;
  /** دفعات لم تتوازن — تُقال ولا تُجبَر */
  unbalanced: { period: string; lines: number; difference: number }[];
  /** أسباب الإيقاف مجمَّعة */
  problems: { reason: string; count: number }[];
  accountsCreated: number;
  costCentersCreated: number;
};

/** كم عنصرًا في الذاكرة أُنشئ فعلًا — لا كم مرة قُرئ */
function countCreated(cache: Map<string, { created: boolean }>): number {
  let n = 0;
  for (const ref of cache.values()) if (ref.created) n += 1;
  return n;
}

// ═══════════════════════════════════════════════════════════════
//  شجرة الحسابات — تُبنى من الدفتر
// ═══════════════════════════════════════════════════════════════

type AccountRef = { id: string; created: boolean };

/**
 * يجد الحساب بمساره أو يُنشئه — مستوًى مستوًى.
 *
 * **والمطابقة مطبَّعة**: «الاصول الثابتة» و«الأصول الثابتة» حسابٌ واحد،
 * فلا يُنشأ له صفّان. **والاسم المحفوظ كما كتبه المحاسب** لا مطبَّعًا —
 * الطيّ يُبدّل «الخزينة» بـ«الخزينه» في شاشة تُفتح كل يوم.
 */
async function ensureAccount(
  path: string[],
  type: string,
  expenseGroup: string | null,
  cache: Map<string, AccountRef>,
  tag: string
): Promise<AccountRef | null> {
  let parentId: string | null = null;
  let ref: AccountRef | null = null;

  for (let level = 0; level < path.length; level += 1) {
    const name = path[level];
    const key = `${parentId ?? 'root'}|${matchKey(name)}`;
    const cached = cache.get(key);
    if (cached) {
      parentId = cached.id;
      ref = cached;
      continue;
    }

    // الموجود يُعاد استعماله — بمطابقةٍ على الاسم المطبَّع تحت الأب نفسه
    const siblings: { id: string; name: string }[] = await db.account.findMany({
      where: { parentId },
      select: { id: true, name: true },
    });
    const want = matchKey(name);
    const found = siblings.find((s) => matchKey(s.name) === want);

    if (found) {
      ref = { id: found.id, created: false };
    } else {
      const isLeaf = level === path.length - 1;
      const created: { id: string } = await db.account.create({
        data: {
          name,
          type,
          expenseGroup: type === 'expense' ? expenseGroup : null,
          level: level + 1,
          parentId,
          isPostable: isLeaf,
          importTag: tag,
        },
        select: { id: true },
      });
      ref = { id: created.id, created: true };
    }

    cache.set(key, ref);
    parentId = ref.id;
  }

  /**
   * **الورقة تقبل القيد ولو وُلدت تجميعيّة.** حسابٌ أُنشئ أبًا في صفّ ثم
   * وقع عليه قيدٌ في صفّ آخر يبقى مرفوضًا للأبد لولا هذا.
   */
  if (ref && !ref.created) {
    await db.account.updateMany({
      where: { id: ref.id, isPostable: false },
      data: { isPostable: true },
    });
  }
  return ref;
}

/** مركز الربحية باسمه — يُنشأ مرة ويُعاد استعماله */
async function ensureCostCenter(
  name: string,
  cache: Map<string, { id: string; created: boolean }>,
  tag: string
): Promise<string | null> {
  const clean = cleanText(name);
  if (!clean) return null;
  const key = matchKey(clean);
  const cached = cache.get(key);
  if (cached) return cached.id;

  const all = await db.costCenter.findMany({ select: { id: true, name: true } });
  const found = all.find((c) => matchKey(c.name) === key);
  if (found) {
    cache.set(key, { id: found.id, created: false });
    return found.id;
  }

  const created = await db.costCenter.create({
    data: { name: clean, importTag: tag },
    select: { id: true },
  });
  cache.set(key, { id: created.id, created: true });
  return created.id;
}

// ═══════════════════════════════════════════════════════════════
//  الترحيل
// ═══════════════════════════════════════════════════════════════

export function ledgerTag(year: number): string {
  return `ledger-${year}`;
}

/** يسحب كل ما أُدخل بوسمٍ بعينه — فتُعاد سنةٌ بلا أن تمسّ غيرها */
export async function rollbackTag(tag: string): Promise<{ entries: number; accounts: number; costCenters: number }> {
  // السطور تُحذف مع رأس القيد (`onDelete: Cascade`)
  const entries = await db.journalEntry.deleteMany({ where: { importTag: tag } });
  // ولا يُحذف حسابٌ وقع عليه قيدٌ آخر — الشجرة تبقى لما بعدها
  const orphanAccounts = await db.account.findMany({
    where: { importTag: tag, lines: { none: {} }, children: { none: {} } },
    select: { id: true },
  });
  await db.account.deleteMany({ where: { id: { in: orphanAccounts.map((a) => a.id) } } });
  const orphanCenters = await db.costCenter.findMany({
    where: { importTag: tag, lines: { none: {} } },
    select: { id: true },
  });
  await db.costCenter.deleteMany({ where: { id: { in: orphanCenters.map((c) => c.id) } } });

  return {
    entries: entries.count,
    accounts: orphanAccounts.length,
    costCenters: orphanCenters.length,
  };
}

/**
 * يقرأ ملفّ دفترٍ سنويّ ويكتبه في النظام.
 *
 * **والقيود تدخل مرحَّلةً لا مسوَّدة**: هذه دفاتر سنواتٍ أُقفلت ووُقّعت
 * قوائمُها المالية — ومراجعتها اليوم قيدًا قيدًا عملٌ بلا غاية.
 */
export async function importLedgerWorkbook(params: {
  buffer: Buffer;
  year: number;
  actorId: string;
  sheetName?: string;
}): Promise<LedgerImportSummary> {
  const tag = ledgerTag(params.year);
  const workbook = readWorkbook(params.buffer);

  /**
   * **الورقة تُختار بترويستها لا باسمها.**
   *
   * دفتر ٢٠٢٢ ورقتُه «القيود» وما بعده «قيود اليومية»، وفي الملف الواحد
   * إحدى عشرة ورقة (إهلاك · تدفقات · حقوق ملكية). فيُبحث بالاسم أولًا، ثم
   * تُؤخذ **أكبر ورقةٍ فيها ترويسةُ قيودٍ صالحة** — وهذا يصيب مهما سُمّيت.
   */
  const findSheet = (): { name: string; rows: CellValue[][]; header: NonNullable<ReturnType<typeof findHeader>> } => {
    const candidates = params.sheetName
      ? [params.sheetName]
      : [
          ...workbook.sheetNames.filter((n) => matchKey(n).includes(matchKey('قيود'))),
          ...workbook.sheetNames,
        ];

    let best: { name: string; rows: CellValue[][]; header: NonNullable<ReturnType<typeof findHeader>> } | null = null;
    for (const name of candidates) {
      const rows = workbook.sheet(name) as CellValue[][];
      const header = findHeader(rows as unknown as (string | null | undefined)[][]);
      if (!header) continue;
      if (!best || rows.length > best.rows.length) best = { name, rows, header };
      // ورقةٌ اسمها «قيود» وفيها ترويسة: هي المقصودة بلا بحثٍ أبعد
      if (matchKey(name).includes(matchKey('قيود'))) return best;
    }
    if (!best) throw new Error('لم تُوجد ورقةٌ فيها ترويسة قيود في هذا الملف');
    return best;
  };

  const { rows, header } = findSheet();

  // إعادة الترحيل تمسح ما وسمَته أولًا — فلا يتضاعف قيدٌ برفعٍ ثانٍ
  await rollbackTag(tag);

  const parsed: ArabicLedgerRow[] = [];
  const problems = new Map<string, number>();
  let skipped = 0;

  for (let i = header.row + 1; i < rows.length; i += 1) {
    const cells = rows[i];
    // صفٌّ بلا تاريخ ولا مبلغ صفٌّ فارغ — لا يُعدّ خطأً
    const hasAnything = cells.some((c) => c !== null && c !== undefined && c !== '');
    if (!hasAnything) continue;

    const row = parseArabicLedgerRow(cells, header.columns, i + 1);
    if ('reason' in row) {
      /**
       * **الصفّ الفارغ ليس خطأً.** أوراق المحاسب تحتها آلاف الصفوف المهيّأة
       * سلفًا: فيها رقمٌ مسلسل وصيغةُ رصيدٍ تُنتج فراغًا، ولا تاريخ ولا
       * مبلغ. وعدّها أخطاءً يُغرق التقرير فيُخفي الخطأ الحقيقي.
       */
      const debitAt = header.columns.debit;
      const creditAt = header.columns.credit;
      const money = (at: number | undefined) =>
        at === undefined ? 0 : parseArabicAmount(cells[at]);
      const blank =
        row.reason.includes('التاريخ غير مقروء') &&
        money(debitAt) === 0 &&
        money(creditAt) === 0;
      if (blank) continue;
      skipped += 1;
      const key = row.reason.replace(/«[^»]*»/, '«…»');
      problems.set(key, (problems.get(key) ?? 0) + 1);
      continue;
    }
    if (row.date.getUTCFullYear() !== params.year) continue;
    parsed.push(row);
  }

  const accountCache = new Map<string, AccountRef>();
  const centerCache = new Map<string, { id: string; created: boolean }>();
  const batches = groupBatches(parsed);
  const unbalanced: LedgerImportSummary['unbalanced'] = [];
  let entries = 0;
  let lines = 0;
  let debit = 0;
  let credit = 0;

  for (const batch of batches) {
    /**
     * **ولا تُرفض الدفعة هنا.** التوازن يُحكم عليه بعد التسوية لا قبلها:
     * دفعةٌ فارقها قرشٌ واحد فارقُ تقريبٍ يُسوَّى، وردُّها قبل أن تُسوَّى
     * يُسقط اثنين وستين سطرًا من الدفتر لأجل قرش.
     */
    const lineData: {
      accountId: string;
      debit: number;
      credit: number;
      debitBase: number;
      creditBase: number;
      memo: string;
      costCenterId: string | null;
      sortOrder: number;
    }[] = [];

    for (const [index, row] of batch.rows.entries()) {
      const type = accountTypeOf(row.path[0]) ?? row.accountType;
      const account = await ensureAccount(row.path, type, row.expenseGroup, accountCache, tag);
      if (!account) continue;

      const costCenterId = row.costCenter
        ? await ensureCostCenter(row.costCenter, centerCache, tag)
        : null;

      lineData.push({
        accountId: account.id,
        debit: row.debit,
        credit: row.credit,
        debitBase: row.debit,
        creditBase: row.credit,
        memo: row.memo.slice(0, 500),
        costCenterId,
        sortOrder: index,
      });
    }

    if (lineData.length === 0) continue;

    // كسور القرش تُسوَّى على آخر سطر — وما جاوز خمسة قروش لا يُجبَر
    const settlement = settleRounding(lineData);
    if (!settlement.settled) {
      unbalanced.push({
        period: batch.rows[0].period,
        lines: lineData.length,
        difference: settlement.difference,
      });
      continue;
    }
    for (const line of lineData) {
      line.debitBase = line.debit;
      line.creditBase = line.credit;
    }

    const first = batch.rows[0];
    await db.journalEntry.create({
      data: {
        date: first.date,
        period: first.period,
        docType: 'journal',
        description: first.memo.slice(0, 300),
        status: 'posted',
        postedAt: first.date,
        postedById: params.actorId,
        createdById: params.actorId,
        importTag: tag,
        lines: { create: lineData },
      },
    });

    entries += 1;
    lines += lineData.length;
    debit += lineData.reduce((s, l) => s + l.debit, 0);
    credit += lineData.reduce((s, l) => s + l.credit, 0);
  }

  return {
    year: params.year,
    rows: parsed.length,
    skipped,
    entries,
    lines,
    debit: round2(debit),
    credit: round2(credit),
    unbalanced,
    problems: [...problems.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    // **العدّ على الذاكرة بعد الفراغ** — لا في كل سطر: الذاكرة تُعيد نفس
    // المرجع لكل سطرٍ بعده، فعدُّه في كل مرة يُنتج رقمًا بعدد السطور
    accountsCreated: countCreated(accountCache),
    costCentersCreated: countCreated(centerCache),
  };
}
