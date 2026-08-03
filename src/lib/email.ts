/**
 * قواعد البريد الخالصة — بلا شبكة ولا قاعدة بيانات.
 *
 * كل ما هنا دالّة تأخذ نصًّا وتعيد نصًّا أو قرارًا، فيُختبر بلا خادم بريد.
 * الاتصال الفعلي (IMAP/SMTP) في `email-engine.ts` وحده.
 */

/** بادئات الرد وإعادة التوجيه بالعربية والإنجليزية */
const REPLY_PREFIXES = /^\s*(?:(?:re|fw|fwd|رد|إعادة توجيه|اعادة توجيه)\s*(?:\[\d+\])?\s*:\s*)+/i;

/** موضوع الرسالة مجرّدًا من كل بادئات الرد المتراكمة */
export function normalizeSubject(subject: string): string {
  let out = (subject ?? '').trim();
  let guard = 0;
  while (REPLY_PREFIXES.test(out) && guard++ < 10) out = out.replace(REPLY_PREFIXES, '').trim();
  return out.replace(/\s+/g, ' ');
}

/** عنوان البريد مطبَّعًا: صغيرًا بلا مسافات ولا أقواس زاوية */
export function normalizeAddress(address: string): string {
  const raw = (address ?? '').trim().toLowerCase();
  const angled = raw.match(/<([^>]+)>/);
  return (angled ? angled[1] : raw).trim();
}

/** يفصل «الاسم <العنوان>» إلى جزأيه */
export function parseAddress(value: string): { name: string | null; address: string } {
  const raw = (value ?? '').trim();
  const angled = raw.match(/^(.*?)<([^>]+)>\s*$/);
  if (!angled) return { name: null, address: normalizeAddress(raw) };
  const name = angled[1].trim().replace(/^["']|["']$/g, '').trim();
  return { name: name || null, address: normalizeAddress(angled[2]) };
}

/** يقبل قائمة عناوين مفصولة بفواصل ويعيدها مطبَّعة بلا تكرار */
export function parseAddressList(value: string | null | undefined): string[] {
  if (!value) return [];
  const out: string[] = [];
  // لا نقسم على فاصلة داخل اسم بين علامتي تنصيص: «"مجموعة، ترايستار" <a@b.c>»
  for (const part of value.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
    const address = parseAddress(part).address;
    if (address && address.includes('@') && !out.includes(address)) out.push(address);
  }
  return out;
}

export function isValidAddress(value: string): boolean {
  const a = normalizeAddress(value);
  return /^[^\s@،,;:<>"]+@[^\s@،,;:<>"]+\.[a-z]{2,}$/i.test(a);
}

/** نطاق العنوان — يُستعمل لربط الرسالة بشركة عندما لا يُعرف الشخص */
export function addressDomain(value: string): string | null {
  const a = normalizeAddress(value);
  const at = a.lastIndexOf('@');
  if (at < 0 || at === a.length - 1) return null;
  return a.slice(at + 1);
}

/** نطاقات البريد العام — وجودها لا يدلّ على شركة */
const PUBLIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com',
  'yahoo.com', 'yahoo.co.uk', 'icloud.com', 'me.com', 'aol.com',
  'proton.me', 'protonmail.com', 'mail.ru', 'yandex.com', 'zoho.com',
]);

export function isCorporateDomain(domain: string | null): boolean {
  if (!domain) return false;
  return !PUBLIC_DOMAINS.has(domain.toLowerCase());
}

/**
 * مفتاح الخيط.
 *
 * الترابط بـ`In-Reply-To` وحده يفشل مع العملاء الذين يردّون برسالة جديدة،
 * فنجمع الموضوع المطبَّع مع عنوان الطرف الآخر: كلاهما ثابت عبر الخيط.
 */
export function threadKey(subject: string, counterparty: string): string {
  return `${normalizeSubject(subject).toLowerCase()}|${normalizeAddress(counterparty)}`;
}

/** الطرف الآخر: المرسِل إن كانت واردة، وأول مستقبِل إن كانت صادرة */
export function counterpartyOf(params: {
  direction: string;
  fromAddress: string;
  toAddresses: string[];
}): string {
  if (params.direction === 'out') return params.toAddresses[0] ?? '';
  return normalizeAddress(params.fromAddress);
}

/** فواصل الاقتباس في ردود العملاء — عربية وإنجليزية */
const QUOTE_MARKERS = [
  /^\s*-{2,}\s*Original Message\s*-{2,}/im,
  /^\s*_{5,}\s*$/m,
  /^\s*On .{5,120}\bwrote:\s*$/im,
  // «في ٣ أغسطس، كتب فلان:» — الاسم يقع بين الفعل والنقطتين لا بعدهما
  /^\s*(?:في|بتاريخ)\s.{5,160}\s(?:كتب|كتبت)\s?.*:\s*$/m,
  /^\s*From:\s.+$/im,
  /^\s*(?:من|مِن):\s.+$/m,
];

