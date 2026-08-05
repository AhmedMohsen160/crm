/**
 * تصنيف العملاء وفترات المتابعة — الوحدة الخالصة.
 *
 * لا تلمس قاعدة بيانات. كل ما فيها قواعد تُختبر بأرقامها، فيبقى معنى
 * «متكرّر» و«متوقّف» واحدًا في كل شاشة يظهر فيها.
 */

// ── التصنيف ────────────────────────────────────────────────────

export const CLIENT_SEGMENTS = {
  repeat: 'عميل متكرّر',
  new: 'عميل جديد',
  dormant: 'متوقّف',
  prospect: 'بلا تعامل بعد',
} as const;

export type ClientSegment = keyof typeof CLIENT_SEGMENTS;

export const CLIENT_SEGMENT_ORDER: ClientSegment[] = ['repeat', 'new', 'dormant', 'prospect'];

export const CLIENT_SEGMENT_COLORS: Record<ClientSegment, string> = {
  repeat: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  new: 'border-sky-200 bg-sky-50 text-sky-700',
  dormant: 'border-amber-200 bg-amber-50 text-amber-700',
  prospect: 'border-slate-200 bg-slate-50 text-slate-500',
};

/**
 * كم يومًا بلا تعامل حتى يُعدّ العميل متوقّفًا.
 *
 * ١٢٠ يومًا لا ٣٠: أغلب حجمنا ترجمة مستندات شخصية، وصاحبها يأتي حين تلزمه
 * ورقة لا كل شهر. فثلاثون يومًا تُلوّن كل السجل بالأحمر فيفقد اللون معناه.
 */
export const DORMANT_AFTER_DAYS = 120;

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * تصنيف العميل من تاريخه.
 *
 * **الترتيب مقصود: «متوقّف» تسبق «متكرّر».** العميل الذي اشترى خمس مرات ثم
 * انقطع نصف سنة هو الاسم الذي يجب أن يراه الأدمن اليوم — لا أن يختفي تحت
 * وسام «متكرّر» فيبدو السجل كله بخير.
 *
 * و«متكرّر» تتبع تعريف التسعير حرفيًّا (§١٠ بند ٣): مشروعٌ سابقٌ سُلّم أو
 * حُصّل. فمن له اثنان فأكثر متكرّرٌ اليوم، ومن له واحد كان متكرّرًا في ثانيه.
 */
export function clientSegment(
  input: { dealCount: number; lastDealAt: Date | null },
  now: Date
): ClientSegment {
  if (input.dealCount <= 0 || !input.lastDealAt) return 'prospect';
  if (daysBetween(input.lastDealAt, now) > DORMANT_AFTER_DAYS) return 'dormant';
  return input.dealCount >= 2 ? 'repeat' : 'new';
}

// ── الفترات ────────────────────────────────────────────────────

export const CLIENT_PERIODS = {
  month: 'هذا الشهر',
  quarter: 'آخر ٣ شهور',
  half: 'آخر ٦ شهور',
  year: 'هذه السنة',
  prev_year: 'السنة الماضية',
} as const;

export type ClientPeriod = keyof typeof CLIENT_PERIODS;

/**
 * حدود الفترة المختارة.
 *
 * الغياب يعني **كل الفترات** لا «هذا الشهر»: من يفتح الشاشة أول مرة يريد
 * سجلّه كاملًا، ثم يضيّق. والعكس يُخفي عنه عملاءه ويظنّهم غير موجودين.
 */
export function periodRange(
  key: string | undefined,
  now: Date
): { from: Date | null; to: Date | null } {
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (key) {
    case 'month':
      return { from: new Date(y, m, 1), to: new Date(y, m + 1, 1) };
    case 'quarter':
      return { from: new Date(y, m - 2, 1), to: new Date(y, m + 1, 1) };
    case 'half':
      return { from: new Date(y, m - 5, 1), to: new Date(y, m + 1, 1) };
    case 'year':
      return { from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1) };
    case 'prev_year':
      return { from: new Date(y - 1, 0, 1), to: new Date(y, 0, 1) };
    default:
      return { from: null, to: null };
  }
}

// ── الترتيب ────────────────────────────────────────────────────

export const CLIENT_SORTS = {
  value: 'الأعلى قيمة',
  recent: 'الأحدث تعاملًا',
  deals: 'الأكثر تكرارًا',
  name: 'الاسم',
} as const;

export type ClientSort = keyof typeof CLIENT_SORTS;

export type SortableClient = {
  name: string;
  dealCount: number;
  totalValue: number;
  lastDealAt: Date | null;
};

/**
 * ترتيب الصفوف.
 *
 * **«بلا تاريخ» يذهب إلى الآخر دائمًا** — لا إلى الأول لأن قيمته صفر عند
 * المقارنة. ومن لم يتعامل بعدُ ليس أقدمَ الناس تعاملًا.
 */
export function sortClients<T extends SortableClient>(rows: T[], sort: string | undefined): T[] {
  const out = [...rows];
  switch (sort) {
    case 'recent':
      return out.sort(
        (a, b) => (b.lastDealAt?.getTime() ?? -Infinity) - (a.lastDealAt?.getTime() ?? -Infinity)
      );
    case 'deals':
      return out.sort((a, b) => b.dealCount - a.dealCount || b.totalValue - a.totalValue);
    case 'name':
      return out.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    default:
      return out.sort((a, b) => b.totalValue - a.totalValue || b.dealCount - a.dealCount);
  }
}
