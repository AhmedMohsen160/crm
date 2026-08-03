/**
 * فحص التنبيهات — يُستدعى من مؤقّت خارجي (cron) كل ساعة.
 *
 *     npx tsx scripts/notify.ts
 *
 * **آمن التكرار**: تشغيلان في الدقيقة نفسها لا يُنتجان رسالتين، فمفتاح منع
 * التكرار هو الحارس لا توقيت الاستدعاء. ولا يكتب شيئًا حين لا يجد ما
 * يستحق — «لا مشاكل» ليست خبرًا يستحق رسالة.
 */
import { runAllEvents } from '../src/lib/notification-engine';
import { db } from '../src/lib/db';

async function main() {
  const results = await runAllEvents();
  for (const r of results) {
    const state = r.due ? `${r.findings} سجل ← ${r.written} رسالة` : `مؤجَّل (${r.reason})`;
    console.log(`  ${r.written > 0 ? '✓' : '•'} ${r.label}: ${state}`);
  }
  const total = results.reduce((s, r) => s + r.written, 0);
  console.log(`\n${total} رسالة جديدة`);
}

main()
  .catch((error) => {
    console.error('❌ فشل فحص التنبيهات:', error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
