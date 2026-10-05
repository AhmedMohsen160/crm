import Link from '@/components/link';
import { Sprout, ShieldCheck } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import {
  BRANCH_STATUSES,
  BRANCH_TYPES,
  SPEND_KINDS,
  SPEND_KIND_KEYS,
  SPEND_KIND_HINTS,
  MATURITY_STAGES,
  VALIDATION_RULES,
  type SpendKind,
} from '@/lib/branch-economics';
import { listOptions } from '@/lib/reference';
import { toDateInput } from '@/lib/utils';
import { PageHeader, ErrorAlert, FormField, SelectField, Badge } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'إعداد محاسبة الفروع' };
export const dynamic = 'force-dynamic';

/**
 * إعداد الموديول.
 *
 * ثلاث خطوات بترتيبها: **زرع الفروع** ثم **تصنيف حسابات المصروفات** ثم
 * تعليم الحسابات غير النقدية. والثانية هي التي بدونها لا يعمل شيء: تصنيف
 * الحساب هو ما يحدّد أين يقع كل جنيه.
 *
 * **والتصنيف على الحساب لا على مركز التكلفة** — مركز التكلفة عند المحاسب
 * مشروعٌ تُقاس ربحيته، لا وعاءٌ لتصنيف الإنفاق.
 */
