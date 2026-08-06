import { Download, ShieldCheck, CalendarClock } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { BACKUP_TABLES } from '@/lib/backup';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/ui';

export const metadata = { title: 'النسخة الاحتياطية' };
export const dynamic = 'force-dynamic';

/**
 * النسخة الاحتياطية.
 *
 * **النسخة التي لا تملكها ليست نسخةً احتياطية.** مزوّد القاعدة يحتفظ بنسخه،
 * لكن حسابًا يُغلق أو خطأً بشريًّا في لوحته يعني أن سجل العملاء والدفاتر
 * يختفي بلا رجعة. وهذه الشاشة تُخرج نسخةً إلى جهازك أنت.
 */
export default async function BackupPage() {
  await requirePermission('canManageSettings');

  const [clients, projects, entries, lastExport] = await Promise.all([
    db.client.count(),
    db.project.count(),
    db.journalEntry.count(),
    db.auditLog.findFirst({
      where: { tableName: 'Backup' },
      orderBy: { ts: 'desc' },
      select: { ts: true, userId: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="النسخة الاحتياطية"
        subtitle="نسخةٌ كاملة تملكها أنت — خارج حساب مزوّد القاعدة"
      />

      <section className="card card-pad space-y-4">
        <p className="text-sm text-slate-700">
          الملف يحمل <b className="nums">{clients}</b> عميلًا و
          <b className="nums">{projects}</b> مشروعًا و<b className="nums">{entries}</b> قيدًا
          محاسبيًّا، ومعها المستخدمون والأدوار والقوائم والأسعار وسجل التدقيق —{' '}
          <b className="nums">{BACKUP_TABLES.length}</b> جدولًا.
        </p>

        <a href="/api/backup" className="btn-primary inline-flex w-fit" download>
          <Download className="h-4 w-4" />
          نزّل النسخة الآن
        </a>

        {lastExport && (
          <p className="text-xs text-slate-500">آخر نسخة: {formatDate(lastExport.ts)}</p>
        )}
      </section>

      <section className="card card-pad space-y-3 text-sm text-slate-700">
        <h2 className="flex items-center gap-2 font-semibold text-slate-800">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          ما لا يخرج في النسخة
        </h2>
        <p>
          كلمات المرور المشفَّرة وأسرار صناديق البريد <b>لا تُصدَّر</b>. ملفٌ يُنزَّل
          على جهاز ويُرسَل في بريد ليس مكانًا لها.
        </p>
        <p className="text-xs text-slate-500">
          وكل تنزيل يُسجَّل في سجل التدقيق باسم من نزّله ووقته — الملف أخطر ما يخرج
          من النظام في ملف واحد.
        </p>
      </section>

      <section className="card card-pad space-y-3 text-sm text-slate-700">
        <h2 className="flex items-center gap-2 font-semibold text-slate-800">
          <CalendarClock className="h-4 w-4 text-brand-600" />
          كم مرة؟
        </h2>
        <p>
          <b>أسبوعيًّا يكفي</b> ما دام حجم العمل كما هو. واحتفظ بآخر أربع نسخ على
          الأقل: خطأٌ يقع اليوم قد لا يُكتشف إلا بعد أسبوعين، والنسخة الوحيدة تكون
          حينها قد حملت الخطأ معها.
        </p>
        <p className="text-xs text-slate-500">
          وضَعها في مكانين مختلفين — جهازك وحسابُ تخزينٍ سحابي مثلًا. نسختان في
          مكان واحد نسخةٌ واحدة.
        </p>
      </section>
    </div>
  );
}
