import Link from '@/components/link';
import { LANGUAGES } from '@/lib/constants';
import { FormField, SelectField, TextAreaField } from '@/components/ui';
import { SaveButton } from '@/components/forms';

type ContactData = {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  jobTitle: string | null;
  language: string | null;
  notes: string | null;
  companyId: string | null;
  ownerId: string | null;
};

export default function ContactForm({
  recordId,
  backPath,
  contact,
  companies,
  users,
  currentUserId,
  canAssign,
  cancelHref,
  defaultCompanyId,
}: {
  recordId?: string;
  backPath: string;
  contact?: ContactData;
  companies: { id: string; name: string }[];
  users: { id: string; name: string }[];
  currentUserId: string;
  canAssign: boolean;
  cancelHref: string;
  defaultCompanyId?: string;
}) {
  return (
    <form method="post" action="/api/save" className="space-y-6">
      <input type="hidden" name="entity" value="contact" />
      <input type="hidden" name="id" value={recordId ?? ''} />
      <input type="hidden" name="back" value={backPath} />
      <section className="card card-pad">
        <h2 className="mb-4 section-title">بيانات جهة الاتصال</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="الاسم الأول" name="firstName" required defaultValue={contact?.firstName} />
          <FormField label="اسم العائلة" name="lastName" defaultValue={contact?.lastName} />
          <SelectField
            label="الشركة"
            name="companyId"
            defaultValue={contact?.companyId ?? defaultCompanyId}
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
            hint="اتركه فارغًا إن كان عميلاً فردًا"
          />
          <FormField
            label="المسمى الوظيفي"
            name="jobTitle"
            defaultValue={contact?.jobTitle}
            placeholder="مثال: مدير الشؤون القانونية"
          />
          <FormField label="البريد الإلكتروني" name="email" type="email" defaultValue={contact?.email} />
          <FormField label="الجوال" name="mobile" defaultValue={contact?.mobile} />
          <FormField label="هاتف العمل" name="phone" defaultValue={contact?.phone} />
          <SelectField
            label="لغة التواصل المفضلة"
            name="language"
            defaultValue={contact?.language}
            options={LANGUAGES.map((l) => ({ value: l, label: l }))}
          />
          {canAssign && (
            <SelectField
              label="الموظف المسؤول"
              name="ownerId"
              defaultValue={contact?.ownerId ?? currentUserId}
              options={users.map((u) => ({ value: u.id, label: u.name }))}
              className="sm:col-span-2"
            />
          )}
        </div>
      </section>

      <section className="card card-pad">
        <TextAreaField label="ملاحظات" name="notes" defaultValue={contact?.notes} rows={4} />
      </section>

      <div className="flex items-center gap-3">
        <SaveButton>{contact ? 'حفظ التعديلات' : 'إضافة جهة الاتصال'}</SaveButton>
        <Link href={cancelHref} className="btn-secondary">
          إلغاء
        </Link>
      </div>
    </form>
  );
}
