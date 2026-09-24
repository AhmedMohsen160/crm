import Link from '@/components/link';
import { INDUSTRIES } from '@/lib/constants';
import { FormField, SelectField, TextAreaField } from '@/components/ui';
import { SaveButton } from '@/components/forms';
import CountryCity from '@/components/country-city';
import DocumentUpload from '@/components/document-upload';

type CompanyData = {
  name: string;
  nameAr: string | null;
  industry: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  taxNumber: string | null;
  commercialRegNo: string | null;
  repName: string | null;
  repPhone: string | null;
  paymentTerms: string | null;
  notes: string | null;
  ownerId: string | null;
  commercialRegFile?: { id: string; name: string; size: number } | null;
  taxCardFile?: { id: string; name: string; size: number } | null;
};

export default function CompanyForm({
  recordId,
  backPath,
  company,
  users,
  currentUserId,
  canAssign,
  cancelHref,
}: {
  recordId?: string;
  backPath: string;
  company?: CompanyData;
  users: { id: string; name: string }[];
  currentUserId: string;
  canAssign: boolean;
  cancelHref: string;
}) {
  return (
    <form
      method="post"
      action="/api/save"
      encType="multipart/form-data"
      className="space-y-6"
    >
      <input type="hidden" name="entity" value="company" />
      <input type="hidden" name="id" value={recordId ?? ''} />
      <input type="hidden" name="back" value={backPath} />
      <section className="card card-pad">
        <h2 className="mb-4 section-title">بيانات الشركة</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="اسم الشركة" name="name" required defaultValue={company?.name} />
          <FormField
            label="الاسم بالعربية"
            name="nameAr"
            defaultValue={company?.nameAr}
            placeholder="إن اختلف عن الاسم الرسمي"
          />
          <SelectField
            label="القطاع"
            name="industry"
            defaultValue={company?.industry}
            options={INDUSTRIES.map((i) => ({ value: i, label: i }))}
          />
          <FormField
            label="الموقع الإلكتروني"
            name="website"
            defaultValue={company?.website}
            placeholder="https://example.com"
          />
          <FormField label="البريد الإلكتروني" name="email" type="email" defaultValue={company?.email} />
          <FormField label="رقم الهاتف" name="phone" defaultValue={company?.phone} />
        </div>
      </section>

      {/* ── ممثّل الشركة ─────────────────────────────────── */}
      <section className="card card-pad">
        <h2 className="mb-1 section-title">ممثّل الشركة</h2>
        <p className="mb-4 text-xs text-slate-500">
          من يُوقّع ويُتابع الالتزامات — غير جهة الاتصال التي قد تكون موظف تنسيق.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="اسم الممثّل" name="repName" defaultValue={company?.repName} />
          <FormField
            label="رقم الممثّل"
            name="repPhone"
            dir="ltr"
            defaultValue={company?.repPhone}
          />
        </div>
      </section>

      <section className="card card-pad">
        <h2 className="mb-4 section-title">العنوان والبيانات المالية</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <CountryCity defaultCountry={company?.country} defaultCity={company?.city} />
          <FormField
            label="العنوان التفصيلي"
            name="address"
            className="sm:col-span-2"
            defaultValue={company?.address}
          />
          <FormField
            label="الرقم الضريبي"
            name="taxNumber"
            dir="ltr"
            defaultValue={company?.taxNumber}
            hint="يظهر في عروض الأسعار والفواتير"
          />
          <FormField
            label="رقم السجل التجاري"
            name="commercialRegNo"
            dir="ltr"
            defaultValue={company?.commercialRegNo}
            hint="رقمٌ آخر غير الضريبي — والفاتورة تطلبهما معًا"
          />
          <FormField
            label="شروط الدفع"
            name="paymentTerms"
            defaultValue={company?.paymentTerms}
            placeholder="مثال: 50% مقدم — الباقي عند التسليم"
          />
          {canAssign && (
            <SelectField
              label="الموظف المسؤول"
              name="ownerId"
              defaultValue={company?.ownerId ?? currentUserId}
              options={users.map((u) => ({ value: u.id, label: u.name }))}
              className="sm:col-span-2"
            />
          )}
        </div>
      </section>

      {/* ── مستندات الشركة ──────────────────────────────── */}
      <section className="card card-pad">
        <h2 className="mb-1 section-title">مستندات الشركة</h2>
        <p className="mb-4 text-xs text-slate-500">
          اختيارية — ترفعها مرة فيجدها المحاسب عند إصدار الفاتورة بلا أن يطلبها من
          العميل ثانيةً.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <DocumentUpload
            label="السجل التجاري"
            name="commercialRegFile"
            file={company?.commercialRegFile}
          />
          <DocumentUpload
            label="البطاقة الضريبية"
            name="taxCardFile"
            file={company?.taxCardFile}
          />
        </div>
      </section>

      <section className="card card-pad">
        <TextAreaField label="ملاحظات" name="notes" defaultValue={company?.notes} rows={4} />
      </section>

      <div className="flex items-center gap-3">
        <SaveButton>{company ? 'حفظ التعديلات' : 'إضافة الشركة'}</SaveButton>
        <Link href={cancelHref} className="btn-secondary">
          إلغاء
        </Link>
      </div>
    </form>
  );
}
