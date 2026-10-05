/**
 * مراكز الربحية — القواعد الخالصة.
 *
 * **مركز الربحية مشروعٌ أو عميلٌ مستمرّ يُرصد إيرادُه ومصروفُه ليُقاس هامشه
 * وحده** (Job Costing). وهو ما أنشأه المحاسب لمشاريع مثل «جمعية التبيان»:
 * يحصر الوارد والتشغيل فيها فيعرف أرابحةٌ هي أم خاسرة.
 *
 * وكان النظام يستعمل الحقل نفسه لتصنيف الإنفاق (مركزي أم فرعي) — وهو بُعدٌ
 * آخر لا علاقة له بهذا. فانتقل التصنيف إلى الحساب، وعاد مركز الربحية إلى
 * معناه: **وحدةٌ يُقاس ربحُها**.
 *
 * ولا رقم عمل واحد مثبَّت هنا: الأرقام كلها تصل من الدفتر.
 */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type CenterInput = {
  id: string;
  name: string;
  /** المشروع أو الجهة، إن سُجّل */
  project: string | null;
  revenue: number;
  cost: number;
};

export type CenterResult = {
  id: string;
  name: string;
  project: string | null;
  revenue: number;
  cost: number;
  margin: number;
  /**
   * نسبة الهامش من الإيراد — **`null` بلا إيراد لا صفرًا**.
   *
   * صفرٌ يعني «باع ولم يربح»، والغياب يعني «لم يبع بعد» — والفرق حكمٌ على
   * مشروع قد يكون في شهره الأول.
   */
  marginPct: number | null;
  /** الترتيب بالهامش — المتساويان يشتركان في المركز ثم يقفز التالي */
  rank: number;
};

/** هامش المركز الواحد */
export function centerPL(input: CenterInput): Omit<CenterResult, 'rank'> {
  const revenue = round2(input.revenue);
  const cost = round2(input.cost);
  const margin = round2(revenue - cost);
  return {
    id: input.id,
    name: input.name,
    project: input.project,
    revenue,
    cost,
    margin,
    marginPct: revenue > 0 ? round2((margin / revenue) * 100) : null,
  };
}

/**
 * يرتّب المراكز بالهامش نزولًا.
 *
 * **والمتساويان يشتركان في المركز ثم يقفز التالي** — الفصل بينهما بترتيب
 * الحروف ظلمٌ يراه صاحب المشروع في شاشة غرضُها المقارنة.
 */
export function rankCenters(inputs: CenterInput[]): CenterResult[] {
  const rows = inputs.map(centerPL).sort((a, b) => b.margin - a.margin);

  let rank = 0;
  let seen = 0;
  let previous: number | null = null;

  return rows.map((row) => {
    seen += 1;
    if (previous === null || row.margin !== previous) {
      rank = seen;
      previous = row.margin;
    }
    return { ...row, rank };
  });
}

export type CenterTotals = {
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number | null;
  /** كم مركزًا هامشه سالب — أول ما يبحث عنه المالك */
  losing: number;
};

/** الإجمالي عبر المراكز كلها */
export function centerTotals(rows: CenterResult[]): CenterTotals {
  const revenue = round2(rows.reduce((s, r) => s + r.revenue, 0));
  const cost = round2(rows.reduce((s, r) => s + r.cost, 0));
  const margin = round2(revenue - cost);
  return {
    revenue,
    cost,
    margin,
    marginPct: revenue > 0 ? round2((margin / revenue) * 100) : null,
    losing: rows.filter((r) => r.margin < 0).length,
  };
}
