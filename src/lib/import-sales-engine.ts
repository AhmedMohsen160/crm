import 'server-only';
import { db } from './db';
import { readWorkbook, type CellValue } from './xlsx';
import { normalizePhone } from './phone';
import { nextClientCode, nextLeadCode, nextProjectCode } from './sequence';
import {
  parseSheetDate,
  parseSheetAmount,
  mapChannel,
  mapContactMethod,
  mapBranch,
  matchAdmin,
  isLostInquiry,
  mergeNotes,
} from './migration';
import { findSalesHeader, cleanClientName, nameKeyOf, salesTag } from './import-sales';
import { ownerFor, type OwnerRule } from './client-merge';

/**
 * ترحيل شيت المبيعات — ما يكتب في القاعدة.
 *
 * الشيت سجلُّ الكاونتر منذ نوفمبر ٢٠٢٢: صفٌّ لكل طلب باسم العميل ورقمه
 * والمبلغ المحصَّل وأدمن المبيعات. وهو **مصدر العملاء والمشاريع**، بينما
 * دفتر المحاسب مصدر المال.
 *
 * ── القواعد التي أقرّها أحمد ──────────────────────────────────
 *
 * ١) **العميل يتبع من باع له.** وما قاله الشيت يعلو على أي قاعدة. وما لم
 *    يُذكر له بائع فهو لأحمد مجلي — كان وحده قبل توظيف الفريق.
 *
 * ٢) **وخمسةُ عملاء قدامى للمدير التنفيذي** مهما قال الشيت — بأسمائهم في
 *    `EXECUTIVE_CLIENT_NAMES`، وتُزاد من الشاشة.
 *
 * ٣) **الصفّ بلا سعر ليدٌ خاسر لا مشروع** (§١٤): استفسارٌ لم يُبَع، وعدُّه
 *    مشروعًا يضخّم عدد الطلبات ويهبط بمتوسط قيمة الطلب.
 *
 * ٤) **والصفّ بلا رقم لا يُردّ** — يُجمَّع بالاسم. ردُّه يُسقط بيعًا حدث
 *    فعلًا، وإفرادُه بمفتاحٍ لكل صفٍّ يمزّق سجلَّ عميلٍ واحد إلى عشرة.
 */

export type SalesYearSummary = {
  year: number;
  rows: number;
  projects: number;
  leads: number;
  amount: number;
};

export type SalesImportSummary = {
  /** صفوف قُرئت من الورقة */
  rows: number;
  clients: number;
  projects: number;
  leads: number;
  /** صفوف لم تُحسم — كلٌّ بسببه في قائمة المراجعة */
  review: number;
  /** صفوف رُحِّلت من قبل بمفتاحها فلم تُكرَّر */
  skipped: number;
  years: SalesYearSummary[];
  problems: { reason: string; count: number }[];
  /** أسماء وردت في الشيت ولم تُطابَق — تُقال ولا تُخمَّن */
  unmatchedAdmins: string[];
  unmatchedBranches: string[];
};

type ClientRef = { id: string; created: boolean };

/**
 * يسحب كل ما رُحِّل من شيت المبيعات بوسمٍ بعينه.
 *
 * **ولا يُحذف عميلٌ له أثرٌ باقٍ**: عميلٌ اشترى في ٢٠٢٢ و٢٠٢٤ يبقى حين
 * تُسحب ٢٠٢٢ وحدها — يُحذف من لم يبقَ له مشروعٌ ولا ليد.
 */
export async function rollbackSalesTag(
  tag: string
): Promise<{ projects: number; leads: number; clients: number }> {
  const projects = await db.project.deleteMany({ where: { importTag: tag } });
  const leads = await db.lead.deleteMany({ where: { importTag: tag } });
  const orphans = await db.client.findMany({
    where: { importTag: tag, projects: { none: {} }, leads: { none: {} } },
    select: { id: true },
  });
  await db.client.deleteMany({ where: { id: { in: orphans.map((c) => c.id) } } });
  return { projects: projects.count, leads: leads.count, clients: orphans.length };
}

/** الخدمة في الشيت نصّ إنجليزي حرّ — يُطابَق ما يُعرف ولا يُخترع خط خدمة */
function mapService(raw: string): string | null {
  const text = raw.toLowerCase().trim();
  if (!text) return null;
  if (/cerificate|certificate|\bid\b|passport|criminal|record|marriage|family/.test(text))
    return 'certified';
  if (/contract|declaration|power of attorney|acknowledgment/.test(text)) return 'legal';
  if (/medical|bulletin/.test(text)) return 'medical';
  if (/commercial register|invoice/.test(text)) return 'financial';
  if (/engineering|technical/.test(text)) return 'technical';
  if (/essay|dessertation|dissertation|reseach|research|book|booklet/.test(text)) return 'academic';
  if (/brochure|video|cv/.test(text)) return 'marketing';
  return 'general';
}

