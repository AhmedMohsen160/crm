import 'server-only';
import { db } from './db';
import { callAi } from './ai-client';
import { UNITS } from './constants';
import {
  briefFromHtml,
  briefToText,
  designSystemPrompt,
  designUserPrompt,
  looksLikeDocument,
  normalizeUrl,
  sanitizeHtml,
  MAX_DESIGN_CHARS,
  type DesignInput,
} from './quote-design';

/**
 * توليد عرض السعر المصمَّم.
 *
 * الجلب من موقع العميل والنداء على النموذج — كلاهما أثر خارجي، فمكانهما هنا
 * لا في `quote-design.ts` الذي يحمل القواعد ويُختبر بلا شبكة.
 */

/** أطول ما نقرأه من صفحة العميل — الباقي حشو صفحات وقوائم */
const MAX_FETCH_BYTES = 400_000;
const FETCH_TIMEOUT_MS = 12_000;

export type FetchResult =
  | { ok: true; brief: string }
  | { ok: false; error: string };

/**
 * يقرأ موقع العميل.
 *
 * الفشل هنا **لا يوقف التصميم**: موقع لا يفتح أو يحجب الآلات أمرٌ شائع،
 * والعرض يُصمَّم بلا موجز عندها. ولذلك يعيد نتيجةً ولا يرمي استثناءً.
 */
export async function fetchClientSite(rawUrl: string): Promise<FetchResult> {
  const url = normalizeUrl(rawUrl);
  if (!url) return { ok: false, error: 'رابط الموقع غير صحيح' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // بعض المواقع تردّ صفحةً فارغة لمن لا يعرّف نفسه
        'user-agent': 'Mozilla/5.0 (compatible; FastTransCRM/1.0)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!response.ok) return { ok: false, error: `الموقع ردّ بالرمز ${response.status}` };

    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('html')) return { ok: false, error: 'العنوان لا يعيد صفحة HTML' };

    const raw = await response.text();
    const brief = briefFromHtml(url, raw.slice(0, MAX_FETCH_BYTES));
    return { ok: true, brief: briefToText(brief) };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'تأخّر الموقع في الرد'
        : error instanceof Error
          ? error.message
          : 'تعذّر الوصول للموقع';
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/** يبني مدخلات التصميم من عرض محفوظ — بلا رقم يُخترع */
async function designInputFor(quoteId: string, instruction: string | null): Promise<DesignInput | null> {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      company: { select: { name: true } },
      contact: { select: { firstName: true, lastName: true } },
      owner: { select: { name: true, email: true } },
      project: { select: { title: true, client: { select: { name: true } } } },
    },
  });
  if (!quote) return null;

  const clientName =
    quote.company?.name ??
    quote.project?.client?.name ??
    (quote.contact ? `${quote.contact.firstName} ${quote.contact.lastName ?? ''}`.trim() : null);

  return {
    number: quote.number,
    title: quote.title,
    currency: quote.currency,
    clientName,
    contactName: quote.contact
      ? `${quote.contact.firstName} ${quote.contact.lastName ?? ''}`.trim()
      : null,
    validUntil: quote.validUntil ? quote.validUntil.toISOString().slice(0, 10) : null,
    items: quote.items.map((it) => ({
      description: it.description,
      serviceType: it.serviceType,
      sourceLang: it.sourceLang,
      targetLang: it.targetLang,
      unit: UNITS[it.unit as keyof typeof UNITS] ?? it.unit,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      lineTotal: it.lineTotal,
    })),
    subtotal: quote.subtotal,
    discount: quote.discount,
    discountLabel: quote.discountMode === 'percent' ? `${quote.discountPct}%` : null,
    taxRate: quote.taxRate,
    taxAmount: quote.taxAmount,
    total: quote.total,
    terms: quote.terms,
    notes: quote.notes,
    ownerName: quote.owner?.name ?? 'فريق فاست ترانس',
    ownerEmail: quote.owner?.email ?? null,
    brief: quote.clientBrief,
    instruction,
  };
}

export type DesignResult = { ok: true } | { ok: false; error: string };

/**
 * يولّد المستند ويحفظه.
 *
 * المولَّد **يُعقَّم قبل الحفظ لا قبل العرض**: لو عُقِّم عند العرض وحده لبقي
 * الخام في القاعدة، وأول شاشة تنساه تعرضه كما جاء.
 */
export async function designQuote(params: {
  quoteId: string;
  userId: string;
  instruction: string | null;
}): Promise<DesignResult> {
  const input = await designInputFor(params.quoteId, params.instruction);
  if (!input) return { ok: false, error: 'عرض السعر غير موجود' };
  if (!input.items.length) return { ok: false, error: 'أضف بندًا واحدًا على الأقل قبل التصميم' };

  const result = await callAi({
    purpose: 'quote.design',
    userId: params.userId,
    system: designSystemPrompt(),
    // المستند كامل الصفحة — سقفه أعلى من سقف الرد النصّي
    maxTokens: 8_000,
    timeoutMs: 180_000,
    messages: [{ role: 'user', content: designUserPrompt(input) }],
  });

  if (!result.ok) return { ok: false, error: result.error };

  const html = sanitizeHtml(result.text).slice(0, MAX_DESIGN_CHARS);
  if (!looksLikeDocument(html)) {
    return { ok: false, error: 'ما أعاده النموذج ليس مستندًا صالحًا — أعد المحاولة بتوجيه أوضح' };
  }

  await db.quote.update({
    where: { id: params.quoteId },
    data: {
      designHtml: html,
      designPrompt: params.instruction,
      designedAt: new Date(),
      designModel: result.model,
    },
  });

  return { ok: true };
}
