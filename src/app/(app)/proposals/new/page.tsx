import Link from '@/components/link';
import { requirePermission } from '@/lib/auth';
import { listOptionsMany } from '@/lib/reference';
import { PageHeader, FormField, SelectField, TextAreaField, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'عرض احترافي جديد' };
export const dynamic = 'force-dynamic';

export default async function NewProposalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; clientId?: string; leadId?: string }>;
}) {
  const { error, clientId, leadId } = await searchParams;
  await requirePermission('canViewSellPrice');
  const lists = await listOptionsMany('language', 'currency');

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="عرض احترافي جديد"
        subtitle="يُنشأ بشرائح فاست ترانس الافتراضية — وكلها تُعدَّل بعد الإنشاء"
      >
        <Link href="/proposals" className="btn-secondary">
          رجوع للقائمة
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />

      <form method="post" action="/api/save" className="space-y-5">
        <input type="hidden" name="entity" value="proposal" />
        <input type="hidden" name="id" value="" />
        <input type="hidden" name="back" value="/proposals/new" />
        {clientId && <input type="hidden" name="clientId" value={clientId} />}
        {leadId && <input type="hidden" name="leadId" value={leadId} />}

        <section className="card card-pad grid gap-4 sm:grid-cols-2">
          <FormField
            label="عنوان العرض"
            name="title"
            required
            placeholder="عرض تجاري وفني — ترجمة عربي إلى إنجليزي"
            className="sm:col-span-2"
          />
          <FormField label="الجهة المستقبِلة" name="clientName" required placeholder="مجموعة ترايستار" />
          <FormField label="عناية" name="attention" placeholder="الأستاذ ..." />
          <FormField label="صفته" name="attentionRole" placeholder="المشتريات" />
          <SelectField label="من لغة" name="sourceLang" options={lists.language} placeholder="العربية" />
          <SelectField label="إلى لغة" name="targetLang" options={lists.language} placeholder="الإنجليزية" />
          <SelectField
            label="العملة"
            name="currency"
            defaultValue="SAR"
            options={lists.currency}
            placeholder="ريال سعودي"
          />
        </section>

        <section className="card card-pad grid gap-4 sm:grid-cols-3">
          <FormField
            label="ضريبة القيمة المضافة ٪"
            name="vatPct"
            type="number"
            step="0.5"
            min="0"
            defaultValue={15}
            dir="ltr"
          />
          <FormField
            label="مدة الصلاحية (يومًا)"
            name="validityDays"
            type="number"
            min="1"
            defaultValue={30}
            dir="ltr"
          />
          <FormField
            label="شروط السداد (يومًا)"
            name="paymentDays"
            type="number"
            min="0"
            defaultValue={30}
            dir="ltr"
          />
          <FormField
            label="الجهة المتعاقدة"
            name="contractingEntity"
            defaultValue="فاست ترانس — الرياض، المملكة العربية السعودية"
            className="sm:col-span-3"
          />
          <FormField label="اسم الموقِّع" name="signerName" className="sm:col-span-2" />
          <FormField label="صفة الموقِّع" name="signerTitle" />
        </section>

        <section className="card card-pad">
          <TextAreaField
            label="افتتاحية العرض"
            name="intro"
            placeholder="اتركها فارغة لتُستخدم الافتتاحية الافتراضية"
          />
          <TextAreaField
            label="موقفنا من السعر"
            name="positioning"
            placeholder="الفقرة التي تشرح لماذا لم يُخفَّض السعر الأساسي"
          />
        </section>

        <SaveButton>إنشاء العرض</SaveButton>
      </form>
    </div>
  );
}
