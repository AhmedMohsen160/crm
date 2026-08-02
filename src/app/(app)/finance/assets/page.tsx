import Link from '@/components/link';
import { Plus, CheckCircle2 } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { listOptions } from '@/lib/reference';
import { bookValue, monthlyDepreciation, fiscalMonth } from '@/lib/accounting';
import { DEPRECIATION_RATES } from '@/lib/chart-of-accounts';
import { formatMoney, formatDate } from '@/lib/utils';
import { PageHeader, Badge, FormField, SelectField, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'الأصول الثابتة' };
export const dynamic = 'force-dynamic';

/**
 * الأصول الثابتة وإهلاكها بالقسط الثابت.
 *
 * القسط يُحتسب شهريًا ويُرحَّل ضمن قيد إهلاك الشهر من لوحة الماليات.
 * **والمجمّع لا يتجاوز التكلفة أبدًا** — الأصل المستهلَك بالكامل يتوقف قسطه،
 * وإلا ظهرت قيمة دفترية سالبة.
 */
export default async function FixedAssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requirePermission('canManageAccounting');
  const { saved, error } = await searchParams;

  const [assets, branches] = await Promise.all([
    db.fixedAsset.findMany({ orderBy: [{ active: 'desc' }, { purchaseDate: 'desc' }] }),
    listOptions('branch'),
  ]);

  const categoryLabel = new Map(DEPRECIATION_RATES.map((d) => [d.category, d.label]));

  const totals = assets.reduce(
    (acc, a) => ({
      cost: acc.cost + a.cost,
      accumulated: acc.accumulated + a.accumulated,
      book: acc.book + bookValue(a.cost, a.accumulated),
      monthly:
        acc.monthly +
        (a.active
          ? monthlyDepreciation({
              cost: a.cost,
              annualRate: a.annualRate,
              accumulated: a.accumulated,
              salvage: a.salvageValue,
            })
          : 0),
    }),
    { cost: 0, accumulated: 0, book: 0, monthly: 0 }
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="الأصول الثابتة"
        subtitle={`${assets.length} أصلًا · قسط الشهر ${formatMoney(totals.monthly)}`}
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

      <div className="card table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>الأصل</th>
              <th>النوع</th>
              <th>التكلفة</th>
              <th>النسبة</th>
              <th>قسط الشهر</th>
              <th>مجمّع الإهلاك</th>
              <th>القيمة الدفترية</th>
              <th>آخر شهر رُحّل</th>
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-sm text-slate-400">
                  لا أصول مسجَّلة — أضِف أصلًا أدناه
                </td>
              </tr>
            )}
            {assets.map((asset) => {
              const monthly = monthlyDepreciation({
                cost: asset.cost,
                annualRate: asset.annualRate,
                accumulated: asset.accumulated,
                salvage: asset.salvageValue,
              });
              const book = bookValue(asset.cost, asset.accumulated);
              return (
                <tr key={asset.id} className={asset.active ? undefined : 'opacity-50'}>
                  <td>
                    <span className="font-medium text-slate-800">{asset.name}</span>
                    <span className="block text-xs text-slate-400">
                      اشتُري {formatDate(asset.purchaseDate)}
                      {asset.branch ? ` · ${asset.branch}` : ''}
                    </span>
                  </td>
                  <td className="text-xs text-slate-500">
                    {categoryLabel.get(asset.category) ?? asset.category}
                  </td>
                  <td className="nums">{formatMoney(asset.cost)}</td>
                  <td className="nums text-slate-600">{(asset.annualRate * 100).toFixed(0)}٪</td>
                  <td className="nums">
                    {monthly === 0 ? (
                      <Badge className="border-slate-200 bg-slate-50 text-slate-500">مستهلَك</Badge>
                    ) : (
                      formatMoney(monthly)
                    )}
                  </td>
                  <td className="nums text-slate-600">{formatMoney(asset.accumulated)}</td>
                  <td className="nums font-semibold">{formatMoney(book)}</td>
                  <td className="text-xs text-slate-400" dir="ltr">
                    {asset.lastPeriod ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 font-semibold">
              <td colSpan={2}>الإجمالي</td>
              <td className="nums">{formatMoney(totals.cost)}</td>
              <td></td>
              <td className="nums">{formatMoney(totals.monthly)}</td>
              <td className="nums">{formatMoney(totals.accumulated)}</td>
              <td className="nums">{formatMoney(totals.book)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <section className="card card-pad">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
          <Plus className="h-4 w-4 text-brand-600" />
          أصل جديد
        </h2>
        <form method="post" action="/api/save" className="grid gap-4 sm:grid-cols-4">
          <input type="hidden" name="entity" value="fixedAsset" />
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="back" value="/finance/assets" />

          <FormField label="اسم الأصل" name="name" required className="sm:col-span-2" />
          <SelectField
            label="النوع"
            name="category"
            required
            options={DEPRECIATION_RATES.map((d) => ({ value: d.category, label: d.label }))}
            placeholder="— اختر —"
          />
          <SelectField
            label="الفرع"
            name="branch"
            options={branches.map((b) => ({ value: b.value, label: b.label }))}
            placeholder="— غير محدد —"
          />
          <FormField label="التكلفة" name="cost" type="number" step="0.01" min="0" required dir="ltr" />
          <FormField
            label="نسبة الإهلاك السنوية"
            name="annualRate"
            type="number"
            step="0.01"
            min="0"
            max="1"
            required
            dir="ltr"
            hint="٠٫٢٥ = ٢٥٪ · التكييفات ٠٫٥"
          />
          <FormField
            label="القيمة المتبقية"
            name="salvageValue"
            type="number"
            step="0.01"
            min="0"
            dir="ltr"
            hint="تُطرح من الأساس القابل للإهلاك"
          />
          <FormField label="تاريخ الشراء" name="purchaseDate" type="date" required />
          <FormField
            label="مجمّع إهلاك سابق"
            name="accumulated"
            type="number"
            step="0.01"
            min="0"
            dir="ltr"
            hint="لأصل قديم يُرحَّل رصيده"
          />
          <FormField
            label="يبدأ إهلاكه من شهر"
            name="startPeriod"
            defaultValue={fiscalMonth(new Date())}
            dir="ltr"
            hint="YYYY-MM"
          />
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="active"
                defaultChecked
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
              />
              <span>نشط</span>
            </label>
          </div>
          <div className="sm:col-span-4">
            <SaveButton>إضافة الأصل</SaveButton>
          </div>
        </form>
      </section>
    </div>
  );
}
