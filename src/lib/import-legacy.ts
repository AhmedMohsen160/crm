import 'server-only';
import { db } from './db';
import { normalizePhone } from './phone';
import { findOrCreateClient } from './clients';
import type { SessionUser } from './auth';
import { nextLeadCode, nextProjectCode } from './sequence';
import {
  parseSheetDate,
  fixMarch2026Flip,
  parseSheetAmount,
  mapChannel,
  mapContactMethod,
  mapBranch,
  matchAdmin,
  isLostInquiry,
  isConverted,
  mergeNotes,
} from './migration';

/**
 * ترحيل ملفَّي الليدز والمبيعات القديمين (§١٤).
 *
 * **لا تحذف ولا تخمّن.** كل صف إما يدخل النظام كاملًا، أو يذهب إلى
 * `MigrationReview` بسبب مكتوب يقرأه إنسان. ولا صف يُهمَل صامتًا.
 *
 * وكل تشغيل **آمن التكرار**: الهاتف المطبَّع مفتاح العميل، والمفتاح
 * `legacyKey` يمنع تكرار الليد أو المشروع نفسه.
 */

export type ImportSummary = {
  total: number;
  clients: number;
  leads: number;
  projects: number;
  lostLeads: number;
  skipped: number;
  review: number;
  warnings: number;
};

const empty = (): ImportSummary => ({
  total: 0,
  clients: 0,
  leads: 0,
  projects: 0,
  lostLeads: 0,
  skipped: 0,
  review: 0,
  warnings: 0,
});

/** يفصل صفًّا: تبويب أولًا (لصق من إكسل)، وإلا فاصلة */
function cells(line: string): string[] {
  return (line.includes('\t') ? line.split('\t') : line.split(',')).map((c) => c.trim());
}

async function toReview(source: string, rowNo: number, raw: string, reason: string) {
  await db.migrationReview.create({ data: { source, rowNo, raw: raw.slice(0, 2000), reason } });
}

/**
 * ملف «New lead tracking» — سجل الليدز المرصود.
 *
 * الأعمدة: التاريخ · اسم العميل · رقم الهاتف · القناة · طريقة التواصل ·
 * **أدمن المبيعات** · تم التحويل؟ · المبلغ المحصل · الفرع · سبب الرفض.
 *
 * و**أدمن المبيعات يصير مالك الليد في النظام** — وهو ما طلبته الإدارة
 * صراحةً، وعليه يقوم نطاق الرؤية وحساب النسب.
 */
