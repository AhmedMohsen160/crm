import { FileText } from 'lucide-react';
import { FormField, SelectField, TextAreaField } from '@/components/ui';
import { SaveButton } from '@/components/forms';
import { FREELANCER_TIERS, RATE_UNITS } from '@/lib/freelancers';
import type { Option } from '@/lib/reference';
import { acceptAttribute, extensionList, formatBytes, MAX_FILE_BYTES } from '@/lib/files';

/** إرشاد خانة البيانات مأخوذ من القائمة نفسها — يتغيّر بتغيّر الطريقة */
function paymentHint(method: string | null | undefined, options: Option[]): string {
  const found = options.find((o) => o.value === method);
  return found?.extra || 'رقم الحساب أو المحفظة أو البريد المرتبط';
}

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
  cvFile?: { id: string; name: string; size: number } | null;
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
  paymentMethods,
  back,
}: {
  values: FreelancerValues;
  languages: Option[];
  serviceLines: Option[];
  currencies: Option[];
  paymentMethods: Option[];
  back: string;
}) {
  const selectedLangs = (values.langs ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const selectedLines = (values.specialisations ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <form
      method="post"
      action="/api/save"
      encType="multipart/form-data"
      className="space-y-6"
    >
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
          {/* قائمة لا نصّ حر: «انستا» و«إنستاباي» و«Instapay» تصير ثلاث طرق
              مختلفة في التقارير وهي واحدة */}
          <SelectField
            label="طريقة الدفع"
            name="paymentMethod"
            defaultValue={values.paymentMethod}
            options={paymentMethods}
            placeholder="— اختر طريقة الدفع —"
          />
          <FormField
            label="بيانات الدفع"
            name="paymentRef"
            defaultValue={values.paymentRef}
            dir="ltr"
            hint={paymentHint(values.paymentMethod, paymentMethods)}
          />
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <p className="label">السيرة الذاتية</p>

          {values.cvFile ? (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-brand-600" />
              <a
                href={`/api/files/${values.cvFile.id}`}
                className="link min-w-0 flex-1 truncate text-sm font-medium"
              >
                {values.cvFile.name}
              </a>
              <span className="shrink-0 text-xs text-slate-400">
                {formatBytes(values.cvFile.size)}
              </span>
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-rose-600">
                <input type="checkbox" name="cvRemove" className="h-4 w-4 rounded border-slate-300" />
                احذفها
              </label>
            </div>
          ) : null}

          <input
            type="file"
            name="cvFile"
            accept={acceptAttribute()}
            className="block w-full text-sm text-slate-600 file:ml-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
          />
          <p className="mt-1 text-xs text-slate-400">
            {values.cvFile ? 'اختيار ملف جديد يستبدل الحالي. ' : ''}
            المقبول {extensionList()} — وحتى {formatBytes(MAX_FILE_BYTES)}.
          </p>

          <FormField
            label="أو رابط خارجي للسيرة"
            name="cvUrl"
            defaultValue={values.cvUrl}
            dir="ltr"
            className="mt-4"
            hint="يُستعمل حين تكون السيرة على درايف أو لينكدإن — والمرفوع أوثق"
          />
        </div>

        <TextAreaField label="ملاحظات" name="notes" defaultValue={values.notes} className="mt-4" />
      </section>

      <SaveButton>حفظ</SaveButton>
    </form>
  );
}
