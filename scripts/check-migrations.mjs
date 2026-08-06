/**
 * يمنع أن يسبق المخططُ ملفاتِ الترحيل.
 *
 * **عمودٌ يُضاف في المخطط بلا ملف ترحيل عمودٌ لا يصل الإنتاج**: الكود يطلبه
 * والقاعدة لا تعرفه، فتسقط الشاشة التي تقرؤه. وهذا الفحص يوقف الكوميت قبل
 * أن يقع ذلك، كما يوقف `check:additive` حذفَ عمود.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const statePath = path.join(root, 'prisma', 'migrations', '.schema-state.prisma');
if (!existsSync(statePath)) {
  console.log('• لا حالة مرجعية بعد — يُتخطّى الفحص');
  process.exit(0);
}

const current = readFileSync(path.join(root, 'prisma', 'schema.prisma'), 'utf8').replace(
  /provider\s*=\s*"sqlite"/,
  'provider = "postgresql"'
);
const tmp = path.join(root, 'prisma', 'migrations', '.check.prisma');
writeFileSync(tmp, current);

let sql = '';
try {
  sql = execFileSync(
    'npx',
    [
      'prisma',
      'migrate',
      'diff',
      '--from-schema-datamodel',
      statePath,
      '--to-schema-datamodel',
      tmp,
      '--script',
    ],
    { encoding: 'utf8' }
  );
} finally {
  unlinkSync(tmp);
}

if (sql.trim() && !sql.includes('-- This is an empty migration')) {
  console.error('✗ المخطط تغيّر بلا ملف ترحيل. أنشِئه ثم أعِد المحاولة:');
  console.error('    npm run migration:new -- اسم_مختصر_بالإنجليزية\n');
  console.error(sql.trim().slice(0, 600));
  process.exit(1);
}

console.log('✓ ملفات الترحيل مواكِبة للمخطط');
