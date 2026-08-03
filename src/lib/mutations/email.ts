import 'server-only';
import { MutationError } from './base';
import { db } from '@/lib/db';
import { can, type SessionUser } from '@/lib/auth';
import { str, num } from '@/lib/utils';
import { auditEvent, auditDiff } from '@/lib/audit';
import { encryptSecret, encryptionReady } from '@/lib/crypto';
import { canSeeMailbox, isValidAddress, normalizeAddress } from '@/lib/email';
import {
  analyzeMessage,
  draftReply,
  sendNew,
  sendReply,
  syncAllMailboxes,
  syncMailbox,
  testMailbox,
} from '@/lib/email-engine';
import { REPLY_TONES, type ReplyTone } from '@/lib/ai';

/**
 * بريد النظام.
 *
 * القرار الملزم هنا: **لا يُرسل ردّ من تلقاء النظام.** النموذج يقترح، والموظف
 * يقرأ ويعدّل ثم يضغط إرسال. الرسالة الصادرة باسم المكتب التزامٌ عليه، ولا
 * يجوز أن يُلزمه ما لم يقرأه إنسان.
 */

/** يتحقق أن هذا الصندوق مرئي لهذا المستخدم قبل أي عملية عليه */
async function reachableMailbox(mailboxId: string, user: SessionUser) {
  const mailbox = await db.mailbox.findUnique({ where: { id: mailboxId } });
  if (!mailbox) throw new MutationError('الصندوق غير موجود');
  const allowed = canSeeMailbox({
    mailboxOwnerId: mailbox.ownerId,
    userId: user.id,
    canViewAll: can(user, 'canViewAllLeads'),
  });
  if (!allowed) throw new MutationError('هذا الصندوق ليس لك');
  return mailbox;
}

/** الرسالة مرئية بقدر ما صندوقها مرئي — لا نفحص الرسالة وحدها */
async function reachableMessage(messageId: string, user: SessionUser) {
  const message = await db.emailMessage.findUnique({ where: { id: messageId } });
  if (!message) throw new MutationError('الرسالة غير موجودة');
  await reachableMailbox(message.mailboxId, user);
  return message;
}

/**
 * إضافة صندوق أو تعديله.
 *
 * كلمة المرور تُعمّى ولا تُقرأ في أي شاشة، وتُترك فارغةً عند التعديل لتبقى
 * كما هي: لو أفرغها التعديل لانقطع الصندوق بلا أن يقصد أحد.
 */
export async function saveMailbox(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageSettings')) throw new MutationError('إعداد صناديق البريد للإدارة');
  if (!encryptionReady()) {
    throw new MutationError('يلزم ضبط SECRET_KEY (أو AUTH_SECRET) قبل حفظ أسرار البريد');
  }

  const address = normalizeAddress(str(fd, 'address') ?? '');
  if (!isValidAddress(address)) throw new MutationError('عنوان الصندوق غير صحيح');

  const label = str(fd, 'label');
  const imapHost = str(fd, 'imapHost');
  const smtpHost = str(fd, 'smtpHost');
  if (!label) throw new MutationError('اسم الصندوق مطلوب');
  if (!imapHost) throw new MutationError('خادم الوارد (IMAP) مطلوب');
  if (!smtpHost) throw new MutationError('خادم الصادر (SMTP) مطلوب');

  const data = {
    label,
    address,
    // فارغًا = صندوق مشترك يراه كل من يملك صلاحية البريد
    ownerId: str(fd, 'ownerId'),
    imapHost,
    imapPort: Math.round(num(fd, 'imapPort') ?? 993),
    imapSecure: fd.get('imapSecure') === 'on',
    smtpHost,
    smtpPort: Math.round(num(fd, 'smtpPort') ?? 465),
    smtpSecure: fd.get('smtpSecure') === 'on',
    username: str(fd, 'username') ?? address,
    folder: str(fd, 'folder') ?? 'INBOX',
    fromName: str(fd, 'fromName'),
    signature: str(fd, 'signature'),
    active: fd.get('active') !== 'off',
  };

  const secret = str(fd, 'secret');

  if (!id) {
    if (!secret) throw new MutationError('كلمة مرور التطبيق مطلوبة');
    const created = await db.mailbox.create({
      data: { ...data, secret: encryptSecret(secret) },
    });
    await auditEvent(user.id, 'create', 'Mailbox', created.id, label);
    return `/settings/mailboxes/${created.id}`;
  }

  const existing = await db.mailbox.findUnique({ where: { id } });
  if (!existing) throw new MutationError('الصندوق غير موجود');

  await db.mailbox.update({
    where: { id },
    data: secret ? { ...data, secret: encryptSecret(secret) } : data,
  });
  // السرّ لا يدخل سجلّ التدقيق — السجلّ يُقرأ من الشاشة
  await auditDiff(user.id, 'Mailbox', id, existing, data);
  return `/settings/mailboxes/${id}`;
}

/** فحص الاتصال بالصندوق — يُخزَّن ناتجه في `lastError` ليُقرأ من الشاشة */
export async function checkMailbox(_fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canManageSettings')) throw new MutationError('لا صلاحية');
  if (!id) throw new MutationError('معرّف الصندوق مفقود');

  const mailbox = await db.mailbox.findUnique({ where: { id } });
  if (!mailbox) throw new MutationError('الصندوق غير موجود');

  const result = await testMailbox(mailbox);
  await db.mailbox.update({
    where: { id },
    data: { lastError: result.ok ? null : (result.error ?? 'تعذّر الاتصال').slice(0, 500) },
  });
  if (!result.ok) throw new MutationError(`تعذّر الاتصال: ${result.error}`);
  return `/settings/mailboxes/${id}?ok=1`;
}

