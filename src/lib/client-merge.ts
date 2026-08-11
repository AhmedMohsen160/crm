/**
 * تنظيف أسماء العملاء ودمج المتشابهات — القواعد الخالصة.
 *
 * ── المشكلة التي حلّها هذا الملف ───────────────────────────────
 *
 * العميل الواحد يظهر في دفاتر المكتب بأسماء مختلفة:
 *   «قرآن هاوس» · «أكاديمية قرآن هاوس» · «قرآن هاوس نظير خدمات تحسين
 *   محركات البحث» · «مشروع قرآن هاوس»
 * وهي أربعة نصوص لعميل واحد. وإدخالها كما هي يُنشئ أربع بطاقات، فلا يُعرف
 * كم اشترى العميل ولا يُصنَّف تصنيفًا صحيحًا.
 *
 * **فالمفتاح لبّ الاسم لا نصّه**: تُنزع الصفة القانونية (شركة · مؤسسة ·
 * دار · مركز · جمعية · أكاديمية) وأداة التعريف والألقاب (د. · أ. · العميل)
 * وما بعد «نظير» و«لمشروع»، ثم يُطبَّع الباقي.
 *
 * **ولا يُدمج شيء بلا عرضٍ على أحمد**: الدمج اقتراحٌ يُراجَع سطرًا سطرًا،
 * فاسمان متشابهان قد يكونان عميلين مختلفين فعلًا.
 */

import { normalizeArabic } from './import-ledger-ar';

/** صفاتٌ قانونية ووصفية تسبق الاسم ولا تُميّزه */
const PREFIXES = [
  'شركة',
  'شركه',
  'مؤسسة',
  'مؤسسه',
  'موسسة',
  'جمعية',
  'جمعيه',
  'أكاديمية',
  'اكاديميه',
  'دار',
  'مركز',
  'مكتب',
  'معهد',
  'العميل',
  'مشروع',
  'السادة',
  'السيد',
];

/** ألقابٌ تسبق أسماء الأشخاص */
const TITLES = ['د', 'أ', 'ا', 'م', 'الدكتور', 'الاستاذ', 'المهندس', 'الشيخ'];

/**
 * لواحقُ وصفية تصف الخدمة لا العميل.
 *
 * **وبلا `\b`**: حدُّ الكلمة في جافاسكربت لاتينيّ صرف، فلا يقع بعد حرف
 * عربي — ونمطٌ يعتمد عليه لا يطابق شيئًا في نصّ عربي (§٧ من الذاكرة).
 */
const TAIL = /\s+(?:نظير|لمشروع|مقابل|بخصوص|تحت حساب)\s[\s\S]*$/;

/**
 * لبّ الاسم — ما يبقى بعد نزع ما لا يُميّز.
 *
 * **ولا يُنزع إلا من الأول والآخر**: «دار العالمية» لبّها «العالمية»،
 * أما «الدار البيضاء» فـ«الدار» فيها جزءٌ من الاسم لا صفة — ولذلك يُنزع
 * ما تلاه فراغٌ فقط، ولا يُمسّ ما التصق.
 */
export function clientCore(raw: string | null | undefined): string {
  let text = normalizeArabic(raw)
    .replace(/[«»"'()[\]|]/g, ' ')
    .replace(TAIL, '')
    .replace(/\s+/g, ' ')
    .trim();

  // الصفات والألقاب — قد تتراكم: «مشروع دار يتخيلون» · «العميل/د.علي»
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of PREFIXES) {
      // يفصلها فراغٌ أو شرطة مائلة: «شركة سوليد» · «العميل/علي»
      const pattern = new RegExp(`^${prefix}\\s*[/]\\s*|^${prefix}\\s+`, 'u');
      if (pattern.test(text)) {
        text = text.replace(pattern, '').trim();
        changed = true;
      }
    }
    const title = text.match(new RegExp(`^(?:${TITLES.join('|')})\\s*[./]\\s*`, 'u'));
    if (title) {
      text = text.slice(title[0].length).trim();
      changed = true;
    }
  }

  // «لـ» و«ال» في أول اللبّ لا تُميّز
  text = text.replace(/^لـ?\s*/u, '').trim();
  return text;
}

/** مفتاح الدمج — لبّ الاسم بلا مسافات ولا «ال» */
export function mergeKey(raw: string | null | undefined): string {
  return clientCore(raw).replace(/ال/g, '').replace(/\s/g, '');
}

/** مسافة التحرير — كم حرفًا يلزم تغييره ليصير أحدهما الآخر */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * هل المفتاحان لعميلٍ واحد على الأرجح؟
 *
 * ثلاث حالات ظهرت في دفاتر المكتب فعلًا:
 *   ١) التطابق — «قرآن هاوس» و«أكاديمية قرآن هاوس» بعد نزع الصفة
 *   ٢) **البادئة** — «يتخيلون» و«يتخيلون للنشر والتوزيع»: أحدهما ذُكر
 *      باسمه المختصر والآخر باسمه الكامل
 *   ٣) **حرفٌ يختلف في اسم أعجميّ** — «ترانسليشن» و«ترانزليشن»
 *
 * **وكلّه اقتراحٌ يُراجَع**: التقريب يُخطئ أحيانًا، والحارس أن أحمد يرى كل
 * دمجٍ قبل أن يقع — لا أن يكون النمط معصومًا.
 */
