import { FormField, SelectField, TextAreaField } from '@/components/ui';
import { SaveButton } from '@/components/forms';
import { FREELANCER_TIERS, RATE_UNITS } from '@/lib/freelancers';
import type { Option } from '@/lib/reference';

type FreelancerValues = {
  id?: string;
  name?: string | null;
  phone?: string | null;
  phoneAlt?: string | null;
  email?: string | null;
  country?: string | null;
  city?: string | null;
  langs?: string | null;
  specialisations?: string | null;
  defaultRate?: number | null;
  rateUnit?: string | null;
  currency?: string | null;
  tier?: string | null;
  active?: boolean;
  rating?: number | null;
  paymentMethod?: string | null;
  paymentRef?: string | null;
  cvUrl?: string | null;
  notes?: string | null;
  needsReview?: boolean;
};

/**
 * نموذج الفريلانسر — واحد للإنشاء والتعديل.
 *
 * اللغات والتخصصات مربعات اختيار متعددة لأن الشخص الواحد يعمل على أكثر من
 * زوج، وهو سبب تكراره في ملف المصدر أصلًا (§١٤).
 */
export default function FreelancerForm({
  values,
  languages,
  serviceLines,
  currencies,
  back,
}: {
  values: FreelancerValues;
  languages: Option[];
  serviceLines: Option[];
  currencies: Option[];
  back: string;
}) {
  const selectedLangs = (values.langs ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const selectedLines = (values.specialisations ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <form method="post" action="/api/save" className="space-y-6">
      <input type="hidden" name="entity" value="freelancer" />
      <input type="hidden" name="id" value={values.id ?? ''} />
      <input type="hidden" name="back" value={back} />

      <section className="card card-pad">
        <h2 className="mb-4 section-title">البيانات الأساسية</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="الاسم" name="name" required defaultValue={values.name} />
          <FormField
            label="الهاتف"
            name="phone"
            defaultValue={values.phone}
            dir="ltr"
            hint="يُطبَّع تلقائيًا — وهو مفتاح دمج المكرر"
          />
          <FormField label="هاتف بديل" name="phoneAlt" defaultValue={values.phoneAlt} dir="ltr" />
          <FormField
            label="البريد الإلكتروني"
            name="email"
            type="email"
            defaultValue={values.email}
            dir="ltr"
          />
          <FormField label="الدولة" name="country" defaultValue={values.country} />
          <FormField label="المدينة" name="city" defaultValue={values.city} />
        </div>
      </section>

      <section className="card card-pad">
        <h2 className="mb-1 section-title">اللغات والتخصصات</h2>
        <p className="mb-4 text-xs text-slate-500">
          عليها يقوم الترشيح المسبق في شاشة الإسناد — فلا يظهر إلا من يعمل على
          زوج المشروع فعلًا.
        </p>

        <p className="label">اللغات</p>
        <div className="mb-5 flex flex-wrap gap-2">
          {languages.map((l) => (
            <label
              key={l.value}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              <input
                type="checkbox"
                name="langs"
                value={l.value}
                defaultChecked={selectedLangs.includes(l.value)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
              />
              {l.label}
            </label>
          ))}
        </div>

        <p className="label">التخصصات</p>
        <div className="flex flex-wrap gap-2">
          {serviceLines.map((s) => (
            <label
              key={s.value}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              <input
                type="checkbox"
                name="specialisations"
                value={s.value}
                defaultChecked={selectedLines.includes(s.value)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
              />
              {s.label}
            </label>
          ))}
        </div>
      </section>

      <section className="card card-pad">
        <h2 className="mb-4 section-title">الأجر والدرجة</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            label="السعر الافتراضي"
            name="defaultRate"
            type="number"
            step="0.01"
            min="0"
            defaultValue={values.defaultRate}
            dir="ltr"
            hint="اتركه فارغًا إن لم يُتفق — الفراغ ليس صفرًا"
          />
          <SelectField
            label="وحدة الأجر"
            name="rateUnit"
            defaultValue={values.rateUnit ?? 'page'}
            placeholder="الصفحة"
            options={Object.entries(RATE_UNITS).map(([value, label]) => ({ value, label }))}
            hint="من يُدفع له بالساعة لا تُضرب صفحاته في أجره"
          />
          <SelectField
            label="العملة"
            name="currency"
            defaultValue={values.currency ?? 'EGP'}
            placeholder="جنيه مصري"
            options={currencies}
          />
          <SelectField
            label="الدرجة"
            name="tier"
            defaultValue={values.tier ?? 'bench'}
            placeholder="مخزون"
            options={Object.entries(FREELANCER_TIERS).map(([value, label]) => ({ value, label }))}
            hint="«معتمد» هو الافتراضي في شاشة الإسناد"
          />
          <FormField
            label="التقييم (من ١٠)"
            name="rating"
            type="number"
            step="0.5"
            min="0"
            max="10"
            defaultValue={values.rating}
            dir="ltr"
          />
          <div className="flex items-end gap-4 pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="active"
                defaultChecked={values.active ?? true}
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
              />
              <span>نشط</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="needsReview"
                defaultChecked={values.needsReview ?? false}
                className="h-4 w-4 rounded border-slate-300 text-amber-600"
              />
              <span>يحتاج مراجعة</span>
            </label>
          </div>
        </div>
      </section>

      <section className="card card-pad">
        <h2 className="mb-4 section-title">الدفع والملفات</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="طريقة الدفع"
            name="paymentMethod"
            defaultValue={values.paymentMethod}
            placeholder="تحويل بنكي · محفظة · إنستاباي"
          />
          <FormField
            label="بيانات الدفع"
            name="paymentRef"
            defaultValue={values.paymentRef}
            dir="ltr"
            hint="رقم الحساب أو المحفظة"
          />
          <FormField label="رابط السيرة الذاتية" name="cvUrl" defaultValue={values.cvUrl} dir="ltr" />
        </div>
        <TextAreaField label="ملاحظات" name="notes" defaultValue={values.notes} />
      </section>

      <SaveButton>حفظ</SaveButton>
    </form>
  );
}
