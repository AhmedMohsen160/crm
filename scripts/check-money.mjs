/**
 * يتحقّق أن دفاتر القاعدة متوازنة **بالقرش الصحيح** لا «بفرقٍ مقبول».
 *
 * ميزان المراجعة لا يُقرأ في الشاشة كل يوم، وانحرافُه بقرشٍ لا يُرى بالعين
 * لكنه يعني أن قيدًا ما نقص أو زاد. هذا الفحص يقرأ الدفتر كلّه ويقول الحقيقة
 * رقمًا: كم قيدًا فيه، وهل يتوازن، وأين الخلل إن وُجد.
 *
 * التشغيل:  npm run check:money
 */
import { PrismaClient } from '@prisma/client';

const MINOR = 100;
const piastres = (v) => Math.round(((v ?? 0) + Number.EPSILON * Math.sign(v ?? 0)) * MINOR);
const pounds = (p) => p / MINOR;

const db = new PrismaClient();

async function main() {
  const lines = await db.journalLine.findMany({
    select: { entryId: true, debitBase: true, creditBase: true },
  });

  if (lines.length === 0) {
    console.log('• لا سطور في الدفتر — لا شيء يُفحص');
    return;
  }

  let debit = 0;
  let credit = 0;
  const perEntry = new Map();

  for (const line of lines) {
    const d = piastres(line.debitBase);
    const c = piastres(line.creditBase);
    debit += d;
    credit += c;
    const cur = perEntry.get(line.entryId) ?? 0;
    perEntry.set(line.entryId, cur + d - c);
  }

  const unbalanced = [...perEntry.entries()].filter(([, diff]) => diff !== 0);

  console.log(`  سطور: ${lines.length} · قيود: ${perEntry.size}`);
  console.log(`  المدين: ${pounds(debit).toFixed(2)} · الدائن: ${pounds(credit).toFixed(2)}`);

  if (debit !== credit) {
    console.error(`✗ ميزان المراجعة غير متوازن بفرق ${pounds(debit - credit).toFixed(2)}`);
  }

  if (unbalanced.length > 0) {
    console.error(`✗ ${unbalanced.length} قيدًا غير متوازن — أوّلها:`);
    for (const [id, diff] of unbalanced.slice(0, 5)) {
      console.error(`    ${id}: فرق ${pounds(diff).toFixed(2)}`);
    }
  }

  if (debit === credit && unbalanced.length === 0) {
    console.log('✓ الدفتر متوازن بالقرش — كل قيد على حدة والمجموع كذلك');
    return;
  }
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('✗ تعذّر الفحص:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