export async function importLeadSheet(
  rows: string[],
  options: { defaultBranch?: string | null; fixMarchFlip?: boolean; actor: SessionUser }
): Promise<ImportSummary> {
  const SOURCE = 'leads';
  const summary = empty();
  const users = await db.user.findMany({
    where: { active: true },
    select: { id: true, name: true },
  });

  for (const [index, line] of rows.entries()) {
    const rowNo = index + 1;
    if (!line.trim()) continue;
    summary.total += 1;

    const c = cells(line);
    const [rawDate, rawName, rawPhone, rawChannel, rawContact, rawAdmin, rawConverted, rawAmount, rawBranch, , rawReason] = c;

    // رأس الجدول يُستبعد بلا ضجيج
    if (/التاريخ|^#$|^date$/i.test(rawDate ?? '')) {
      summary.skipped += 1;
      continue;
    }

    const phone = normalizePhone(rawPhone ?? '');
    if (!phone.ok) {
      await toReview('leads', rowNo, line, `هاتف غير صالح: ${rawPhone ?? '(فارغ)'} — ${phone.reason ?? ''}`);
      summary.review += 1;
      continue;
    }

    const parsedDate = parseSheetDate(rawDate);
    if (!parsedDate.date) {
      await toReview('leads', rowNo, line, parsedDate.problem ?? 'تاريخ غير مفهوم');
      summary.review += 1;
      continue;
    }
    const flip = fixMarch2026Flip(parsedDate.date, { enabled: options.fixMarchFlip ?? false });

    // الحكم على «المستقبلي» بعد التصحيح لا قبله: صف مارس المقلوب يبدو
    // مستقبليًا حتى يُقلب، فرفضه في القراءة يمنعه من بلوغ قاعدته
    if (parsedDate.future && flip.date > new Date(Date.now() + 7 * 86_400_000)) {
      await toReview(SOURCE, rowNo, line, `تاريخ في المستقبل: ${rawDate} — يُراجَع`);
      summary.review += 1;
      continue;
    }

    const owner = matchAdmin(rawAdmin, users);
    if (rawAdmin?.trim() && !owner) {
      // لا نُسنده لأحد بالتخمين — يدخل بلا مالك ويُعلَّم
      summary.warnings += 1;
    }

    const amount = parseSheetAmount(rawAmount);
    const converted = isConverted(rawConverted, amount.amount);
    const branch = mapBranch(rawBranch) ?? options.defaultBranch ?? null;
    const channel = mapChannel(rawChannel);
    const contactMethod = mapContactMethod(rawContact);

    const notes = mergeNotes(
      `مُرحَّل من سجل الليدز (صف ${rowNo})`,
      parsedDate.corrected,
      flip.corrected,
      amount.corrected,
      !channel && rawChannel?.trim() ? `قناة غير معروفة في المصدر: ${rawChannel}` : null,
      !contactMethod && rawContact?.trim() ? `وسيلة تواصل غير معروفة: ${rawContact}` : null,
      rawAdmin?.trim() && !owner ? `أدمن غير مطابَق: ${rawAdmin}` : null,
      amount.currency !== 'EGP' ? `العملة ${amount.currency}` : null,
      rawReason?.trim() ? `سبب الرفض في المصدر: ${rawReason.trim()}` : null
    );

    const legacyKey = `lead:${phone.value}:${flip.date.toISOString().slice(0, 10)}`;
    const existing = await db.lead.findFirst({ where: { legacyKey } });
    if (existing) {
      summary.skipped += 1;
      continue;
    }

    // العميل يُنشأ أو يُعاد استخدامه بالهاتف المطبَّع — ومعه كوده CL-#####
    // كل عميل يحصل على كوده CL-##### لحظة إنشائه — قرار الإدارة
    const client = await findOrCreateClient(
      { phone: rawPhone ?? '', name: rawName?.trim() || `عميل ${phone.value.slice(-4)}` },
      { ...options.actor, branch: branch ?? options.actor.branch }
    );
    if (client.created) summary.clients += 1;

    const lead = await db.lead.create({
      data: {
        code: await nextLeadCode(flip.date),
        firstName: rawName?.trim() || `عميل ${phone.value.slice(-4)}`,
        phone: rawPhone ?? '',
        channel,
        contactMethod,
        branch,
        // **أدمن المبيعات يصير المالك** — قرار الإدارة
        ownerId: owner?.id ?? null,
        clientId: client.id,
        status: converted ? 'WON' : 'LOST',
        lossReason: converted ? null : mapLossReason(rawReason),
        createdAt: flip.date,
        firstReplyAt: flip.date,
        closedAt: flip.date,
        convertedAt: converted ? flip.date : null,
        legacyKey,
        notes,
      },
    });
    summary.leads += 1;

    // §١٤: الصف بلا سعر **استفسار خاسر لا مشروع**
    if (!converted || isLostInquiry(amount.amount)) {
      summary.lostLeads += 1;
      continue;
    }

    await db.project.create({
      data: {
        code: await nextProjectCode(flip.date),
        title: `${rawName?.trim() || 'عميل'} — ${flip.date.toISOString().slice(0, 10)}`,
        status: 'collected',
        netTotal: amount.amount ?? 0,
        collectedAmount: amount.amount ?? 0,
        currency: amount.currency,
        branch,
        ownerId: owner?.id ?? null,
        clientId: client.id,
        leadId: lead.id,
        createdAt: flip.date,
        convertedAt: flip.date,
        deliveredAt: flip.date,
        collectedAt: flip.date,
        closedAt: flip.date,
        revenueMonth: flip.date.toISOString().slice(0, 7),
        legacyKey,
        description: notes,
      },
    });
    summary.projects += 1;
  }

  return summary;
}

