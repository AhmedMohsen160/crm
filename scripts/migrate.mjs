/**
 * ترحيل قاعدة الإنتاج — **بملفات مراجَعة لا بدفعٍ أعمى**.
 *
 * كان البناء يشغّل `prisma db push --accept-data-loss`: أمرٌ يُطابق القاعدة
 * بالمخطط مهما كلّف، والأمان قائم على **عُرف** أن التعديلات إضافية فقط.
 * وقد كُسر هذا العرف مرة فسقطت النسخة العاملة على الإنتاج.
 *
 * الآن كل تغيير في المخطط يصير **ملف SQL مكتوبًا في المستودع** يُقرأ قبل أن
 * يُطبَّق، وقاعدةُ الإنتاج تحفظ ما طُبِّق عليها فلا يُعاد ولا يُنسى.
 *
 * **وهو يُهيّئ نفسه**: قاعدةٌ عامرة بلا سجل ترحيل (وهي حال الإنتاج اليوم،
 * فقد بُنيت بـ`db push`) تُختَم بالأساس `0_init` **بلا تنفيذه** — لأن جداولها
 * موجودة بالفعل — ثم تمضي الترحيلات التالية عليها. فلا خطوة يدوية على أحد.
 */
import { execFileSync, spawnSync } from 'node:child_process';

function run(args) {
  return execFileSync('npx', ['prisma', ...args], { encoding: 'utf8', stdio: 'inherit' });
}

/**
 * ننفّذ الترحيل و**نلتقط مخرجاته** لا نتركها تمرّ إلى الطرفية وحدها: السبب
 * الذي يفرّق بين «قاعدة تحتاج تهيئة» و«ترحيل فاشل» مكتوبٌ في المخرجات، ولو
 * تركناها لما عرفنا أيّهما وقع.
 */
function deploy() {
  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);
  return { ok: result.status === 0, output };
}

const first = deploy();
if (first.ok) {
  console.log('✓ الترحيل مكتمل');
  process.exit(0);
}

/**
 * P3005 = «القاعدة ليست فارغة ولا سجل ترحيل فيها».
 * هذه حالُ قاعدةٍ بُنيت بـ`db push` — نختم الأساس مطبَّقًا ولا ننفّذه.
 */
// الرمز قد يُطبع وقد لا يُطبع — فنقبل نصّ الرسالة كذلك
const NEEDS_BASELINE = ['P3005', 'database schema is not empty'];
if (!NEEDS_BASELINE.some((sign) => first.output.includes(sign))) {
  console.error('✗ فشل الترحيل لسببٍ غير التهيئة — لا نُخفيه:\n');
  console.error(first.output);
  process.exit(1);
}

console.log('• قاعدة عامرة بلا سجل ترحيل — نختم الأساس مطبَّقًا بلا تنفيذه');
try {
  run(['migrate', 'resolve', '--applied', '0_init']);
} catch (error) {
  console.error('✗ تعذّر ختم الأساس:', error.message);
  process.exit(1);
}

const second = deploy();
if (!second.ok) {
  console.error('✗ فشل الترحيل بعد التهيئة:\n');
  console.error(second.output);
  process.exit(1);
}
console.log('✓ الترحيل مكتمل بعد التهيئة');