export default async function BranchSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    edit?: string;
    seeded?: string;
    classified?: string;
    suggested?: string;
    cash?: string;
  }>;
}) {
  await requirePermission('canManageAccounting');
  const sp = await searchParams;

  const [branches, expenseAccounts, currencies] = await Promise.all([
    db.branch.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    db.account.findMany({
      where: { type: 'expense', isPostable: true, active: true },
      select: { id: true, name: true, code: true, isCash: true, systemKey: true, spendKind: true },
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
    }),
    listOptions('currency'),
  ]);

  const editing = sp.edit ? branches.find((b) => b.id === sp.edit) : null;
  const unclassified = expenseAccounts.filter((a) => !a.spendKind).length;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="إعداد محاسبة الفروع" subtitle="الفروع · تصنيف حسابات المصروفات · الحسابات غير النقدية">
        <Link href="/finance/branches" className="btn-secondary">
          اللوحة
        </Link>
      </PageHeader>
      <ErrorAlert message={sp.error} />
      {(sp.seeded || sp.classified || sp.suggested || sp.cash) && (
        <p className="mb-4 rounded-lg border border-lime-300 bg-lime-50 px-4 py-3 text-sm text-lime-900">
          {sp.seeded && `زُرع ${sp.seeded} فرعًا. `}
          {sp.classified && `صُنِّف ${sp.classified} حسابًا. `}
          {sp.suggested && `اقتُرح تصنيف ${sp.suggested} حسابًا — راجعها وصحّح مصاريف الفروع. `}
          {sp.cash && `حُدِّث ${sp.cash} حسابًا.`}
        </p>
      )}

      {/* ── ١ · الفروع ──────────────────────────────────── */}
      <section className="card mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-800">١ · الفروع</h2>
          {branches.length === 0 && (
            <form method="post" action="/api/save" className="inline">
              <input type="hidden" name="entity" value="branch.seed" />
              <input type="hidden" name="id" value="" />
              <input type="hidden" name="back" value="/finance/branches/settings" />
              <button type="submit" className="btn-primary">
                <Sprout className="h-4 w-4" />
                ازرعها من قائمة الفروع
              </button>
            </form>
          )}
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>الفرع</th>
                <th>المفتاح</th>
                <th>النوع</th>
                <th>المرحلة</th>
                <th>الحال</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.id} className={b.active ? '' : 'opacity-50'}>
                  <td className="text-sm font-medium text-slate-800">{b.name}</td>
                  <td className="text-xs text-slate-400" dir="ltr">
                    {b.code}
                  </td>
                  <td className="text-sm text-slate-600">
                    {BRANCH_TYPES[b.type as keyof typeof BRANCH_TYPES] ?? b.type}
                  </td>
                  <td>
                    <Badge
                      className={
                        b.maturityStage === 'mature'
                          ? 'border-slate-200 bg-slate-50 text-slate-600'
                          : 'border-lime-300 bg-lime-50 text-lime-800'
                      }
                    >
                      {MATURITY_STAGES[b.maturityStage as keyof typeof MATURITY_STAGES] ??
                        b.maturityStage}
                    </Badge>
                  </td>
                  <td className="text-sm text-slate-600">
                    {BRANCH_STATUSES[b.status as keyof typeof BRANCH_STATUSES] ?? b.status}
                  </td>
                  <td>
                    <Link href={`/finance/branches/settings?edit=${b.id}`} className="link text-xs">
                      تعديل
                    </Link>
                  </td>
                </tr>
              ))}
              {branches.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                    لا فروع — الزرع يأخذها من قائمة الفروع بمفاتيحها نفسها، فلا يُرحَّل صفّ واحد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* نموذج الفرع */}
      <section className="card card-pad mb-5">
        <h2 className="mb-4 section-title">{editing ? `تعديل: ${editing.name}` : 'فرع جديد'}</h2>
        <form method="post" action="/api/save" className="grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="entity" value="branch" />
          <input type="hidden" name="id" value={editing?.id ?? ''} />
          <input type="hidden" name="back" value="/finance/branches/settings" />

          <FormField label="الاسم" name="name" required defaultValue={editing?.name} />
          <FormField
            label="المفتاح"
            name="code"
            required
            dir="ltr"
            defaultValue={editing?.code}
            hint={editing ? 'لا يُغيَّر — عليه تقوم السجلات' : 'نفس مفتاح قائمة الفروع'}
          />
          <SelectField
            label="النوع"
            name="type"
            defaultValue={editing?.type ?? 'retail'}
            placeholder="تجزئة"
            options={Object.entries(BRANCH_TYPES).map(([value, label]) => ({ value, label }))}
          />
          <SelectField
            label="مرحلة النضج"
            name="maturityStage"
            defaultValue={editing?.maturityStage ?? 'mature'}
            placeholder="نضج"
            options={Object.entries(MATURITY_STAGES).map(([value, label]) => ({ value, label }))}
            hint="تحدّد نسبة التحميل المطبَّقة"
          />
          <SelectField
            label="الحال"
            name="status"
            defaultValue={editing?.status ?? 'active'}
            placeholder="نشط"
            options={Object.entries(BRANCH_STATUSES).map(([value, label]) => ({ value, label }))}
          />
          <SelectField
            label="العملة"
            name="currency"
            defaultValue={editing?.currency ?? 'EGP'}
            placeholder="جنيه مصري"
            options={currencies.map((c) => ({ value: c.value, label: c.label }))}
          />
          <FormField
            label="تاريخ الافتتاح"
            name="openedAt"
            type="date"
            defaultValue={toDateInput(editing?.openedAt)}
          />
          <FormField
            label="تكلفة التجهيز والتأمين"
            name="setupCost"
            type="number"
            step="0.01"
            dir="ltr"
            defaultValue={editing?.setupCost ?? 0}
          />
          <FormField
            label="شهور متوقَّعة للتعادل"
            name="monthsToBreakEven"
            type="number"
            dir="ltr"
            defaultValue={editing?.monthsToBreakEven ?? 0}
          />
          <div className="sm:col-span-3">
            <label className="label" htmlFor="gateCriteria">
              معيار بوابة القرار — يُكتب قبل الافتتاح
            </label>
            <textarea
              id="gateCriteria"
              name="gateCriteria"
              rows={2}
              className="input"
              defaultValue={editing?.gateCriteria ?? ''}
              placeholder="مثال: بلوغ ٦٠٪ من التعادل النقدي بنهاية الشهر السادس، و٤٠ طلبًا شهريًا."
            />
            <p className="mt-1 text-xs text-slate-400">
              تسجيله مسبقًا يمنع تحوّل القرار إلى قرار عاطفي يُبرَّر بعد وقوعه.
            </p>
          </div>
          <FormField
            label="موعد البوابة"
            name="gateAt"
            type="date"
            defaultValue={toDateInput(editing?.gateAt)}
          />
          <SelectField
            label="قرار البوابة"
            name="gateDecision"
            defaultValue={editing?.gateDecision}
            placeholder="— لم يُتّخذ —"
            options={[
              { value: 'hold', label: 'تثبيت ورفع السقف' },
              { value: 'extend', label: 'تمديد المرحلة' },
              { value: 'downsize', label: 'تقليص إلى نقطة استلام' },
            ]}
          />
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="active"
                defaultChecked={editing?.active ?? true}
                className="h-4 w-4 rounded border-slate-300"
              />
              نشط
            </label>
          </div>
          <div className="sm:col-span-3 flex items-center gap-3">
            <SaveButton>{editing ? 'حفظ' : 'إضافة الفرع'}</SaveButton>
            {editing && (
              <Link href="/finance/branches/settings" className="btn-secondary">
                إلغاء
              </Link>
            )}
          </div>
        </form>
      </section>

      {/* ── ٢ · تصنيف حسابات المصروفات ──────────────────── */}
      <section className="card card-pad mb-5">
        <h2 className="mb-1 section-title">٢ · تصنيف كل حساب مصروف</h2>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          هذه الخطوة هي التي بدونها لا يعمل الموديول: <b>تصنيف الحساب يحدّد أين يقع كل جنيه</b>{' '}
          — في الكتلة المشتركة الثابتة أم في مصاريف فرع بعينه. وبلا تصنيف يبقى المصروف خارج
          المعادلة، فتظهر الشركة أربح مما هي.
          {unclassified > 0 && (
            <span className="mr-1 font-bold text-amber-700">
              ({unclassified} حسابًا بلا تصنيف)
            </span>
          )}
        </p>
        <ul className="mb-4 space-y-1 rounded-lg bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
          {SPEND_KIND_KEYS.map((k) => (
            <li key={k}>
              <b className="text-slate-800">{SPEND_KINDS[k]}</b> — {SPEND_KIND_HINTS[k]}
            </li>
          ))}
        </ul>

        {unclassified > 0 && (
          <form method="post" action="/api/save" className="mb-3">
            <input type="hidden" name="entity" value="account.suggestSpendKinds" />
            <input type="hidden" name="id" value="" />
            <input type="hidden" name="back" value="/finance/branches/settings" />
            <button type="submit" className="btn-secondary">
              املأ الفارغ باقتراح مبدئي من مجموعة الحساب
            </button>
            <span className="mr-2 text-xs text-slate-400">
              اقتراحٌ يملأ الفارغ وحده — ومجموعة الحساب لا تعرف أيّ إيجارٍ إيجارُ فرع،
              فراجِعها بعده
            </span>
          </form>
        )}

        <form method="post" action="/api/save">
          <input type="hidden" name="entity" value="account.spendKinds" />
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="back" value="/finance/branches/settings" />
          <div className="table-wrap max-h-96 overflow-y-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>حساب المصروف</th>
                  <th>تصنيف الإنفاق</th>
                </tr>
              </thead>
              <tbody>
                {expenseAccounts.map((a) => (
                  <tr key={a.id}>
                    <td className="text-sm text-slate-700">
                      {a.code && <span className="ml-2 text-xs text-slate-400">{a.code}</span>}
                      {a.name}
                    </td>
                    <td>
                      <select
                        name={`kind[${a.id}]`}
                        defaultValue={a.spendKind ?? ''}
                        className="input py-1 text-sm"
                      >
                        <option value="">— بلا تصنيف —</option>
                        {SPEND_KIND_KEYS.map((value) => (
                          <option key={value} value={value}>
                            {SPEND_KINDS[value]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <SaveButton>حفظ التصنيف</SaveButton>
          </div>
        </form>
      </section>

      {/* ── ٣ · الحسابات غير النقدية ────────────────────── */}
      <section className="card card-pad mb-5">
        <h2 className="mb-1 section-title">٣ · الحسابات النقدية وغير النقدية</h2>
        <p className="mb-4 text-xs leading-relaxed text-slate-500">
          الإهلاك مصروف <b>غير نقدي</b>، ويُستبعد من <b>التعادل النقدي</b> — وهو الحدّ الذي
          تحته يستنزف الفرع نقدًا فعليًا. أزل العلامة عن حسابات الإهلاك وما يشبهها.
        </p>
        <form method="post" action="/api/save">
          <input type="hidden" name="entity" value="account.cash" />
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="back" value="/finance/branches/settings" />
          <div className="table-wrap max-h-72 overflow-y-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الحساب</th>
                  <th>نقديّ؟</th>
                </tr>
              </thead>
              <tbody>
                {expenseAccounts.map((a) => (
                  <tr key={a.id}>
                    <td className="text-sm text-slate-700">{a.name}</td>
                    <td>
                      <input type="hidden" name="accountId" value={a.id} />
                      <input
                        type="checkbox"
                        name={`cash[${a.id}]`}
                        defaultChecked={a.isCash}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <SaveButton>حفظ</SaveButton>
          </div>
        </form>
      </section>

      {/* ── القواعد الإلزامية ───────────────────────────── */}
      <section className="card card-pad bg-slate-50/60">
        <h2 className="mb-3 flex items-center gap-2 section-title">
          <ShieldCheck className="h-4 w-4 text-brand-600" />
          القواعد التي يفرضها النظام
        </h2>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>القاعدة</th>
                <th>نوع الفرض</th>
              </tr>
            </thead>
            <tbody>
              {VALIDATION_RULES.map((r) => (
                <tr key={r.n}>
                  <td className="nums text-xs text-slate-400">{r.n}</td>
                  <td className="text-sm text-slate-700">{r.rule}</td>
                  <td>
                    <Badge
                      className={
                        r.kind.startsWith('حظر')
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                      }
                    >
                      {r.kind}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
