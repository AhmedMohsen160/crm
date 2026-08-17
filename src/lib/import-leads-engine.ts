import 'server-only';
import { db } from './db';
import { readWorkbook, type CellValue } from './xlsx';
import {
  findLeadsHeader,
  leadsTag,
  yesNo,
  leadStatusOf,
  parseLeadAmount,
  lossReasonOf,
  leadNameOf,
} from './import-leads';
import { parseSheetDate, mapChannel, mapContactMethod, mapBranch, matchAdmin } from './migration';
import { normalizePhone } from './phone';
import { nextLeadCode } from './sequence';

/**
 * ترحيل شيت الليدز — ما يكتب في القاعدة.
 *
 * **والليد هنا سجلٌّ لما مضى لا طابورُ عملٍ مفتوح.** شيت ٢٠٢٦ فيه ألفٌ
 * وأربعمئة استفسارٍ لم يتحوّل، أقدمُها من يناير. وإدخالُها «جديدة» يملأ
 * طوابير الفريق باستفساراتٍ ميّتة ويُنبّههم عليها كل صباح — فتدخل محسومةً
 * فوزًا أو خسارة، وتاريخُ حسمها تاريخُ ورودها.
 *
 * ── وثلاث قواعد ───────────────────────────────────────────────
 *
 * ١) **المحوَّل يُربط ولا يُفتح له مشروع.** «تم التحويل = نعم» في ٧١٠ صفًّا،
 *    وهي نفسها مشترياتٌ رُصدت في شيت المبيعات وصارت مشاريع. ففتحُ مشروعٍ
 *    ثانٍ لها يضاعف الإيراد ويضاعف النسب معه.
 *
 * ٢) **والربط بالهاتف المطبَّع.** هو المفتاح نفسه الذي بُني عليه سجلّ
 *    العملاء في شيت المبيعات، فيلتقي الشيتان على عميلٍ واحد.
 *
 * ٣) **وما لا يُطابَق لا يُخمَّن.** أدمنٌ بلا مستخدم وفرعٌ بلا مفتاح
 *    يُذكران في التقرير ويدخل صفُّهما بلا هذا البُعد.
 */

export type LeadsImportSummary = {
  /** صفوف قُرئت وصفوف أُوقفت */
  rows: number;
  skipped: number;
  /** ليدز كُتبت، ومنها ما تحوّل */
  leads: number;
  won: number;
  lost: number;
  /** ليدز التصقت بعميلٍ موجود من شيت المبيعات */
  linked: number;
  /** صفوف بعد تاريخ الوقف — تُترك لدفعةٍ لاحقة */
  afterCutoff: number;
  /** السنوات التي دخلت وعدد كلٍّ */
  years: { year: number; leads: number }[];
  unmatchedAdmins: string[];
  unmatchedBranches: string[];
  problems: { reason: string; count: number }[];
};

/** يسحب وسم سنةٍ من شيت الليدز — بلا أن يمسّ ما جاء من شيت المبيعات */
export async function rollbackLeadsTag(tag: string): Promise<{ leads: number }> {
  const removed = await db.lead.deleteMany({ where: { importTag: tag } });
  return { leads: removed.count };
}

