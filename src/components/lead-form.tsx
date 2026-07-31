import Link from '@/components/link';
import { LEAD_STATUSES, LEAD_SOURCES, SERVICE_TYPES, LANGUAGES } from '@/lib/constants';
import { FormField, SelectField, TextAreaField } from '@/components/ui';
import { SaveButton } from '@/components/forms';

type LeadData = {
  firstName: string;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  serviceInterest: string | null;
  sourceLang: string | null;
  targetLang: string | null;
  estimatedValue: number | null;
  notes: string | null;
  ownerId: string | null;
};

export default function LeadForm({
  recordId,
  backPath,
  lead,
  users,
  currentUserId,
  canAssign,
  cancelHref,
}: {
  recordId?: string;
  backPath: string;
  lead?: LeadData;
  users: { id: string; name: string }[];
  currentUserId: string;
  canAssign: boolean;
  cancelHref: string;
}) {
  return (
    <form method="post" action="/api/save" className="space-y-6">
      <input type="hidden" name="entity" value="lead" />
      <input type="hidden" name="id" value={recordId ?? ''} />
      <input type="hidden" name="back" value={backPath} />
      <section className="card card-pad">
        <h2 className="mb-4 section-title">البيانات الأساسية</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="الاسم الأول" name="firstName" required defaultValue={lead?.firstName} />
          <FormField label="اسم العائلة" name="lastName" defaultValue={lead?.lastName} />
          <FormField
            label="اسم الشركة / الجهة"
            name="companyName"
            defaultValue={lead?.companyName}
            placeholder="اتركه فارغًا إن كان عميلاً فردًا"
          />
          <FormField
            label="البريد الإلكتروني"
            name="email"
            type="email"
            defaultValue={lead?.email}
          />
          <FormField
            label="رقم الهاتف"
            name="phone"
            defaultValue={lead?.phone}
            placeholder="+20 1X XXXX XXXX"
          />
          <SelectField
            label="مصدر العميل"
            name="source"
            defaultValue={lead?.source}
            options={LEAD_SOURCES.map((s) => ({ value: s, label: s }))}
          />
        </div>
      </section>

      <section className="card card-pad">
        <h2 className="mb-4 section-title">تفاصيل الخدمة المطلوبة</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField
            label="نوع الخدمة"
            name="serviceInterest"
            defaultValue={lead?.serviceInterest}
            options={SERVICE_TYPES.map((s) => ({ value: s, label: s }))}
            className="sm:col-span-2"
          />
          <SelectField
            label="من لغة"
            name="sourceLang"
            defaultValue={lead?.sourceLang}
            options={LANGUAGES.map((l) => ({ value: l, label: l }))}
          />
          <SelectField
            label="إلى لغة"
            name="targetLang"
            defaultValue={lead?.targetLang}
            options={LANGUAGES.map((l) => ({ value: l, label: l }))}
          />
          <FormField
            label="القيمة المتوقعة"
            name="estimatedValue"
            type="number"
            step="0.01"
            min="0"
            defaultValue={lead?.estimatedValue}
            hint="تقدير مبدئي لقيمة المشروع"
          />
          <SelectField
            label="الحالة"
            name="status"
            defaultValue={lead?.status ?? 'NEW'}
            placeholder="جديد"
            options={Object.entries(LEAD_STATUSES).map(([v, l]) => ({ value: v, label: l }))}
          />
          {canAssign && (
            <SelectField
              label="الموظف المسؤول"
              name="ownerId"
              defaultValue={lead?.ownerId ?? currentUserId}
              options={users.map((u) => ({ value: u.id, label: u.name }))}
              className="sm:col-span-2"
            />
          )}
        </div>
      </section>

      <section className="card card-pad">
        <TextAreaField
          label="ملاحظات"
          name="notes"
          defaultValue={lead?.notes}
          placeholder="أي تفاصيل مهمة عن العميل أو طلبه..."
          rows={4}
        />
      </section>

      <div className="flex items-center gap-3">
        <SaveButton>{lead ? 'حفظ التعديلات' : 'إضافة العميل المحتمل'}</SaveButton>
        <Link href={cancelHref} className="btn-secondary">
          إلغاء
        </Link>
      </div>
    </form>
  );
}