/** أسباب الرفض في الملف نصّ حر — نطابق ما نعرفه ونحفظ الأصل كاملًا */
function mapLossReason(raw: string | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  if (/لم يتم الرد|لا يرد|اختفى|مش بيرد/.test(text)) return 'no_reply';
  if (/سعر|السعر|غالي|عالى|عالي/.test(text)) return 'price';
  if (/مسافه|مسافة|بعد/.test(text)) return 'distance';
  if (/مستعجل|الوقت|نفس اليوم/.test(text)) return 'timeline';
  if (/استفسار|يعتقد|ليس مكتب/.test(text)) return 'inquiry_only';
  if (/لغة|اليونان/.test(text)) return 'language';
  return 'other';
}

/**
 * ملف «Sales System» — المبيعات المحوَّلة فعلًا.
 *
 * الأعمدة: Date · Client Name · Phone · Platform · Translation Type ·
 * Requested Services · Pages · Funnel · branch · Sales Admin ·
 * **price collected** · Country · On deadline.
 *
 * و**كل عميل يحصل على كوده** `CL-#####` عند إنشائه — وهو ما طلبته الإدارة.
 */
export async function importSalesSheet(
  rows: string[],
  options: { defaultBranch?: string | null; fixMarchFlip?: boolean; actor: SessionUser }
): Promise<ImportSummary> {
  const SOURCE = 'sales';
  const summary = empty();
  const users = await db.user.findMany({
    where: { active: true },
    select: { id: true, name: true },
  });

  for (const [index, line] of rows.entries()) {
    const rowNo = index + 1;
    if (!line.trim()) continue;
    summary.total += 1;

    const c = cells(line);
    const [rawDate, rawName, rawPhone, rawContact, , rawService, rawPages, rawFunnel, rawBranch, rawAdmin, rawPrice, , rawOnTime] = c;

    if (/^date$/i.test(rawDate ?? '') || /client name/i.test(rawName ?? '')) {
      summary.skipped += 1;
      continue;
    }

    const phone = normalizePhone(rawPhone ?? '');
    if (!phone.ok) {
      await toReview('sales', rowNo, line, `هاتف غير صالح: ${rawPhone ?? '(فارغ)'} — ${phone.reason ?? ''}`);
      summary.review += 1;
      continue;
    }

    const parsedDate = parseSheetDate(rawDate);
    if (!parsedDate.date) {
      await toReview('sales', rowNo, line, parsedDate.problem ?? 'تاريخ غير مفهوم');
      summary.review += 1;
      continue;
    }
    const flip = fixMarch2026Flip(parsedDate.date, { enabled: options.fixMarchFlip ?? false });

    // الحكم على «المستقبلي» بعد التصحيح لا قبله: صف مارس المقلوب يبدو
    // مستقبليًا حتى يُقلب، فرفضه في القراءة يمنعه من بلوغ قاعدته
    if (parsedDate.future && flip.date > new Date(Date.now() + 7 * 86_400_000)) {
      await toReview(SOURCE, rowNo, line, `تاريخ في المستقبل: ${rawDate} — يُراجَع`);
      summary.review += 1;
      continue;
    }

    const owner = matchAdmin(rawAdmin, users);
    if (rawAdmin?.trim() && !owner) summary.warnings += 1;

    const amount = parseSheetAmount(rawPrice);
    const branch = mapBranch(rawBranch) ?? options.defaultBranch ?? null;
    const channel = mapChannel(rawFunnel);
    const contactMethod = mapContactMethod(rawContact);
    const pages = Number(rawPages);

    const notes = mergeNotes(
      `مُرحَّل من ملف المبيعات (صف ${rowNo})`,
      parsedDate.corrected,
      flip.corrected,
      amount.corrected,
      rawService?.trim() ? `الخدمة في المصدر: ${rawService}` : null,
      !channel && rawFunnel?.trim() ? `قناة غير معروفة: ${rawFunnel}` : null,
      rawAdmin?.trim() && !owner ? `أدمن غير مطابَق: ${rawAdmin}` : null,
      amount.currency !== 'EGP' ? `العملة ${amount.currency}` : null
    );

    const legacyKey = `sale:${phone.value}:${flip.date.toISOString().slice(0, 10)}:${amount.amount ?? 0}`;
    if (await db.project.findFirst({ where: { legacyKey } })) {
      summary.skipped += 1;
      continue;
    }
    if (await db.lead.findFirst({ where: { legacyKey } })) {
      summary.skipped += 1;
      continue;
    }

    // كل عميل يحصل على كوده CL-##### لحظة إنشائه — قرار الإدارة
    const client = await findOrCreateClient(
      { phone: rawPhone ?? '', name: rawName?.trim() || `عميل ${phone.value.slice(-4)}` },
      { ...options.actor, branch: branch ?? options.actor.branch }
    );
    if (client.created) summary.clients += 1;

    // §١٤: «١٥٩ صفًا استفسارات خاسرة مختلطة بالطلبات — تُميَّز بأن السعر
    // فارغ — حوّلها إلى ليدز خاسرة لا مشاريع». وفي هذا الملف ٥١٦ صفًا.
    if (isLostInquiry(amount.amount)) {
      await db.lead.create({
        data: {
          code: await nextLeadCode(flip.date),
          firstName: rawName?.trim() || `عميل ${phone.value.slice(-4)}`,
          phone: rawPhone ?? '',
          channel,
          contactMethod,
          branch,
          ownerId: owner?.id ?? null,
          clientId: client.id,
          status: 'LOST',
          lossReason: 'inquiry_only',
          createdAt: flip.date,
          closedAt: flip.date,
          legacyKey,
          notes: mergeNotes(notes, 'صف بلا سعر في ملف المبيعات — استفسار لم يُبَع'),
        },
      });
      summary.leads += 1;
      summary.lostLeads += 1;
      continue;
    }

    await db.project.create({
      data: {
        code: await nextProjectCode(flip.date),
        title: `${rawService?.trim() || 'ترجمة'} — ${rawName?.trim() || 'عميل'}`,
        status: 'collected',
        serviceLine: mapService(rawService),
        pages: Number.isFinite(pages) && pages > 0 ? pages : null,
        netTotal: amount.amount ?? 0,
        collectedAmount: amount.amount ?? 0,
        currency: amount.currency,
        branch,
        ownerId: owner?.id ?? null,
        clientId: client.id,
        createdAt: flip.date,
        convertedAt: flip.date,
        deliveredAt: flip.date,
        collectedAt: flip.date,
        closedAt: flip.date,
        revenueMonth: flip.date.toISOString().slice(0, 7),
        // العمود يحمل «التزام بالموعد» — يُحفظ لأنه مقام مؤشر §١٧ بند ١٧
        isRework: String(rawOnTime).trim().toLowerCase() === 'false',
        legacyKey,
        description: notes,
      },
    });
    summary.projects += 1;
  }

  return summary;
}

/** الخدمة في الملف نصّ إنجليزي حر — نطابق ما نعرفه ولا نخترع خط خدمة */
function mapService(raw: string | undefined): string | null {
  const text = (raw ?? '').toLowerCase().trim();
  if (!text) return null;
  if (/cerificate|certificate|id|passport|criminal|record|marriage|family/.test(text)) return 'certified';
  if (/contract|declaration|power of attorney|acknowledgment/.test(text)) return 'legal';
  if (/medical|bulletin/.test(text)) return 'medical';
  if (/commercial register|invoice/.test(text)) return 'financial';
  if (/engineering|technical/.test(text)) return 'technical';
  if (/essay|dessertation|dissertation|reseach|research|book|booklet/.test(text)) return 'academic';
  if (/brochure|video|cv/.test(text)) return 'marketing';
  return 'general';
}
