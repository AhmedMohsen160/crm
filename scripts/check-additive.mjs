/**
 * حارس «التعديلات إضافية فقط».
 *
 * بناء النشر يُنفّذ `prisma db push --accept-data-loss` **قبل** `next build`.
 * فلحظةَ ينتهي الدفع تكون القاعدة جديدةً والنسخة العاملة ما زالت قديمة —
 * وإن كان الدفع قد **حذف عمودًا** فالنسخة القديمة تسأل عن عمودٍ لم يعد
 * موجودًا، فتسقط بخطأ ٥٠٠ حتى يُستبدل الكود. وإن فشل البناء بعده بقيت
 * ساقطةً.
 *
 * ولذلك القاعدة الملزمة (§٣ بند ٧): **العمود الجديد يُولد قابلًا للفراغ،
 * والعمود القديم لا يُحذف** — يُتقاعد ويبقى.
 *
 * هذا السكربت يفرضها: يقارن أعمدة السكيما بلقطةٍ محفوظة، فيسقط إن اختفى
 * عمودٌ أو جدول. والإضافة تمرّ ثم تُحدَّث اللقطة.
 *
 *   npm run check:additive          يفحص
 *   npm run check:additive -- --update   يعتمد الحالة الجديدة لقطةً
 */
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = path.join(process.cwd(), 'prisma', 'schema.prisma');
const SNAPSHOT = path.join(process.cwd(), 'prisma', 'columns.json');

/** يقرأ الجداول وحقولها القياسية — بلا العلاقات، فهي لا تصير أعمدة */
function readColumns(source) {
  const models = {};
  const modelBlocks = source.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm);

  for (const [, name, body] of modelBlocks) {
    const fields = [];
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('///') || line.startsWith('@@')) continue;
      const match = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?/);
      if (!match) continue;
      const [, field, type, isList] = match;
      // العلاقة ليست عمودًا: قائمة، أو نوعٌ هو اسم نموذج آخر
      if (isList) continue;
      if (line.includes('@relation') && !line.includes('fields:')) continue;
      if (/^[A-Z]/.test(type) && !['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'Bytes', 'Decimal', 'BigInt'].includes(type)) continue;
      fields.push(field);
    }
    models[name] = fields.sort();
  }
  return models;
}

const current = readColumns(fs.readFileSync(SCHEMA, 'utf8'));

if (process.argv.includes('--update')) {
  fs.writeFileSync(SNAPSHOT, JSON.stringify(current, null, 2) + '\n');
  const columns = Object.values(current).reduce((sum, f) => sum + f.length, 0);
  console.log(`✓ حُدِّثت اللقطة: ${Object.keys(current).length} جدولًا · ${columns} عمودًا`);
  process.exit(0);
}

if (!fs.existsSync(SNAPSHOT)) {
  console.error('✗ لا لقطة محفوظة. شغّل: npm run check:additive -- --update');
  process.exit(1);
}

const previous = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
const problems = [];

for (const [model, fields] of Object.entries(previous)) {
  if (!current[model]) {
    problems.push(`الجدول «${model}» حُذف`);
    continue;
  }
  for (const field of fields) {
    if (!current[model].includes(field)) {
      problems.push(`العمود «${model}.${field}» حُذف`);
    }
  }
}

if (problems.length > 0) {
  console.error('✗ تعديلٌ يحذف — وبناء النشر يدفع القاعدة قبل الكود:\n');
  for (const problem of problems) console.error('   • ' + problem);
  console.error(
    '\n  أبقِ العمود متقاعدًا (قابلًا للفراغ وبلا استعمال) بدل حذفه.\n' +
      '  وإن كان الحذف مقصودًا فعلًا ومتزامنًا مع النشر:\n' +
      '     npm run check:additive -- --update\n'
  );
  process.exit(1);
}

const added = [];
for (const [model, fields] of Object.entries(current)) {
  if (!previous[model]) {
    added.push(`جدول ${model}`);
    continue;
  }
  for (const field of fields) {
    if (!previous[model].includes(field)) added.push(`${model}.${field}`);
  }
}

console.log(
  added.length > 0
    ? `✓ إضافات فقط: ${added.join(' · ')}`
    : '✓ لا تغيير في أعمدة السكيما'
);
