/**
 * اختبار قارئ ملفات إكسل المكتوب بلا مكتبة.
 *
 * **والملفّ المختبَر يُبنى هنا** — أرشيف ZIP حقيقي بملفات XML حقيقية، لا
 * نصٌّ يُتظاهر بأنه ملف. فما يمرّ هنا يمرّ على ملفّ إكسل فعليّ.
 *
 * ويحرس المصيدة التي كلّفتنا عمودًا: **الخلية المغلقة على نفسها**
 * (`<c r="A6"/>`) يبتلعها نمطٌ جشع فيلتهم الخلية التي بعدها.
 *
 * التشغيل:  npm run test:xlsx
 */
import { deflateRawSync } from 'node:zlib';
import { unzip, readWorkbook, columnOf, decodeXml, serialToDate } from '../src/lib/xlsx.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}
function eq(actual, expected, label) {
  check(
    JSON.stringify(actual) === JSON.stringify(expected),
    label,
    `نتج ${JSON.stringify(actual)} والمتوقع ${JSON.stringify(expected)}`
  );
}

// ── بناء أرشيف ZIP حقيقي ────────────────────────────────────
function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const raw = Buffer.from(text, 'utf8');
    const packed = deflateRawSync(raw);
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(Buffer.concat([local, nameBuf, packed]));

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(packed.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([dir, nameBuf]));

    offset += 30 + nameBuf.length + packed.length;
  }
  const body = Buffer.concat(locals);
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, directory, end]);
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

console.log('\n── ١ · فكّ الأرشيف ──────────────────────────────────\n');

const archive = zip([
  ['a.txt', 'أوّل'],
  ['dir/b.txt', 'ثانٍ'],
]);
const files = unzip(archive);
eq(files.size, 2, 'ملفّان في الأرشيف');
eq(files.get('a.txt')?.toString('utf8'), 'أوّل', 'ومحتوى الأول بالعربية سليم');
eq(files.get('dir/b.txt')?.toString('utf8'), 'ثانٍ', 'والثاني في مجلّده');

let threw = false;
try {
  unzip(Buffer.from('ليس أرشيفًا'));
} catch {
  threw = true;
}
check(threw, 'وما ليس أرشيفًا يُرفض برسالة لا يُقرأ بالتخمين');

console.log('\n── ٢ · مرجع العمود ──────────────────────────────────\n');

eq(columnOf('A1'), 0, 'العمود A صفر');
eq(columnOf('B7'), 1, 'وB واحد');
eq(columnOf('Z1'), 25, 'وZ خمسة وعشرون');
eq(columnOf('AA1'), 26, 'وAA ستة وعشرون');
eq(columnOf('AB12'), 27, 'وAB سبعة وعشرون');

console.log('\n── ٣ · فكّ ترميز XML ────────────────────────────────\n');

eq(decodeXml('&amp;'), '&', 'العطف');
eq(decodeXml('&lt;a&gt;'), '<a>', 'والأقواس');
eq(decodeXml('&#x645;'), 'م', 'والحرف بالست عشري');
eq(decodeXml('&#1605;'), 'م', 'وبالعشري');

console.log('\n── ٤ · التواريخ ─────────────────────────────────────\n');

eq(serialToDate(44927)?.toISOString().slice(0, 10), '2023-01-01', '٤٤٩٢٧ هو أول ٢٠٢٣');
eq(serialToDate(44562)?.toISOString().slice(0, 10), '2022-01-01', 'و٤٤٥٦٢ أول ٢٠٢٢');
eq(serialToDate(0), null, 'والصفر ليس تاريخًا');
eq(serialToDate(-5), null, 'ولا السالب');

console.log('\n── ٥ · قراءة ورقة كاملة ─────────────────────────────\n');

const book = zip([
  [
    'xl/workbook.xml',
    `<workbook xmlns:r="x"><sheets><sheet name="قيود اليومية" sheetId="1" r:id="rId1"/><sheet name="ميزان" sheetId="2" r:id="rId2"/></sheets></workbook>`,
  ],
  [
    'xl/_rels/workbook.xml.rels',
    `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`,
  ],
  [
    'xl/sharedStrings.xml',
    `<sst><si><t>التاريخ</t></si><si><t>مدين</t></si><si><t>الحساب الرئيسي</t></si><si><t>النقدية</t></si></sst>`,
  ],
  [
    'xl/styles.xml',
    `<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="2"/></cellXfs></styleSheet>`,
  ],
  [
    'xl/worksheets/sheet1.xml',
    `<worksheet><sheetData>` +
      // الترويسة — وأول خلية **مغلقة على نفسها**: هي المصيدة
      `<row r="1"><c r="A1" s="0"/><c r="B1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row>` +
      // صفّ بيانات: تاريخ بنمط تاريخ، ورقم، ونصّ مشترك، ونصّ من صيغة
      `<row r="2"><c r="A2"><v>1</v></c><c r="B2" s="1"><v>44927</v></c><c r="C2" s="2"><v>12917.5</v></c><c r="D2" t="s"><v>3</v></c><c r="E2" t="str"><f>X()</f><v> 12,917 </v></c></row>` +
      // صفّ فيه فجوة: العمود C متخطّى تمامًا
      `<row r="3"><c r="A3"><v>2</v></c><c r="D3" t="inlineStr"><is><t>مضمَّن</t></is></c></row>` +
      `</sheetData></worksheet>`,
  ],
  ['xl/worksheets/sheet2.xml', `<worksheet><sheetData/></worksheet>`],
]);

const wb = readWorkbook(book);
eq(wb.sheetNames, ['قيود اليومية', 'ميزان'], 'الأوراق بأسمائها وترتيبها');

const rows = wb.sheet('قيود اليومية');
eq(rows.length, 3, 'ثلاثة صفوف');
eq(
  rows[0],
  [null, 'التاريخ', 'مدين', 'الحساب الرئيسي'],
  '★ **والخلية المغلقة على نفسها لا تبتلع التي بعدها** — بها ضاع عمود التاريخ'
);
eq(rows[1][0], 1, 'الرقم يُقرأ رقمًا');
eq(
  rows[1][1] instanceof Date ? rows[1][1].toISOString().slice(0, 10) : rows[1][1],
  '2023-01-01',
  '★ **والتاريخ يُكشف بنمط تنسيقه** — لا بالتخمين على كل رقم'
);
eq(rows[1][2], 12917.5, 'والمبلغ بكسره — ونمطه ليس تاريخًا فلا يُحوَّل');
eq(rows[1][3], 'النقدية', 'والنصّ المشترك بفهرسه');
eq(rows[1][4], ' 12,917 ', 'وناتج الصيغة نصًّا كما خُزِّن');
eq(
  rows[2],
  [2, null, null, 'مضمَّن'],
  '★ **والعمود المتخطّى يبقى فارغًا في موضعه** — فلا تنزلق الأعمدة'
);

let missing = false;
try {
  wb.sheet('ورقة لا وجود لها');
} catch {
  missing = true;
}
check(missing, 'وورقةٌ لا وجود لها تُرفض باسمها');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
