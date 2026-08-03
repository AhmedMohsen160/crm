import Link from '@/components/link';
import { Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { listOptions } from '@/lib/reference';
import { PageHeader, SelectField, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'ترحيل الملفات القديمة' };
export const dynamic = 'force-dynamic';

/**
 * ترحيل ملفَّي الليدز والمبيعات (§١٤).
 *
 * **لا يحذف ولا يخمّن.** الصف الذي لا يُحسم يذهب لشاشة المراجعة بسبب
 * مكتوب. والتشغيل آمن التكرار: ما رُحّل يُتخطّى بمفتاحه، فيُلصق الملف
 * كاملًا كلما نما بلا أن يتضاعف شيء.
 */
export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission('canManageSettings');
  const params = await searchParams;
  const { source, error } = params;

  const [branches, pending] = await Promise.all([
    listOptions('branch'),
    db.migrationReview.count({ where: { status: 'pending' } }),
  ]);

  const done = source && params.total !== undefined;
  const n = (key: string) => Number(params[key] ?? 0);

  const SHEETS = [
    {
      key: 'leads',
      title: 'سجل الليدز المرصود',
      file: 'New lead tracking',
      columns: 'التاريخ ⇥ اسم العميل ⇥ رقم الهاتف ⇥ القناة ⇥ طريقة التواصل ⇥ أدمن المبيعات ⇥ تم التحويل؟ ⇥ المبلغ المحصل ⇥ الفرع ⇥ تمت المتابعة؟ ⇥ سبب الرفض',
      note: '**أدمن المبيعات يصير مالك الليد** في النظام — وعليه يقوم نطاق الرؤية وحساب النسب.',
      sample:
        '2026-02-03\t\t20 10 99136676\tGoogle Ads\tاتصال\tنورا\tلا\t\tفرع المهندسين',
    },
    {
      key: 'sales',
      title: 'المبيعات المحوَّلة',
      file: 'Sales System — DATA',
      columns:
        'Date ⇥ Client Name ⇥ Phone ⇥ Platform ⇥ Translation Type ⇥ Requested Services ⇥ Pages ⇥ Funnel ⇥ branch ⇥ Sales Admin ⇥ price collected',
      note: '**كل عميل يحصل على كوده** `CL-#####` لحظة إنشائه. والصف بلا سعر يدخل **ليدًا خاسرًا لا مشروعًا**.',
      sample:
        '2022-11-01\tد عبد الله حربي\t201062580872\tWhatsapp\tWritten\tCerificate\t\tPR\tmokattam\tAhmad Megaly\t900',
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="ترحيل الملفات القديمة"
        subtitle="الليدز والمبيعات — لا يُحذف صف ولا يُخمَّن، وما لا يُحسم يذهب للمراجعة"
      >
        <Link href="/settings/import/review" className="btn-secondary">
          قائمة المراجعة
          {pending > 0 && ` (${pending})`}
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />

      {done && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="mb-2 flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4" />
            تم ترحيل {source === 'leads' ? 'سجل الليدز' : 'ملف المبيعات'}
          </p>
          <ul className="grid gap-1 text-xs sm:grid-cols-2">
            <li>
              الصفوف المقروءة: <b className="nums">{n('total')}</b>
            </li>
            <li>
              عملاء جدد بأكوادهم: <b className="nums">{n('clients')}</b>
            </li>
            <li>
              ليدز: <b className="nums">{n('leads')}</b> — منها{' '}
              <b className="nums">{n('lostLeads')}</b> خاسرة
            </li>
            <li>
              مشاريع محصَّلة: <b className="nums">{n('projects')}</b>
            </li>
            <li>
              مُتخطّاة (مُرحَّلة سابقًا): <b className="nums">{n('skipped')}</b>
            </li>
            <li>
              للمراجعة اليدوية: <b className="nums">{n('review')}</b>{' '}
              {n('review') > 0 && (
                <Link href="/settings/import/review" className="link">
                  افتحها
                </Link>
              )}
            </li>
          </ul>
          {n('warnings') > 0 && (
            <p className="mt-2 text-xs text-amber-800">
              <b className="nums">{n('warnings')}</b> صفًّا حمل اسم أدمن لم يُطابَق
              بمستخدم — دخل بلا مالك ومعلَّمًا في ملاحظاته، ولم يُسنَد بالتخمين.
            </p>
          )}
        </div>
      )}

      {pending > 0 && (
        <Link
          href="/settings/import/review"
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <b>{pending}</b> صفًّا ينتظر مراجعتك — تواريخ أو أرقام هواتف لم تُحسم.
          </span>
        </Link>
      )}

      {SHEETS.map((sheet) => (
        <section key={sheet.key} className="card card-pad">
          <h2 className="mb-1 font-semibold text-slate-800">{sheet.title}</h2>
          <p className="mb-3 text-xs text-slate-500">
            الملف: <span dir="ltr">{sheet.file}</span>
          </p>

          <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600" dir="ltr">
            {sheet.columns}
          </p>
          <p className="mb-4 text-xs text-slate-600">{sheet.note}</p>

          <form method="post" action="/api/save" className="space-y-3">
            <input type="hidden" name="entity" value="legacy.import" />
            <input type="hidden" name="source" value={sheet.key} />
            <input type="hidden" name="back" value="/settings/import" />

            <textarea
              name="rows"
              required
              rows={8}
              dir="ltr"
              placeholder={sheet.sample}
              className="input font-mono text-xs"
            />

            <div className="flex flex-wrap items-end gap-4">
              <SelectField
                label="الفرع الافتراضي"
                name="defaultBranch"
                options={branches}
                placeholder="— لِما لا فرع له —"
              />
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  name="fixMarchFlip"
                  className="h-4 w-4 rounded border-slate-300 text-amber-600"
                />
                <span>صحّح انقلاب يوم/شهر في مارس ٢٠٢٦</span>
              </label>
              <SaveButton>
                <Upload className="h-4 w-4" />
                ترحيل
              </SaveButton>
            </div>
          </form>
        </section>
      ))}

      <section className="card card-pad bg-slate-50/60 text-sm text-slate-600">
        <p className="mb-2 font-semibold text-slate-800">ما يفعله الترحيل بلا أن تطلبه</p>
        <ul className="space-y-1 text-xs">
          <li>
            <b>الهاتف مفتاح العميل.</b> يُطبَّع بقاعدة §١٤، فالرقم نفسه بصيغتين
            يجد عميله ولا يُنشئ ثانيًا. وما تعذّر تطبيعه يذهب للمراجعة.
          </li>
          <li>
            <b>التواريخ النصية تُقرأ يومًا/شهرًا/سنة.</b> «24\11\2025» و«26/07/2026»
            و«5\112025» كلها مفهومة. أما السنة التالفة والتاريخ المستقبلي
            فيذهبان للمراجعة — <b>لا نخمّن المقصود</b>.
          </li>
          <li>
            <b>انقلاب مارس ٢٠٢٦ لا يُصحَّح إلا بطلبك.</b> تعميم القاعدة يقلب كل
            تاريخ يومه الثالث — والثالث من كل شهر تاريخ مشروع.
          </li>
          <li>
            <b>«60 ريال» في عمود الجنيه</b> يُخزَّن بعملته ولا يُحوَّل: سعر ذلك
            اليوم غير معروف، وتحويله بسعر اليوم يزوّر إيراد شهره.
          </li>
          <li>
            <b>الصف بلا سعر ليدٌ خاسر لا مشروع.</b> إدخاله مشروعًا يضخّم عدد
            الطلبات ويهبط بمتوسط قيمة الطلب.
          </li>
          <li>
            <b>الأدمن غير المطابَق لا يُخمَّن.</b> الليد يدخل بلا مالك ومعلَّمًا —
            فالمالك الخطأ أسوأ من لا مالك، لأنه يقلب نطاق الرؤية والنسب.
          </li>
        </ul>
      </section>
    </div>
  );
}
