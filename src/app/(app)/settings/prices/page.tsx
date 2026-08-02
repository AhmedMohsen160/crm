import { CheckCircle2, History, Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { listOptionsMany } from '@/lib/reference';
import { formatMoney, formatDate, toDateInput } from '@/lib/utils';
import { PageHeader, FormField, SelectField, Badge, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'قائمة الأسعار' };
export const dynamic = 'force-dynamic';

/**
 * قائمة الأسعار (§١٠ بند ١).
 *
 * **`effectiveFrom` إلزامي:** تعديل سعر اليوم لا يغيّر أسعار الماضي. البند
 * الجديد **يُضاف** بتاريخ سريان ولا يستبدل القديم، ويُقرأ سعر أي مشروع
 * بتاريخه هو (اختبار ١٩).
 */
export default async function PricesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; history?: string }>;
}) {
  const { saved, error, history } = await searchParams;
  await requirePermission('canManageSettings');

  const [lists, items] = await Promise.all([
    listOptionsMany('service_line', 'language', 'currency'),
    db.priceListItem.findMany({
      orderBy: [{ serviceLine: 'asc' }, { effectiveFrom: 'desc' }],
      take: 500,
    }),
  ]);

  const serviceLabel = new Map(lists.service_line.map((s) => [s.value, s.label]));
  const langLabel = new Map(lists.language.map((l) => [l.value, l.label]));

  // البند الساري لكل مجموعة = الأحدث سريانًا مما بدأ قبل الآن
  const now = new Date();
  const currentIds = new Set<string>();
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.serviceLine}|${item.langFrom}|${item.langTo}`;
    if (seen.has(key)) continue;
    if (item.effectiveFrom > now || !item.active) continue;
    seen.add(key);
    currentIds.add(item.id);
  }

  const visible = history ? items : items.filter((i) => currentIds.has(i.id));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="قائمة الأسعار"
        subtitle="خط الخدمة × من لغة × إلى لغة ← سعر الصفحة"
      >
        <a
          href={history ? '/settings/prices' : '/settings/prices?history=1'}
          className="btn-secondary"
        >
          <History className="h-4 w-4" />
          {history ? 'السارية فقط' : 'كل التاريخ'}
        </a>
      </PageHeader>
      <ErrorAlert message={error} />

      {saved && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          تم الحفظ — أسعار المشاريع القديمة لم تتغيّر.
        </div>
      )}

      <p className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
        السعر الجديد <b>يُضاف بتاريخ سريان</b> ولا يمحو القديم. مشروع أُنشئ قبل تاريخ
        السريان يحتفظ بسعره القديم إلى الأبد.
      </p>

      <div className="card table-wrap mb-6">
        <table className="tbl">
          <thead>
            <tr>
              <th>خط الخدمة</th>
              <th>من</th>
              <th>إلى</th>
              <th>سعر الصفحة</th>
              <th>حد أدنى للطلب</th>
              <th>يسري من</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-sm text-slate-400">
                  لا أسعار بعد — أضف أول بند من النموذج أدناه
                </td>
              </tr>
            )}
            {visible.map((item) => {
              const current = currentIds.has(item.id);
              const future = item.effectiveFrom > now;
              return (
                <tr key={item.id} className={current ? undefined : 'opacity-60'}>
                  <td className="text-sm">
                    {serviceLabel.get(item.serviceLine) ?? item.serviceLine}
                  </td>
                  <td className="text-sm">{langLabel.get(item.langFrom) ?? item.langFrom}</td>
                  <td className="text-sm">{langLabel.get(item.langTo) ?? item.langTo}</td>
                  <td className="nums font-semibold">
                    {formatMoney(item.unitPrice, item.currency)}
                  </td>
                  <td className="nums text-slate-600">
                    {item.minOrder ? formatMoney(item.minOrder, item.currency) : '—'}
                  </td>
                  <td className="whitespace-nowrap text-xs text-slate-500">
                    {formatDate(item.effectiveFrom)}
                  </td>
                  <td>
                    {!item.active ? (
                      <Badge className="border-slate-300 bg-slate-100 text-slate-500">
                        معطَّل
                      </Badge>
                    ) : future ? (
                      <Badge className="border-sky-300 bg-sky-100 text-sky-700">
                        يسري لاحقًا
                      </Badge>
                    ) : current ? (
                      <Badge className="border-emerald-300 bg-emerald-100 text-emerald-700">
                        ساري
                      </Badge>
                    ) : (
                      <Badge className="border-slate-300 bg-slate-100 text-slate-500">
                        تاريخي
                      </Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="card card-pad">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
          <Plus className="h-4 w-4 text-brand-600" />
          بند سعر جديد
        </h2>
        <form method="post" action="/api/save" className="grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="entity" value="priceItem" />
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="back" value="/settings/prices" />

          <SelectField
            label="خط الخدمة"
            name="serviceLine"
            required
            options={lists.service_line.map((s) => ({ value: s.value, label: s.label }))}
          />
          <SelectField
            label="من لغة"
            name="langFrom"
            required
            options={lists.language.map((l) => ({ value: l.value, label: l.label }))}
          />
          <SelectField
            label="إلى لغة"
            name="langTo"
            required
            options={lists.language.map((l) => ({ value: l.value, label: l.label }))}
          />
          <FormField
            label="سعر الصفحة"
            name="unitPrice"
            type="number"
            step="0.01"
            min="0"
            required
            dir="ltr"
          />
          <FormField
            label="حد أدنى للطلب"
            name="minOrder"
            type="number"
            step="1"
            min="0"
            dir="ltr"
            hint="اتركه فارغًا لاستخدام الحد العام"
          />
          <SelectField
            label="العملة"
            name="currency"
            defaultValue="EGP"
            placeholder="جنيه مصري"
            options={lists.currency.map((c) => ({ value: c.value, label: c.label }))}
          />
          <FormField
            label="يسري من"
            name="effectiveFrom"
            type="date"
            defaultValue={toDateInput(now)}
            hint="اتركه اليوم ليسري فورًا، أو اختر تاريخًا لاحقًا"
          />
          <FormField label="ملاحظة" name="notes" className="sm:col-span-2" />

          <div className="sm:col-span-3">
            <SaveButton>إضافة البند</SaveButton>
          </div>
        </form>
      </section>
    </div>
  );
}