/** سحب الجديد — صندوقًا بعينه أو كل الصناديق النشطة */
export async function syncEmail(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canUseEmail')) throw new MutationError('لا صلاحية للبريد');
  const analyze = fd.get('analyze') !== 'off';

  if (id) {
    await reachableMailbox(id, user);
    const result = await syncMailbox(id, analyze);
    if (result.error) throw new MutationError(result.error);
    return `/email?synced=${result.saved}`;
  }

  const results = await syncAllMailboxes(analyze);
  const saved = results.reduce((sum, r) => sum + r.saved, 0);
  const failed = results.filter((r) => r.error);
  if (failed.length && !saved) {
    throw new MutationError(`تعذّرت المزامنة: ${failed.map((f) => `${f.mailbox} — ${f.error}`).join(' · ')}`);
  }
  return `/email?synced=${saved}`;
}

/** إعادة تحليل رسالة — بعد تصحيح ربطها مثلًا */
export async function analyzeEmail(_fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canUseAi')) throw new MutationError('التحليل الذكي غير متاح لدورك');
  if (!id) throw new MutationError('معرّف الرسالة مفقود');
  await reachableMessage(id, user);

  const done = await analyzeMessage(id, user.id);
  if (!done) throw new MutationError('تعذّر التحليل — راجع مفتاح الذكاء الاصطناعي وحدّ الإنفاق');
  return `/email/${id}`;
}

/** صياغة مسوّدة رد — تُحفظ في الحقل ولا تُرسل */
export async function suggestReply(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canUseAi')) throw new MutationError('المساعد الذكي غير متاح لدورك');
  if (!id) throw new MutationError('معرّف الرسالة مفقود');
  await reachableMessage(id, user);

  const tone = (str(fd, 'tone') ?? 'formal') as ReplyTone;
  if (!(tone in REPLY_TONES)) throw new MutationError('نبرة غير معروفة');

  const result = await draftReply({
    messageId: id,
    tone,
    instruction: str(fd, 'instruction'),
    userId: user.id,
  });
  if (!result.ok) throw new MutationError(result.error);

  await db.emailMessage.update({ where: { id }, data: { suggestedReply: result.text } });
  return `/email/${id}#reply`;
}

/** إرسال الرد فعلًا — بنصّه كما قرأه الموظف */
export async function sendEmailReply(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canUseEmail')) throw new MutationError('لا صلاحية للبريد');
  if (!id) throw new MutationError('معرّف الرسالة مفقود');
  await reachableMessage(id, user);

  const body = str(fd, 'body');
  if (!body) throw new MutationError('نص الرد فارغ');

  const result = await sendReply({ messageId: id, body, userId: user.id, cc: str(fd, 'cc') });
  if (!result.ok) throw new MutationError(result.error);

  await auditEvent(user.id, 'create', 'EmailMessage', result.id, 'إرسال رد');
  return `/email/${id}`;
}

/** رسالة جديدة من صندوق مختار */
export async function composeEmail(fd: FormData, user: SessionUser) {
  if (!can(user, 'canUseEmail')) throw new MutationError('لا صلاحية للبريد');

  const mailboxId = str(fd, 'mailboxId');
  if (!mailboxId) throw new MutationError('اختر الصندوق المُرسِل');
  await reachableMailbox(mailboxId, user);

  const to = str(fd, 'to');
  const subject = str(fd, 'subject');
  const body = str(fd, 'body');
  if (!to) throw new MutationError('عنوان المستقبِل مطلوب');
  if (!subject) throw new MutationError('موضوع الرسالة مطلوب');
  if (!body) throw new MutationError('نص الرسالة فارغ');

  const result = await sendNew({
    mailboxId,
    to,
    subject,
    body,
    userId: user.id,
    leadId: str(fd, 'leadId'),
    clientId: str(fd, 'clientId'),
    projectId: str(fd, 'projectId'),
  });
  if (!result.ok) throw new MutationError(result.error);

  await auditEvent(user.id, 'create', 'EmailMessage', result.id, `رسالة إلى ${to}`);
  return `/email/${result.id}`;
}

/**
 * تصحيح ربط الرسالة وتعليمها معالَجة.
 *
 * الربط الآلي يخطئ حين يراسلنا موظف عميلٍ من بريده الشخصي، فيبقى التصحيح
 * اليدوي بابًا مفتوحًا بدل أن تُترك الرسالة معلّقة.
 */
export async function linkEmail(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canUseEmail')) throw new MutationError('لا صلاحية للبريد');
  if (!id) throw new MutationError('معرّف الرسالة مفقود');
  const message = await reachableMessage(id, user);

  const handled = fd.get('handled');
  const data = {
    leadId: str(fd, 'leadId'),
    clientId: str(fd, 'clientId'),
    companyId: str(fd, 'companyId'),
    projectId: str(fd, 'projectId'),
    intent: str(fd, 'intent') ?? message.intent,
    ...(handled === null
      ? {}
      : handled === 'on'
        ? { handledAt: message.handledAt ?? new Date(), handledById: user.id }
        : { handledAt: null, handledById: null }),
  };

  await db.emailMessage.update({ where: { id }, data });
  await auditDiff(user.id, 'EmailMessage', id, message, data);
  return `/email/${id}`;
}
