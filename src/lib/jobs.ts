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

/**
 * **والجدول محكومٌ بخطة الاستضافة لا برغبتنا.**
 *
 * خطة Vercel المجانية تقبل مهمةً مجدولة **مرة واحدة يوميًّا**. وكان
 * `vercel.json` يطلب دورةً كل ساعة وأخرى كل نصف ساعة — فرفضت المنصّة النشرَ
 * **عند إنشائه قبل أن يبدأ البناء**، فلم يظهر في القائمة لا ناجحًا ولا
 * فاشلًا. وبقي الموقع الحيّ على كوميتٍ واحدٍ **تسعة عشر كوميتًا**، والصمتُ
 * التامّ هو ما أخفى السبب.
 *
 * فصار نداءً واحدًا يوميًّا يمرّ على المهام بترتيبها، وفيه ميزانية وقت تقول
 * ما لم يُنفَّذ. **ولرفع التكرار طريقان**: خطة Pro، أو جدولةٌ خارجية تنادي
 * `/api/cron?job=email&key=<CRON_SECRET>` بأي تواتر — والمسار مبنيٌّ لها
 * أصلًا، فهو يُحمى بسرٍّ لا بمصدر النداء.
 *
 * **والتنبيهات أولًا**: هي الأهمّ وأخفُّهما، وسحبُ البريد هو الذي قد يستنفد
 * الميزانية. فلو قُدّم الثقيلُ لسقط الخفيفُ معه في يومٍ مزدحم.
 */
export const JOBS: JobDefinition[] = [
  {
    key: 'notifications',
    label: 'توليد التنبيهات',
    hint: 'المشاريع المتأخرة والليدز بلا ردّ والمستحقات — كلٌّ بتوقيته',
    schedule: '0 6 * * *',
    everyMinutes: 24 * 60,
  },
  {
    key: 'email',
    label: 'سحب البريد',
    hint: 'يقرأ صناديق البريد المربوطة ويُدخل الرسائل الجديدة',
    schedule: '0 6 * * *',
    everyMinutes: 24 * 60,
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

// ── حال التهيئة ────────────────────────────────────────────────

export type CronSetupState = 'missing' | 'pending' | 'running';

/**
 * هل المهام مهيّأة أصلًا؟
 *
 * **«لم تعمل بعد» لها سببان مختلفان، وعلاجهما مختلف.** فإن لم يُضبط السرّ
 * فالمسار مغلق (٥٠٣) ولن تعمل أبدًا مهما انتُظر — والعلاج ضبطُه وإعادةُ
 * النشر. وإن ضُبط ولم تعمل بعد فالأمر انتظارُ أول دورة لا خللٌ يُطارَد.
 *
 * وشاشةٌ تقول الجملة نفسها في الحالين تترك المالك ينتظر بابًا مغلقًا.
 */
export function cronSetupState(secretSet: boolean, anyJobRan: boolean): CronSetupState {
  if (!secretSet) return 'missing';
  return anyJobRan ? 'running' : 'pending';
}

export const SETUP_LABELS: Record<CronSetupState, string> = {
  missing: 'المهام معطّلة — لم يُضبط سرّ الجدولة بعد',
  pending: 'السرّ مضبوط — في انتظار أول دورة',
  running: 'المهام مهيّأة وتعمل',
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
