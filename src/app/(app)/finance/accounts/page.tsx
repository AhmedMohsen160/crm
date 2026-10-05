import Link from '@/components/link';
import { Plus, CheckCircle2 } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { ACCOUNT_TYPES, EXPENSE_GROUPS, REVENUE_GROUPS } from '@/lib/accounting';
import { PageHeader, Badge, FormField, SelectField, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'شجرة الحسابات' };
export const dynamic = 'force-dynamic';

const TYPE_STYLE: Record<string, string> = {
  asset: 'border-brand-200 bg-brand-50 text-brand-700',
  liability: 'border-amber-200 bg-amber-50 text-amber-700',
  equity: 'border-violet-200 bg-violet-50 text-violet-700',
  revenue: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  expense: 'border-rose-200 bg-rose-50 text-rose-700',
};

/**
 * شجرة الحسابات — **بيانات لا كود**.
 *
 * تُزرع مرة من دفاتر فاست ترانس ثم يملكها المحاسب: يضيف حسابًا تحت أي
 * مستوى ويعطّل ما لم يعد يُستخدم. ولا يُحذف حساب عليه قيود أبدًا — يُعطَّل،
 * فتظل تقارير الماضي صحيحة.
 */
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; saved?: string; error?: string }>;
}) {
  await requirePermission('canManageAccounting');
  const { type, q, saved, error } = await searchParams;

  const [all, costCenters, usage] = await Promise.all([
    db.account.findMany({ orderBy: [{ level: 'asc' }, { name: 'asc' }] }),
    db.costCenter.findMany({ orderBy: { name: 'asc' } }),
    db.journalLine.groupBy({ by: ['accountId'], _count: true }),
  ]);

  const usedBy = new Map(usage.map((u) => [u.accountId, u._count]));
  const byParent = new Map<string | null, typeof all>();
  for (const account of all) {
    const key = account.parentId ?? null;
    byParent.set(key, [...(byParent.get(key) ?? []), account]);
  }

  const matches = (a: (typeof all)[number]) =>
    (!type || a.type === type) &&
    (!q || a.name.includes(q) || (a.nameEn ?? '').toLowerCase().includes(q.toLowerCase()));

  /** يعرض الفرع إن طابق هو أو أيٌّ من ذريته — فلا يختفي أب النتيجة */
  function subtreeMatches(account: (typeof all)[number]): boolean {
    if (matches(account)) return true;
    return (byParent.get(account.id) ?? []).some(subtreeMatches);
  }

  function renderTree(parentId: string | null, depth = 0): React.ReactNode {
    const children = (byParent.get(parentId) ?? []).filter(subtreeMatches);
    if (children.length === 0) return null;

    return children.map((account) => {
      const used = usedBy.get(account.id) ?? 0;
      return (
        <div key={account.id}>
          <div
            className="flex flex-wrap items-center gap-2 border-b border-slate-100 py-2 text-sm"
            style={{ paddingRight: `${depth * 1.25}rem` }}
          >
            <span
              className={
                account.isPostable
                  ? 'font-medium text-slate-800'
                  : 'font-semibold text-slate-500'
              }
            >
              {account.name}
            </span>
            {account.code && (
              <span className="text-xs text-slate-400" dir="ltr">
                {account.code}
              </span>
            )}
            {depth === 0 && (
              <Badge className={TYPE_STYLE[account.type] ?? TYPE_STYLE.asset}>
                {ACCOUNT_TYPES[account.type as keyof typeof ACCOUNT_TYPES] ?? account.type}
              </Badge>
            )}
            {account.isPostable && (
              <Badge className="border-slate-200 bg-slate-50 text-slate-500">ختامي</Badge>
            )}
            {!account.active && (
              <Badge className="border-slate-300 bg-slate-100 text-slate-400">معطَّل</Badge>
            )}
            {used > 0 && <span className="text-xs text-slate-400">{used} سطر قيد</span>}
            {account.systemKey && (
              <span className="text-xs text-brand-600" title="يربطه النظام بحدث تشغيلي">
                نظامي
              </span>
            )}
          </div>
          {renderTree(account.id, depth + 1)}
        </div>
      );
    });
  }

  const parentOptions = all
    .filter((a) => a.active)
    .map((a) => ({ value: a.id, label: `${'— '.repeat(a.level - 1)}${a.name}` }));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="شجرة الحسابات"
        subtitle={`${all.length} حسابًا في أربعة مستويات — القيد لا يقع إلا على حساب ختامي`}
      >
        <Link href="/finance" className="btn-secondary">
          لوحة الماليات
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />

      {saved && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          تم الحفظ.
        </div>
      )}

      <form method="get" className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="ابحث في أسماء الحسابات"
          className="input w-64"
        />
        <select name="type" defaultValue={type ?? ''} className="input w-auto">
          <option value="">كل الأنواع</option>
          {Object.entries(ACCOUNT_TYPES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-secondary">
          تصفية
        </button>
      </form>

      <section className="card card-pad">{renderTree(null)}</section>

      {/* ── حساب جديد ────────────────────────────────────────── */}
      <section className="card card-pad">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
          <Plus className="h-4 w-4 text-brand-600" />
          حساب جديد
        </h2>
        <form method="post" action="/api/save" className="grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="entity" value="account" />
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="back" value="/finance/accounts" />

          <FormField label="اسم الحساب" name="name" required />
          <FormField label="الاسم الإنجليزي" name="nameEn" dir="ltr" />
          <FormField label="الكود" name="code" dir="ltr" hint="اختياري" />
          <SelectField
            label="تحت أي حساب"
            name="parentId"
            options={parentOptions}
            placeholder="— حساب رئيسي مستقل —"
            hint="النوع والبند يُورَثان من الأب"
            className="sm:col-span-2"
          />
          <SelectField
            label="النوع (للحساب الرئيسي فقط)"
            name="type"
            options={Object.entries(ACCOUNT_TYPES).map(([value, label]) => ({ value, label }))}
            placeholder="— اختر —"
          />
          <SelectField
            label="بند قائمة الدخل"
            name="expenseGroup"
            options={[
              ...Object.entries(EXPENSE_GROUPS).map(([value, label]) => ({ value, label })),
              ...Object.entries(REVENUE_GROUPS).map(([value, label]) => ({ value, label })),
            ]}
            placeholder="— يُورَث من الأب —"
            className="sm:col-span-2"
          />
          <div className="flex items-end gap-4 pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isPostable"
                defaultChecked
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
              />
              <span>يقبل القيود</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="active"
                defaultChecked
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
              />
              <span>مفعَّل</span>
            </label>
          </div>
          <div className="sm:col-span-3">
            <SaveButton>إضافة الحساب</SaveButton>
          </div>
        </form>
      </section>

      {/* ── مراكز الربحية ────────────────────────────────────── */}
      <section className="card card-pad">
        <h2 className="mb-1 font-semibold text-slate-800">مراكز الربحية</h2>
        <p className="mb-4 text-xs leading-relaxed text-slate-500">
          مشروعٌ أو عميلٌ مستمرّ يُرصد إيرادُه ومصروفُه ليُقاس <b>هامشه وحده</b> —
          يُختار في سطر القيد، وتُقرأ نتيجته في «ربحية المشاريع». وهو{' '}
          <b>غير تصنيف الإنفاق</b> (مركزي أم فرعي): ذاك على الحساب في «إعداد محاسبة
          الفروع».
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {costCenters.map((c) => (
            <Badge
              key={c.id}
              className={
                c.active
                  ? 'border-slate-200 bg-slate-50 text-slate-700'
                  : 'border-slate-200 bg-slate-100 text-slate-400'
              }
            >
              {c.name}
              {c.project ? ` · ${c.project}` : ''}
            </Badge>
          ))}
        </div>

        <form method="post" action="/api/save" className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="entity" value="costCenter" />
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="back" value="/finance/accounts" />
          <FormField label="اسم المركز" name="name" required hint="اسم المشروع أو الجهة" />
          <FormField label="وصف إضافي" name="project" />
          <div className="flex items-end gap-3 pb-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="active"
                defaultChecked
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
              />
              <span>مفعَّل</span>
            </label>
            <SaveButton>إضافة</SaveButton>
          </div>
        </form>
      </section>
    </div>
  );
}
