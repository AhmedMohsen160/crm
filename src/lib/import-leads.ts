/**
 * قراءة شيت الليدز — «سجل العملاء» في `New_lead_tracking`.
 *
 * **ولماذا شيتٌ ثالث بجانب المبيعات والدفتر:** الدفتر يقول ما دخل الخزينة،
 * وشيت المبيعات يقول من اشترى — **وكلاهما صامتٌ عمّن سأل ولم يشترِ**. وهؤلاء
 * ثلثا من تواصل مع المكتب: ١٬٤١٥ استفسارًا من ٢٬١٢٨ في سبعة أشهر.
 *
 * وبلا هم لا يُقاس شيءٌ ممّا يقرّر الإنفاق:
 *   · **تكلفة اكتساب العميل** — إنفاقُ الإعلان مقسومًا على من جاء به، لا على
 *     من اشترى فقط.
 *   · **معدل التحويل** لكل قناة ولكل أدمن ولكل فرع.
 *   · **أسباب الرفض** — وهي وحدها ما يُعلّم المكتب شيئًا عمّا يخسره.
 *
 * ── وثلاث حقائق في هذا الشيت بعينه ────────────────────────────
 *
 * ١) **الليد رقمُ هاتفٍ لا اسم.** ٢٬١١٣ صفًّا فيها هاتف و٦٢ فيها اسم —
 *    فالمفتاح الهاتف، والاسم يُكتب حين يُعرف لا شرطًا للدخول.
 *
 * ٢) **والمحوَّل له مشروعٌ في شيت المبيعات أصلًا.** ٧١٠ صفًّا «تم التحويل =
 *    نعم»، وهي نفسها مشترياتٌ رُصدت هناك. فيُربط الليد بعميلها بالهاتف
 *    **ولا يُفتح له مشروعٌ ثانٍ** — وإلا تضاعف الإيراد.
 *
 * ٣) **ولا يُقرأ إنفاق الإعلان من ورقة «الملخص الشهري».** المصروف التسويقي
 *    مُدخَلٌ مرة واحدة: في الدفتر تحت «مصاريف بيعية وتسويقية». وقراءتُه من
 *    هنا أيضًا تُنتج رقمين لشيء واحد لا يُعرف أيّهما الصحيح.
 */

import { cleanText, normalizeArabic } from './import-ledger-ar';

// ═══════════════════════════════════════════════════════════════
//  ١ · الترويسة
// ═══════════════════════════════════════════════════════════════

/** اسم العمود في الورقة ← مفتاحه عندنا. الترتيب لا يهمّ، الاسم يهمّ */
export const LEAD_HEADERS: Record<string, string> = {
  '#': 'serial',
  التاريخ: 'date',
  'اسم العميل': 'name',
  'رقم الهاتف': 'phone',
  القناة: 'channel',
  'طريقة التواصل': 'contactMethod',
  'أدمن المبيعات': 'admin',
  'تم التحويل؟': 'converted',
  'المبلغ المحصل (EGP)': 'amount',
  الفرع: 'branch',
  'تمت المتابعة؟': 'followedUp',
  'سبب الرفض': 'lossReason',
};

