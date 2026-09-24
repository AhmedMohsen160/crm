import { inflateRawSync } from 'node:zlib';

/**
 * قارئ ملفات إكسل — بلا مكتبة.
 *
 * **لماذا بلا مكتبة:** أقربُ مكتبةٍ صالحة تزن ٢٣ ميجابايت وتجرّ معها ثغرةً
 * معلنة في تابعٍ لها. وهذا ثمنٌ باهظ لقراءة جدول — والقراءة نفسها مفهومة:
 * ملفّ `xlsx` أرشيفُ ZIP فيه ملفات XML، وNode يفكّ ضغط ZIP بنفسه.
 *
 * وهي نفس القاعدة التي بُنيت بها الرسوم: **HTML خالص بلا مكتبة**.
 *
 * ── ما يقرؤه ─────────────────────────────────────────────────
 *   · أسماء الأوراق بترتيبها
 *   · النصوص المشتركة (`sharedStrings`) والنصوص المضمَّنة
 *   · الأرقام، والتواريخ (بكشف نمط التنسيق لا بالتخمين)
 *   · الخلايا الفارغة — تُعاد `null` في موضعها فلا تنزلق الأعمدة
 *
 * ── وما لا يقرؤه عمدًا ───────────────────────────────────────
 *   الصيغ (يُقرأ ناتجها المخزَّن)، والتنسيق، والصور، والجداول المحورية.
 *   ولا يحتاجها ترحيل دفتر.
 */

// ═══════════════════════════════════════════════════════════════
//  ١ · فكّ أرشيف ZIP
// ═══════════════════════════════════════════════════════════════

/**
 * يستخرج ملفات الأرشيف بأسمائها.
 *
 * **ويُقرأ من الفهرس المركزي لا بمسح الملف**: المسح الأمامي يلتقط بايتاتٍ
 * داخل بياناتٍ مضغوطة تُشبه ترويسةً فيُفسد كل ما بعدها.
 */
export function unzip(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();

  // نهاية الفهرس المركزي: توقيعها في آخر ٦٥ ألف بايت على الأكثر
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x0605_4b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('ليس ملف إكسل صالحًا — لم يُعثر على فهرس الأرشيف');

  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);

  for (let n = 0; n < count; n += 1) {
    if (buffer.readUInt32LE(at) !== 0x0201_4b50) break;
    const method = buffer.readUInt16LE(at + 10);
    const compressedSize = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const localAt = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);

    // الترويسة المحلية: طولا الاسم والحقول الإضافية فيها قد يخالفان المركزي
    const localNameLength = buffer.readUInt16LE(localAt + 26);
    const localExtraLength = buffer.readUInt16LE(localAt + 28);
    const dataAt = localAt + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataAt, dataAt + compressedSize);

    if (method === 0) files.set(name, Buffer.from(raw));
    else if (method === 8) files.set(name, inflateRawSync(raw));
    // طرقُ ضغطٍ أخرى لا تُنتجها برامج الجداول — تُتخطّى ولا تُوقف الملف

    at += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

// ═══════════════════════════════════════════════════════════════
//  ٢ · XML — قراءةٌ بقدر الحاجة
// ═══════════════════════════════════════════════════════════════

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

export function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (match) => ENTITIES[match] ?? match);
}

/** كل نصوص `<t>` داخل مقطع — وهي أجزاء النصّ المنسَّق */
function textOf(fragment: string): string {
  const parts = [...fragment.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]));
  return parts.join('');
}

// ═══════════════════════════════════════════════════════════════
//  ٣ · التواريخ
// ═══════════════════════════════════════════════════════════════

/** أنماط التنسيق المدمجة التي تعني تاريخًا (١٤ إلى ٢٢ و٤٥ إلى ٤٧) */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/**
 * رقم إكسل التسلسلي ← تاريخ.
 *
 * **وخطأُ سنة ١٩٠٠ محفوظ عمدًا**: إكسل يعدّ ١٩٠٠ سنةً كبيسة وليست كذلك،
 * فالمعادلة تطرح ٢٥٥٦٩ لا ٢٥٥٦٨ — وبها تُطابق تواريخُنا تواريخَه.
 */
export function serialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const ms = Math.round((serial - 25_569) * 86_400_000);
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ═══════════════════════════════════════════════════════════════
//  ٤ · القراءة
// ═══════════════════════════════════════════════════════════════

export type CellValue = string | number | Date | null;

export type Workbook = {
  sheetNames: string[];
  /** صفوف الورقة بترتيبها — الخلية الفارغة `null` في موضعها */
  sheet(name: string): CellValue[][];
};

