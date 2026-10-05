/**
 * يبني ملف وورد عربيًّا من دليل المبرمج.
 *
 * التحدّي كلُّه في الاتجاه: كل فقرة تحتاج `bidirectional` وكل تشغيلة نصّ
 * تحتاج `rightToLeft`، وإلا انقلبت علامات الترقيم إلى يسار السطر.
 */
const fs = require('fs');

/**
 * **و`docx` ليست من حزم المشروع عمدًا.**
 *
 * هذا المولِّد يُشغَّل مرةً كل بضعة أشهر حين يتغيّر الدليل، وإضافتُها إلى
 * `package.json` تُثقل كل `npm install` بحزمةٍ لا يحتاجها التشغيل ولا البناء.
 */
try {
  require.resolve('docx');
} catch {
  console.error('ينقص حزمة `docx`. شغّل أولًا:  npm i --no-save docx');
  process.exit(1);
}

const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  LevelFormat, PageBreak, TableLayoutType, VerticalAlign,
} = require('docx');

const MD = fs.readFileSync('/home/user/crm/docs/DEVELOPER-HANDOVER.md', 'utf8');
const OUT = process.argv[2] || '/home/user/crm/دليل-المبرمج-ومستند-التسليم.docx';

// ── الهوية ───────────────────────────────────────────────────────
const NAVY = '242E5B';
const BLUE = '2B57A6';
const LIME = 'C4D82E';
const INK = '1B2036';
const INK2 = '4A5169';
const LINE = 'DFE1EC';
const SUNKEN = 'F3F4F8';
const AMBER = 'FBF1DF';

const FONT = 'Arial';
const MONO = 'Consolas';

/** عرض النصّ داخل الصفحة بالـDXA (A4 بهوامش ٢سم) */
const PAGE_W = 11906;
const MARGIN = 1134;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ── أدوات ────────────────────────────────────────────────────────

/** يفكّ الماركداون السطريّ إلى تشغيلات نصّ — عريض وكود */
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m;
  const push = (t, extra) => {
    if (!t) return;
    out.push(new TextRun({
      text: t, font: extra.font || FONT, size: extra.size || base.size || 20,
      bold: extra.bold || base.bold || false,
      color: extra.color || base.color || INK,
      rightToLeft: true, ...extra.more,
    }));
  };
  while ((m = re.exec(text)) !== null) {
    push(text.slice(last, m.index), {});
    const tok = m[0];
    if (tok.startsWith('**')) push(tok.slice(2, -2), { bold: true, color: NAVY });
    else push(tok.slice(1, -1), { font: MONO, size: (base.size || 20) - 2, color: BLUE });
    last = m.index + tok.length;
  }
  push(text.slice(last), {});
  return out.length ? out : [new TextRun({ text: ' ', font: FONT, rightToLeft: true })];
}

const P = (text, opts = {}) => new Paragraph({
  bidirectional: true,
  alignment: opts.alignment || AlignmentType.RIGHT,
  spacing: { after: opts.after ?? 120, line: opts.line ?? 300 },
  indent: opts.indent,
  shading: opts.shading,
  border: opts.border,
  children: typeof text === 'string' ? runs(text, opts) : text,
  ...(opts.extra || {}),
});

