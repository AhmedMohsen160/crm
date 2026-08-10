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
import {
  findEnglishHeader,
  parseEnglishLedgerRow,
  trafficKeyOf,
  type EnglishLedgerRow,
} from './import-ledger-en';
import { COST_CENTER_ALIASES } from './import-accounting';
import { matchAdmin } from './migration';
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
  /** أيّ القارئين قرأ الملف — عربيّ أم إنجليزيّ */
  dialect: 'ar' | 'en';
  /** أرصدة افتتاحية أُسقطت عمدًا — الشركة واحدة مستمرّة لا دفتران */
  openingSkipped: number;
  /** صفوفٌ بعد تاريخ الوقف — تُترك لدفعةٍ لاحقة */
  afterCutoff: number;
  /** أسماء فروع وردت ولا تطابق قائمة الفروع */
  unknownBranches: string[];
  /** أسماء أدمنز وردت ولا تطابق مستخدمًا في النظام */
  unknownAdmins: string[];
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
  tag: string,
  /**
   * **والاسم الإنجليزي يُحفظ في خانته** — فيجد قارئُ الصفوف الملصوقة
   * الحسابَ نفسه ولا يُنشئ له ثانيًا: ذاك يطابق بـ`nameEn` وهذا بالاسم.
   */
  english = false
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
    const siblings: { id: string; name: string; nameEn: string | null }[] = await db.account.findMany({
      where: { parentId },
      select: { id: true, name: true, nameEn: true },
    });
    const want = matchKey(name);
    const found = siblings.find(
      (s) => matchKey(s.name) === want || (english && s.nameEn === name)
    );

    if (found) {
      ref = { id: found.id, created: false };
    } else {
      const isLeaf = level === path.length - 1;
      const created: { id: string } = await db.account.create({
        data: {
          name,
          nameEn: english ? name : null,
          type,
          expenseGroup: type === 'expense' ? expenseGroup : null,
          level: level + 1,
          parentId,
          isPostable: isLeaf,
          // الإهلاك مصروف غير نقدي — يُستبعد من التعادل النقدي (§١٠٫٢)
          isCash: !/depreciation|إهلاك/i.test(name),
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
  /**
   * **تاريخ الوقف** — لا يدخل ما بعده.
   *
   * قالها أحمد: «نغلق الداتا ونظبطها على نهاية يوليو بحيث من أول أغسطس
   * تكون مدخلات لاحقة». والوقفُ في الترحيل لا في الملف: الدفتر ينمو كل
   * يوم، ورفعُه غدًا يجب أن يبدأ من حيث وقف لا أن يعيد ما دخل.
   */
  until?: Date;
  /**
   * **إسقاط الأرصدة الافتتاحية.**
   *
   * دفتر ٢٠٢٦ يفتح بثمانية وستين سطرًا تحمل أرصدة ٢٠٢٥ المرحَّلة. وهي
   * موجودة أصلًا في دفاتر ٢٠٢٢–٢٠٢٥ حركةً مفصّلة — «الشركة فقط مستمرة»،
   * لا دفتران. وإدخالُها ثانيةً يحسب المال مرتين ويُضاعف الميزانية.
   */
  skipOpeningBalances?: boolean;
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
  /**
   * **واللهجتان تُجرَّبان على كل ورقة.**
   *
   * حتى ٢٠٢٥ كتب المحاسب دفتره بالعربية، وفي ٢٠٢٦ حوّله كلَّه إلى
   * الإنجليزية (`Journal Entry 🧾`). فالورقة تُعرض على القارئين معًا،
   * ويفوز من قرأ ترويستها — لا من طابق اسمَها.
   */
  type Found = {
    name: string;
    rows: CellValue[][];
    header: NonNullable<ReturnType<typeof findHeader>>;
    dialect: 'ar' | 'en';
  };

  const findSheet = (): Found => {
    const candidates = params.sheetName
      ? [params.sheetName]
      : [
          ...workbook.sheetNames.filter(
            (n) => matchKey(n).includes(matchKey('قيود')) || /journal\s*entry/i.test(n)
          ),
          ...workbook.sheetNames,
        ];

    let best: Found | null = null;
    for (const name of candidates) {
      const rows = workbook.sheet(name) as CellValue[][];
      const plain = rows as unknown as (string | null | undefined)[][];
      const arabic = findHeader(plain);
      const english = arabic ? null : findEnglishHeader(plain);
      const header = arabic ?? english;
      if (!header) continue;
      const found: Found = { name, rows, header, dialect: arabic ? 'ar' : 'en' };
      if (!best || rows.length > best.rows.length) best = found;
      // ورقةٌ باسم القيود وفيها ترويسة: هي المقصودة بلا بحثٍ أبعد
      if (matchKey(name).includes(matchKey('قيود')) || /journal\s*entry/i.test(name)) return best;
    }
    if (!best) throw new Error('لم تُوجد ورقةٌ فيها ترويسة قيود في هذا الملف');
    return best;
  };

  const { rows, header, dialect } = findSheet();
  const parseRow = (cells: CellValue[], line: number) =>
    dialect === 'en'
      ? parseEnglishLedgerRow(cells, header.columns, line)
      : parseArabicLedgerRow(cells, header.columns, line);

  // إعادة الترحيل تمسح ما وسمَته أولًا — فلا يتضاعف قيدٌ برفعٍ ثانٍ
  await rollbackTag(tag);

  const parsed: ArabicLedgerRow[] = [];
  const problems = new Map<string, number>();
  let skipped = 0;
  let openingSkipped = 0;
  let afterCutoff = 0;

  for (let i = header.row + 1; i < rows.length; i += 1) {
    const cells = rows[i];
    // صفٌّ بلا تاريخ ولا مبلغ صفٌّ فارغ — لا يُعدّ خطأً
    const hasAnything = cells.some((c) => c !== null && c !== undefined && c !== '');
    if (!hasAnything) continue;

    const row = parseRow(cells, i + 1);
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

    /**
     * **الإسقاط بعد القراءة لا قبلها** — فيُعدّ ما أُسقط ويُقال في التقرير.
     * صفٌّ يختفي بلا رقمٍ يشرحه يجعل فارق الميزان لغزًا بلا مفتاح.
     */
    if (params.skipOpeningBalances && 'isOpeningBalance' in row && row.isOpeningBalance) {
      openingSkipped += 1;
      continue;
    }
    if (params.until && row.date.getTime() > params.until.getTime()) {
      afterCutoff += 1;
      continue;
    }
    parsed.push(row);
  }

  const accountCache = new Map<string, AccountRef>();
  const centerCache = new Map<string, { id: string; created: boolean }>();
  const unknownBranches = new Set<string>();
  const unknownAdmins = new Set<string>();
  /**
   * قائمة المستخدمين تُقرأ **مرة واحدة** — والمطابقة في الذاكرة. الدفتر
   * خمسة آلاف سطر، وسؤالُ القاعدة عن كل سطرٍ رحلةٌ لا تُحتمل.
   */
  const staff =
    dialect === 'en'
      ? await db.user.findMany({ where: { active: true }, select: { id: true, name: true } })
      : [];
  const adminCache = new Map<string, string | null>();
  const adminIdOf = (raw: string | null): string | null => {
    if (!raw) return null;
    if (adminCache.has(raw)) return adminCache.get(raw) ?? null;
    const user = matchAdmin(raw, staff);
    if (!user) unknownAdmins.add(raw);
    adminCache.set(raw, user?.id ?? null);
    return user?.id ?? null;
  };

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
      branch: string | null;
      salesAdminId: string | null;
      trafficSource: string | null;
      translationType: string | null;
      sortOrder: number;
    }[] = [];

    for (const [index, row] of batch.rows.entries()) {
      /**
       * **نوعُ الحساب من قارئه لا من جذره دائمًا.** جذر الدفتر العربي هو
       * الحساب الرئيسي نفسه، وجذر الإنجليزي مستوًى فوقه (`Expenses`).
       */
      const type =
        dialect === 'en' ? row.accountType : (accountTypeOf(row.path[0]) ?? row.accountType);
      const account = await ensureAccount(
        row.path,
        type,
        row.expenseGroup,
        accountCache,
        tag,
        dialect === 'en'
      );
      if (!account) continue;

      const en = dialect === 'en' ? (row as EnglishLedgerRow) : null;

      /**
       * **ومركز ٢٠٢٦ هو مركز ٢٠٢٥ باسمه العربي.**
       *
       * كتب المحاسب `Salam Center | Haqibat Salam` وفي النظام «مركز سلام».
       * وبلا هذه المطابقة يُنشأ للمركز الواحد سجلّان، فتُقسَّم ربحيةُ
       * المشروع على اثنين ولا يُقرأ رقمٌ صحيح لواحدٍ منهما.
       */
      const centerName = en
        ? (COST_CENTER_ALIASES[`${en.centerAccount ?? ''}|${en.centerProject ?? ''}`]?.name ??
          en.centerProject ??
          en.centerAccount)
        : row.costCenter;

      const costCenterId = centerName
        ? await ensureCostCenter(centerName, centerCache, tag)
        : null;

      if (en?.branchRaw) unknownBranches.add(en.branchRaw);

      lineData.push({
        accountId: account.id,
        debit: row.debit,
        credit: row.credit,
        debitBase: row.debit,
        creditBase: row.credit,
        memo: row.memo.slice(0, 500),
        costCenterId,
        /**
         * **ولا فرعَ لما قبل ٢٠٢٦.** الفروع بدأت حينها، ودفاتر ما قبلها
         * بلا بُعد فرعٍ أصلًا — ووسمُها بفرعٍ يخلق بُعدًا لم يكن ويدعو
         * إلى مقارنة فروعٍ لم توجد.
         */
        branch: en?.branch ?? null,
        salesAdminId: adminIdOf(en?.salesAdmin ?? null),
        trafficSource: en ? trafficKeyOf(en.trafficSource) : null,
        translationType: en?.translationType ?? null,
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
    const firstEn = dialect === 'en' ? (first as EnglishLedgerRow) : null;
    await db.journalEntry.create({
      data: {
        date: first.date,
        period: first.period,
        // نوع المستند ورقمه يذكرهما دفتر ٢٠٢٦ وحده — والفاتورة تُراجَع بهما
        docType: firstEn?.docType ?? 'journal',
        docNumber: batch.rows.map((r) => (r as EnglishLedgerRow).docNumber).find(Boolean) ?? null,
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
    dialect,
    openingSkipped,
    afterCutoff,
    unknownBranches: [...unknownBranches],
    unknownAdmins: [...unknownAdmins],
  };
}