/** رقم العمود من مرجع الخلية: `A1` صفر · `AB7` سبعة وعشرون */
export function columnOf(ref: string): number {
  let index = 0;
  for (const char of ref) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) break;
    index = index * 26 + (code - 64);
  }
  return index - 1;
}

export function readWorkbook(buffer: Buffer): Workbook {
  const files = unzip(buffer);
  const read = (path: string) => files.get(path)?.toString('utf8') ?? '';

  // النصوص المشتركة — أغلب خلايا النصّ تشير إليها بفهرسها
  const shared: string[] = [];
  const sharedXml = read('xl/sharedStrings.xml');
  for (const match of sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    shared.push(textOf(match[1]));
  }

  // أنماط التنسيق — بها يُعرف أنّ الرقم تاريخ
  const stylesXml = read('xl/styles.xml');
  const customDateFormats = new Set<number>();
  for (const match of stylesXml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    // نمطٌ فيه يوم أو شهر أو سنة تاريخٌ — والساعة وحدها ليست كذلك
    if (/[dmyDMY]/.test(decodeXml(match[2]))) customDateFormats.add(Number(match[1]));
  }
  const cellFormats: number[] = [];
  const xfsBlock = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? '';
  for (const match of xfsBlock.matchAll(/<xf\b[^>]*numFmtId="(\d+)"[^>]*\/?>/g)) {
    cellFormats.push(Number(match[1]));
  }
  const isDateStyle = (styleIndex: number | null) => {
    if (styleIndex === null || styleIndex >= cellFormats.length) return false;
    const format = cellFormats[styleIndex];
    return BUILTIN_DATE_FORMATS.has(format) || customDateFormats.has(format);
  };

  // الأوراق: الاسم من `workbook.xml` والمسار من ملف العلاقات
  const targets = new Map<string, string>();
  for (const match of read('xl/_rels/workbook.xml.rels').matchAll(
    /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g
  )) {
    targets.set(match[1], match[2].replace(/^\/?xl\//, '').replace(/^\//, ''));
  }

  const sheets = new Map<string, string>();
  const sheetNames: string[] = [];
  for (const match of read('xl/workbook.xml').matchAll(/<sheet\b[^>]*\/?>/g)) {
    const tag = match[0];
    const name = decodeXml(tag.match(/name="([^"]*)"/)?.[1] ?? '');
    const rid = tag.match(/r:id="([^"]+)"/)?.[1] ?? '';
    const target = targets.get(rid);
    if (!name || !target) continue;
    sheetNames.push(name);
    sheets.set(name, `xl/${target}`);
  }

  function sheet(name: string): CellValue[][] {
    const path = sheets.get(name);
    if (!path) throw new Error(`لا توجد ورقة باسم «${name}»`);
    const xml = files.get(path)?.toString('utf8') ?? '';
    const rows: CellValue[][] = [];

    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g)) {
      const body = rowMatch[1] ?? '';
      const cells: CellValue[] = [];

      /**
       * **والسمات غير جشعة عمدًا**: `[^>]*` الجشع يبتلع شرطةَ الخلية
       * المغلقة على نفسها (`<c r="A6"/>`) فيظنّها خليةً مفتوحة، ثم يبحث عن
       * `</c>` فيلتهم الخلية التالية كلها. وبها ضاع أول عمودٍ في كل صف.
       */
      for (const cellMatch of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cellMatch[1] ?? '';
        const inner = cellMatch[2] ?? '';
        const ref = attrs.match(/r="([A-Z]+)\d+"/)?.[1];
        const at = ref ? columnOf(ref) : cells.length;
        const type = attrs.match(/t="([^"]+)"/)?.[1] ?? 'n';
        const styleRaw = attrs.match(/s="(\d+)"/)?.[1];
        const style = styleRaw === undefined ? null : Number(styleRaw);

        // الخلايا المتخطّاة تبقى فارغة في مواضعها فلا تنزلق الأعمدة
        while (cells.length < at) cells.push(null);

        let value: CellValue = null;
        if (type === 's') {
          const index = Number(inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '-1');
          value = shared[index] ?? null;
        } else if (type === 'inlineStr') {
          value = textOf(inner) || null;
        } else if (type === 'str' || type === 'e') {
          value = decodeXml(inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '') || null;
        } else if (type === 'b') {
          value = inner.includes('<v>1</v>') ? 'TRUE' : 'FALSE';
        } else {
          const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
          if (raw !== undefined && raw !== '') {
            const number = Number(raw);
            value = Number.isFinite(number)
              ? isDateStyle(style)
                ? (serialToDate(number) ?? number)
                : number
              : null;
          }
        }

        cells[at] = value;
      }

      rows.push(cells);
    }

    return rows;
  }

  return { sheetNames, sheet };
}
