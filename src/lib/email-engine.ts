import 'server-only';
import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import nodemailer from 'nodemailer';
import { db } from './db';
import { decryptSecret } from './crypto';
import { normalizePhone } from './phone';
import { callAi } from './ai-client';
import {
  analysisPrompt,
  parseAnalysis,
  replyPrompt,
  cleanText,
  SYSTEM_RULES,
  MAX_OUTPUT_TOKENS,
  type ReplyTone,
} from './ai';
import {
  EMAIL_INTENT_KEYS,
  SYNC_BATCH,
  addressDomain,
  buildReferences,
  counterpartyOf,
  extractPhones,
  guessIntent,
  guessLanguage,
  guessUrgency,
  htmlToText,
  isCorporateDomain,
  normalizeAddress,
  parseAddress,
  parseAddressList,
  quoteForReply,
  replySubject,
  stripQuoted,
  threadKey,
  truncateForAnalysis,
  withSignature,
} from './email';

/**
 * الاتصال الفعلي بصناديق البريد.
 *
 * كل ما هنا له أثر خارجي — يقرأ من خادم أو يرسل رسالة — ولذلك عُزل عن
 * `email.ts` الذي يحمل القواعد ويُختبر بلا شبكة.
 */

type MailboxRow = Awaited<ReturnType<typeof db.mailbox.findUniqueOrThrow>>;

function imapClient(mailbox: MailboxRow) {
  return new ImapFlow({
    host: mailbox.imapHost,
    port: mailbox.imapPort,
    secure: mailbox.imapSecure,
    auth: { user: mailbox.username, pass: decryptSecret(mailbox.secret) },
    logger: false,
  });
}

function smtpTransport(mailbox: MailboxRow) {
  return nodemailer.createTransport({
    host: mailbox.smtpHost,
    port: mailbox.smtpPort,
    secure: mailbox.smtpSecure,
    auth: { user: mailbox.username, pass: decryptSecret(mailbox.secret) },
  });
}

/** فحص بيانات الصندوق قبل حفظه — أفضل من اكتشاف الخطأ عند أول مزامنة */
export async function testMailbox(mailbox: MailboxRow): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = imapClient(mailbox);
    await client.connect();
    await client.logout();
    await smtpTransport(mailbox).verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'تعذّر الاتصال' };
  }
}

export type SyncResult = { fetched: number; saved: number; analyzed: number; error?: string };

/**
 * سحب الجديد من صندوق واحد.
 *
 * نسحب ما بعد `lastUid` وحده: صندوق المكتب فيه سنوات من الرسائل، وإعادة
 * تنزيله في كل مزامنة تُغرق القاعدة وتكلّف تحليلًا لا لزوم له.
 */
