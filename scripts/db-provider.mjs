/**
 * يضبط نوع قاعدة البيانات في ملف المخطط قبل البناء.
 *
 * Prisma لا يسمح بقراءة نوع القاعدة من متغيّر بيئة، لذا نكتبه هنا.
 *
 * لا تحتاج ضبط أي شيء عادةً — النوع يُستنتج تلقائيًا:
 *   - رابط يبدأ بـ postgres  ⇒ PostgreSQL (السيرفر)
 *   - غير ذلك               ⇒ SQLite (جهازك)
 *
 * وإن أردت فرض نوع معيّن، اضبط DATABASE_PROVIDER=postgresql أو sqlite.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SCHEMA = new URL('../prisma/schema.prisma', import.meta.url);
const ALLOWED = ['sqlite', 'postgresql'];

/** يستنتج نوع القاعدة من رابطها */
function detectProvider() {
  const explicit = process.env.DATABASE_PROVIDER?.trim();
  if (explicit) return explicit;

  const url = process.env.DATABASE_URL?.trim() ?? '';
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    return 'postgresql';
  }
  return 'sqlite';
}

const provider = detectProvider();

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