/** فواصل التوقيع */
const SIGNATURE_MARKERS = [
  /^\s*--\s*$/m,
  /^\s*Best regards,?\s*$/im,
  /^\s*Kind regards,?\s*$/im,
  // بلا `\b`: حدّ الكلمة في جافاسكربت لاتينيّ صرف فلا يقع بعد حرف عربي
  /^\s*(?:مع تحيات|تحياتي|وتفضلوا بقبول فائق الاحترام).*$/m,
];

/**
 * نصّ الرسالة وحده: بلا سلسلة الاقتباس ولا التوقيع.
 *
 * التحليل على النص الكامل يجعل النموذج يلخّص رسالة الأمس بدل رسالة اليوم،
 * ويضاعف التكلفة مع كل ردّ في الخيط.
 */
export function stripQuoted(body: string): string {
  let text = (body ?? '').replace(/\r\n/g, '\n');
  let cut = text.length;

  for (const marker of QUOTE_MARKERS) {
    const m = text.match(marker);
    if (m?.index !== undefined && m.index < cut) cut = m.index;
  }
  text = text.slice(0, cut);

  // سطور `>` المقتبسة قد تسبق أي فاصل
  text = text
    .split('\n')
    .filter((line) => !/^\s*>/.test(line))
    .join('\n');

  let sigCut = text.length;
  for (const marker of SIGNATURE_MARKERS) {
    const m = text.match(marker);
    // التوقيع في النصف الأخير فقط — «تحياتي» في أول سطر تحيّةٌ لا توقيع
    if (m?.index !== undefined && m.index > text.length * 0.4 && m.index < sigCut) {
      sigCut = m.index;
    }
  }

  return text.slice(0, sigCut).replace(/\n{3,}/g, '\n\n').trim();
}

