import Link from '@/components/link';
import { FormField, SelectField } from '@/components/ui';
import { SaveButton } from '@/components/forms';
import { EMPLOYMENT_TYPES } from '@/lib/hr';
import { toDateInput } from '@/lib/utils';
import type { Option } from '@/lib/reference';

type UserValues = {
  id?: string;
  name?: string | null;
  email?: string | null;
  canLogin?: boolean;
  roleId?: string | null;
  branch?: string | null;
  reportsToId?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  isProducer?: boolean;
  active?: boolean;
  departmentId?: string | null;
  hireDate?: Date | null;
  employmentType?: string | null;
  nationalId?: string | null;
  payMethod?: string | null;
  bankAccount?: string | null;
};

/**
 * نموذج المستخدم — واحد للإنشاء والتعديل.
 *
 * **نوعان من السجلات في شاشة واحدة:**
 *   ١) مستخدم يدخل النظام — له بريد وكلمة مرور ودور.
 *   ٢) **منفِّذ داخلي** — مترجم أو مراجع يُسنَد إليه العمل ولا يدخل النظام.
 *
 * والثاني هو ما كان ناقصًا: مدير المشاريع يكتب أن دعاء راجعت مراجعةً مكثفة،
 * فتُحسب تكلفتها وتُقاس طاقتها ويظهر أداؤها — بلا حساب دخول تفتحه هي.
 *
 * الحقول كلها ظاهرة دائمًا بلا إخفاء بالجافاسكربت، والإلزام يُفحص في الخادم:
 * الشاشة تعمل ولو تعطّل الجافاسكربت (§٤).
 */
export default function UserForm({
  values,
  roles,
  branches,
  managers,
  departments,
  paymentMethods,
  back,
  isSelf = false,
  submitLabel,
}: {
  values: UserValues;
  roles: { id: string; label: string }[];
  branches: Option[];
  managers: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  paymentMethods: Option[];
  back: string;
  /** المستخدم يعدّل نفسه — لا يغيّر دوره ولا يوقف حسابه */
  isSelf?: boolean;
  submitLabel: string;
}) {
  const editing = Boolean(values.id);
  const staffOnly = values.canLogin === false;

  return (
    <form method="post" action="/api/save" className="space-y-6">
      <input type="hidden" name="entity" value="user" />
      <input type="hidden" name="id" value={values.id ?? ''} />
      <input type="hidden" name="back" value={back} />

      {/* ── نوع السجل ───────────────────────────────────── */}
      <section className="card card-pad">
        <h2 className="mb-3 section-title">نوع السجل</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:border-brand-300 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50/60">
            <input
              type="radio"
              name="canLogin"
              value="on"
              defaultChecked={!staffOnly}
              disabled={isSelf}
              className="mt-1 h-4 w-4 border-slate-300 text-brand-600"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">يدخل النظام</span>
              <span className="block text-xs text-slate-500">
                له بريد وكلمة مرور ودور يحدّد صلاحياته
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:border-brand-300 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50/60">
            <input
              type="radio"
              name="canLogin"
              value="off"
              defaultChecked={staffOnly}
              disabled={isSelf}
              className="mt-1 h-4 w-4 border-slate-300 text-brand-600"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">
                منفِّذ داخلي — لا يدخل النظام
              </span>
              <span className="block text-xs text-slate-500">
                مترجم أو مراجع أو منسّق: يُسنَد إليه العمل وتُحسب تكلفته وتُقاس
                طاقته، بلا بريد ولا كلمة مرور
              </span>
            </span>
          </label>
        </div>
        {isSelf && (
          <p className="mt-2 text-xs text-slate-400">
            لا تُغيّر نوع سجلّك أنت — لن تعود تفتح الشاشة.
          </p>
        )}
      </section>

      {/* ── البيانات الأساسية ───────────────────────────── */}
      <section className="card card-pad">
        <h2 className="mb-4 section-title">البيانات الأساسية</h2>
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
            label="يتبع إداريًا"
            name="reportsToId"
            defaultValue={values.reportsToId}
            placeholder="لا يتبع أحدًا"
            options={managers.map((m) => ({ value: m.id, label: m.name }))}
            hint="مديره المباشر — عليه يقوم نطاق «رؤية الفريق» ونسبة المدير"
          />
        </div>

        <label className="mt-4 flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            name="isProducer"
            defaultChecked={values.isProducer ?? false}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-slate-700">
            يعمل في الإنتاج
            <span className="mr-2 text-xs text-slate-400">
              (يظهر في قائمة الإسناد منفِّذًا أو مراجعًا — والمنفِّذ الداخلي كذلك دائمًا)
            </span>
          </span>
        </label>

        {editing && !isSelf && (
          <label className="mt-3 flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={values.active ?? true}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-slate-700">
              نشط
              <span className="mr-2 text-xs text-slate-400">
                (الموقوف لا يُحذف — تبقى سجلاته منسوبةً إليه)
              </span>
            </span>
          </label>
        )}
      </section>

      {/* ── بيانات الدخول ───────────────────────────────── */}
      <section className="card card-pad">
        <h2 className="mb-1 section-title">الدخول والصلاحيات</h2>
        <p className="mb-4 text-xs text-slate-400">
          تُملأ لمن يدخل النظام. المنفِّذ الداخلي يُترك له هذا القسم فارغًا.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="البريد الإلكتروني"
            name="email"
            type="email"
            defaultValue={values.email}
            dir="ltr"
            className="sm:col-span-2"
          />
          <FormField
            label={editing ? 'كلمة مرور جديدة' : 'كلمة المرور'}
            name="password"
            type="password"
            hint={editing ? 'اتركها فارغة لتبقى كما هي' : '٨ أحرف على الأقل'}
          />
          <SelectField
            label="الدور"
            name="roleId"
            defaultValue={values.roleId}
            disabled={isSelf}
            placeholder="بلا دور — منفِّذ داخلي"
            options={roles.map((r) => ({ value: r.id, label: r.label }))}
            hint={isSelf ? 'لا تُغيّر دورك بنفسك' : 'الدور يحدّد صلاحياته'}
          />
        </div>
      </section>

      {/* ── الموارد البشرية ─────────────────────────────── */}
      <section className="card card-pad">
        <h2 className="mb-4 section-title">بيانات الموارد البشرية</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="الإدارة أو القسم"
            name="departmentId"
            defaultValue={values.departmentId}
            placeholder="بلا قسم"
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
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
          />
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

      <div className="flex items-center gap-3">
        <SaveButton>{submitLabel}</SaveButton>
        <Link href="/settings/users" className="btn-secondary">
          إلغاء
        </Link>
      </div>
    </form>
  );
}
