import 'server-only';
import { db } from './db';
import {
  AI_MODELS,
  DEFAULT_MODEL,
  DEFAULT_DAILY_BUDGET_USD,
  MAX_OUTPUT_TOKENS,
  runCost,
  withinBudget,
  type AiModel,
} from './ai';

/**
 * النداء الفعلي لواجهة النموذج.
 *
 * كل نداء يمرّ من هنا لا من الشاشات: هنا وحدها يُفحص المفتاح والميزانية،
 * ويُسجَّل ما أُنفق. نداء يتخطّى هذه الدالة هو نداء لا يُحاسَب عليه أحد.
 */

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

export type AiPurpose =
  | 'email.analyze'
  | 'email.reply'
  | 'assistant'
  | 'proposal.draft'
  | 'quote.design';

export type AiResult =
  | { ok: true; text: string; inTokens: number; outTokens: number; costUsd: number; model: string }
  | { ok: false; error: string };

/** هل الذكاء الاصطناعي مفعَّل أصلًا؟ الشاشات تسأل قبل أن تعرض أزراره */
export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** النموذج المختار — يُضبط بمتغيّر بيئة فيُغيَّر بلا نشر جديد */
export function activeModel(): AiModel {
  const configured = process.env.AI_MODEL as AiModel | undefined;
  return configured && configured in AI_MODELS ? configured : DEFAULT_MODEL;
}

/** ما أُنفق اليوم بالدولار — من سجلّ النداءات لا من عدّاد في الذاكرة */
export async function spentToday(): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const agg = await db.aiRun.aggregate({
    where: { createdAt: { gte: start } },
    _sum: { costUsd: true },
  });
  return agg._sum.costUsd ?? 0;
}

function dailyBudget(): number {
  const raw = Number(process.env.AI_DAILY_BUDGET_USD);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_DAILY_BUDGET_USD;
}

type CallParams = {
  purpose: AiPurpose;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens?: number;
  userId?: string | null;
  /** ثوانٍ قبل التخلّي — النموذج البطيء لا يُعلّق شاشة الموظف */
  timeoutMs?: number;
};

/**
 * نداء واحد مع تسجيله.
 *
 * لا يرمي استثناءً: العطل في النموذج لا يجوز أن يُسقط شاشةً كاملة، فيُعاد
 * `ok: false` وتُظهر الشاشة ما تملكه بلا مساعدة ذكية.
 */
export async function callAi(params: CallParams): Promise<AiResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: 'الذكاء الاصطناعي غير مفعَّل — يلزم مفتاح ANTHROPIC_API_KEY' };

  const limit = dailyBudget();
  const spent = await spentToday();
  if (!withinBudget(spent, limit)) {
    return { ok: false, error: `بلغ إنفاق اليوم الحدّ المسموح (${limit}$) — يُرفع من إعدادات البيئة` };
  }

  const model = activeModel();
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 60_000);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: params.maxTokens ?? MAX_OUTPUT_TOKENS.reply,
        system: params.system,
        messages: params.messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const error = `تعذّر نداء النموذج (${response.status}) ${detail.slice(0, 200)}`;
      await record({ ...params, model, ok: false, error, ms: Date.now() - started });
      return { ok: false, error };
    }

    const payload = (await response.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = (payload.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('\n')
      .trim();

    const inTokens = payload.usage?.input_tokens ?? 0;
    const outTokens = payload.usage?.output_tokens ?? 0;
    const costUsd = runCost(model, inTokens, outTokens);

    await record({
      ...params,
      model,
      ok: true,
      inTokens,
      outTokens,
      costUsd,
      ms: Date.now() - started,
    });

    if (!text) return { ok: false, error: 'رد النموذج فارغ' };
    return { ok: true, text, inTokens, outTokens, costUsd, model };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'تأخّر رد النموذج — حاول مرة أخرى'
        : error instanceof Error
          ? error.message
          : 'عطل غير معروف';
    await record({ ...params, model, ok: false, error: message, ms: Date.now() - started });
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

async function record(params: {
  purpose: string;
  userId?: string | null;
  model: string;
  ok: boolean;
  error?: string;
  inTokens?: number;
  outTokens?: number;
  costUsd?: number;
  ms: number;
}) {
  try {
    await db.aiRun.create({
      data: {
        purpose: params.purpose,
        userId: params.userId ?? null,
        model: params.model,
        inTokens: params.inTokens ?? 0,
        outTokens: params.outTokens ?? 0,
        costUsd: params.costUsd ?? 0,
        ms: Math.round(params.ms),
        ok: params.ok,
        error: params.error?.slice(0, 500) ?? null,
      },
    });
  } catch (error) {
    // فشل التسجيل لا يُسقط النداء نفسه
    console.error('تعذّر تسجيل نداء الذكاء الاصطناعي:', error);
  }
}
