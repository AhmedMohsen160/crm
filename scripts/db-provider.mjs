/**
 * يضبط نوع قاعدة البيانات في ملف المخطط قبل البناء.
 *
 * Prisma لا يسمح بقراءة نوع القاعدة من متغيّر بيئة، لذا نكتبه هنا:
 *   - على جهازك:   SQLite (ملف واحد، بلا أي إعداد)
 *   - على السيرفر: PostgreSQL (يتحمّل عدة مستخدمين ولا يضيع عند إعادة النشر)
 *
 * يُستدعى تلقائيًا قبل npm run build و npm run dev.
 * لتغيير النوع اضبط المتغيّر DATABASE_PROVIDER=postgresql
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SCHEMA = new URL('../prisma/schema.prisma', import.meta.url);
const ALLOWED = ['sqlite', 'postgresql'];

const provider = (process.env.DATABASE_PROVIDER ?? 'sqlite').trim();

if (!ALLOWED.includes(provider)) {
  console.error(
    `✗ DATABASE_PROVIDER غير مدعوم: "${provider}" — المسموح: ${ALLOWED.join(' أو ')}`
  );
  process.exit(1);
}

const schema = readFileSync(SCHEMA, 'utf8');
const updated = schema.replace(
  /(datasource\s+db\s*\{[^}]*?provider\s*=\s*)"[^"]*"/,
  `$1"${provider}"`
);

if (updated === schema) {
  console.log(`• نوع قاعدة البيانات كما هو: ${provider}`);
} else {
  writeFileSync(SCHEMA, updated);
  console.log(`✓ تم ضبط قاعدة البيانات على: ${provider}`);
}