/** HTML إلى نص مقروء — للرسائل التي لا تحمل نسخة نصية */
export function htmlToText(html: string): string {
  return (html ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/[ \t]{2,}/g, ' ')
    // الوسم المفتوح يترك مسافةً في أول السطر بعد إغلاق سابقه
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** لغة الرسالة بالحروف لا بالنموذج — رخيص ويكفي لتوجيه الرد */
export function guessLanguage(text: string): 'ar' | 'en' | 'mixed' {
  const arabic = (text.match(/[ء-ي]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (arabic === 0 && latin === 0) return 'ar';
  const total = arabic + latin;
  if (arabic / total > 0.75) return 'ar';
  if (latin / total > 0.75) return 'en';
  return 'mixed';
}

/** نوايا الرسالة الواردة — مفاتيح إنجليزية وعرضٌ عربي */
export const EMAIL_INTENTS = {
  quote_request: 'طلب عرض سعر',
  inquiry: 'استفسار',
  order: 'تأكيد طلب',
  followup: 'متابعة طلب قائم',
  complaint: 'شكوى',
  invoice: 'فاتورة أو سداد',
  vendor: 'عرض من مورّد أو فريلانسر',
  spam: 'رسالة دعائية',
  other: 'أخرى',
} as const;

export type EmailIntent = keyof typeof EMAIL_INTENTS;
export const EMAIL_INTENT_KEYS = Object.keys(EMAIL_INTENTS) as EmailIntent[];

export const EMAIL_URGENCY = { high: 'عاجلة', normal: 'عادية', low: 'غير عاجلة' } as const;
export type EmailUrgency = keyof typeof EMAIL_URGENCY;

/**
 * تخمين النية بالكلمات — يعمل بلا مفتاح ذكاء اصطناعي.
 *
 * ليس بديلًا عن النموذج بل أرضية له: النظام يجب أن يظلّ مفيدًا يوم ينقطع
 * المفتاح أو ينفد رصيده.
 */
const INTENT_WORDS: [EmailIntent, RegExp][] = [
  [
    'quote_request',
    /عرض\s*سعر|تسعير|كم\s*(?:سعر|تكلفة|يكلف)|quotation|\bquote\b|pricing|price\s*(?:list|offer)|proposal/i,
  ],
  [
    'complaint',
    /شكوى|شكوي|اعتراض|غير\s*راض|خطأ\s*في\s*الترجمة|تأخر(?:تم|تو)|complaint|unacceptable|disappointed|refund/i,
  ],
  [
    'invoice',
    /فاتورة|سداد|تحويل\s*بنكي|إيصال|ايصال|مستحقات|invoice|payment|remittance|receipt|بيان\s*حساب/i,
  ],
  [
    'vendor',
    /سيرة\s*ذاتية|أرغب\s*في\s*العمل|مترجم\s*(?:حر|مستقل)|cv\b|resume|freelance\s*translator|rate\s*card/i,
  ],
  [
    'order',
    /نعتمد\s*العرض|موافق(?:ون|ين)?\s*على\s*العرض|أمر\s*شراء|purchase\s*order|\bpo\b|go\s*ahead|approved/i,
  ],
  [
    'followup',
    /متابعة|تحديث\s*(?:الحالة|الطلب)|أين\s*وصل|هل\s*تم|follow(?:ing)?\s*up|any\s*update|status\s*of/i,
  ],
  [
    'spam',
    /إلغاء\s*الاشتراك|unsubscribe|newsletter|black\s*friday|limited\s*offer|seo\s*services|رفع\s*ترتيب\s*موقعك/i,
  ],
];

export function guessIntent(subject: string, body: string): EmailIntent {
  const text = `${subject ?? ''}\n${body ?? ''}`;
  for (const [intent, pattern] of INTENT_WORDS) if (pattern.test(text)) return intent;
  return 'inquiry';
}

/** إلحاحية الرسالة بالكلمات — النموذج يصحّحها إن توفّر */
export function guessUrgency(subject: string, body: string): EmailUrgency {
  const text = `${subject ?? ''}\n${body ?? ''}`;
  if (/عاجل|ضروري|اليوم|بأسرع\s*وقت|urgent|asap|immediately|today/i.test(text)) return 'high';
  if (/شكوى|متأخر|تأخير|escalat|complaint/i.test(text)) return 'high';
  if (/إلغاء\s*الاشتراك|unsubscribe|newsletter/i.test(text)) return 'low';
  return 'normal';
}

/** استخراج أرقام الهواتف من نص الرسالة — لربطها بليد قائم */
export function extractPhones(text: string): string[] {
  const found = (text ?? '').match(/(?:\+|00)?\d[\d\s\-()]{7,17}\d/g) ?? [];
  const out: string[] = [];
  for (const raw of found) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) continue;
    if (!out.includes(digits)) out.push(digits);
  }
  return out;
}

/** موضوع الرد: `Re:` مرة واحدة مهما تكرّرت في الأصل */
export function replySubject(subject: string): string {
  return `Re: ${normalizeSubject(subject)}`;
}

/**
 * سلسلة `References` للرد.
 *
 * بقاؤها هو ما يُبقي الردّ داخل الخيط في بريد العميل بدل أن يظهر رسالةً
 * منفصلة تكسر السياق.
 */
export function buildReferences(previous: string | null, inReplyTo: string | null): string | null {
  const parts = [...(previous ?? '').split(/\s+/), inReplyTo ?? '']
    .map((s) => s.trim())
    .filter(Boolean);
  const unique = [...new Set(parts)];
  return unique.length ? unique.join(' ') : null;
}

/** يُذيّل الرد بتوقيع الصندوق مرة واحدة */
export function withSignature(body: string, signature: string | null | undefined): string {
  const text = (body ?? '').trimEnd();
  const sig = (signature ?? '').trim();
  if (!sig) return text;
  if (text.includes(sig)) return text;
  return `${text}\n\n--\n${sig}`;
}

/** نصّ الرد اقتباسًا للأصل — كما تفعل برامج البريد */
export function quoteForReply(original: { fromName?: string | null; fromAddress: string; sentAt: Date; bodyText: string }): string {
  const who = original.fromName ? `${original.fromName} <${original.fromAddress}>` : original.fromAddress;
  const when = original.sentAt.toISOString().slice(0, 16).replace('T', ' ');
  const quoted = (original.bodyText ?? '')
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return `\n\nفي ${when}، كتب ${who}:\n${quoted}`;
}

/**
 * هل الصندوق مرئيّ لهذا المستخدم؟
 *
 * الصندوق المشترك للجميع، والشخصي لصاحبه ولمن يملك رؤية كل السجلات. لا
 * نستثني بالدور بل بالصلاحية (§٠).
 */
export function canSeeMailbox(params: {
  mailboxOwnerId: string | null;
  userId: string;
  canViewAll: boolean;
}): boolean {
  if (params.mailboxOwnerId === null) return true;
  if (params.mailboxOwnerId === params.userId) return true;
  return params.canViewAll;
}

/** الرسائل التي تنتظر معالجة — الوارد غير المعالَج وغير الدعائي */
export function needsHandling(msg: {
  direction: string;
  handledAt: Date | null;
  intent: string | null;
}): boolean {
  if (msg.direction !== 'in') return false;
  if (msg.handledAt) return false;
  return msg.intent !== 'spam';
}

/** عمر الرسالة بالساعات — لترتيب ما تأخّر ردّه */
export function hoursWaiting(sentAt: Date, now: Date): number {
  return Math.max(0, (now.getTime() - sentAt.getTime()) / 3_600_000);
}

/** حدود التنزيل: لا نسحب أكثر من هذا في مزامنة واحدة */
export const SYNC_BATCH = 50;
/** أطول نصّ يُرسل للتحليل — الباقي لا يضيف معنى ويضاعف التكلفة */
export const ANALYSIS_MAX_CHARS = 6_000;

export function truncateForAnalysis(text: string, max = ANALYSIS_MAX_CHARS): string {
  const t = (text ?? '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n…[اقتُطع النص]`;
}
