import Link from '@/components/link';
import { FormField, SelectField, TextAreaField } from '@/components/ui';
import { SaveButton } from '@/components/forms';
import ExpressDeadline from '@/components/express-deadline';
import LiveTotal from '@/components/live-total';
import { toDateInput } from '@/lib/utils';
import type { Option } from '@/lib/reference';

type ProjectData = {
  title: string;
  description: string | null;
  netTotal: number;
  currency: string;
  unitPrice: number | null;
  serviceLine: string | null;
  sourceLang: string | null;
  targetLang: string | null;
  wordCount: number | null;
  pages: number | null;
  deposit: number;
  isRush: boolean;
  deadline: Date | null;
  expectedCloseDate: Date | null;
  companyId: string | null;
  contactId: string | null;
  clientId: string | null;
  ownerId: string | null;
  discountType: string | null;
  discountValue: number | null;
};

export type ProjectFormLists = {
  service_line: Option[];
  language: Option[];
  currency: Option[];
};

/**
 * نموذج المشروع.
 *
 * **حالة المشروع ليست فيه.** الحالة تتغيّر من أزرار الانتقال وحدها، لأنها
 * تخضع لقواعد §٦ (من يملكها وما شرطها). حقل قائمة في نموذج تعديل يتجاوز
 * تلك القواعد كلها.
 */
export default function ProjectForm({
  recordId,
  backPath,
  project,
  lists,
  companies,
  contacts,
  users,
  currentUserId,
  canAssign,
  showPrice,
  canDiscount,
  discountTypes,
  discountHint,
  cancelHref,
}: {
  recordId?: string;
  backPath: string;
  project?: ProjectData;
  lists: ProjectFormLists;
  companies: { id: string; name: string }[];
  contacts: { id: string; firstName: string; lastName: string | null }[];
  users: { id: string; name: string }[];
  currentUserId: string;
  canAssign: boolean;
  showPrice: boolean;
  canDiscount: boolean;
  discountTypes: { value: string; label: string }[];
  discountHint: string;
  cancelHref: string;
}) {
  const asOptions = (items: Option[]) =>
    items.map((i) => ({ value: i.value, label: i.label }));

  return (
    <form method="post" action="/api/save" className="space-y-5">
      <input type="hidden" name="entity" value="project" />
      <input type="hidden" name="id" value={recordId ?? ''} />
      <input type="hidden" name="back" value={backPath} />
      {project?.clientId && (
        <input type="hidden" name="clientId" value={project.clientId} />
      )}

      <section className="card card-pad">
        <h2 className="mb-4 section-title">المشروع</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="عنوان المشروع"
            name="title"
            required
            className="sm:col-span-2"
            defaultValue={project?.title}
          />
          <SelectField
            label="خط الخدمة"
            name="serviceLine"
            required
            defaultValue={project?.serviceLine}
            options={asOptions(lists.service_line)}
            className="sm:col-span-2"
          />
          <SelectField
            label="من لغة"
            name="sourceLang"
            defaultValue={project?.sourceLang}
            options={asOptions(lists.language)}
          />
          <SelectField
            label="إلى لغة"
            name="targetLang"
            defaultValue={project?.targetLang}
            options={asOptions(lists.language)}
          />
          <FormField
            label="عدد الكلمات"
            name="wordCount"
            type="number"
            min="0"
            defaultValue={project?.wordCount}
          />
        </div>

        <ExpressDeadline defaultDeadline={toDateInput(project?.deadline)} />

        <label className="mt-3 flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            name="isRush"
            defaultChecked={project?.isRush}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-slate-700">طلب مستعجل</span>
        </label>
      </section>

      {/* ── الصفحات والسعر والخصم — والإجمالي يُحسب أمام العين ──── */}
      <section className="card card-pad">
        <h2 className="mb-4 section-title">التسعير</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <LiveTotal
            currency={project?.currency ?? 'EGP'}
            defaultPages={project?.pages}
            defaultUnitPrice={project?.unitPrice}
            defaultNetTotal={project?.netTotal}
            defaultDiscountType={project?.discountType}
            defaultDiscountPercent={
              project?.discountType === 'percent' && project?.discountValue
                ? project.discountValue * 100
                : null
            }
            defaultDiscountAmount={
              project?.discountType === 'amount' ? project?.discountValue : null
            }
            discountTypes={discountTypes}
            discountHint={discountHint}
            showPrice={showPrice}
            canDiscount={canDiscount}
          />
          {showPrice && (
            <>
              <SelectField
                label="العملة"
                name="currency"
                defaultValue={project?.currency ?? 'EGP'}
                placeholder="جنيه مصري"
                options={asOptions(lists.currency)}
              />
              <FormField
                label="المقدم المقبوض"
                name="deposit"
                type="number"
                step="0.01"
                min="0"
                defaultValue={project?.deposit}
              />
            </>
          )}
        </div>
      </section>

      <section className="card card-pad">
        <h2 className="mb-4 section-title">الربط</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="الشركة"
            name="companyId"
            defaultValue={project?.companyId}
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
          />
          <SelectField
            label="جهة الاتصال"
            name="contactId"
            defaultValue={project?.contactId}
            options={contacts.map((c) => ({
              value: c.id,
              label: [c.firstName, c.lastName].filter(Boolean).join(' '),
            }))}
          />
          {canAssign && (
            <SelectField
              label="أدمن المبيعات"
              name="ownerId"
              defaultValue={project?.ownerId ?? currentUserId}
              options={users.map((u) => ({ value: u.id, label: u.name }))}
              hint="صاحب الصفقة — وله حصة الأدمن في النسبة، ولمديره حصة المدير"
            />
          )}
          <TextAreaField
            label="تفاصيل"
            name="description"
            defaultValue={project?.description}
            rows={3}
            className="sm:col-span-2"
          />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <SaveButton>{project ? 'حفظ التعديلات' : 'إنشاء المشروع'}</SaveButton>
        <Link href={cancelHref} className="btn-secondary">
          إلغاء
        </Link>
      </div>
    </form>
  );
}
