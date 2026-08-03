/**
 * قواعد الذكاء الاصطناعي الخالصة — بناء الأوامر وتحليل الرد وحساب التكلفة.
 *
 * بلا شبكة: النداء الفعلي في `ai-client.ts`. الفصل مقصود، فما هنا يُختبر
 * بلا مفتاح ولا إنترنت، وهو الجزء الذي تخطئ فيه الأنظمة عادةً.
 */

/** النماذج المتاحة وأسعارها بالدولار لكل مليون رمز */
export const AI_MODELS = {
  'claude-sonnet-4-5': { label: 'متوازن', inPerM: 3, outPerM: 15 },
  'claude-haiku-4-5': { label: 'سريع ورخيص', inPerM: 1, outPerM: 5 },
  'claude-opus-4-5': { label: 'الأقوى', inPerM: 15, outPerM: 75 },
} as const;

export type AiModel = keyof typeof AI_MODELS;
export const DEFAULT_MODEL: AiModel = 'claude-sonnet-4-5';

/** تكلفة النداء بالدولار — تُسجَّل مع كل استدعاء فلا ينفق النظام بلا أثر */
export function runCost(model: string, inTokens: number, outTokens: number): number {
  const price = AI_MODELS[model as AiModel];
  if (!price) return 0;
  const usd = (inTokens / 1e6) * price.inPerM + (outTokens / 1e6) * price.outPerM;
  return Math.round(usd * 1e6) / 1e6;
}

/**
 * حجب البيانات الشخصية قبل إرسالها للنموذج.
 *
 * قاعدة المكتب: أسماء العملاء وأرقامهم لا تغادر النظام إلا لِزامًا. الرسالة
 * تُرسل للتحليل لأن معناها هو المطلوب، لكن الهواتف والأرقام البنكية لا معنى
 * لها في التحليل، فتُستبدل برموز.
 */
export function redact(text: string): string {
  return (text ?? '')
    .replace(/\b(?:IBAN|آيبان|ايبان)\s*:?\s*[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/gi, '[حساب بنكي]')
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{16,30}\b/g, '[حساب بنكي]')
    .replace(/\b(?:\+|00)?\d[\d\s\-()]{8,17}\d\b/g, '[رقم]')
    .replace(/\b\d{10,16}\b/g, '[رقم]');
}

/** نبرة الرد — تُختار من الشاشة */
export const REPLY_TONES = {
  formal: 'رسمي',
  friendly: 'ودّي',
  brief: 'مختصر جدًا',
} as const;
export type ReplyTone = keyof typeof REPLY_TONES;

/**
 * توجيه المساعد الأساسي.
 *
 * الحدود هنا ليست تجميلًا: نموذج بلا حدود يخترع سعرًا أو يَعِد بموعد، والوعد
 * في بريد صادر التزامٌ على المكتب. فالممنوع منصوص عليه لا متروك للفهم.
 */
export const SYSTEM_RULES = [
  'أنت مساعد داخل نظام «فاست ترانس» لإدارة الترجمة المعتمدة.',
  'اكتب بالعربية الفصحى المبسّطة ما لم تكن رسالة العميل بالإنجليزية فترد بها.',
  'لا تخترع سعرًا ولا مدة تسليم ولا خصمًا. إن لزم رقم ولم يُعطَ لك، اكتب مكانه [يُملأ من النظام].',
  'لا تَعِد بشيء نيابة عن المكتب. صِغ الالتزامات بصيغة مقترحة يراجعها الموظف.',
  'لا تذكر أنك ذكاء اصطناعي، ولا تشرح تفكيرك، وأعطِ المطلوب مباشرة.',
  'إن نقصتك معلومة لازمة، قل ما ينقص بدل التخمين.',
].join('\n');

/** أمر تحليل رسالة واردة — يطلب JSON صرفًا ليُقرأ آليًّا */
export function analysisPrompt(params: {
  subject: string;
  from: string;
  body: string;
  intents: string[];
}): string {
  return [
    'حلّل رسالة البريد التالية الواردة إلى مكتب ترجمة معتمدة.',
    '',
    `المرسِل: ${params.from}`,
    `الموضوع: ${params.subject}`,
    '— نص الرسالة —',
    redact(params.body),
    '— انتهى النص —',
    '',
    'أعِد كائن JSON وحده بلا أي نص قبله أو بعده، بهذه المفاتيح:',
    `  intent: واحدة من [${params.intents.join(', ')}]`,
    '  urgency: high أو normal أو low',
    '  sentiment: positive أو neutral أو negative',
    '  language: ar أو en أو mixed',
    '  summary: جملتان بالعربية تلخّصان ما يطلبه المرسِل',
    '  needsHuman: true إن كانت تحتاج قرار موظف (سعر، شكوى، تعاقد)',
    '  suggestedReply: مسوّدة رد كاملة بلغة الرسالة، بلا أسعار مخترَعة',
  ].join('\n');
}