/**
 * يقرأ شيت المبيعات ويكتبه في النظام.
 *
 * **والسنة وحدةُ الترحيل**: كل صفٍّ يُوسَم بسنته، فتُعاد سنةٌ وحدها حين
 * يُصحَّح شيتها ويبقى ما قبلها. وإعادةُ رفع الملف تمسح وسوم سنواته أولًا
 * فلا يتضاعف مشروعٌ لأن الملف رُفع مرتين.
 */
export async function importSalesWorkbook(params: {
  buffer: Buffer;
  actorId: string;
  rule: OwnerRule;
  sheetName?: string;
  /** سنواتٌ بعينها — وبلا تحديدٍ تدخل كل السنوات في الملف */
  onlyYears?: number[];
}): Promise<SalesImportSummary> {
  const workbook = readWorkbook(params.buffer);
  const sheetName =
    params.sheetName ??
    workbook.sheetNames.find((n) => n.trim().toUpperCase() === 'DATA') ??
    workbook.sheetNames[0];

  const rows = workbook.sheet(sheetName) as CellValue[][];
  const header = findSalesHeader(rows);
  if (!header) throw new Error(`لم تُوجد ترويسة المبيعات في ورقة «${sheetName}»`);
  const col = header.columns;
  const cell = (row: CellValue[], at: number | undefined) =>
    at === undefined ? null : (row[at] ?? null);

  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true } });

  // ── ١ · القراءة والفرز قبل أي كتابة ──────────────────────────
  type Ready = {
    date: Date;
    year: number;
    name: string;
    key: string;
    rawPhone: string;
    amount: number;
    currency: string;
    branch: string | null;
    channel: string | null;
    contactMethod: string | null;
    ownerId: string | null;
    service: string;
    pages: number | null;
    notes: string | null;
    onDeadline: boolean;
    hadProblem: boolean;
    rowNo: number;
  };

  const ready: Ready[] = [];
  const problems = new Map<string, number>();
  const unmatchedAdmins = new Set<string>();
  const unmatchedBranches = new Set<string>();
  let read = 0;
  let review = 0;

  const reject = async (rowNo: number, raw: CellValue[], reason: string) => {
    review += 1;
    problems.set(reason, (problems.get(reason) ?? 0) + 1);
    await db.migrationReview.create({
      data: {
        source: 'sales',
        rowNo,
        raw: raw.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? ''))).join('\t').slice(0, 2000),
        reason,
      },
    });
  };

  for (let i = header.row + 1; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    if (!row.some((c) => c !== null && c !== undefined && c !== '')) continue;
    read += 1;

    const parsed = parseSheetDate(cell(row, col.date));
    if (!parsed.date) {
      await reject(i + 1, row, parsed.problem ?? 'تاريخ غير مفهوم');
      continue;
    }
    const year = parsed.date.getUTCFullYear();
    if (params.onlyYears && !params.onlyYears.includes(year)) continue;

    const name = cleanClientName(cell(row, col.name));
    const rawPhone = String(cell(row, col.phone) ?? '');
    const phone = normalizePhone(rawPhone);

    /**
     * **مفتاح العميل: الهاتف أولًا ثم الاسم.** والصفّ بلا هذين لا يُنسب
     * إلى أحد — ولا يُخترع له عميل، فيُراجَع بعينه.
     */
    let key: string;
    if (phone.ok) key = phone.value;
    else if (name) key = nameKeyOf(name);
    else {
      await reject(i + 1, row, 'بلا اسم ولا رقم — لا يُنسب إلى عميل');
      continue;
    }

    const rawAdmin = String(cell(row, col.admin) ?? '').trim();
    const matched = matchAdmin(rawAdmin, users);
    if (rawAdmin && !matched) unmatchedAdmins.add(rawAdmin);

    const rawBranch = String(cell(row, col.branch) ?? '').trim();
    const branch = mapBranch(rawBranch);
    if (rawBranch && !branch) unmatchedBranches.add(rawBranch);

    const amount = parseSheetAmount(cell(row, col.price));
    const rawService = String(cell(row, col.service) ?? '').trim();
    const pagesRaw = Number(cell(row, col.pages));

    ready.push({
      date: parsed.date,
      year,
      name: name || `عميل ${key.slice(-4)}`,
      key,
      rawPhone,
      amount: amount.amount ?? 0,
      currency: amount.currency,
      branch,
      channel: mapChannel(cell(row, col.funnel)),
      contactMethod: mapContactMethod(cell(row, col.platform)),
      // القاعدة تُطبَّق على العميل لا على الصفّ وحده — والشيت يعلو عليها
      ownerId: matched?.id ?? null,
      service: rawService,
      pages: Number.isFinite(pagesRaw) && pagesRaw > 0 ? pagesRaw : null,
      notes: mergeNotes(
        `مُرحَّل من شيت المبيعات (صف ${i + 1})`,
        parsed.corrected,
        amount.corrected,
        !phone.ok && rawPhone ? `رقم غير صالح في المصدر: ${rawPhone}` : null,
        !phone.ok ? 'جُمِّع بالاسم — لا رقم صالحًا' : null,
        rawService ? `الخدمة في المصدر: ${rawService}` : null,
        rawAdmin && !matched ? `أدمن غير مطابَق: ${rawAdmin}` : null,
        rawBranch && !branch ? `فرع غير مطابَق: ${rawBranch}` : null,
        amount.currency !== 'EGP' ? `العملة ${amount.currency}` : null
      ),
      onDeadline: String(cell(row, col.onDeadline) ?? '').trim().toUpperCase() !== 'FALSE',
      hadProblem: String(cell(row, col.problem) ?? '').trim().toUpperCase() === 'TRUE',
      rowNo: i + 1,
    });
  }

  // ── ٢ · سحبُ وسوم السنوات الداخلة قبل الكتابة ────────────────
  const years = [...new Set(ready.map((r) => r.year))].sort();
  for (const year of years) await rollbackSalesTag(salesTag(year));

  // ── ٣ · الكتابة ──────────────────────────────────────────────
  const clients = new Map<string, ClientRef>();
  const summaries = new Map<number, SalesYearSummary>();
  let projects = 0;
  let leads = 0;
  let skipped = 0;

  // بالتاريخ صعودًا: فأولُ صفٍّ للعميل هو من يفتح بطاقته ويكتب فرعه الأول
  ready.sort((a, b) => a.date.getTime() - b.date.getTime() || a.rowNo - b.rowNo);

  for (const r of ready) {
    const tag = salesTag(r.year);
    const summary =
      summaries.get(r.year) ??
      (summaries.set(r.year, { year: r.year, rows: 0, projects: 0, leads: 0, amount: 0 }),
      summaries.get(r.year)!);
    summary.rows += 1;

    const ownerId = ownerFor(r.name, params.rule, r.ownerId);

    let client = clients.get(r.key);
    if (!client) {
      const existing = await db.client.findUnique({
        where: { phoneNormalized: r.key },
        select: { id: true },
      });
      if (existing) client = { id: existing.id, created: false };
      else {
        const made = await db.client.create({
          data: {
            code: await nextClientCode(),
            name: r.name,
            phone: r.rawPhone || r.name,
            phoneNormalized: r.key,
            firstBranch: r.branch,
            createdById: params.actorId,
            ownerId,
            importTag: tag,
          },
          select: { id: true },
        });
        client = { id: made.id, created: true };
      }
      clients.set(r.key, client);
    }

    const day = r.date.toISOString().slice(0, 10);
    /**
     * **ورقمُ الصفّ في المفتاح.** عميلٌ اشترى مرتين في يوم بنفس المبلغ
     * صفّان في الشيت لا صفّ — وبلا رقم الصفّ يبتلع أحدُهما الآخر فيضيع
     * بيعٌ حدث فعلًا. وتكرارُ الرفع يحرسه سحبُ وسم السنة لا هذا المفتاح.
     */
    const legacyKey = `sale:${r.key}:${day}:${r.amount}#${r.rowNo}`;
    if (await db.project.findFirst({ where: { legacyKey }, select: { id: true } })) {
      skipped += 1;
      continue;
    }
    if (await db.lead.findFirst({ where: { legacyKey }, select: { id: true } })) {
      skipped += 1;
      continue;
    }

    // §١٤: الصفّ بلا سعر استفسارٌ لم يُبَع — ليدٌ خاسر لا مشروع
    if (isLostInquiry(r.amount)) {
      await db.lead.create({
        data: {
          code: await nextLeadCode(r.date),
          firstName: r.name,
          phone: r.rawPhone || r.name,
          channel: r.channel,
          contactMethod: r.contactMethod,
          branch: r.branch,
          ownerId,
          clientId: client.id,
          status: 'LOST',
          lossReason: 'inquiry_only',
          createdAt: r.date,
          closedAt: r.date,
          legacyKey,
          importTag: tag,
          notes: mergeNotes(r.notes, 'صفٌّ بلا سعر — استفسار لم يُبَع'),
        },
      });
      leads += 1;
      summary.leads += 1;
      continue;
    }

    await db.project.create({
      data: {
        code: await nextProjectCode(r.date),
        title: `${r.service || 'ترجمة'} — ${r.name}`,
        status: 'collected',
        serviceLine: mapService(r.service),
        pages: r.pages,
        netTotal: r.amount,
        collectedAmount: r.amount,
        currency: r.currency,
        branch: r.branch,
        ownerId,
        clientId: client.id,
        createdAt: r.date,
        convertedAt: r.date,
        deliveredAt: r.date,
        collectedAt: r.date,
        closedAt: r.date,
        revenueMonth: day.slice(0, 7),
        // عمود «الالتزام بالموعد» مقامُ مؤشر §١٧ — ومن أخفق فيه يُعدّ إعادة
        isRework: !r.onDeadline || r.hadProblem,
        legacyKey,
        importTag: tag,
        description: r.notes,
      },
    });
    projects += 1;
    summary.projects += 1;
    summary.amount += r.amount;
  }

  return {
    rows: read,
    clients: [...clients.values()].filter((c) => c.created).length,
    projects,
    leads,
    review,
    skipped,
    years: [...summaries.values()].sort((a, b) => a.year - b.year),
    problems: [...problems.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    unmatchedAdmins: [...unmatchedAdmins],
    unmatchedBranches: [...unmatchedBranches],
  };
}
