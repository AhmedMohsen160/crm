/**
 * اختبار تنقية سجل الأعطال وتوقيعه.
 *
 * **سجلٌّ يفتحه المالك على شاشته ليس مكانًا لسرّ.** رسالة خطأ من قاعدة
 * البيانات تحمل رابط الاتصال بكلمة مروره، ومن البريد تحمل كلمة مرور الصندوق.
 *
 * التشغيل:  npm run test:error-log
 */
import {
  redactSecrets,
  signature,
  clamp,
  kindLabel,
  MAX_DETAIL,
  MAX_MESSAGE,
} from '../src/lib/error-log.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}

console.log('\n── ١ · التنقية ──────────────────────────────────────\n');

const conn = 'postgresql://neondb_owner:S3cr3tP@ss@ep-x.neon.tech/neondb';
const clean = redactSecrets(conn);
check(!clean.includes('S3cr3tP'), '★ **رابط قاعدة البيانات يخرج بلا كلمة مروره**');
check(clean.includes('neondb_owner') && clean.includes('neon.tech'), 'ويبقى ما يفيد التشخيص');

check(
  !redactSecrets('AUTH_SECRET=abc123xyz789').includes('abc123'),
  'والمفتاح في متغيّر بيئة يُطمس'
);
check(
  !redactSecrets('{"token": "eyJhbGciOi"}').includes('eyJhbGciOi'),
  'والرمز في استجابة JSON يُطمس'
);
check(
  !redactSecrets('Authorization: Bearer sk-ant-api03-XXXX').includes('api03'),
  'ومفتاح الذكاء الاصطناعي يُطمس'
);
check(
  redactSecrets('تعذّر الاتصال بالخادم') === 'تعذّر الاتصال بالخادم',
  'ورسالةٌ بلا سرّ تمرّ كما هي — التنقية لا تُفسد التشخيص'
);
check(
  !redactSecrets('password: hunter2').includes('hunter2'),
  'وكلمة المرور بالعربية أو الإنجليزية سواء'
);

console.log('\n── ٢ · التوقيع ──────────────────────────────────────\n');

const a = signature('save', 'فشل حفظ المشروع cmscgbby3002j7d0mxpdhy3la');
const b = signature('save', 'فشل حفظ المشروع cmsxyzab1009k8e1nqwerty2b');
check(
  a === b,
  '★ **خطآن على مشروعين هما خطأٌ واحد يتكرّر** — المعرّفات تُحذف من التوقيع'
);

check(
  signature('save', 'تجاوز الحد 500') === signature('save', 'تجاوز الحد 1200'),
  'والأرقام كذلك — «تجاوز الحد ٥٠٠» و«تجاوز الحد ١٢٠٠» خطأ واحد'
);
check(
  signature('save', 'خطأ') !== signature('mutate', 'خطأ'),
  'ونفس الرسالة من بابين مختلفين خطآن — المصدر جزء من التوقيع'
);

console.log('\n── ٣ · الطول ────────────────────────────────────────\n');

check(MAX_MESSAGE === 500 && MAX_DETAIL === 4000, 'حدّان للطول: الرسالة والأثر');
check(clamp('abc', 10) === 'abc', 'وما قصُر يمرّ كما هو');
check(clamp('abcdefghij', 5) === 'abcde…', 'وما طال يُقصّ بعلامة تقول إنه قُصّ');

console.log('\n── ٤ · التسمية ──────────────────────────────────────\n');

check(kindLabel('save') === 'حفظ سجل', 'المصدر يُعرض بالعربية');
check(kindLabel('شيء غريب') === 'شيء غريب', 'وما لا اسم له يُعرض كما هو لا فارغًا');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