export function looksSame(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;

  // البادئة — والحدّ ستةُ أحرف فأكثر، فـ«دار» بادئةُ كل شيء
  const shorter = a.length <= b.length ? a : b;
  const longer = shorter === a ? b : a;
  if (shorter.length < 6) return false;
  if (longer.startsWith(shorter)) return true;

  const allowed = shorter.length >= 10 ? 2 : 1;

  // بادئةٌ يختلف فيها حرف — «ترانزليشن هوم» و«ترانسليشن هوم للترجمة»
  if (editDistance(shorter, longer.slice(0, shorter.length)) <= allowed) return true;

  // أو الاسمان كلاهما بفارق حرف — «ترانسليشن» و«ترانزليشن»
  return editDistance(a, b) <= allowed;
}

export type NameOccurrence = {
  /** الاسم كما ورد في المصدر */
  raw: string;
  /** المبلغ المنسوب إليه */
  amount: number;
  /** كم مرة ظهر */
  count: number;
  /** السنوات التي ظهر فيها */
  years: number[];
};

export type MergeGroup = {
  key: string;
  /** الاسم المقترح للعميل — أطول صيغة، فهي أوضحها للقارئ */
  suggested: string;
  variants: NameOccurrence[];
  amount: number;
  count: number;
  years: number[];
};

/**
 * يجمع الأسماء في مجموعات بمفتاح اللبّ.
 *
 * **والاسم المقترح أطول الصيغ** لا أقصرها: «أكاديمية قرآن هاوس» أوضح من
 * «قرآن هاوس» لمن يفتح البطاقة بعد سنتين. وهو اقتراحٌ يُعدَّل.
 */
export function groupNames(occurrences: NameOccurrence[]): MergeGroup[] {
  const groups: MergeGroup[] = [];

  const absorb = (group: MergeGroup, item: NameOccurrence) => {
    group.variants.push(item);
    group.amount += item.amount;
    group.count += item.count;
    for (const year of item.years) if (!group.years.includes(year)) group.years.push(year);
    if (item.raw.length > group.suggested.length) group.suggested = item.raw;
  };

  /**
   * **الأكبر مبلغًا أولًا** — فيصير هو نواة المجموعة ويُضمّ إليه الصغار.
   * ولو بدأنا بالصغير لالتقط بادئتُه عملاء لا تخصّه.
   */
  const ordered = [...occurrences].sort((a, b) => b.amount - a.amount);

  for (const item of ordered) {
    const key = mergeKey(item.raw);
    if (!key) continue;
    const match = groups.find((g) => looksSame(g.key, key));
    if (match) absorb(match, item);
    else {
      groups.push({
        key,
        suggested: item.raw,
        variants: [item],
        amount: item.amount,
        count: item.count,
        years: [...item.years],
      });
    }
  }

  for (const group of groups) {
    group.years.sort();
    group.variants.sort((a, b) => b.amount - a.amount);
  }

  return groups.sort((a, b) => b.amount - a.amount);
}

// ═══════════════════════════════════════════════════════════════
//  ملكية العميل
// ═══════════════════════════════════════════════════════════════

/**
 * **عملاء المدير التنفيذي** — أقرّها أحمد بأسمائها.
 *
 * هؤلاء عملاء قديمة تواصل معها هو بنفسه قبل أن يوظّف فريق مبيعات، فلا
 * تُنسب إلى أحمد مجلي وإن كان هو الوحيد وقتها. والقائمة **بيانات لا كود**:
 * تُعرض في شاشة الترحيل وتُعدَّل، وهذه قيمتها الابتدائية.
 */
export const EXECUTIVE_CLIENT_NAMES = [
  'علي الشبيلي',
  'أكاديمية الأسرة',
  'قرآن هاوس',
  'بصيرة',
  'سلام',
  'ترانزليشن هوم',
  'دار يتخيلون',
  'أبو الهيثم',
  'حصين',
  'مسار الذهبية',
];

const EXECUTIVE_KEYS = new Set(EXECUTIVE_CLIENT_NAMES.map(mergeKey));

/**
 * هل هذا العميل من عملاء المدير التنفيذي؟
 *
 * المطابقة على **لبّ الاسم**، فتلتقط «مركز سلام للدعوة والحوار» و«مشروع
 * سلام» و«شركة ترانسليشن هوم للترجمة» — وهي صيغٌ ظهرت كلّها في الدفاتر.
 */
export function isExecutiveClient(name: string | null | undefined, extra: string[] = []): boolean {
  const key = mergeKey(name);
  if (!key) return false;
  const keys = extra.length ? new Set([...EXECUTIVE_KEYS, ...extra.map(mergeKey)]) : EXECUTIVE_KEYS;
  for (const owned of keys) {
    if (!owned) continue;
    // الاحتواء هنا مقصود: «سلام» تلتقط «مركز سلام للدعوة والحوار»
    if (key.includes(owned) || looksSame(key, owned)) return true;
  }
  return false;
}

export type OwnerRule = {
  /** مالك عملاء التجزئة وما لم يُنصّ عليه — أحمد مجلي */
  defaultOwnerId: string;
  /** مالك العملاء القدامى — المدير التنفيذي */
  executiveOwnerId: string;
  /** أسماء إضافية تُعدّ للمدير التنفيذي — من شاشة الترحيل */
  executiveNames?: string[];
};

/**
 * من يملك هذا العميل؟
 *
 * **وما قاله شيت المبيعات يعلو على القاعدة**: صفٌّ باسم بائعٍ صريح يُنسب
 * إليه — فالقاعدة لمن لم يُذكر له بائع، لا لمن ذُكر.
 */
export function ownerFor(
  name: string | null | undefined,
  rule: OwnerRule,
  sheetOwnerId?: string | null
): string {
  if (sheetOwnerId) return sheetOwnerId;
  return isExecutiveClient(name, rule.executiveNames ?? [])
    ? rule.executiveOwnerId
    : rule.defaultOwnerId;
}