/** مفتاح مطابقة عربيّ بلا همزات ولا تاء مربوطة ولا علامات ترقيم */
function headerKey(value: string | null | undefined): string {
  return normalizeArabic(value).replace(/[^\p{L}\p{N}#]+/gu, '');
}

const HEADER_BY_KEY = new Map(
  Object.entries(LEAD_HEADERS).map(([label, key]) => [headerKey(label), key])
);

export type LeadColumnMap = Partial<Record<string, number>>;

/**
 * يجد صفّ الترويسة ويبني خريطة الأعمدة.
 *
 * **وفوقها صفُّ عنوانٍ لا ترويسة** — الخلية `A1` فيها كلمة `Data` وحدها.
 * فيُبحث عن الصفّ الذي فيه «التاريخ» و«رقم الهاتف» معًا، لا عن أول صفّ
 * فيه نصّ.
 */
export function findLeadsHeader(
  rows: (string | null | undefined)[][],
  limit = 20
): { row: number; columns: LeadColumnMap } | null {
  for (let i = 0; i < Math.min(rows.length, limit); i += 1) {
    const cells = rows[i].map((c) => headerKey(c));
    if (!cells.includes(headerKey('التاريخ'))) continue;
    if (!cells.includes(headerKey('رقم الهاتف'))) continue;

    const columns: LeadColumnMap = {};
    for (const [index, cell] of cells.entries()) {
      const key = HEADER_BY_KEY.get(cell);
      if (key && columns[key] === undefined) columns[key] = index;
    }
    return { row: i, columns };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
//  ٢ · الوسم
// ═══════════════════════════════════════════════════════════════

/** وسمُ سنةٍ من شيت الليدز — تُسحب بضغطة كما يُسحب دفترٌ أو شيت مبيعات */
export function leadsTag(year: number): string {
  return `leads-${year}`;
}

// ═══════════════════════════════════════════════════════════════
//  ٣ · قراءة الحقول
// ═══════════════════════════════════════════════════════════════

/**
 * «نعم» و«لا» — وما عداهما فراغ.
 *
 * **والفراغ ليس «لا»**: خانةٌ لم تُملأ تعني «لم يُسأل» لا «لم يتحوّل»،
 * والفرق في «تمت المتابعة؟» قرارٌ يُتّخذ في حق موظف — ٣٣ صفًّا من ٢٬١٢٨
 * فيها جواب، والباقي لم يُسجَّل أصلًا.
 */
export function yesNo(raw: unknown): boolean | null {
  const text = normalizeArabic(String(raw ?? '')).toLowerCase();
  if (!text) return null;
  if (/^(نعم|yes|y|true|1)$/.test(text)) return true;
  if (/^(لا|no|n|false|0)$/.test(text)) return false;
  return null;
}

/**
 * حالةُ الليد من عمود التحويل.
 *
 * **والذي لم يتحوّل «خاسر» لا «جديد».** الشيت سجلٌّ لما مضى: استفسارُ
 * فبراير لم يعد مفتوحًا في أغسطس، وإدخالُه «جديدًا» يملأ طوابير الفريق
 * بألفٍ وأربعمئة استفسارٍ ميّت ويُنبّههم عليها كل يوم.
 */
export function leadStatusOf(converted: boolean | null): 'WON' | 'LOST' {
  return converted === true ? 'WON' : 'LOST';
}

/** مبلغٌ من خانة قد تحمل فاصلة آلاف أو رمز عملة */
export function parseLeadAmount(raw: unknown): number {
  const value =
    typeof raw === 'number'
      ? raw
      : Number(String(raw ?? '').replace(/[,\s ]/g, '').replace(/[^\d.\-]/g, ''));
  /**
   * **والسالب صفر لا سالب.** «المبلغ المحصَّل» لا يكون سالبًا — والسالب
   * فيه ردٌّ كُتب في الخانة الخطأ. وحملُه يُنقص إيرادَ الشهر من شاشةٍ
   * ليست مصدرَ الإيراد أصلًا.
   */
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * سببُ الرفض كما كتبه الأدمن — نصًّا حرًّا يُحفظ كما هو.
 *
 * **ولا يُصنَّف تلقائيًّا في الترحيل.** «السعر كان عالي بالنسبة له» و«كان
 * يعتقد أن المكتب مكتب توثيقات» سببان مختلفان تمامًا، وطيُّهما في «السعر»
 * يُخفي أن جزءًا من الإعلان يجلب من لا يريد الخدمة أصلًا — وهي أهمّ ما في
 * الشيت.
 */
export function lossReasonOf(raw: unknown): string | null {
  const text = cleanText(String(raw ?? ''));
  return text ? text.slice(0, 500) : null;
}

/** اسم الليد حين يُكتب — و«غير محدد» و«—» غيابٌ لا اسم */
export function leadNameOf(raw: unknown): string | null {
  const text = cleanText(String(raw ?? ''));
  if (!text || text === '—' || text === '-') return null;
  if (normalizeArabic(text) === normalizeArabic('غير محدد')) return null;
  return text.slice(0, 120);
}
