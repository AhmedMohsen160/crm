import Link from '@/components/link';
import { BookOpen, ShoppingBag, Scale, Undo2, CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react';
import { db } from '@/lib/db';
import { requireAnyPermission, can } from '@/lib/auth';
import { listOptions } from '@/lib/reference';
import { PageHeader, SelectField, FormField, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';
import { EXECUTIVE_CLIENT_NAMES } from '@/lib/client-merge';
import { centerClientsText } from '@/lib/settlement';
import { formatMoney } from '@/lib/utils';
import { previewReset, protectedCounts } from '@/lib/reset-engine';
import { RESET_PHRASE } from '@/lib/mutations';

export const metadata = { title: 'ترحيل تاريخ المكتب' };
export const dynamic = 'force-dynamic';

/**
 * ترحيل تاريخ المكتب — دفاتر المحاسب وشيت المبيعات.
 *
 * الغاية كما قالها أحمد: **«لتكون كأن النظام مبنيّ من ٢٠٢٢»** — فيدخل
 * الموظفون فيجدوا تاريخهم كاملًا في مكانه ويُكملون عليه.
 *
 * **والشاشة تقول ما دخل فعلًا** لا ما يُفترض أن يدخل: لكل وسمٍ عدّادُه
 * وزرُّ سحبه. فمن رفع ملفًا خطأً يسحبه بضغطة ولا يبحث عن قيوده واحدًا واحدًا.
 */
export default async function HistoryImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireAnyPermission('canManageAccounting', 'canManageSettings');
  const params = await searchParams;
  const allowed = can(user, 'canManageAccounting') && can(user, 'canManageSettings');

  const [users, branches, entries, projects, leads, clients, willWipe, kept] = await Promise.all([
    db.user.findMany({
      where: { active: true },
      select: { id: true, name: true, jobTitle: true },
      orderBy: { name: 'asc' },
    }),
    listOptions('branch'),
    db.journalEntry.groupBy({ by: ['importTag'], _count: true, where: { importTag: { not: null } } }),
    db.project.groupBy({ by: ['importTag'], _count: true, _sum: { netTotal: true }, where: { importTag: { not: null } } }),
    db.lead.groupBy({ by: ['importTag'], _count: true, where: { importTag: { not: null } } }),
    db.client.groupBy({ by: ['importTag'], _count: true, where: { importTag: { not: null } } }),
    previewReset(),
    protectedCounts(),
  ]);

  /** كل وسمٍ دخل فعلًا وما حمله — مصدرُه القاعدة لا قائمةٌ مكتوبة */
  const tags = new Map<
    string,
    { entries: number; projects: number; leads: number; clients: number; amount: number }
  >();
  const cell = (tag: string) =>
    tags.get(tag) ?? (tags.set(tag, { entries: 0, projects: 0, leads: 0, clients: 0, amount: 0 }), tags.get(tag)!);
  for (const row of entries) cell(row.importTag!).entries = row._count;
  for (const row of projects) {
    const c = cell(row.importTag!);
    c.projects = row._count;
    c.amount = row._sum.netTotal ?? 0;
  }
  for (const row of leads) cell(row.importTag!).leads = row._count;
  for (const row of clients) cell(row.importTag!).clients = row._count;

  const sorted = [...tags.entries()].sort(([a], [b]) => a.localeCompare(b));
  const kindOf = (tag: string) =>
    tag.startsWith('ledger') ? 'دفتر المحاسب' : tag.startsWith('sales') ? 'شيت المبيعات' : 'تسوية';

  const magly = users.find((u) => u.name.includes('مجلي'));
  const owner = users.find((u) => u.name.includes('محسن')) ?? users[0];
  const userOptions = users.map((u) => ({
    value: u.id,
    label: u.jobTitle ? `${u.name} — ${u.jobTitle}` : u.name,
  }));

  const n = (key: string) => Number(params[key] ?? 0);
  const money = (key: string) => formatMoney(n(key));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="ترحيل تاريخ المكتب"
        subtitle="دفاتر المحاسب وشيت المبيعات — ليجد الموظفون تاريخهم كاملًا في النظام"
      >
        <Link href="/settings/import" className="btn-secondary">
          ترحيل اللصق
        </Link>
      </PageHeader>
      <ErrorAlert message={params.error} />

      {!allowed && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            العرض فقط
          </p>
          <p className="mt-1 text-xs">
            الترحيل يكتب في الدفتر وفي سجل العملاء معًا، فيحتاج صلاحيتَي «الدفاتر المحاسبية»
            و«إعدادات النظام» معًا. وما تراه هنا ما دخل فعلًا.
          </p>
        </div>
      )}

      {/* ── ما دخل فعلًا ─────────────────────────────────── */}
      <section className="card">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">ما دخل النظام حتى الآن</h2>
        <p className="mb-3 text-xs text-slate-500">
          كل دفعةٍ تحمل وسمها، ويُسحب الوسم كاملًا بضغطة — فلا يُبحث عن قيودٍ واحدًا واحدًا.
        </p>
        {sorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">لم يدخل شيء بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الوسم</th>
                  <th>المصدر</th>
                  <th className="text-center">قيود</th>
                  <th className="text-center">مشاريع</th>
                  <th className="text-center">ليدز</th>
                  <th className="text-center">عملاء</th>
                  <th className="text-left">المبلغ</th>
                  {allowed && <th />}
                </tr>
              </thead>
              <tbody>
                {sorted.map(([tag, c]) => (
                  <tr key={tag}>
                    <td className="font-mono text-xs">{tag}</td>
                    <td className="text-xs text-slate-500">{kindOf(tag)}</td>
                    <td className="nums text-center">{c.entries || '—'}</td>
                    <td className="nums text-center">{c.projects || '—'}</td>
                    <td className="nums text-center">{c.leads || '—'}</td>
                    <td className="nums text-center">{c.clients || '—'}</td>
                    <td className="nums text-left">{c.amount ? formatMoney(c.amount) : '—'}</td>
                    {allowed && (
                      <td className="text-left">
                        <form method="post" action="/api/save">
                          <input type="hidden" name="entity" value="history.rollback" />
                          <input type="hidden" name="tag" value={tag} />
                          <button type="submit" className="btn-danger btn-sm">
                            <Undo2 className="h-3.5 w-3.5" />
                            اسحبه
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── نتيجة آخر عملية ──────────────────────────────── */}
      {params.done === 'ledger' && (
        <Result title={`تم ترحيل دفتر ${params.year}`}>
          <li>
            صفوف قُرئت: <b className="nums">{n('rows')}</b> · موقوفة:{' '}
            <b className="nums">{n('skipped')}</b>
          </li>
          <li>
            قيود: <b className="nums">{n('entries')}</b> بـ<b className="nums">{n('lines')}</b> سطرًا
          </li>
          <li>
            مدين: <b className="nums">{money('debit')}</b>
          </li>
          <li>
            دائن: <b className="nums">{money('credit')}</b>
          </li>
          <li>
            حسابات جديدة: <b className="nums">{n('accounts')}</b> · مراكز ربحية:{' '}
            <b className="nums">{n('centers')}</b>
          </li>
          <li className={n('unbalanced') ? 'text-amber-800' : ''}>
            دفعات لم تتوازن: <b className="nums">{n('unbalanced')}</b>
            {n('unbalanced') === 0 && ' — الدفتر متوازن بالقرش'}
          </li>
        </Result>
      )}

      {params.done === 'sales' && (
        <Result title="تم ترحيل شيت المبيعات">
          <li>
            صفوف قُرئت: <b className="nums">{n('rows')}</b>
          </li>
          <li>
            عملاء جدد: <b className="nums">{n('clients')}</b>
          </li>
          <li>
            مشاريع: <b className="nums">{n('projects')}</b>
          </li>
          <li>
            ليدز خاسرة (صفوف بلا سعر): <b className="nums">{n('leads')}</b>
          </li>
          <li className={n('review') ? 'text-amber-800' : ''}>
            للمراجعة: <b className="nums">{n('review')}</b>{' '}
            {n('review') > 0 && (
              <Link href="/settings/import/review?source=sales" className="link">
                افتحها
              </Link>
            )}
          </li>
          {params.years && <li className="sm:col-span-2">بالسنة: {params.years}</li>}
          {params.admins && (
            <li className="text-amber-800 sm:col-span-2">
              أدمنز لم يُطابَقوا بمستخدم: <b>{params.admins}</b> — صفوفهم دخلت لمالك التجزئة.
            </li>
          )}
          {params.branches && (
            <li className="text-amber-800 sm:col-span-2">
              فروع لم تُطابَق: <b>{params.branches}</b> — صفوفها دخلت بلا فرع ولم يُخمَّن لها فرع.
            </li>
          )}
        </Result>
      )}

      {params.done === 'settle' && (
        <Result title={`تمت التسوية على الدفتر — ${params.years}`}>
          <li>
            عملاء سمّاهم المحاسب: <b className="nums">{n('namedClients')}</b> بـ
            <b className="nums"> {n('namedProjects')}</b> مشروعًا
          </li>
          <li>
            وأخذوا أرقامهم بالضبط: <b className="nums">{money('namedAmount')}</b>
          </li>
          <li>
            عملاء شهريّون مجمَّعون: <b className="nums">{n('bucketClients')}</b> بـ
            <b className="nums"> {money('bucketAmount')}</b>
          </li>
          <li>
            مشاريع الشيت التي وُسِّعت بالتناسب: <b className="nums">{n('scaledProjects')}</b>
          </li>
          <li className="sm:col-span-2">
            من <b className="nums">{money('scaledFrom')}</b> إلى{' '}
            <b className="nums">{money('scaledTo')}</b> — والفارق مشترياتٌ لم تُسجَّل في الشيت
          </li>
          {params.silent && (
            <li className="text-amber-800 sm:col-span-2">
              شهورٌ رصدها الشيت والدفتر صامتٌ عنها: <b>{params.silent}</b> — بقيت كما رُصدت،
              فالصمت ليس رقمًا.
            </li>
          )}
        </Result>
      )}

      {params.done === 'reset' && (
        <Result title="مُسحت البيانات التجريبية">
          <li className="sm:col-span-2">{params.line}</li>
        </Result>
      )}

      {params.done === 'rollback' && (
        <Result title={`سُحب الوسم «${params.tag}»`}>
          <li className="sm:col-span-2">{params.line}</li>
        </Result>
      )}

      {allowed && (
        <>
          {/* ── ١ · الدفتر ─────────────────────────────────── */}
          <form method="post" action="/api/save" encType="multipart/form-data" className="card">
            <input type="hidden" name="entity" value="history.ledger" />
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <BookOpen className="h-4 w-4 text-brand-600" />
              ١ · دفتر المحاسب — سنةً سنة
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              ملفّ السنة كما هو، بورقة «قيود اليومية». والقيود تُجمَّع بالرصيد الجاري لأن ورقة
              المحاسب مسطَّحة بلا أرقام قيود — <b>وما لا يتوازن لا يدخل ولا يُجبَر</b>. ورفعُ نفس
              السنة مرة أخرى يمسح ما رُحِّل منها أولًا فلا يتضاعف قيد.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="السنة"
                name="year"
                type="number"
                min="2000"
                max="2100"
                required
                placeholder="2023"
                hint="ما خرج عن هذه السنة في الملف يُتخطّى"
              />
              <div>
                <label className="label" htmlFor="ledgerFile">
                  ملف الدفتر <span className="text-rose-500">*</span>
                </label>
                <input
                  id="ledgerFile"
                  type="file"
                  name="file"
                  accept=".xlsx,.xls"
                  required
                  className="block w-full text-sm text-slate-600 file:ml-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
                />
                <p className="mt-1 text-xs text-slate-400">xlsx حتى ١٠ ميجابايت</p>
              </div>
            </div>
            <div className="mt-4">
              <SaveButton>رحّل الدفتر</SaveButton>
            </div>
          </form>

          {/* ── ٢ · شيت المبيعات ───────────────────────────── */}
          <form method="post" action="/api/save" encType="multipart/form-data" className="card">
            <input type="hidden" name="entity" value="history.sales" />
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <ShoppingBag className="h-4 w-4 text-brand-600" />٢ · شيت المبيعات — ورقة DATA
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              الشيت كلّه دفعةً واحدة، وكل سنةٍ تُوسَم بسنتها فتُعاد وحدها. والصفّ بلا سعر يدخل{' '}
              <b>ليدًا خاسرًا لا مشروعًا</b> — استفسارٌ لم يُبَع. والصفّ بلا رقم هاتف لا يُردّ بل
              يُجمَّع باسمه.
            </p>
            <OwnerFields
              userOptions={userOptions}
              defaultOwner={magly?.id}
              executiveOwner={owner?.id}
            />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="salesFile">
                  ملف الشيت <span className="text-rose-500">*</span>
                </label>
                <input
                  id="salesFile"
                  type="file"
                  name="file"
                  accept=".xlsx,.xls"
                  required
                  className="block w-full text-sm text-slate-600 file:ml-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
                />
              </div>
              <FormField
                label="سنوات بعينها (اختياري)"
                name="years"
                placeholder="2026"
                dir="ltr"
                hint="اتركها فارغة ليدخل الشيت كلّه — واكتب سنةً لتُعاد وحدها"
              />
            </div>
            <div className="mt-4">
              <SaveButton>رحّل شيت المبيعات</SaveButton>
            </div>
          </form>

          {/* ── ٣ · التسوية ────────────────────────────────── */}
          <form method="post" action="/api/save" className="card">
            <input type="hidden" name="entity" value="history.settle" />
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Scale className="h-4 w-4 text-brand-600" />٣ · التسوية على الدفتر
            </h2>
            <div className="mb-4 space-y-1 text-xs text-slate-500">
              <p>
                <b>الدفتر هو الحقيقة المالية، وشيت المبيعات ناقصٌ لا خاطئ</b> — والفارق بينهما
                عملاءُ لم يُرصدوا ومشترياتٌ متكرّرة لم تُسجَّل. فتُسوَّى ولا تُعرَض فجوة.
              </p>
              <p>وثلاث طبقات بالترتيب:</p>
              <ol className="mr-4 list-decimal space-y-0.5">
                <li>
                  العميل الذي سمّاه المحاسب في مركز الربحية <b>يأخذ رقمه بالضبط</b> — وهذه ثلثا
                  الإيراد.
                </li>
                <li>
                  وما بقي على مركزٍ عامّ <b>يُوزَّع بالتناسب</b> على من رصدهم الشيت في ذلك الشهر —
                  لا بالتساوي، فيبقى ترتيب العملاء وأوزانهم.
                </li>
                <li>
                  وشهرٌ لم يرصد فيه الشيت أحدًا <b>يُنشأ له عميل شهريّ مجمَّع</b> باسمه الصريح.
                </li>
              </ol>
              <p className="text-amber-800">
                وتُعاد التسوية كلّما أُعيد ترحيل الدفتر أو الشيت — فهي مبنيّة فوقهما.
              </p>
            </div>
            <OwnerFields
              userOptions={userOptions}
              defaultOwner={magly?.id}
              executiveOwner={owner?.id}
            />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FormField
                label="السنوات"
                name="years"
                required
                defaultValue="2022 2023 2024 2025"
                dir="ltr"
                hint="سنةٌ بلا دفترٍ تبقى كما رصدها الشيت — الصمت ليس رقمًا"
              />
              <SelectField
                label="فرع العميل الشهريّ المجمَّع"
                name="fallbackBranch"
                options={branches}
                defaultValue="mokattam"
                hint="حين لا يرصد الشيت شيئًا في الشهر فلا يُعرف فرعه"
              />
              <div className="sm:col-span-2">
                <label className="label" htmlFor="centerClients">
                  مراكز الربحية التي هي مشاريعُ عميلٍ آخر
                </label>
                <textarea
                  id="centerClients"
                  name="centerClients"
                  rows={5}
                  defaultValue={centerClientsText()}
                  className="input font-mono text-xs"
                  dir="rtl"
                />
                <p className="mt-1 text-xs text-slate-400">
                  سطرٌ لكلٍّ بالصيغة <b>اسم المركز = اسم العميل</b>. فالمركز في الدفتر
                  <b> مشروعٌ لا عميلًا بالضرورة</b>: «أسورة اليقين» مشروعٌ للعميل «مركز سلام».
                  والمشروع يحتفظ باسمه ويقع تحت عميله، فلا ينكسر سجلّ العميل إلى عدة سجلات.
                  <b> والمطابقة بالاسم الصريح لا بالتقريب</b> — فلا يُضمّ عميلٌ إلى غيره بلا
                  أن تطلبه أنت.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <SaveButton>سوِّ على الدفتر</SaveButton>
            </div>
          </form>

          {/* ── ٤ · مسح البيانات التجريبية ─────────────────── */}
          <form method="post" action="/api/save" className="card border-rose-200">
            <input type="hidden" name="entity" value="history.reset" />
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-rose-800">
              <Trash2 className="h-4 w-4" />٤ · مسح البيانات التجريبية
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              ما زُرع لتجريب النظام قبل أن يحمل بيانات المكتب. <b>والمُرحَّل لا يُمسّ</b> — ما
              يحمل وسمًا بياناتٌ حقيقية جاءت لتحلّ محلّ التجريبيّ. وتبقى معه المستخدمون
              والأدوار وشجرة الحسابات وقائمة الأسعار وخطط النسب والقوائم المرجعية وسجلّ التدقيق:
              هذه هيكل النظام لا بياناته.
            </p>

            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                <p className="mb-1 text-xs font-semibold text-rose-800">سيُمسح</p>
                <ul className="space-y-0.5 text-xs text-rose-900">
                  {Object.entries(willWipe).map(([label, count]) => (
                    <li key={label}>
                      {label}: <b className="nums">{count}</b>
                    </li>
                  ))}
                  {Object.keys(willWipe).length === 0 && <li>لا شيء تجريبيّ باقٍ</li>}
                </ul>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <p className="mb-1 text-xs font-semibold text-emerald-800">محميٌّ — مُرحَّل</p>
                <ul className="space-y-0.5 text-xs text-emerald-900">
                  {Object.entries(kept).map(([label, count]) => (
                    <li key={label}>
                      {label}: <b className="nums">{count}</b>
                    </li>
                  ))}
                  {Object.keys(kept).length === 0 && <li>لم يُرحَّل شيء بعد</li>}
                </ul>
              </div>
            </div>

            <label className="mb-3 flex items-start gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                name="backupDone"
                value="yes"
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
              />
              <span>
                نزّلتُ نسخةً احتياطية من{' '}
                <Link href="/settings/backup" className="link">
                  شاشة النسخة الاحتياطية
                </Link>{' '}
                — والنسخة التي لا يملكها المكتب ليست نسخة.
              </span>
            </label>

            <FormField
              label={`اكتب «${RESET_PHRASE}» بالحرف`}
              name="confirm"
              required
              placeholder={RESET_PHRASE}
              hint="جملةٌ تُكتب باليد لا تُضغط سهوًا — وهذا يمسح سجلّ عملاء بأكمله"
            />
            <div className="mt-4">
              <button type="submit" className="btn-danger">
                امسح التجريبيّ
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

/** بطاقة نتيجةٍ خضراء — نفس الشكل في العمليات الأربع */
function Result({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      <p className="mb-2 flex items-center gap-2 font-semibold">
        <CheckCircle2 className="h-4 w-4" />
        {title}
      </p>
      <ul className="grid gap-1 text-xs sm:grid-cols-2">{children}</ul>
    </div>
  );
}

/**
 * مالكا العملاء — ويظهران في الترحيل والتسوية معًا.
 *
 * **والأسماء تُعدَّل من الشاشة لا من الكود**: أحمد قال خمسةً وسيتذكّر
 * غيرهم، وقاعدةٌ في الكود تحتاج نشرًا لكل اسمٍ يتذكّره.
 */
function OwnerFields({
  userOptions,
  defaultOwner,
  executiveOwner,
}: {
  userOptions: { value: string; label: string }[];
  defaultOwner?: string;
  executiveOwner?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField
        label="مالك عملاء التجزئة"
        name="defaultOwnerId"
        options={userOptions}
        defaultValue={defaultOwner}
        required
        hint="من لم يُذكر له بائع في الشيت يتبعه — وما قاله الشيت يعلو على هذا"
      />
      <SelectField
        label="مالك العملاء القدامى"
        name="executiveOwnerId"
        options={userOptions}
        defaultValue={executiveOwner}
        required
        hint="العملاء أدناه يتبعونه مهما قال الشيت"
      />
      <div className="sm:col-span-2">
        <label className="label" htmlFor="executiveNames">
          عملاء المدير التنفيذي — سطرٌ لكل اسم
        </label>
        <textarea
          id="executiveNames"
          name="executiveNames"
          rows={5}
          defaultValue={EXECUTIVE_CLIENT_NAMES.join('\n')}
          className="input font-mono text-xs"
        />
        <p className="mt-1 text-xs text-slate-400">
          المطابقة على لبّ الاسم، فـ«سلام» تلتقط «مركز سلام للدعوة والحوار» و«مشروع سلام».
        </p>
      </div>
    </div>
  );
}
