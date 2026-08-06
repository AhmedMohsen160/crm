/**
 * مؤشرات التشغيل — الوحدة الخالصة.
 *
 * لا تلمس قاعدة بيانات. أرقام مدير المشاريع كلها هنا: الالتزام بالموعد،
 * والحجم المنجَز، والتقدّم عن الشهر الماضي، ونسبة التشغيل من المبيعات،
 * وعائد التشغيل.
 *
 * **وقاعدةٌ واحدة تحكمها جميعًا: «غير مقيس» ليست صفرًا.** الصفر حكمٌ على
 * أداء («أدّى ولم يُنجز»)، والغياب إقرارٌ بأن لا قياس. وكلها تُرجع `null`
 * حين لا يوجد ما يُقاس.
 */

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * نسبة ما سُلّم في موعده.
 *
 * **بلا موعد لا التزام**: المشروع الذي لم يُحدَّد له موعد لا يدخل البسط ولا
 * المقام — إدخالُه بائعًا للنسبة يُكافئ من لا يضع مواعيد.
 * والتسليم **في يوم** الموعد التزامٌ لا تأخّر.
 */
export function onTimeRate(
  rows: { deliveredAt: Date | null; deadline: Date | null }[]
): { rate: number | null; onTime: number; late: number; measured: number } {
  const measured = rows.filter((r) => r.deliveredAt && r.deadline);
  const onTime = measured.filter((r) => r.deliveredAt!.getTime() <= endOfDay(r.deadline!)).length;
  return {
    rate: measured.length ? round1((onTime / measured.length) * 100) : null,
    onTime,
    late: measured.length - onTime,
    measured: measured.length,
  };
}

/** آخر لحظة في يوم الموعد — التسليم فيه التزامٌ لا تأخّر */
export function endOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/**
 * التقدّم عن الفترة السابقة بالنسبة المئوية.
 *
 * **والصفر السابق لا يُنتج نسبةً** — النموّ من لا شيء ليس ما لا نهاية، بل
 * قياسٌ لا معنى له. يُقال «جديد» ولا يُخترع رقم.
 */
export function growthPct(current: number, previous: number): number | null {
  if (!previous) return null;
  return round1(((current - previous) / previous) * 100);
}

/**
 * نسبة تكلفة التشغيل من المبيعات.
 *
 * الجواب عن «كم يأكل التشغيلُ من كل جنيه نبيعه؟». وبلا مبيعات لا نسبة.
 */
export function operatingRatio(cost: number, revenue: number): number | null {
  if (!revenue) return null;
  return round1((cost / revenue) * 100);
}

/**
 * عائد التشغيل — لكل جنيه تشغيلٍ كم جنيهًا يعود.
 *
 * `(الإيراد − التكلفة) ÷ التكلفة`. وبلا تكلفة مسجَّلة **لا عائد** — لا عائدٌ
 * لا نهائي: تكلفةٌ صفرٌ تعني «لم تُسجَّل» لا «مجّانًا».
 */
export function operatingRoi(revenue: number, cost: number): number | null {
  if (cost <= 0) return null;
  return round1(((revenue - cost) / cost) * 100);
}

/** متوسط تكلفة الصفحة الموزونة — وبلا صفحات لا متوسط */
export function costPerPage(cost: number, pages: number): number | null {
  if (pages <= 0) return null;
  return Math.round((cost / pages) * 100) / 100;
}

/**
 * ترتيب المنفِّذين بحجمهم — والمتساويان يشتركان في المركز.
 *
 * الفصل بينهما بترتيب الحروف ظلمٌ يراه المنفِّذ في شاشةٍ غرضُها التحفيز.
 */
export type ProducerRow = { userId: string; userName: string; pages: number; projects: number };

export function rankProducers(rows: ProducerRow[]): (ProducerRow & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.pages - a.pages || b.projects - a.projects);
  const out: (ProducerRow & { rank: number })[] = [];
  let rank = 0;
  let previous: number | null = null;
  sorted.forEach((row, index) => {
    if (previous === null || row.pages !== previous) rank = index + 1;
    previous = row.pages;
    out.push({ ...row, rank });
  });
  return out;
}
