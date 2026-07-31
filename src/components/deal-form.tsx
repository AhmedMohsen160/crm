import Link from '@/components/link';
import {
  DEAL_STAGES,
  SERVICE_TYPES,
  LANGUAGES,
  CURRENCIES,
  CURRENCY_LABELS,
} from '@/lib/constants';
import { FormField, SelectField, TextAreaField } from '@/components/ui';
import { SaveButton } from '@/components/forms';
import { toDateInput } from '@/lib/utils';

type DealData = {
  title: string;
  description: string | null;
  stage: string;
  amount: number;
  currency: string;
  probability: number;
  serviceType: string | null;
  sourceLang: string | null;
  targetLang: string | null;
  wordCount: number | null;
  pageCount: number | null;
  deliveryDate: Date | null;
  expectedCloseDate: Date | null;
  lostReason: string | null;
  companyId: string | null;
  contactId: string | null;
  ownerId: string | null;
};

export default function DealForm({
  recordId,
  backPath,
  deal,
  companies,
  contacts,
  users,
  currentUserId,
  canAssign,
  cancelHref,
  defaultCompanyId,
  defaultContactId,
}: {
  recordId?: string;
  backPath: string;
  deal?: DealData;
  companies: { id: string; name: string }[];
  contacts: { id: string; firstName: string; lastName: string | null }[];
  users: { id: string; name: string }[];
  currentUserId: string;
  canAssign: boolean;
  cancelHref: string;
  defaultCompanyId?: string;
  defaultContactId?: string;
}) {
  return (
    <form method="post" action="/api/save" className="space-y-6">
      <input type="hidden" name="entity" value="deal" />
      <input type="hidden" name="id" value={recordId ?? ''} />
      <input type="hidden" name="back" value={backPath} />
      <section className="card card-pad">
        <h2 className="mb-4 section-title">بيانات الصفقة</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="عنوان الصفقة"
            name="title"
            required
            className="sm:col-span-2"
            defaultValue={deal?.title}
            placeholder="مثال: ترجمة معتمدة لعقد شراكة — شركة النور"
          />
          <SelectField
            label="الشركة"
            name="companyId"
            defaultValue={deal?.companyId ?? defaultCompanyId}
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
          />
          <SelectField
            label="جهة الاتصال"
            name="contactId"
            defaultValue={deal?.contactId ?? defaultContactId}
            options={contacts.map((c) => ({
              value: c.id,
              label: [c.firstName, c.lastName].filter(Boolean).join(' '),
            }))}
          />
          <SelectField
            label="المرحلة"
            name="stage"
            defaultValue={deal?.stage ?? 'NEW'}
            placeholder="جديدة"
            options={Object.entries(DEAL_STAGES).map(([v, l]) => ({ value: v, label: l }))}
          />
          <FormField
            label="نسبة احتمال الإغلاق %"
            name="probability"
            type="number"
            min="0"
            defaultValue={deal?.probability}
            hint="تُحسب تلقائيًا حسب المرحلة إن تُركت فارغة"
          />
          <FormField
            label="قيمة الصفقة"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            defaultValue={deal?.amount}
          />
          <SelectField
            label="العملة"
            name="currency"
            defaultValue={deal?.currency ?? 'EGP'}
            placeholder="EGP — جنيه مصري"
            options={CURRENCIES.map((c) => ({
              value: c,
              label: `${c} — ${CURRENCY_LABELS[c]}`,
            }))}
          />
        </div>
      </section>

      <section className="card card-pad">
        <h2 className="mb-4 section-title">تفاصيل مشروع الترجمة</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField
            label="نوع الخدمة"
            name="serviceType"
            defaultValue={deal?.serviceType}
            options={SERVICE_TYPES.map((s) => ({ value: s, label: s }))}
            className="sm:col-span-2"
          />
          <SelectField
            label="من لغة"
            name="sourceLang"
            defaultValue={deal?.sourceLang}
            options={LANGUAGES.map((l) => ({ value: l, label: l }))}
          />
          <SelectField
            label="إلى لغة"
            name="targetLang"
            defaultValue={deal?.targetLang}
            options={LANGUAGES.map((l) => ({ value: l, label: l }))}
          />
          <FormField
            label="عدد الكلمات"
            name="wordCount"
            type="number"
            min="0"
            defaultValue={deal?.wordCount}
          />
          <FormField
            label="عدد الصفحات"
            name="pageCount"
            type="number"
            min="0"
            defaultValue={deal?.pageCount}
          />
          <FormField
            label="موعد التسليم للعميل"
            name="deliveryDate"
            type="date"
            defaultValue={toDateInput(deal?.deliveryDate)}
          />
          <FormField
            label="تاريخ الإغلاق المتوقع"
            name="expectedCloseDate"
            type="date"
            defaultValue={toDateInput(deal?.expectedCloseDate)}
          />
        </div>
      </section>

      <section className="card card-pad space-y-4">
        <TextAreaField
          label="وصف / متطلبات المشروع"
          name="description"
          defaultValue={deal?.description}
          rows={4}
        />
        <FormField
          label="سبب الخسارة"
          name="lostReason"
          defaultValue={deal?.lostReason}
          placeholder="يُملأ فقط عند خسارة الصفقة — مثال: السعر مرتفع"
        />
        {canAssign && (
          <SelectField
            label="الموظف المسؤول"
            name="ownerId"
            defaultValue={deal?.ownerId ?? currentUserId}
            options={users.map((u) => ({ value: u.id, label: u.name }))}
          />
        )}
      </section>

      <div className="flex items-center gap-3">
        <SaveButton>{deal ? 'حفظ التعديلات' : 'إنشاء الصفقة'}</SaveButton>
        <Link href={cancelHref} className="btn-secondary">
          إلغاء
        </Link>
      </div>
    </form>
  );
}
