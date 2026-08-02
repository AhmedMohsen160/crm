import { CheckCircle2, Lock } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { settingNumber } from '@/lib/reference';
import { standardCostPerWeightedPage, actualCostOfStaff } from '@/lib/costing';
import { formatMoney } from '@/lib/utils';
import { PageHeader, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'تكلفة الموظفين' };
export const dynamic = 'force-dynamic';

/**
 * رواتب الموظفين ومعطيات تكلفتهم.
 *
 * > «**لا أحد** يرى رواتب الموظفين إلا مدير النظام والإدارة.» — §٥
 *
 * الشاشة كلها خلف `canViewStaffSalary`، ولا يمرّ رقم منها إلى أي شاشة
 * أخرى. ما يصل لمدير المشاريع هو **مؤشر التكلفة المجرّد** وحده.
 */
export default async function StaffCostsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  await requirePermission('canViewStaffSalary');

  const [producers, workingDays] = await Promise.all([
    db.user.findMany({
      where: { isProducer: true },
      include: { staffCost: true },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    }),
    settingNumber('working_days'),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="تكلفة الموظفين"
        subtitle="معطيات حساب تكلفة الصفحة الموزونة — لا تظهر في أي شاشة أخرى"
      />
      <ErrorAlert message={error} />

      {saved && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          تم الحفظ — هوامش المشاريع المسلَّمة سابقًا لم تتغيّر.
        </div>
      )}

      <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          هذه الشاشة لمدير النظام والإدارة فقط. مدير المشاريع يرى{' '}
          <b>رقمًا مجرّدًا</b> عند الإسناد ولا يرى راتب أحد.
        </p>
      </div>

      {producers.length === 0 ? (
        <p className="card card-pad text-sm text-slate-500">
          لا يوجد موظفون معلَّمون بـ«يعمل في الإنتاج». علّمهم من شاشة المستخدمين أولًا.
        </p>
      ) : (
        <form method="post" action="/api/save" className="space-y-4">
          <input type="hidden" name="entity" value="staffCost" />
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="back" value="/settings/staff-costs" />

          <div className="card table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>الراتب الشهري</th>
                  <th>نسبة الإنتاج</th>
                  <th>الطاقة اليومية</th>
                  <th>تكلفة الصفحة الموزونة</th>
                  <th>التكلفة الفعلية</th>
                </tr>
              </thead>
              <tbody>
                {producers.map((p) => {
                  const rate = p.staffCost ?? {
                    monthlySalary: 0,
                    productiveRatio: 0.7,
                    dailyCapacity: 4,
                  };
                  const perPage = standardCostPerWeightedPage(rate, workingDays);

                  return (
                    <tr key={p.id} className={p.active ? undefined : 'opacity-50'}>
                      <td className="font-medium text-slate-800">
                        {p.name}
                        {!p.active && (
                          <span className="mr-1 text-xs text-slate-400">(موقوف)</span>
                        )}
                      </td>
                      <td>
                        <input
                          name={`salary_${p.id}`}
                          type="number"
                          step="100"
                          min="0"
                          defaultValue={p.staffCost?.monthlySalary || ''}
                          placeholder="0"
                          dir="ltr"
                          className="input w-28 text-left"
                        />
                      </td>
                      <td>
                        <input
                          name={`ratio_${p.id}`}
                          type="number"
                          step="0.05"
                          min="0"
                          max="1"
                          defaultValue={p.staffCost?.productiveRatio ?? 0.7}
                          dir="ltr"
                          className="input w-20 text-left"
                        />
                      </td>
                      <td>
                        <input
                          name={`capacity_${p.id}`}
                          type="number"
                          step="0.5"
                          min="0"
                          defaultValue={p.staffCost?.dailyCapacity ?? 4}
                          dir="ltr"
                          className="input w-20 text-left"
                        />
                      </td>
                      <td className="nums font-medium">
                        {perPage > 0 ? perPage.toFixed(2) : '—'}
                      </td>
                      <td className="nums text-slate-600">
                        {rate.monthlySalary > 0 ? formatMoney(actualCostOfStaff(rate)) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <SaveButton>حفظ التكاليف</SaveButton>
        </form>
      )}

      <div className="mt-6 card card-pad bg-slate-50/60 text-sm text-slate-600">
        <p className="mb-2 font-semibold text-slate-800">كيف تُحسب تكلفة الصفحة الموزونة</p>
        <p dir="ltr" className="mb-2 rounded bg-white px-3 py-2 text-left text-xs">
          (الراتب ÷ {workingDays} يوم عمل × نسبة الإنتاج) ÷ الطاقة اليومية
        </p>
        <ul className="space-y-1 text-xs">
          <li>
            <b>نسبة الإنتاج:</b> كم من وقت الدوام يُقضى في إنتاج فعلي (٠٫٧ تعني ٧٠٪).
          </li>
          <li>
            <b>الطاقة اليومية:</b> الصفحات <b>الموزونة</b> التي يُنجزها في اليوم، لا
            الصفحات الخام.
          </li>
          <li>
            <b>التكلفة الفعلية</b> تُدفع سواء عمل أم لا — وهي المستخدمة في قياس العائد،
            بينما التكلفة المستوعبة تُستخدم في هامش المشروع الواحد.
          </li>
          <li>
            هذه القيم <b>تقديرات تُعايَر</b> بعد ٦٠ يومًا من التشغيل الفعلي.
          </li>
        </ul>
      </div>
    </div>
  );
}
