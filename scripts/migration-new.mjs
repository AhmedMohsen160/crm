/**
 * يولّد ملف ترحيل جديدًا من الفرق بين المخطط الحالي وآخر حالة مُرحَّلة.
 *
 * **يعمل بلا قاعدة بيانات حيّة**: الفرق يُحسب بين ملفَّي مخطط لا بين قاعدتين،
 * فلا يحتاج «قاعدة ظلّ» ولا اتصالًا بالإنتاج. وهذا مقصود — من يبني الميزة
 * لا يجوز أن يحتاج رابط قاعدة الإنتاج ليكتب ترحيلها.
 *
 * والملفات كلها **بلهجة PostgreSQL** لأنها للإنتاج وحده؛ وجهاز التطوير يبقى
 * على SQLite بـ`db push` — قاعدةٌ يُعاد بناؤها في ثانية لا تحتاج ترحيلًا.
 *
 * الاستعمال:  npm run migration:new -- اسم_الترحيل
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/i.test(name)) {
  console.error('اكتب اسمًا للترحيل بحروف لاتينية وشرطات سفلية:');
  console.error('  npm run migration:new -- add_client_segment');
  process.exit(1);
}

const root = process.cwd();
const schemaPath = path.join(root, 'prisma', 'schema.prisma');
const statePath = path.join(root, 'prisma', 'migrations', '.schema-state.prisma');

if (!existsSync(statePath)) {
  console.error('✗ لا توجد حالة مرجعية — أُنشئت مع الأساس 0_init ولا يجوز حذفها');
  process.exit(1);
}

// نسخة PostgreSQL من المخطط الحالي — الملفات للإنتاج وحده
const current = readFileSync(schemaPath, 'utf8').replace(
  /provider\s*=\s*"sqlite"/,
  'provider = "postgresql"'
);
const currentPath = path.join(root, 'prisma', 'migrations', '.next.prisma');
writeFileSync(currentPath, current);

const sql = execFileSync(
  'npx',
  [
    'prisma',
    'migrate',
    'diff',
    '--from-schema-datamodel',
    statePath,
    '--to-schema-datamodel',
    currentPath,
    '--script',
  ],
  { encoding: 'utf8' }
);

if (!sql.trim() || sql.includes('-- This is an empty migration')) {
  console.log('• لا فرق بين المخطط وآخر حالة مُرحَّلة — لا ملف يُنشأ');
  process.exit(0);
}

/**
 * **حارس الإضافة**: الترحيل الذي يُسقط عمودًا أو جدولًا لا يُولَّد صامتًا.
 * النشر يدفع القاعدة قبل أن يبني الكود، فحذفُ عمود يُسقط النسخة العاملة قبل
 * وصول بديلها — وهو الخطأ الذي وقع مرة في المرحلة ١٦.
 */
const destructive = /DROP\s+(TABLE|COLUMN)/i.exec(sql);
if (destructive) {
  console.error(`✗ الترحيل يحذف (${destructive[0]}) — والعمود يُتقاعد ولا يُحذف.`);
  console.error('  إن كان الحذف مقصودًا فاكتب الملف بيدك واشرح لماذا في تعليق.');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const dir = path.join(root, 'prisma', 'migrations', `${stamp}_${name}`);
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, 'migration.sql'), sql);

// الحالة المرجعية تتقدّم — الترحيل التالي يُقاس عليها
writeFileSync(statePath, current);

console.log(`✓ ${path.relative(root, path.join(dir, 'migration.sql'))}`);
console.log('  اقرأه قبل الدفع — هو ما سيُنفَّذ على قاعدة الإنتاج.');
