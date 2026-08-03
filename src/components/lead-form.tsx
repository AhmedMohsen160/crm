import Link from '@/components/link';
import { LEAD_STATUSES } from '@/lib/constants';
import { FormField, SelectField, TextAreaField } from '@/components/ui';
import { SaveButton } from '@/components/forms';
import { PhoneLookup } from '@/components/phone-lookup';
import type { Option } from '@/lib/reference';

type LeadData = {
  firstName: string;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  channel: string | null;
  contactMethod: string | null;
  status: string;
  serviceInterest: string | null;
  sourceLang: string | null;
  targetLang: string | null;
  estPages: number | null;
  estimatedValue: number | null;
  lossReason: string | null;
  notes: string | null;
  ownerId: string | null;
  coOwnerId: string | null;
};

export type LeadFormLists = {
  channel: Option[];
  contact_method: Option[];
  service_line: Option[];
  language: Option[];
  loss_reason: Option[];
};

/**
 * نموذج الليد.
 *
 * **الهاتف أولًا** (§7.1): أول عنصر في الشاشة، ويبحث في العملاء أثناء
 * الكتابة. الحالة البسيطة أربعة حقول — هاتف واسم وقناة ووسيلة تواصل —
 * ومعيار القبول ≤١٥ ثانية. كل ما عداها داخل «تفاصيل إضافية» مطوية، حتى لا
 * يدفع الحالةَ البسيطةَ ثمنُ الحالة النادرة.
 */
export default function LeadForm({
  recordId,
  backPath,
  lead,
  lists,
  users,
  currentUserId,
  canAssign,
  cancelHref,
}: {
  recordId?: string;
  backPath: string;
  lead?: LeadData;
  lists: LeadFormLists;
  users: { id: string; name: string }[];
  currentUserId: string;
  canAssign: boolean;
  cancelHref: string;
}) {
  const asOptions = (items: Option[]) =>
    items.map((i) => ({ value: i.value, label: i.label }));

  return (
    <form method="post" action="/api/save" className="space-y-5">
      <input type="hidden" name="entity" value="lead" />
      <input type="hidden" name="id" value={recordId ?? ''} />
      <input type="hidden" name="back" value={backPath} />

      <section className="card card-pad space-y-4">
        <PhoneLookup defaultValue={lead?.phone ?? ''} />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="اسم العميل"
            name="firstName"
            required
            defaultValue={lead?.firstName}
            placeholder="الاسم كما يعرّف به نفسه"
          />
          <SelectField
            label="القناة"
            name="channel"
            required
            defaultValue={lead?.channel}
            placeholder="من أين جاءنا؟"
            options={asOptions(lists.channel)}
          />
          <SelectField
            label="وسيلة التواصل"
            name="contactMethod"
            defaultValue={lead?.contactMethod}
            options={asOptions(lists.contact_method)}
          />
          {lead && (
            <SelectField
              label="المرحلة"
              name="status"
              defaultValue={lead.status}
              placeholder="جديد"
              options={Object.entries(LEAD_STATUSES).map(([v, l]) => ({
                value: v,
                label: l,
              }))}
              hint="عند «خاسر» يصبح سبب الخسارة إلزاميًا"
            />
          )}
        </div>

        {!lead && (
          <p className="text-xs text-slate-400">
            الفرع والموظف المسؤول يُملآن تلقائيًا من حسابك.
          </p>
        )}
      </section>

      <details className="card card-pad" open={Boolean(lead)}>
        <summary className="cursor-pointer font-semibold text-slate-800">
          تفاصيل إضافية
          <span className="mr-2 text-xs font-normal text-slate-400">
            (اختيارية — تُكمَّل لاحقًا)
          </span>
        </summary>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FormField
            label="اسم الشركة / الجهة"
            name="companyName"
            defaultValue={lead?.companyName}
            placeholder="اتركه فارغًا إن كان عميلًا فردًا"
          />
          <FormField
            label="البريد الإلكتروني"
            name="email"
            type="email"
            defaultValue={lead?.email}
          />
          <SelectField
            label="خط الخدمة"
            name="serviceInterest"
            defaultValue={lead?.serviceInterest}
            options={asOptions(lists.service_line)}
          />
          <FormField
            label="عدد الصفحات التقديري"
            name="estPages"
            type="number"
            step="0.5"
            min="0"
            defaultValue={lead?.estPages}
          />
          <SelectField
            label="من لغة"
            name="sourceLang"
            defaultValue={lead?.sourceLang}
            options={asOptions(lists.language)}
          />
          <SelectField
            label="إلى لغة"
            name="targetLang"
            defaultValue={lead?.targetLang}
            options={asOptions(lists.language)}
          />
          <FormField
            label="القيمة المتوقعة"
            name="estimatedValue"
            type="number"
            step="0.01"
            min="0"
            defaultValue={lead?.estimatedValue}
          />
          {lead && (
            <SelectField
              label="سبب الخسارة"
              name="lossReason"
              defaultValue={lead.lossReason}
              placeholder="— يُملأ عند الخسارة —"
              options={asOptions(lists.loss_reason)}
            />
          )}
          {canAssign && (
            <>
              <SelectField
                label="المالك الرئيسي"
                name="ownerId"
                defaultValue={lead?.ownerId ?? currentUserId}
                options={users.map((u) => ({ value: u.id, label: u.name }))}
                hint="من جلب العميل — الصفقة تبقى مملوكةً له"
              />
              <SelectField
                label="المالك الفرعي"
                name="coOwnerId"
                defaultValue={lead?.coOwnerId}
                placeholder="لا يوجد — الجالب هو الخادم"
                options={users.map((u) => ({ value: u.id, label: u.name }))}
                hint="من يكمل التواصل ويخدم العميل — وله حصة الأدمن في النسبة"
              />
            </>
          )}
          <TextAreaField
            label="ملاحظات"
            name="notes"
            defaultValue={lead?.notes}
            placeholder="أي تفاصيل مهمة عن العميل أو طلبه..."
            rows={3}
            className="sm:col-span-2"
          />
        </div>
      </details>

      <div className="flex items-center gap-3">
        <SaveButton>{lead ? 'حفظ التعديلات' : 'حفظ الليد'}</SaveButton>
        <Link href={cancelHref} className="btn-secondary">
          إلغاء
        </Link>
      </div>
    </form>
  );
}
