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
  ownerId: string | null;
  coOwnerId: string | null;
};

export default function ClientForm({
  recordId,
  backPath,
  client,
  cancelHref,
  owners,
  defaultOwnerId,
}: {
  recordId?: string;
  backPath: string;
  client?: ClientData;
  cancelHref: string;
  /** قائمة من يصحّ أن يملك بطاقةً — فارغةٌ لمن لا يملك إعادة الإسناد */
  owners?: { value: string; label: string }[];
  defaultOwnerId?: string;
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

      {/**
        * **الملكية تُعدَّل من هنا — ولم تكن تُعدَّل من أي مكان.**
        *
        * كان `ownerId` يُكتب عند الإنشاء وحده، فبطاقةٌ وقعت على الحساب
        * الخطأ تبقى عليه للأبد. وبيانات المكتب استُوردت كلها بحسابٍ واحد،
        * فبلا هذه الخانة لا تُصحَّح بطاقةٌ واحدة.
        */}
      {owners && owners.length > 0 && (
        <section className="card card-pad">
          <h2 className="mb-1 text-sm font-semibold text-slate-800">من يملك هذه البطاقة</h2>
          {/**
            * **والفرعيّ بابُ رؤيةٍ لا حصّةُ مال.** النسبة تُحسب على مالك
            * **المشروع** لا على مالك البطاقة: من نفّذ الصفقة له ٣٪ ومديره
            * ٢٪ — «العبرة بالشراء وليس المالك الرئيسي».
            */}
          <p className="mb-4 text-xs leading-relaxed text-slate-500">
            العميل القديم يبقى لمن جاء به <b>مالكًا رئيسيًّا</b>، ومن باع له بعد ذلك
            يُضاف <b>مالكًا فرعيًّا</b> — فتظهر البطاقة عند الحسابين ويقرؤها كلاهما.
            <b> ولا تمسّ النسبة</b>: هي تُحسب على مالك المشروع نفسه، فمن نفّذ الصفقة
            له ٣٪ ومديره ٢٪ مهما كان مالك البطاقة.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="المالك الرئيسي"
              name="ownerId"
              options={owners}
              defaultValue={client?.ownerId ?? defaultOwnerId}
              hint="من جاء بالعميل أول مرة"
            />
            <SelectField
              label="المالك الفرعي"
              name="coOwnerId"
              options={owners}
              defaultValue={client?.coOwnerId ?? undefined}
              placeholder="— لا أحد —"
              hint="أدمنٌ آخر باع لهذا العميل — يراه ولا تُقتسم نسبتُه"
            />
          </div>
        </section>
      )}

      <div className="flex items-center gap-3">
        <SaveButton>{client ? 'حفظ التعديلات' : 'إضافة العميل'}</SaveButton>
        <Link href={cancelHref} className="btn-secondary">
          إلغاء
        </Link>
      </div>
    </form>
  );
}