/** أمر صياغة ردّ على رسالة */
export function replyPrompt(params: {
  subject: string;
  from: string;
  body: string;
  tone: ReplyTone;
  instruction?: string | null;
  context?: string | null;
}): string {
  return [
    `اكتب ردًّا ${REPLY_TONES[params.tone]} على رسالة العميل التالية.`,
    '',
    `المرسِل: ${params.from}`,
    `الموضوع: ${params.subject}`,
    '— نص الرسالة —',
    redact(params.body),
    '— انتهى النص —',
    params.context ? `\nمعطيات من النظام يمكنك الاستناد إليها:\n${params.context}` : '',
    params.instruction ? `\nتوجيه الموظف: ${params.instruction}` : '',
    '',
    'أعِد نصّ الرد وحده بلا عنوان ولا توقيع ولا تعليق. التوقيع يُضاف آليًّا.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * قراءة JSON من رد النموذج.
 *
 * النماذج تُحيط الـJSON بسياج ```json أو بجملة تمهيدية رغم كل التعليمات،
 * فنقرأ أول كائن متزن بدل أن نُفشل التحليل كلّه على قوسٍ زائد.
 */
export function extractJson(raw: string): unknown | null {
  const text = (raw ?? '').trim();
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      // نبحث عن أول كائن متزن الأقواس
      const start = trimmed.indexOf('{');
      if (start < 0) continue;
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = start; i < trimmed.length; i++) {
        const ch = trimmed[i];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            try {
              return JSON.parse(trimmed.slice(start, i + 1));
            } catch {
              break;
            }
          }
        }
      }
    }
  }
  return null;
}

export type Analysis = {
  intent: string;
  urgency: string;
  sentiment: string;
  language: string;
  summary: string;
  needsHuman: boolean;
  suggestedReply: string | null;
};

/**
 * قراءة تحليل النموذج مع أرضية آمنة.
 *
 * ردّ النموذج ليس عقدًا: قد يعيد نيّة ليست في القائمة أو يُسقط مفتاحًا. نأخذ
 * ما صحّ ونرجع للتخمين النصّي فيما عداه، فلا تسقط الرسالة من النظام.
 */
export function parseAnalysis(
  raw: string,
  fallback: { intent: string; urgency: string; language: string },
  allowedIntents: string[]
): Analysis {
  const parsed = extractJson(raw) as Record<string, unknown> | null;
  const pick = (key: string, allowed: string[], fb: string): string => {
    const value = parsed?.[key];
    return typeof value === 'string' && allowed.includes(value) ? value : fb;
  };

  const summary = typeof parsed?.summary === 'string' ? parsed.summary.trim() : '';
  const reply = typeof parsed?.suggestedReply === 'string' ? parsed.suggestedReply.trim() : '';

  return {
    intent: pick('intent', allowedIntents, fallback.intent),
    urgency: pick('urgency', ['high', 'normal', 'low'], fallback.urgency),
    sentiment: pick('sentiment', ['positive', 'neutral', 'negative'], 'neutral'),
    language: pick('language', ['ar', 'en', 'mixed'], fallback.language),
    summary: summary || 'تعذّر التلخيص — اقرأ نص الرسالة.',
    needsHuman: parsed?.needsHuman === undefined ? true : parsed.needsHuman !== false,
    suggestedReply: reply || null,
  };
}

/** رد النموذج نصًّا نظيفًا — بلا سياج ولا تمهيد */
export function cleanText(raw: string): string {
  let text = (raw ?? '').trim();
  const fenced = text.match(/^```(?:\w+)?\s*([\s\S]*?)```$/);
  if (fenced) text = fenced[1].trim();
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * سؤال المساعد يُقيَّد بما يراه صاحبه.
 *
 * المساعد يقرأ أرقامًا من النظام، ولو قرأها بصلاحية النظام لأجاب مدير
 * المشاريع عن سعر البيع المحجوب عنه (§٥). فالسياق يُبنى بصلاحيات السائل.
 */
export function assistantSystem(params: {
  userName: string;
  roleLabel: string;
  permissions: string[];
  today: string;
}): string {
  return [
    SYSTEM_RULES,
    '',
    `السائل: ${params.userName} — ${params.roleLabel}. تاريخ اليوم: ${params.today}.`,
    `صلاحياته: ${params.permissions.join('، ') || 'لا صلاحيات خاصة'}.`,
    'أجب من المعطيات المرفقة وحدها. ما لم يُرفق لك لا تعرفه، فقل إنه غير متاح لك.',
    'إن كان السؤال عن رقم غير مرفق، دلّ السائل على الشاشة التي تعرضه.',
  ].join('\n');
}

/** أقصى عدد رموز في الرد — يُمنع التوليد المفتوح */
export const MAX_OUTPUT_TOKENS = { analyze: 1_200, reply: 1_500, assistant: 2_000 } as const;

/** حدّ يومي للإنفاق بالدولار — يُقرأ من الإعدادات ويُفحص قبل كل نداء */
export const DEFAULT_DAILY_BUDGET_USD = 5;

export function withinBudget(spentToday: number, limit: number): boolean {
  if (limit <= 0) return true; // صفر = بلا حد
  return spentToday < limit;
}
