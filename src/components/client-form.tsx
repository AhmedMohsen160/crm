import Link from '@/components/link';
import { CLIENT_TYPES } from '@/lib/constants';
import { FormField, SelectField, TextAreaField } from '@/components/ui';
import { SaveButton } from '@/components/forms';

type ClientData = {
  name: string;
  phone: string;
  phoneAlt: string | null;
  email: string | null;
  type: string;
  companyName: string | null;
  taxId: string | null;
  country: string | null;
  city: string | null;
  notes: string | null;
};

export default function ClientForm({
  recordId,
  backPath,
  client,
  cancelHref,
}: {
  recordId?: string;
  backPath: string;
  client?: ClientData;
  cancelHref: string;
}) {
  return (
    <form method="post" action="/api/save" className="space-y-5">
      <input type="hidden" name="entity" value="client" />
      <input type="hidden" name="id" value={recordId ?? ''} />
      <input type="hidden" name="back" value={backPath} />

      <section className="card card-pad">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="رقم الهاتف"
            name="phone"
            type="tel"
            required
            dir="ltr"
            defaultValue={client?.phone}
            placeholder="01xxxxxxxxx"
            hint="مفتاح العميل — لا يتكرر في النظام مهما اختلفت صيغة كتابته"
          />
          <FormField
            label="هاتف بديل"
            name="phoneAlt"
            type="tel"
            dir="ltr"
            defaultValue={client?.phoneAlt}
          />
          <FormField label="الاسم" name="name" required defaultValue={client?.name} />
          <SelectField
            label="النوع"
            name="type"
            defaultValue={client?.type ?? 'individual'}
            placeholder="فرد"
            options={Object.entries(CLIENT_TYPES).map(([v, l]) => ({ value: v, label: l }))}
          />
          <FormField
            label="البريد الإلكتروني"
            name="email"
            type="email"
            defaultValue={client?.email}
          />
          <FormField
            label="اسم الشركة"
            name="companyName"
            defaultValue={client?.companyName}
            placeholder="للعميل المؤسسي"
          />
          <FormField label="الرقم الضريبي" name="taxId" defaultValue={client?.taxId} />
          <FormField label="المدينة" name="city" defaultValue={client?.city} />
          <FormField label="الدولة" name="country" defaultValue={client?.country} />
          <TextAreaField
            label="ملاحظات"
            name="notes"
            defaultValue={client?.notes}
            rows={3}
            className="sm:col-span-2"
          />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <SaveButton>{client ? 'حفظ التعديلات' : 'إضافة العميل'}</SaveButton>
        <Link href={cancelHref} className="btn-secondary">
          إلغاء
        </Link>
      </div>
    </form>
  );
}
