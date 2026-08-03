import 'server-only';
import { MutationError } from './base';
import { db } from '@/lib/db';
import { can, type SessionUser } from '@/lib/auth';
import { str } from '@/lib/utils';
import { auditEvent } from '@/lib/audit';
import { normalizeUrl } from '@/lib/quote-design';
import { designQuote, fetchClientSite } from '@/lib/quote-design-engine';

/**
 * العرض المصمَّم بالذكاء الاصطناعي.
 *
 * **طريقان لا طريق واحد:** العرض القياسي المبني على القالب يبقى كما هو —
 * سريع ومضمون ويعمل بلا مفتاح ذكاء. وإلى جانبه هذا الطريق: يقرأ موقع
 * العميل، ويصوغ محتوى يناسب طبيعة عمله، ويصمّم مستندًا بهوية المكتب.
 *
 * والمصمَّم **لا يستبدل القياسي**: كلاهما محفوظ، والموظف يرسل أيّهما شاء.
 */

/** يقرأ موقع العميل ويحفظ الموجز — خطوة تسبق التصميم وتُراجَع قبله */
export async function readClientSite(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canUseAi')) throw new MutationError('المساعد الذكي غير متاح لدورك');
  if (!id) throw new MutationError('معرّف عرض السعر مفقود');

  const quote = await db.quote.findUnique({ where: { id } });
  if (!quote) throw new MutationError('عرض السعر غير موجود');

  const url = normalizeUrl(str(fd, 'clientWebsite'));
  if (!url) throw new MutationError('اكتب رابط موقع العميل — مثال: fasttrans.net');

  const result = await fetchClientSite(url);
  if (!result.ok) {
    // نحفظ الرابط رغم الفشل: الموظف قد يصحّحه، وقد يصمّم بلا موجز
    await db.quote.update({ where: { id }, data: { clientWebsite: url } });
    throw new MutationError(`تعذّرت قراءة الموقع: ${result.error} — يمكنك التصميم بلا موجز`);
  }

  await db.quote.update({
    where: { id },
    data: { clientWebsite: url, clientBrief: result.brief },
  });
  return `/quotes/${id}/design`;
}

/** التوليد نفسه */
export async function designQuoteDocument(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canUseAi')) throw new MutationError('المساعد الذكي غير متاح لدورك');
  if (!can(user, 'canViewSellPrice')) throw new MutationError('تصميم العروض لمن يرى سعر البيع');
  if (!id) throw new MutationError('معرّف عرض السعر مفقود');

  const instruction = str(fd, 'instruction');
  const result = await designQuote({ quoteId: id, userId: user.id, instruction });
  if (!result.ok) throw new MutationError(result.error);

  await auditEvent(user.id, 'update', 'Quote', id, 'تصميم العرض بالذكاء الاصطناعي');
  return `/quotes/${id}/designed`;
}

/** حذف التصميم — يعود العرض إلى القالب القياسي وحده */
export async function clearQuoteDesign(_fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canViewSellPrice')) throw new MutationError('لا صلاحية');
  if (!id) throw new MutationError('معرّف عرض السعر مفقود');

  await db.quote.update({
    where: { id },
    data: { designHtml: null, designedAt: null, designModel: null },
  });
  await auditEvent(user.id, 'delete', 'Quote', id, 'حذف التصميم المولَّد');
  return `/quotes/${id}`;
}
