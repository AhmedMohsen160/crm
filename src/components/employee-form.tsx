import Link from '@/components/link';
import { FormField, SelectField } from '@/components/ui';
import { SaveButton } from '@/components/forms';
import { EMPLOYMENT_TYPES } from '@/lib/hr';
import { toDateInput } from '@/lib/utils';
import type { Option } from '@/lib/reference';

type EmployeeValues = {
  id?: string;
  name?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  branch?: string | null;
  departmentId?: string | null;
  reportsToId?: string | null;
  employmentType?: string | null;
  hireDate?: Date | null;
  nationalId?: string | null;
  payMethod?: string | null;
  bankAccount?: string | null;
  isProducer?: boolean;
};

/**
 * نموذج تعيين موظف — من شاشة الموارد البشرية.
 *
 * **ليس فيه بريدٌ ولا كلمة مرور ولا دور**، وهذا مقصود: الموارد البشرية
 * تُعيّن الموظف وتضعه في قسمه وتُقرّ راتبه، ثم يُقرَّر بعدها — من شاشة
 * المستخدمين — هل يحتاج حسابًا يدخل به أصلًا. فمن يفتح الحساب هو من يملك
 * منح الصلاحيات، لا من يملك ملف الموظف.
 */
export default function EmployeeForm({
  values,
  branches,
  departments,
  managers,
  paymentMethods,
  back,
  submitLabel,
}: {
  values: EmployeeValues;
  branches: Option[];
  departments: { id: string; name: string }[];
  managers: { id: string; name: string }[];
  paymentMethods: Option[];
  back: string;
  submitLabel: string;
}) {
  const editing = Boolean(values.id);

  return (
    <form method="post" action="/api/save" className="space-y-6">
      <input type="hidden" name="entity" value="employee" />
      <input type="hidden" name="id" value={values.id ?? ''} />
      <input type="hidden" name="back" value={back} />

      <section className="card card-pad">
        <h2 className="mb-4 section-title">بيانات الموظف</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="الاسم الكامل"
            name="name"
            required
            defaultValue={values.name}
            className="sm:col-span-2"
          />
          <FormField label="رقم الهاتف" name="phone" defaultValue={values.phone} />
          <FormField
            label="المسمى الوظيفي"
            name="jobTitle"
            defaultValue={values.jobTitle}
            placeholder="مترجم أول · أدمن مبيعات · مراجع"
          />
          <SelectField
            label="الفرع"
            name="branch"
            defaultValue={values.branch}
            placeholder="بلا فرع"
            options={branches.map((b) => ({ value: b.value, label: b.label }))}
          />
          <SelectField
            label="الإدارة أو القسم"
            name="departmentId"
            defaultValue={values.departmentId}
            placeholder="بلا قسم"
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
          />
          <SelectField
            label="يتبع إداريًا"
            name="reportsToId"
            defaultValue={values.reportsToId}
            placeholder="لا يتبع أحدًا"
            options={managers.map((m) => ({ value: m.id, label: m.name }))}
            hint="مديره المباشر — هو من يُسند إليه ويقيس أداءه"
          />
          <SelectField
            label="نوع التعاقد"
            name="employmentType"
            defaultValue={values.employmentType ?? 'full_time'}
            placeholder="دوام كامل"
            options={Object.entries(EMPLOYMENT_TYPES).map(([value, label]) => ({ value, label }))}
          />
          <FormField
            label="تاريخ التعيين"
            name="hireDate"
            type="date"
            defaultValue={toDateInput(values.hireDate)}
            hint="منه تُحسب مدة الخدمة، ومنه يسري الراتب"
          />
        </div>

        <label className="mt-4 flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            name="isProducer"
            defaultChecked={values.isProducer ?? true}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-slate-700">
            يعمل في الإنتاج
            <span className="mr-2 text-xs text-slate-400">
              (يظهر في قائمة الإسناد منفِّذًا أو مراجعًا وتُحسب تكلفته)
            </span>
          </span>
        </label>
      </section>

      <section className="card card-pad">
        <h2 className="mb-1 section-title">الأجر والصرف</h2>
        <p className="mb-4 text-xs text-slate-400">
          {editing
            ? 'بنود الأجر تُدار من بطاقة الموظف — البند السارِي يُنهى ويُنشأ خلفه ولا يُعدَّل.'
            : 'الأساسي يُنشأ بندًا يسري من تاريخ التعيين. والبدلات والحوافز تُضاف بعده من بطاقته.'}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {!editing && (
            <FormField
              label="الراتب الأساسي الشهري"
              name="basicSalary"
              type="number"
              step="0.01"
              min="0"
              hint="اتركه فارغًا إن كان الأجر بالقطعة أو لم يُقرَّر بعد"
            />
          )}
          <FormField label="الرقم القومي" name="nationalId" defaultValue={values.nationalId} dir="ltr" />
          <SelectField
            label="طريقة صرف الراتب"
            name="payMethod"
            defaultValue={values.payMethod}
            placeholder="— اختر —"
            options={paymentMethods}
          />
          <FormField
            label="بيانات الصرف"
            name="bankAccount"
            defaultValue={values.bankAccount}
            dir="ltr"
            hint="رقم الحساب أو المحفظة"
          />
        </div>
      </section>

      {!editing && (
        <p className="rounded-lg border border-lime-200 bg-lime-50/60 p-3 text-xs text-slate-600">
          يُسجَّل الموظف <strong>بلا حساب دخول</strong>. فإن احتاج أن يدخل النظام،
          افتح له حسابًا بعد ذلك من «الإعدادات ← المستخدمون» بدور وبريد وكلمة مرور.
        </p>
      )}

      <div className="flex items-center gap-3">
        <SaveButton>{submitLabel}</SaveButton>
        <Link href="/hr/employees" className="btn-secondary">
          إلغاء
        </Link>
      </div>
    </form>
  );
}