export async function syncMailbox(mailboxId: string, analyze = true): Promise<SyncResult> {
  const mailbox = await db.mailbox.findUnique({ where: { id: mailboxId } });
  if (!mailbox) return { fetched: 0, saved: 0, analyzed: 0, error: 'الصندوق غير موجود' };
  if (!mailbox.active) return { fetched: 0, saved: 0, analyzed: 0, error: 'الصندوق موقوف' };

  const client = imapClient(mailbox);
  let fetched = 0;
  let saved = 0;
  let analyzed = 0;
  let highestUid = mailbox.lastUid;

  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailbox.folder);
    try {
      const range = `${mailbox.lastUid + 1}:*`;
      const batch: { uid: number; raw: Buffer }[] = [];

      for await (const message of client.fetch(range, { uid: true, source: true }, { uid: true })) {
        // نطاق `n:*` يعيد آخر رسالة دائمًا حتى لو كانت أقدم من الحدّ
        if (message.uid <= mailbox.lastUid) continue;
        batch.push({ uid: message.uid, raw: message.source as Buffer });
        if (batch.length >= SYNC_BATCH) break;
      }

      fetched = batch.length;

      for (const item of batch) {
        highestUid = Math.max(highestUid, item.uid);
        const parsed = await simpleParser(item.raw);
        const stored = await storeIncoming(mailbox, item.uid, parsed);
        if (!stored) continue;
        saved += 1;
        if (analyze) {
          const done = await analyzeMessage(stored.id);
          if (done) analyzed += 1;
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();

    await db.mailbox.update({
      where: { id: mailbox.id },
      data: { lastUid: highestUid, lastSyncAt: new Date(), lastError: null },
    });
    return { fetched, saved, analyzed };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذّرت المزامنة';
    await db.mailbox.update({
      where: { id: mailbox.id },
      data: { lastSyncAt: new Date(), lastError: message.slice(0, 500) },
    });
    try {
      await client.logout();
    } catch {
      /* الاتصال ساقط أصلًا */
    }
    return { fetched, saved, analyzed, error: message };
  }
}

/** مزامنة كل الصناديق النشطة — يناديها الجدول الزمني أو زر واحد */
export async function syncAllMailboxes(analyze = true) {
  const boxes = await db.mailbox.findMany({ where: { active: true }, select: { id: true, label: true } });
  const results: (SyncResult & { mailbox: string })[] = [];
  for (const box of boxes) {
    const result = await syncMailbox(box.id, analyze);
    results.push({ ...result, mailbox: box.label });
  }
  return results;
}

/** حقول العناوين تصل كائنًا أو مصفوفة كائنات حسب الرسالة — نوحّدها نصًّا */
function addressText(field: { text?: string } | { text?: string }[] | undefined): string {
  if (!field) return '';
  if (Array.isArray(field)) return field.map((f) => f.text ?? '').filter(Boolean).join(', ');
  return field.text ?? '';
}

/** يحفظ رسالة واردة ويربطها بسجلّها — ويعيد `null` إن كانت محفوظة سلفًا */
async function storeIncoming(mailbox: MailboxRow, uid: number, parsed: ParsedMail) {
  const messageId = parsed.messageId ?? null;
  if (messageId) {
    const existing = await db.emailMessage.findUnique({ where: { messageId } });
    if (existing) return null;
  }

  const fromRaw = parsed.from?.value?.[0];
  const fromAddress = normalizeAddress(fromRaw?.address ?? '');
  if (!fromAddress) return null;

  // رسائلنا الصادرة تعود إلينا في بعض الصناديق — لا تُحسب واردًا
  if (fromAddress === normalizeAddress(mailbox.address)) return null;

  const toAddresses = parseAddressList(addressText(parsed.to));
  const bodyText = parsed.text ?? (parsed.html ? htmlToText(String(parsed.html)) : '');
  const subject = parsed.subject ?? '(بلا موضوع)';
  const clean = stripQuoted(bodyText);
  const links = await matchRecords(fromAddress, `${subject}\n${clean}`);

  const created = await db.emailMessage.create({
    data: {
      mailboxId: mailbox.id,
      direction: 'in',
      messageId,
      inReplyTo: parsed.inReplyTo ?? null,
      threadKey: threadKey(subject, fromAddress),
      uid,
      fromAddress,
      fromName: fromRaw?.name || null,
      toAddresses: toAddresses.join(', '),
      ccAddresses: parseAddressList(addressText(parsed.cc)).join(', ') || null,
      subject,
      bodyText,
      bodyHtml: parsed.html ? String(parsed.html) : null,
      cleanText: clean || bodyText.slice(0, 4_000),
      sentAt: parsed.date ?? new Date(),
      attachmentNames:
        parsed.attachments?.map((a: { filename?: string }) => a.filename ?? 'مرفق').join(', ') || null,
      intent: guessIntent(subject, clean),
      urgency: guessUrgency(subject, clean),
      language: guessLanguage(clean),
      ...links,
    },
  });
  return created;
}

/**
 * ربط الرسالة بسجلّ في النظام.
 *
 * بالعنوان أولًا لأنه الأدقّ، ثم بالهاتف المذكور في نصّها، ثم بنطاق الشركة —
 * والنطاق العام (gmail وأمثاله) لا يُربط به شيء، وإلا صار كل عملاء جيميل
 * شركة واحدة.
 */
async function matchRecords(fromAddress: string, text: string) {
  const out: {
    leadId?: string;
    clientId?: string;
    companyId?: string;
  } = {};

  const client = await db.client.findFirst({
    where: { email: { equals: fromAddress } },
    select: { id: true, companyId: true },
  });
  if (client) {
    out.clientId = client.id;
    if (client.companyId) out.companyId = client.companyId;
  }

  const lead = await db.lead.findFirst({
    where: { email: { equals: fromAddress } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, clientId: true },
  });
  if (lead) {
    out.leadId = lead.id;
    // الليد لا يحمل شركةً مباشرةً — يحملها عبر عميله إن كان قد تحوّل
    if (!out.clientId && lead.clientId) out.clientId = lead.clientId;
  }

  if (!out.clientId && !out.leadId) {
    for (const raw of extractPhones(text)) {
      const phone = normalizePhone(raw);
      if (!phone.ok) continue;
      const byPhone = await db.client.findFirst({
        where: {
          OR: [{ phoneNormalized: phone.value }, { phoneAltNormalized: phone.value }],
        },
        select: { id: true, companyId: true },
      });
      if (byPhone) {
        out.clientId = byPhone.id;
        if (!out.companyId && byPhone.companyId) out.companyId = byPhone.companyId;
        break;
      }
    }
  }

  if (!out.companyId) {
    const domain = addressDomain(fromAddress);
    if (isCorporateDomain(domain)) {
      const company = await db.company.findFirst({
        where: {
          OR: [{ email: { contains: `@${domain}` } }, { website: { contains: domain! } }],
        },
        select: { id: true },
      });
      if (company) out.companyId = company.id;
    }
  }

  return out;
}

/**
 * تحليل رسالة بالنموذج.
 *
 * التخمين النصّي مكتوب سلفًا في السجلّ، فإن تعذّر النداء بقيت الرسالة مصنَّفة
 * تصنيفًا معقولًا بدل أن تُترك بلا شيء.
 */
export async function analyzeMessage(messageId: string, userId?: string): Promise<boolean> {
  const message = await db.emailMessage.findUnique({ where: { id: messageId } });
  if (!message) return false;

  const body = truncateForAnalysis(message.cleanText || message.bodyText);
  const result = await callAi({
    purpose: 'email.analyze',
    userId: userId ?? null,
    system: SYSTEM_RULES,
    maxTokens: MAX_OUTPUT_TOKENS.analyze,
    messages: [
      {
        role: 'user',
        content: analysisPrompt({
          subject: message.subject,
          from: message.fromName ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress,
          body,
          intents: [...EMAIL_INTENT_KEYS],
        }),
      },
    ],
  });

  if (!result.ok) return false;

  const analysis = parseAnalysis(
    result.text,
    {
      intent: message.intent ?? 'inquiry',
      urgency: message.urgency ?? 'normal',
      language: message.language ?? 'ar',
    },
    [...EMAIL_INTENT_KEYS]
  );

  await db.emailMessage.update({
    where: { id: messageId },
    data: {
      intent: analysis.intent,
      urgency: analysis.urgency,
      sentiment: analysis.sentiment,
      language: analysis.language,
      summary: analysis.summary,
      suggestedReply: analysis.suggestedReply,
      analyzedAt: new Date(),
    },
  });
  return true;
}

/** مسوّدة ردّ بنبرة مختارة — تُعرض للموظف ولا تُرسل من تلقائها */
export async function draftReply(params: {
  messageId: string;
  tone: ReplyTone;
  instruction?: string | null;
  userId: string;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const message = await db.emailMessage.findUnique({
    where: { id: params.messageId },
    include: {
      lead: { select: { code: true, status: true, serviceInterest: true } },
      client: { select: { code: true, name: true } },
      project: { select: { code: true, status: true, deadline: true } },
    },
  });
  if (!message) return { ok: false, error: 'الرسالة غير موجودة' };

  // السياق من النظام لا من ذاكرة النموذج — رقمٌ لم نعطه لا يُخترع
  const context = [
    message.client && `العميل مسجَّل لدينا: ${message.client.name} (${message.client.code ?? '—'})`,
    message.lead && `ليد قائم: ${message.lead.code ?? '—'} — حالته ${message.lead.status}`,
    message.project &&
      `مشروع مرتبط: ${message.project.code ?? '—'} — حالته ${message.project.status}` +
        (message.project.deadline
          ? ` وموعد تسليمه ${message.project.deadline.toISOString().slice(0, 10)}`
          : ''),
  ]
    .filter(Boolean)
    .join('\n');

  const result = await callAi({
    purpose: 'email.reply',
    userId: params.userId,
    system: SYSTEM_RULES,
    maxTokens: MAX_OUTPUT_TOKENS.reply,
    messages: [
      {
        role: 'user',
        content: replyPrompt({
          subject: message.subject,
          from: message.fromName ?? message.fromAddress,
          body: truncateForAnalysis(message.cleanText || message.bodyText),
          tone: params.tone,
          instruction: params.instruction,
          context: context || null,
        }),
      },
    ],
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, text: cleanText(result.text) };
}

/**
 * إرسال ردّ فعلي.
 *
 * الرد يُحفظ في النظام كما أُرسل: ما وُعد به العميل جزء من ملفّه، ولا يُقرأ
 * من صندوق قد يُمحى منه.
 */
export async function sendReply(params: {
  messageId: string;
  body: string;
  userId: string;
  cc?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const original = await db.emailMessage.findUnique({
    where: { id: params.messageId },
    include: { mailbox: true },
  });
  if (!original) return { ok: false, error: 'الرسالة الأصلية غير موجودة' };

  const mailbox = original.mailbox;
  const body = withSignature(params.body, mailbox.signature);
  const subject = replySubject(original.subject);
  const cc = parseAddressList(params.cc ?? '');

  try {
    const info = await smtpTransport(mailbox).sendMail({
      from: mailbox.fromName ? `"${mailbox.fromName}" <${mailbox.address}>` : mailbox.address,
      to: original.fromAddress,
      cc: cc.length ? cc : undefined,
      subject,
      text: body + quoteForReply(original),
      inReplyTo: original.messageId ?? undefined,
      references: buildReferences(null, original.messageId) ?? undefined,
    });

    const saved = await db.emailMessage.create({
      data: {
        mailboxId: mailbox.id,
        direction: 'out',
        messageId: info.messageId ?? null,
        inReplyTo: original.messageId,
        threadKey: original.threadKey,
        fromAddress: normalizeAddress(mailbox.address),
        fromName: mailbox.fromName,
        toAddresses: original.fromAddress,
        ccAddresses: cc.join(', ') || null,
        subject,
        bodyText: body,
        cleanText: body,
        sentAt: new Date(),
        leadId: original.leadId,
        clientId: original.clientId,
        companyId: original.companyId,
        projectId: original.projectId,
        handledAt: new Date(),
        handledById: params.userId,
      },
    });

    await db.emailMessage.update({
      where: { id: original.id },
      data: { handledAt: new Date(), handledById: params.userId },
    });

    return { ok: true, id: saved.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'تعذّر الإرسال' };
  }
}

/** رسالة جديدة (لا ردّ) من صندوق مختار */
export async function sendNew(params: {
  mailboxId: string;
  to: string;
  subject: string;
  body: string;
  userId: string;
  leadId?: string | null;
  clientId?: string | null;
  projectId?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const mailbox = await db.mailbox.findUnique({ where: { id: params.mailboxId } });
  if (!mailbox) return { ok: false, error: 'الصندوق غير موجود' };

  const to = parseAddressList(params.to);
  if (!to.length) return { ok: false, error: 'عنوان المستقبِل غير صحيح' };

  const body = withSignature(params.body, mailbox.signature);
  try {
    const info = await smtpTransport(mailbox).sendMail({
      from: mailbox.fromName ? `"${mailbox.fromName}" <${mailbox.address}>` : mailbox.address,
      to,
      subject: params.subject,
      text: body,
    });

    const saved = await db.emailMessage.create({
      data: {
        mailboxId: mailbox.id,
        direction: 'out',
        messageId: info.messageId ?? null,
        threadKey: threadKey(params.subject, to[0]),
        fromAddress: normalizeAddress(mailbox.address),
        fromName: mailbox.fromName,
        toAddresses: to.join(', '),
        subject: params.subject,
        bodyText: body,
        cleanText: body,
        sentAt: new Date(),
        leadId: params.leadId ?? null,
        clientId: params.clientId ?? null,
        projectId: params.projectId ?? null,
        handledAt: new Date(),
        handledById: params.userId,
      },
    });
    return { ok: true, id: saved.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'تعذّر الإرسال' };
  }
}

/** الصناديق التي يراها هذا المستخدم — المشترك للجميع والشخصي لصاحبه */
export async function visibleMailboxes(userId: string, canViewAll: boolean) {
  return db.mailbox.findMany({
    where: canViewAll ? {} : { OR: [{ ownerId: null }, { ownerId: userId }] },
    orderBy: [{ ownerId: 'asc' }, { label: 'asc' }],
  });
}

/** عدد الوارد غير المعالَج — للشارة في القائمة */
export async function unhandledCount(userId: string, canViewAll: boolean): Promise<number> {
  const boxes = await visibleMailboxes(userId, canViewAll);
  if (!boxes.length) return 0;
  return db.emailMessage.count({
    where: {
      mailboxId: { in: boxes.map((b) => b.id) },
      direction: 'in',
      handledAt: null,
      intent: { not: 'spam' },
    },
  });
}

export { parseAddress };
