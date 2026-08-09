/**
 * قراءة شيت المبيعات — القواعد الخالصة.
 *
 * الشيت ورقةٌ اسمها `DATA` يكتبها فريق المبيعات منذ نوفمبر ٢٠٢٢. وترويستها
 * إنجليزية فيها أخطاء إملائية بقيت سنوات (`Rٌequested` بضمّةٍ عربية عالقة،
 * و`Handeld`) — **فتُقرأ بالأسماء تسامحًا لا بترتيب الأعمدة**: من يعدّ
 * الأعمدة يعمى عن أول عمودٍ يُدرج في المنتصف.
 */

/** الأعمدة التي نحتاجها — وكلٌّ بأسمائه كما ظهرت في الشيت */
const COLUMN_NAMES: Record<string, string[]> = {
  date: ['date'],
  name: ['client name', 'clientname'],
  phone: ['phone number', 'phone', 'phonenumber'],
  platform: ['communication platform', 'platform'],
  translationType: ['translation type'],
  service: ['requested services', 'requested service', 'services'],
  pages: ['number of pages', 'pages'],
  funnel: ['funnel', 'marketing funnel'],
  branch: ['branch'],
  admin: ['sales admin', 'admin'],
  price: ['price collected', 'price'],
  country: ['customer country', 'country'],
  onDeadline: ['on deadline', 'ondeadline'],
  problem: ['with problem?', 'with problem', 'problem'],
};

export type SalesColumns = Partial<Record<keyof typeof COLUMN_NAMES, number>> & {
  date: number;
  name: number;
};

/** الضمّة العربية العالقة في `Rٌequested` تُنزع، والفراغات تُطوى */
function headerKey(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[ً-ْـ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * يجد صفّ الترويسة وأعمدته.
 *
 * **ولا يُقبل صفٌّ ترويسةً إلا بعمودَي التاريخ والاسم** — فبقية الأعمدة
 * اختيارية، وورقةٌ بلا هذين ليست شيت مبيعات.
 */
export function findSalesHeader(
  rows: unknown[][],
  limit = 20
): { row: number; columns: SalesColumns } | null {
  for (let i = 0; i < Math.min(limit, rows.length); i += 1) {
    const cells = rows[i] ?? [];
    const found: Record<string, number> = {};
    for (const [at, cell] of cells.entries()) {
      const key = headerKey(cell);
      if (!key) continue;
      for (const [field, names] of Object.entries(COLUMN_NAMES)) {
        // **أول ظهورٍ يفوز**: الشيت يعيد عمود `date` في آخر الصف وهو
        // عمود متابعةٍ لا تاريخ الطلب
        if (found[field] === undefined && names.includes(key)) found[field] = at;
      }
    }
    if (found.date !== undefined && found.name !== undefined) {
      return { row: i, columns: found as SalesColumns };
    }
  }
  return null;
}

/**
 * اسم العميل كما يُحفظ.
 *
 * **يُنظَّف ولا يُطبَّع**: الفراغات الزائدة والمحارف غير المرئية تُزال —
 * أما الهمزة والتاء المربوطة فتبقيان، فالاسم يُعرض للموظف ويُقرأ.
 */
export function cleanClientName(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * مفتاح العميل حين يتعذّر الهاتف.
 *
 * الشيت فيه عشرات الصفوف بلا رقم — وردُّها يُسقط بيعًا حدث فعلًا. فتُجمَّع
 * **بالاسم**: صفّان باسم «هبه عادل» بلا رقم عميلٌ واحد لا اثنان، وسجلُّ
 * مشترياته يبقى متّصلًا.
 *
 * والبادئة صريحة (`NAME:`) فلا يلتبس بهاتفٍ مطبَّع في أي شاشة.
 */
export function nameKeyOf(name: string): string {
  return `NAME:${name.replace(/\s+/g, '')}`;
}

/**
 * وسمُ الترحيل لسنةٍ من شيت المبيعات.
 *
 * **بالسنة لا بالملف كلّه**: فتُعاد سنةٌ وحدها حين يُصحَّح شيتها، ويبقى ما
 * قبلها في مكانه — وأحمد يرفع ٢٠٢٦ بعد أن يستقرّ ما قبله.
 */
export function salesTag(year: number): string {
  return `sales-${year}`;
}

/** هل الوسم من ترحيل تاريخيّ أصلًا؟ — يحرس زرّ السحب من وسمٍ مخترَع */
export function isImportTag(tag: string): boolean {
  return /^(ledger|sales|settle)-\d{4}$/.test(tag);
}
