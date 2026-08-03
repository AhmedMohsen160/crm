import Link from '@/components/link';
import { CheckCircle2, Plus, Percent } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { formatMoney, toDateInput } from '@/lib/utils';
import { PageHeader, FormField, SelectField, Badge, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'خطط نسب المبيعات' };
export const dynamic = 'force-dynamic';

/**
 * خطط النسب — **كل رقم هنا يُعدَّل من الشاشة**.
 *
 * لا حدّ شريحة ولا نسبة أدمن ولا نسبة مدير مكتوبة في الكود. عدد الشرائح
 * نفسه غير محدود: تُضاف وتُحذف كما تشاء الإدارة.
 */
export default async function CommissionSchemesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  await requirePermission('canManageSettings');

  const [schemes, users] = await Promise.all([
    db.commissionScheme.findMany({
      include: {
        tiers: { orderBy: { fromAmount: 'asc' } },
        assignments: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { effectiveFrom: 'desc' },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    }),
    db.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="خطط نسب المبيعات"
        subtitle="الشرائح والنسب وطريقة الاحتساب — كلها بيانات تُعدَّل هنا"
      />
      <ErrorAlert message={error} />

      {saved && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          تم الحفظ — الفترات المغلقة لم تتغيّر.
        </div>
      )}

      <p className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
        تعديل خطة يسري على <b>الفترات المفتوحة</b> وحدها. الشهر المغلق يحتفظ
        باستحقاقاته كما احتُسبت.
      </p>

      {schemes.map((scheme) => (
        <section key={scheme.id} className="mb-6 card card-pad">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold text-slate-800">
              <Percent className="h-4 w-4 text-brand-600" />
              {scheme.name}
              {scheme.isDefault && (
                <Badge className="border-brand-300 bg-brand-50 text-brand-700">
                  الافتراضية
                </Badge>
              )}
              {!scheme.active && (
                <Badge className="border-slate-300 bg-slate-100 text-slate-500">معطَّلة</Badge>
              )}
            </h2>
          </div>

          {/* إعدادات الخطة */}
          <form method="post" action="/api/save" className="mb-4 grid gap-4 sm:grid-cols-4">
            <input type="hidden" name="entity" value="commissionScheme" />
            <input type="hidden" name="id" value={scheme.id} />
            <input type="hidden" name="back" value="/settings/commissions" />

            <FormField label="اسم الخطة" name="name" required defaultValue={scheme.name} />
            <SelectField
              label="أساس الاحتساب"
              name="basis"
              defaultValue={scheme.basis}
              placeholder="المحصَّل"
              options={[
                { value: 'collected', label: 'المحصَّل فعلًا' },
                { value: 'net', label: 'إجمالي المبيعات' },
              ]}
            />
            <SelectField
              label="طريقة الشريحة"
              name="tierMode"
              defaultValue={scheme.tierMode}
              placeholder="تصاعدية"
              options={[
                { value: 'progressive', label: 'تصاعدية جزئية' },
                { value: 'whole', label: 'الشريحة تبتلع الكل' },
              ]}
            />
            <FormField
              label="تسري من"
              name="effectiveFrom"
              type="date"
              defaultValue={toDateInput(scheme.effectiveFrom)}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isDefault"
                defaultChecked={scheme.isDefault}
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
              />
              <span>الافتراضية</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="active"
                defaultChecked={scheme.active}
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
              />
              <span>مفعَّلة</span>
            </label>
            <div className="sm:col-span-2">
              <SaveButton>حفظ إعدادات الخطة</SaveButton>
            </div>
          </form>

          {/* الشرائح */}
          <div className="table-wrap mb-4">
            <table className="tbl">
              <thead>
                <tr>
                  <th>من</th>
                  <th>إلى</th>
                  <th>نسبة الأدمن</th>
                  <th>نسبة المدير</th>
                  <th>الإجمالي</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {scheme.tiers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-sm text-rose-500">
                      لا شرائح — الخطة بلا شرائح لا تُنتج استحقاقًا
                    </td>
                  </tr>
                )}
                {scheme.tiers.map((tier) => (
                  <tr key={tier.id}>
                    <td className="nums">{formatMoney(tier.fromAmount)}</td>
                    <td className="nums">
                      {tier.toAmount === null ? 'فما فوق' : formatMoney(tier.toAmount)}
                    </td>
                    <td className="nums font-medium">{(tier.adminRate * 100).toFixed(2)}٪</td>
                    <td className="nums">{(tier.managerRate * 100).toFixed(2)}٪</td>
                    <td className="nums text-slate-500">
                      {((tier.adminRate + tier.managerRate) * 100).toFixed(2)}٪
                    </td>
                    <td>
                      <form method="post" action="/api/mutate" className="inline">
                        <input type="hidden" name="op" value="commissionTier.delete" />
                        <input type="hidden" name="id" value={tier.id} />
                        <input type="hidden" name="redirectTo" value="/settings/commissions" />
                        <button type="submit" className="text-xs text-rose-600 hover:underline">
                          حذف
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* شريحة جديدة */}
          <form
            method="post"
            action="/api/save"
            className="grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-5"
          >
            <input type="hidden" name="entity" value="commissionTier" />
            <input type="hidden" name="id" value="" />
            <input type="hidden" name="schemeId" value={scheme.id} />
            <input type="hidden" name="back" value="/settings/commissions" />

            <FormField label="من مبلغ" name="fromAmount" type="number" min="0" required dir="ltr" />
            <FormField
              label="إلى مبلغ"
              name="toAmount"
              type="number"
              min="0"
              dir="ltr"
              hint="اتركه فارغًا لـ«فما فوق»"
            />
            <FormField
              label="نسبة الأدمن"
              name="adminRate"
              type="number"
              step="0.001"
              min="0"
              max="1"
              required
              dir="ltr"
              hint="٠٫٠٣ = ٣٪"
            />
            <FormField
              label="نسبة المدير"
              name="managerRate"
              type="number"
              step="0.001"
              min="0"
              max="1"
              dir="ltr"
              hint="٠٫٠٢ = ٢٪"
            />
            <div className="flex items-end pb-1">
              <SaveButton>
                <Plus className="h-4 w-4" />
                إضافة شريحة
              </SaveButton>
            </div>
          </form>

          {/* إسناد الخطة لأشخاص */}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-medium text-slate-500">
              يخضع لهذه الخطة:{' '}
              {scheme.assignments.length === 0
                ? scheme.isDefault
                  ? 'الجميع (افتراضية)'
                  : 'لا أحد بعد'
                : scheme.assignments
                    .map((a) =>
                      a.target
                        ? `${a.user.name} (عتبة ${a.target.toLocaleString('ar-EG')})`
                        : a.user.name
                    )
                    .join(' · ')}
            </p>
            <form method="post" action="/api/save" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="entity" value="commissionAssignment" />
              <input type="hidden" name="id" value="" />
              <input type="hidden" name="schemeId" value={scheme.id} />
              <input type="hidden" name="back" value="/settings/commissions" />
              <SelectField
                label="إسناد لموظف"
                name="userId"
                options={users.map((u) => ({ value: u.id, label: u.name }))}
              />
              <FormField
                label="عتبة الاستحقاق"
                name="target"
                type="number"
                step="1000"
                min="0"
                hint="ما دونها لا نسبة — اتركها فارغة لبلا عتبة"
              />
              <FormField label="من تاريخ" name="effectiveFrom" type="date" />
              <SaveButton>إسناد</SaveButton>
            </form>
          </div>
        </section>
      ))}

      <section className="card card-pad">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
          <Plus className="h-4 w-4 text-brand-600" />
          خطة جديدة
        </h2>
        <form method="post" action="/api/save" className="grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="entity" value="commissionScheme" />
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="back" value="/settings/commissions" />
          <FormField label="اسم الخطة" name="name" required placeholder="مثال: خطة ٢٠٢٧" />
          <SelectField
            label="أساس الاحتساب"
            name="basis"
            defaultValue="collected"
            placeholder="المحصَّل"
            options={[
              { value: 'collected', label: 'المحصَّل فعلًا' },
              { value: 'net', label: 'إجمالي المبيعات' },
            ]}
          />
          <SelectField
            label="طريقة الشريحة"
            name="tierMode"
            defaultValue="progressive"
            placeholder="تصاعدية"
            options={[
              { value: 'progressive', label: 'تصاعدية جزئية' },
              { value: 'whole', label: 'الشريحة تبتلع الكل' },
            ]}
          />
          <div className="sm:col-span-3">
            <SaveButton>إنشاء الخطة</SaveButton>
          </div>
        </form>
      </section>

      <div className="mt-6 card card-pad bg-slate-50/60 text-sm text-slate-600">
        <p className="mb-2 font-semibold text-slate-800">الفرق بين طريقتي الشريحة</p>
        <p className="mb-2 text-xs">بائع حصّل ٣٠٠٬٠٠٠ والشرائح ٣٪ حتى ٢٠٠ ألف ثم ٣٫٥٪:</p>
        <ul className="space-y-1 text-xs">
          <li>
            <b>تصاعدية جزئية:</b> ٢٠٠ألف×٣٪ + ١٠٠ألف×٣٫٥٪ ={' '}
            <b className="nums">٩٬٥٠٠</b>
          </li>
          <li>
            <b>الشريحة تبتلع الكل:</b> ٣٠٠ألف×٣٫٥٪ = <b className="nums">١٠٬٥٠٠</b>
          </li>
        </ul>
        <p className="mt-2 text-xs">
          جرّب الاثنين على أرقام شهر حقيقي من{' '}
          <Link href="/commissions" className="link">
            شاشة «نسبي»
          </Link>{' '}
          واختر ما يطابق نيتك.
        </p>
      </div>
    </div>
  );
}
