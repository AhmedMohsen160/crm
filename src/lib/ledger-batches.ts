import type { ArabicLedgerRow } from './import-ledger-ar';

/**
 * تجميع صفوف دفتر المحاسب في قيود متوازنة، وتسوية كسور القرش.
 *
 * **ولماذا هنا لا في المحرّك:** هاتان قاعدتان خالصتان — لا تلمسان قاعدة
 * بيانات ولا شبكة — وما لا يُختبر بلا قاعدة بيانات فهو في الطبقة الخطأ.
 * وهما أخطر ما في الترحيل: خطأٌ فيهما يُنتج دفترًا يبدو سليمًا وميزانَ
 * مراجعةٍ لا يتوازن.
 */

/** ما دون نصف قرش فارقُ تقريبٍ عائم لا اختلال */
export const TOLERANCE = 0.005;

/**
 * **أقصى ما يُسوَّى على آخر سطر** — خمسة قروش.
 *
 * أوراق المحاسب فيها كسورٌ أطول من قرشين (٣٬٨٢٧٬٤٠٩٫٣٧٥)، وتراكمُها عبر
 * آلاف السطور يُخرج القيد عن التوازن بقرشٍ أو قرشين. وهذا تقريبٌ لا خطأ.
 *
 * **وما جاوزها لا يُجبَر**: اختلالٌ بجنيهٍ فأكثر خطأٌ في ورقة المحاسب،
 * وإجبارُه يُخفيه بدل أن يكشفه.
 */
export const SETTLE_LIMIT = 0.05;

/** خللٌ في صفٍّ واحد كان سيبتلع بقية الشهر بلا هذا الحدّ */
export const MAX_ENTRY_LINES = 200;

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type Batch = { rows: ArabicLedgerRow[]; balanced: boolean; difference: number };

/**
 * يجمّع الصفوف في قيود متوازنة **بالرصيد الجاري**.
 *
 * ورقة المحاسب مسطَّحة بلا أرقام قيود صالحة: القيد فيها صفوفٌ متتالية
 * يتوازن عندها المجموع. فيُجمَع حتى يتساوى المدين والدائن، ثم يُقفل.
 *
 * **ولا يُتجاوز الشهر**: شهرٌ فيه خلل لا يُفسد الذي بعده. ولا يُتجاوز
 * `MAX_ENTRY_LINES`: خللٌ في صفٍّ واحد كان سيبتلع بقية السنة.
 */
export function groupBatches(rows: ArabicLedgerRow[]): Batch[] {
  const batches: Batch[] = [];
  let current: ArabicLedgerRow[] = [];
  let debit = 0;
  let credit = 0;
  let period: string | null = null;

  const close = () => {
    if (current.length === 0) return;
    const difference = round2(debit - credit);
    batches.push({
      rows: current,
      balanced: Math.abs(difference) < TOLERANCE,
      difference,
    });
    current = [];
    debit = 0;
    credit = 0;
  };

  for (const row of rows) {
    if (period !== null && row.period !== period) close();
    period = row.period;

    current.push(row);
    debit += row.debit;
    credit += row.credit;

    if (current.length >= MAX_ENTRY_LINES) close();
    else if (Math.abs(round2(debit - credit)) < TOLERANCE) close();
  }
  close();

  return batches;
}

/**
 * يسوّي كسور القرش على **آخر سطر** في القيد.
 *
 * والمجموعان يُقارنان **بالقرش الصحيح** لا بالجنيه العائم: الفاصلة العائمة
 * لا تعرف عُشرًا، والكسر ينحرف عبر آلاف السطور حتى يُخرج ميزان المراجعة
 * عن التوازن.
 *
 * **ويُعدَّل السطر في مكانه** — فالمنادي يكتب ما بين يديه بعد النداء.
 */
export function settleRounding(
  lines: { debit: number; credit: number }[]
): { settled: boolean; difference: number } {
  if (lines.length === 0) return { settled: true, difference: 0 };

  const piastres = (value: number) => Math.round(value * 100);
  for (const line of lines) {
    line.debit = round2(line.debit);
    line.credit = round2(line.credit);
  }
  const debitP = lines.reduce((s, l) => s + piastres(l.debit), 0);
  const creditP = lines.reduce((s, l) => s + piastres(l.credit), 0);
  const gap = debitP - creditP;
  if (gap === 0) return { settled: true, difference: 0 };
  if (Math.abs(gap) > Math.round(SETTLE_LIMIT * 100)) {
    return { settled: false, difference: gap / 100 };
  }

  // الفارق يُحمَّل على آخر سطر — في جانبه الذي يُنقصه
  const last = lines[lines.length - 1];
  if (gap > 0) {
    if (last.credit > 0) last.credit = round2(last.credit + gap / 100);
    else last.debit = round2(last.debit - gap / 100);
  } else {
    if (last.debit > 0) last.debit = round2(last.debit - gap / 100);
    else last.credit = round2(last.credit + gap / 100);
  }
  return { settled: true, difference: 0 };
}
