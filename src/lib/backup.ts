import 'server-only';
import { db } from './db';

/**
 * نسخة احتياطية كاملة — **خارج حساب مزوّد القاعدة**.
 *
 * المزوّد يحتفظ بنسخه، لكنك لا تملك نسخةً خارج حسابه: حسابٌ يُغلق أو خطأٌ
 * بشريّ في لوحته يعني أن ٣٬٤٤٨ عميلًا و٣٬١٠٥ مشاريع تختفي بلا رجعة. والنسخة
 * التي لا تملكها ليست نسخةً احتياطية.
 *
 * **وتُنقّى قبل أن تخرج**: كلمات المرور المشفَّرة وأسرار صناديق البريد لا
 * تُصدَّر — ملفٌ يُنزَّل على جهازٍ ويُرسَل في بريدٍ ليس مكانًا لها. وإعادةُ
 * الاستيراد تُنشئ كلمات مرور جديدة كما تفعل شاشة التجهيز.
 */

/** الجداول التي تُصدَّر — والترتيب يراعي التبعية عند الاستيراد */
export const BACKUP_TABLES = [
  'setting',
  'listItem',
  'role',
  'user',
  'department',
  'salaryComponent',
  'staffCost',
  'branch',
  'client',
  'company',
  'contact',
  'lead',
  'project',
  'projectStep',
  'task',
  'note',
  'quote',
  'quoteLine',
  'proposal',
  'proposalTierRow',
  'freelancer',
  'freelancerRate',
  'freelancerPayment',
  'priceItem',
  'account',
  'costCenter',
  'journalEntry',
  'journalLine',
  'fiscalPeriod',
  'budget',
  'budgetLine',
  'fixedAsset',
  'commissionScheme',
  'commissionTier',
  'commissionAssignment',
  'commissionEntry',
  'payrollRun',
  'payrollLine',
  'activity',
  'auditLog',
] as const;

/** ما لا يخرج في النسخة أبدًا — بمفتاحه لا بقيمته */
const OMITTED_FIELDS = new Set([
  'passwordHash',
  'secretCipher',
  'passwordCipher',
  'accessToken',
  'refreshToken',
]);

function stripSecrets(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (OMITTED_FIELDS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

export type BackupFile = {
  version: 1;
  takenAt: string;
  counts: Record<string, number>;
  tables: Record<string, unknown[]>;
};

/**
 * يبني النسخة كاملةً في الذاكرة.
 *
 * **جدولٌ غير موجود لا يُسقط النسخة**: السكيما تتغيّر، ونسخةٌ تفشل كلها لأن
 * جدولًا واحدًا أُعيدت تسميتُه أسوأ من نسخةٍ ينقصها جدول. الناقص يُسجَّل في
 * العدّاد بصفر ليُرى.
 */
export async function buildBackup(): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  for (const name of BACKUP_TABLES) {
    const model = (db as unknown as Record<string, { findMany?: () => Promise<unknown[]> }>)[name];
    if (!model?.findMany) {
      counts[name] = 0;
      continue;
    }
    try {
      const rows = await model.findMany();
      tables[name] = rows.map((r) => stripSecrets(r as Record<string, unknown>));
      counts[name] = rows.length;
    } catch {
      counts[name] = 0;
    }
  }

  return {
    version: 1,
    takenAt: new Date().toISOString(),
    counts,
    tables,
  };
}

/** اسم الملف — بالتاريخ ليُرتَّب وحده في مجلد التحميلات */
export function backupFileName(now = new Date()): string {
  return `fasttrans-backup-${now.toISOString().slice(0, 10)}.json`;
}
