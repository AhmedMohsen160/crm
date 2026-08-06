/**
 * المهام المجدولة — الوحدة الخالصة.
 *
 * **المهمة التي تعمل داخل طلبٍ واحد تموت صامتة.** كان `/api/cron` يسحب
 * البريد ويولّد التنبيهات الثمانية كلَّها في نداءٍ واحد؛ ومع نموّ البيانات
 * يتجاوز مهلة الدالة فيتوقّف **بلا رسالة خطأ** — لا شيء يقع، فقط تنبيهات
 * تكفّ عن الوصول ولا يعلم أحد.
 *
 * فصارت كل مهمة نداءً مستقلًّا بجدوله، ولها **بصمة نجاح** تُقرأ في الشاشة:
 * مهمةٌ لم تعمل منذ يومين تُرى، والصمت يُكشف.
 */

export type JobKey = 'email' | 'notifications';

export type JobDefinition = {
  key: JobKey;
  label: string;
  /** ما تفعله — بلغة العمل لا بلغة الكود */
  hint: string;
  /** الجدول المقترح بصيغة cron — يُكتب في `vercel.json` */
  schedule: string;
  /** كل كم دقيقة يُتوقَّع أن تعمل — يُقاس عليه «تأخّرت» */
  everyMinutes: number;
};

export const JOBS: JobDefinition[] = [
  {
    key: 'email',
    label: 'سحب البريد',
    hint: 'يقرأ صناديق البريد المربوطة ويُدخل الرسائل الجديدة',
    schedule: '*/30 * * * *',
    everyMinutes: 30,
  },
  {
    key: 'notifications',
    label: 'توليد التنبيهات',
    hint: 'المشاريع المتأخرة والليدز بلا ردّ والمستحقات — كلٌّ بتوقيته',
    schedule: '0 * * * *',
    everyMinutes: 60,
  },
];

export const JOB_KEYS = JOBS.map((j) => j.key);

export function jobByKey(key: string): JobDefinition | undefined {
  return JOBS.find((j) => j.key === key);
}

/** مفتاح الإعداد الذي تُكتب فيه بصمة آخر نجاح */
export function lastOkKey(key: JobKey): string {
  return `job_last_ok_${key}`;
}

/**
 * ميزانية الوقت داخل الطلب الواحد.
 *
 * **الأمانة أهم من الإتمام**: حين ينفد الوقت نتوقّف ونقول ما لم يُنفَّذ، ولا
 * نُكمل حتى تقتلنا المهلة فيبدو الأمر كأن كل شيء تمّ.
 */
export const BUDGET_MS = 45_000;

export function hasBudget(startedAt: number, now: number, budgetMs = BUDGET_MS): boolean {
  return now - startedAt < budgetMs;
}

// ── حال المهمة ─────────────────────────────────────────────────

export type JobHealth = 'ok' | 'late' | 'never';

/**
 * هل تأخّرت المهمة؟
 *
 * **ثلاثة أضعاف دورتها** لا دورةً واحدة: مهمةٌ كل ساعة قد تتأخّر دقائق
 * لأسباب عادية، وتلوينُها حمراء عند أول تأخّر يُفقد اللون معناه.
 */
export function jobHealth(
  lastOk: Date | null,
  everyMinutes: number,
  now: Date
): { state: JobHealth; minutesAgo: number | null } {
  if (!lastOk) return { state: 'never', minutesAgo: null };
  const minutesAgo = Math.floor((now.getTime() - lastOk.getTime()) / 60_000);
  return {
    state: minutesAgo > everyMinutes * 3 ? 'late' : 'ok',
    minutesAgo,
  };
}

export const HEALTH_LABELS: Record<JobHealth, string> = {
  ok: 'تعمل',
  late: 'متأخّرة',
  never: 'لم تعمل بعد',
};

/** «منذ كم» بالعربية — بلا كسور ولا أرقام لا تُقرأ */
export function agoLabel(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  return `منذ ${Math.floor(hours / 24)} يومًا`;
}