const H = (text, level, size, color) => new Paragraph({
  bidirectional: true,
  alignment: AlignmentType.RIGHT,
  heading: level,
  spacing: { before: 320, after: 160 },
  children: [new TextRun({ text: text.replace(/[*`]/g, ''), font: FONT, size, bold: true, color, rightToLeft: true })],
});

/** خطّ فاصل — حدّ سفليّ على فقرة، لا جدول */
const RULE = () => new Paragraph({
  bidirectional: true, spacing: { before: 200, after: 200 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE } },
  children: [new TextRun({ text: '', font: FONT })],
});

function cell(text, { header = false, width, bg } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill: bg || (header ? SUNKEN : 'FFFFFF'), color: 'auto' },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      spacing: { after: 0, line: 260 },
      children: runs(text, { size: 18, bold: header, color: header ? INK2 : INK }),
    })],
  });
}

function table(rows) {
  const cols = Math.max(...rows.map((r) => r.length));
  const widths = [];
  // العمود الأول أعرض — فيه النصّ الشارح غالبًا
  if (cols === 2) widths.push(Math.round(CONTENT_W * 0.42), Math.round(CONTENT_W * 0.58));
  else {
    const w = Math.floor(CONTENT_W / cols);
    for (let i = 0; i < cols; i++) widths.push(i === cols - 1 ? CONTENT_W - w * (cols - 1) : w);
  }
  const border = { style: BorderStyle.SINGLE, size: 2, color: LINE };
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    visuallyRightToLeft: true,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: rows.map((r, ri) => new TableRow({
      tableHeader: ri === 0,
      children: widths.map((w, ci) => cell(r[ci] ?? '', { header: ri === 0, width: w })),
    })),
  });
}

// ── التحليل ──────────────────────────────────────────────────────
const lines = MD.split('\n');
const body = [];
let i = 0, inCode = false, codeBuf = [];

while (i < lines.length) {
  const ln = lines[i];

  if (ln.startsWith('```')) {
    if (!inCode) { inCode = true; codeBuf = []; i++; continue; }
    inCode = false;
    body.push(new Paragraph({
      spacing: { before: 120, after: 160, line: 260 },
      alignment: AlignmentType.LEFT,
      shading: { type: ShadingType.CLEAR, fill: SUNKEN, color: 'auto' },
      border: {
        top: { style: BorderStyle.SINGLE, size: 2, color: LINE },
        bottom: { style: BorderStyle.SINGLE, size: 2, color: LINE },
        left: { style: BorderStyle.SINGLE, size: 2, color: LINE },
        right: { style: BorderStyle.SINGLE, size: 2, color: LINE },
      },
      children: codeBuf.flatMap((l, n) => [
        ...(n ? [new TextRun({ break: 1 })] : []),
        new TextRun({ text: l || ' ', font: MONO, size: 17, color: INK2 }),
      ]),
    }));
    i++; continue;
  }
  if (inCode) { codeBuf.push(ln); i++; continue; }

  // ترويسات
  if (ln.startsWith('# ')) {
    body.push(H(ln.slice(2), HeadingLevel.TITLE, 40, NAVY)); i++; continue;
  }
  if (ln.startsWith('## ')) {
    if (body.length) body.push(new Paragraph({ children: [new PageBreak()] }));
    body.push(H(ln.slice(3), HeadingLevel.HEADING_1, 30, NAVY)); i++; continue;
  }
  if (ln.startsWith('### ')) {
    body.push(H(ln.slice(4), HeadingLevel.HEADING_2, 24, BLUE)); i++; continue;
  }

  // اقتباس
  if (ln.startsWith('>')) {
    const buf = [];
    while (i < lines.length && lines[i].startsWith('>')) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
    body.push(new Paragraph({
      bidirectional: true, alignment: AlignmentType.RIGHT,
      spacing: { before: 140, after: 160, line: 300 },
      indent: { left: 200, right: 200 },
      shading: { type: ShadingType.CLEAR, fill: AMBER, color: 'auto' },
      border: { right: { style: BorderStyle.SINGLE, size: 18, color: LIME } },
      children: runs(buf.join(' ').trim(), { size: 19, color: INK2 }),
    }));
    continue;
  }

  // جدول
  if (ln.startsWith('|')) {
    const raw = [];
    while (i < lines.length && lines[i].startsWith('|')) { raw.push(lines[i]); i++; }
    const rows = raw
      .map((r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
      .filter((r) => !r.every((c) => /^:?-+:?$/.test(c) || c === ''));
    if (rows.length) body.push(table(rows));
    body.push(P('', { after: 160 }));
    continue;
  }

  // فاصل
  if (/^---+$/.test(ln.trim())) { body.push(RULE()); i++; continue; }

  // قائمة مرقّمة
  if (/^\d+\.\s/.test(ln)) {
    while (i < lines.length && (/^\d+\.\s/.test(lines[i]) || /^\s{3,}\S/.test(lines[i]))) {
      if (/^\d+\.\s/.test(lines[i])) {
        let t = lines[i].replace(/^\d+\.\s/, '');
        const num = lines[i].match(/^(\d+)\./)[1];
        i++;
        while (i < lines.length && /^\s{3,}\S/.test(lines[i])) { t += ' ' + lines[i].trim(); i++; }
        body.push(P([
          new TextRun({ text: num + '. ', font: FONT, size: 20, bold: true, color: NAVY, rightToLeft: true }),
          ...runs(t),
        ], { indent: { right: 280, hanging: 220 }, after: 90 }));
      } else i++;
    }
    continue;
  }

  // قائمة نقطية
  if (/^-\s/.test(ln)) {
    while (i < lines.length && (/^-\s/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
      if (/^-\s/.test(lines[i])) {
        let t = lines[i].slice(2);
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) { t += ' ' + lines[i].trim(); i++; }
        body.push(P([
          new TextRun({ text: '• ', font: FONT, size: 20, color: LIME, bold: true, rightToLeft: true }),
          ...runs(t),
        ], { indent: { right: 280, hanging: 200 }, after: 90 }));
      } else i++;
    }
    continue;
  }

  if (!ln.trim()) { i++; continue; }

  // فقرة — تُلمّ أسطرها المتتالية
  const para = [];
  while (i < lines.length && lines[i].trim() && !/^(#|>|\||-\s|\d+\.\s|```|---)/.test(lines[i])) {
    para.push(lines[i].trim()); i++;
  }
  body.push(P(para.join(' ')));
}

// ── المستند ──────────────────────────────────────────────────────
const doc = new Document({
  creator: 'Fast Trans',
  title: 'دليل المبرمج ومستند التسليم — فاست ترانس CRM',
  description: 'دليل كامل للمبرمج الذي سيتولّى منصة فاست ترانس، ومعه قائمة استلام',
  styles: {
    default: {
      document: { run: { font: FONT, size: 20, color: INK, rightToLeft: true }, paragraph: { bidirectional: true } },
    },
  },
  sections: [{
    properties: {
      page: {
        size: { width: PAGE_W, height: 16838 },
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      },
      bidi: true,
    },
    children: body,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log('✓ ' + OUT + ' — ' + (buf.length / 1024).toFixed(0) + ' كيلوبايت · ' + body.length + ' عنصرًا');
});