export async function importLeadsWorkbook(params: {
  buffer: Buffer;
  actorId: string;
  /** مالكُ الصفّ حين لا يُطابَق أدمنُه بمستخدم */
  defaultOwnerId: string;
  sheetName?: string;
  onlyYears?: number[];
  until?: Date;
}): Promise<LeadsImportSummary> {
  const workbook = readWorkbook(params.buffer);

  /**
   * **الورقة تُختار بترويستها لا باسمها** — والملف فيه ورقتان: «سجل
   * العملاء» وفيها الصفوف، و«الملخص الشهري» وفيها جداول إنفاقٍ وصيغ.
   */
  const candidates = params.sheetName ? [params.sheetName] : workbook.sheetNames;
  let found: { rows: CellValue[][]; header: NonNullable<ReturnType<typeof findLeadsHeader>> } | null =
    null;
  for (const name of candidates) {
    const rows = workbook.sheet(name) as CellValue[][];
    const header = findLeadsHeader(rows as unknown as (string | null | undefined)[][]);
    if (header) {
      found = { rows, header };
      break;
    }
  }
  if (!found) throw new Error('لم تُوجد ورقةٌ فيها ترويسة ليدز في هذا الملف');

  const { rows, header } = found;
  const col = header.columns;
  const cell = (row: CellValue[], at: number | undefined) => (at === undefined ? null : (row[at] ?? null));

  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true } });

  // ── ١ · القراءة والفرز قبل أي كتابة ──────────────────────────
  type Ready = {
    date: Date;
    year: number;
    name: string | null;
    rawPhone: string;
    phoneKey: string | null;
    channel: string | null;
    contactMethod: string | null;
    branch: string | null;
    ownerId: string | null;
    converted: boolean | null;
    amount: number;
    lossReason: string | null;
    followedUp: boolean | null;
    rowNo: number;
    note: string;
  };

  const ready: Ready[] = [];
  const problems = new Map<string, number>();
  const unmatchedAdmins = new Set<string>();
  const unmatchedBranches = new Set<string>();
  let read = 0;
  let skipped = 0;
  let afterCutoff = 0;

  const stop = (reason: string) => {
    skipped += 1;
    problems.set(reason, (problems.get(reason) ?? 0) + 1);
  };

  for (let i = header.row + 1; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    if (!row.some((c) => c !== null && c !== undefined && c !== '')) continue;
    read += 1;

    const parsed = parseSheetDate(cell(row, col.date));
    if (!parsed.date) {
      stop(parsed.problem ?? 'تاريخ غير مفهوم');
      continue;
    }
    const year = parsed.date.getUTCFullYear();
    if (params.onlyYears && !params.onlyYears.includes(year)) continue;
    if (params.until && parsed.date.getTime() > params.until.getTime()) {
      afterCutoff += 1;
      continue;
    }

    const rawPhone = String(cell(row, col.phone) ?? '');
    const phone = normalizePhone(rawPhone);
    const name = leadNameOf(cell(row, col.name));

    /**
     * **والصفّ بلا رقمٍ استفسارٌ وقع — لا يُردّ.**
     *
     * مئةٌ وثلاثون صفًّا كُتب في خانة هاتفها صفرٌ وحده، وفيها تاريخٌ وقناةٌ
     * وأدمنٌ وفرع. وردُّها يُسقط سبعة في المئة من الاستفسارات، **فتُنقص
     * مقام معدل التحويل وتُنقص مقام تكلفة الاكتساب** — فيبدو الإعلان أرخص
     * والفريق أنجح ممّا هما. وهي القاعدة نفسها في شيت المبيعات: الصفّ بلا
     * هاتف يُجمَّع ولا يُردّ.
     *
     * ولا يُربط بعميلٍ طبعًا — الربط بالهاتف، وبلاه يبقى استفسارًا مجهولًا
     * في عدّاد القناة وحده. **وهذا كلّ المطلوب منه.**
     */

    const rawAdmin = String(cell(row, col.admin) ?? '').trim();
    const matched = matchAdmin(rawAdmin, users);
    if (rawAdmin && !matched) unmatchedAdmins.add(rawAdmin);

    const rawBranch = String(cell(row, col.branch) ?? '').trim();
    const branch = mapBranch(rawBranch);
    if (rawBranch && !branch) unmatchedBranches.add(rawBranch);

    const notes = [
      `مُرحَّل من شيت الليدز (صف ${i + 1})`,
      parsed.corrected,
      !phone.ok && rawPhone ? `رقم غير صالح في المصدر: ${rawPhone}` : null,
      rawAdmin && !matched ? `أدمن غير مطابَق: ${rawAdmin}` : null,
      rawBranch && !branch ? `فرع غير مطابَق: ${rawBranch}` : null,
    ].filter(Boolean);

    ready.push({
      date: parsed.date,
      year,
      name,
      rawPhone,
      phoneKey: phone.ok ? phone.value : null,
      channel: mapChannel(cell(row, col.channel)),
      contactMethod: mapContactMethod(cell(row, col.contactMethod)),
      branch,
      ownerId: matched?.id ?? null,
      converted: yesNo(cell(row, col.converted)),
      amount: parseLeadAmount(cell(row, col.amount)),
      lossReason: lossReasonOf(cell(row, col.lossReason)),
      followedUp: yesNo(cell(row, col.followedUp)),
      rowNo: i + 1,
      note: notes.join(' · '),
    });
  }

  // ── ٢ · سحبُ وسوم السنوات الداخلة قبل الكتابة ────────────────
  const years = [...new Set(ready.map((r) => r.year))].sort();
  for (const year of years) await rollbackLeadsTag(leadsTag(year));

  // ── ٣ · الكتابة ──────────────────────────────────────────────
  ready.sort((a, b) => a.date.getTime() - b.date.getTime() || a.rowNo - b.rowNo);

  const counts = new Map<number, number>();
  let leads = 0;
  let won = 0;
  let lost = 0;
  let linked = 0;

  for (const r of ready) {
    const tag = leadsTag(r.year);

    /**
     * **يلتقي الشيتان على عميلٍ واحد بالهاتف المطبَّع.** فمن سأل في مايو
     * واشترى في يونيو له بطاقةٌ واحدة يُقرأ فيها الاثنان — وإلا صار في
     * السجل مرّتين: مرةً استفسارًا ومرةً عميلًا، ولا تُعرف قيمته العمرية.
     */
    let clientId: string | null = null;
    if (r.phoneKey) {
      const client = await db.client.findUnique({
        where: { phoneNormalized: r.phoneKey },
        select: { id: true },
      });
      if (client) {
        clientId = client.id;
        linked += 1;
      }
    }

    /**
     * رقمُ الصفّ في المفتاح — فصفّان بنفس الهاتف في اليوم ليدان لا ليد.
     * **وهو وحده ما يميّز الاستفسارات المجهولة** التي لا هاتف لها ولا اسم.
     */
    const legacyKey = `lead:${r.phoneKey ?? r.name ?? 'anon'}:${r.date.toISOString().slice(0, 10)}#${r.rowNo}`;
    if (await db.lead.findFirst({ where: { legacyKey }, select: { id: true } })) {
      skipped += 1;
      continue;
    }

    const status = leadStatusOf(r.converted);
    await db.lead.create({
      data: {
        code: await nextLeadCode(r.date),
        firstName:
          r.name ??
          (r.phoneKey ? `استفسار ${r.phoneKey.slice(-4)}` : `استفسار بلا رقم (صف ${r.rowNo})`),
        phone: r.rawPhone || null,
        channel: r.channel,
        contactMethod: r.contactMethod,
        branch: r.branch,
        ownerId: r.ownerId ?? params.defaultOwnerId,
        clientId,
        status,
        /**
         * **والقيمة تُحفظ للمحوَّل وحده.** «المبلغ المحصل» في صفٍّ لم
         * يتحوّل رقمٌ لم يقع، وحملُه في `estimatedValue` يُدخله كل تقدير.
         */
        estimatedValue: status === 'WON' && r.amount > 0 ? r.amount : null,
        lossReason: status === 'LOST' ? (r.lossReason ?? 'no_reason_recorded') : null,
        // تاريخُ الحسم تاريخُ وروده — الشيت سجلٌّ لما مضى لا طابورٌ مفتوح
        createdAt: r.date,
        closedAt: r.date,
        convertedAt: status === 'WON' ? r.date : null,
        legacyKey,
        importTag: tag,
        notes: [r.note, r.followedUp === true ? 'تمت المتابعة' : null]
          .filter(Boolean)
          .join(' · '),
      },
    });

    leads += 1;
    if (status === 'WON') won += 1;
    else lost += 1;
    counts.set(r.year, (counts.get(r.year) ?? 0) + 1);
  }

  return {
    rows: read,
    skipped,
    leads,
    won,
    lost,
    linked,
    afterCutoff,
    years: [...counts.entries()].map(([year, n]) => ({ year, leads: n })).sort((a, b) => a.year - b.year),
    unmatchedAdmins: [...unmatchedAdmins],
    unmatchedBranches: [...unmatchedBranches],
    problems: [...problems.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}
