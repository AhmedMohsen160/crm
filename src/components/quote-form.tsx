import Link from '@/components/link';
import { QUOTE_STATUSES } from '@/lib/constants';
import { FormField, SelectField, TextAreaField } from '@/components/ui';
import { SaveButton } from '@/components/forms';
import { toDateInput } from '@/lib/utils';
import QuoteItemsEditor, { type QuoteItemData } from '@/components/quote-items-editor';

type QuoteData = {
  title: string;
  status: string;
  currency: string;
  discount: number;
  taxRate: number;
  validUntil: Date | null;
  notes: string | null;
  terms: string | null;
  dealId: string | null;
  companyId: string | null;
  contactId: string | null;
};

const DEFAULT_TERMS = `• الأسعار المذكورة بالعملة الموضحة أعلاه وسارية حتى التاريخ المحدد.
• يبدأ التنفيذ بعد سداد الدفعة المقدمة وتأكيد العرض كتابيًا.
• أي تعديل على نطاق العمل بعد الاعتماد قد يستلزم إعادة تسعير.
• تشمل الخدمة مراجعة لغوية واحدة بعد التسليم.`;

export default function QuoteForm({
  recordId,
  backPath,
  quote,
  items,
  deals,
  companies,
  contacts,
  cancelHref,
  defaultDealId,
  defaultCompanyId,
  defaultContactId,
  defaultTitle,
}: {
  recordId?: string;
  backPath: string;
  quote?: QuoteData;
  items?: QuoteItemData[];
  deals: { id: string; title: string }[];
  companies: { id: string; name: string }[];
  contacts: { id: string; firstName: string; lastName: string | null }[];
  cancelHref: string;
  defaultDealId?: string;
  defaultCompanyId?: string;
  defaultContactId?: string;
  defaultTitle?: string;
}) {
  return (
    <form method="post" action="/api/save" className="space-y-6">
      <input type="hidden" name="entity" value="quote" />
      <input type="hidden" name="id" value={recordId ?? ''} />
      <input type="hidden" name="back" value={backPath} />
      <section className="card card-pad">
        <h2 className="mb-4 section-title">بيانات العرض</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="عنوان العرض"
            name="title"
            required
            className="sm:col-span-2"
            defaultValue={quote?.title ?? defaultTitle}
            placeholder="مثال: عرض سعر ترجمة معتمدة — شركة النور"
          />
          <SelectField
            label="الصفقة المرتبطة"
            name="dealId"
            defaultValue={quote?.dealId ?? defaultDealId}
            options={deals.map((d) => ({ value: d.id, label: d.title }))}
          />
          <SelectField
            label="الشركة"
            name="companyId"
            defaultValue={quote?.companyId ?? defaultCompanyId}
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
          />
          <SelectField
            label="جهة الاتصال"
            name="contactId"
            defaultValue={quote?.contactId ?? defaultContactId}
            options={contacts.map((c) => ({
              value: c.id,
              label: [c.firstName, c.lastName].filter(Boolean).join(' '),
            }))}
          />
          <SelectField
            label="الحالة"
            name="status"
            defaultValue={quote?.status ?? 'DRAFT'}
            placeholder="مسودة"
            options={Object.entries(QUOTE_STATUSES).map(([v, l]) => ({ value: v, label: l }))}
          />
          <FormField
            label="صالح حتى"
            name="validUntil"
            type="date"
            defaultValue={toDateInput(quote?.validUntil)}
          />
        </div>
      </section>

      <QuoteItemsEditor
        initialItems={items}
        currency={quote?.currency ?? 'EGP'}
        initialDiscount={quote?.discount ?? 0}
        initialTaxRate={quote?.taxRate ?? 0}
      />

      <section className="card card-pad space-y-4">
        <TextAreaField
          label="ملاحظات للعميل"
          name="notes"
          defaultValue={quote?.notes}
          rows={3}
          placeholder="أي ملاحظات تريد أن يراها العميل في العرض"
        />
        <TextAreaField
          label="الشروط والأحكام"
          name="terms"
          defaultValue={quote?.terms ?? DEFAULT_TERMS}
          rows={6}
        />
      </section>

      <div className="flex items-center gap-3">
        <SaveButton>{quote ? 'حفظ التعديلات' : 'إنشاء عرض السعر'}</SaveButton>
        <Link href={cancelHref} className="btn-secondary">
          إلغاء
        </Link>
      </div>
    </form>
  );
}
