import { db } from '@/lib/db';
import { listOptions } from '@/lib/reference';
import { freelancerIndex, filterForProject } from '@/lib/freelancer-engine';
import { RATE_UNITS } from '@/lib/freelancers';
import { FormField, SelectField } from '@/components/ui';
import { SaveButton } from '@/components/forms';
import FreelancerPicker from '@/components/freelancer-picker';

/**
 * خطوات التنفيذ.
 *
 * > «زر يفتح سطرًا: `step_type` · المنفِّذ · `pages`. **مخفي افتراضيًا**
 * > حتى لا يبطئ الحالة البسيطة.» — §٧.٢
 *
 * لذلك هو داخل `<details>` مطوية: المشروع بمنتِج واحد بلا خطوات — وهو
 * الأغلب — لا يدفع ثمن الحالة المركّبة.
 */
export default async function ProjectSteps({
  projectId,
  canEdit,
  showCost,
  showRates,
}: {
  projectId: string;
  canEdit: boolean;
  /** تكلفة الخطوة تظهر لمن يملك رؤية التكلفة وحده */
  showCost: boolean;
  /** أجر الفريلانسر يظهر لمن يملك `canViewFreelancerCost` وحده */
  showRates: boolean;
}) {
  const [steps, stepTypes, producers, project, index] = await Promise.all([
    db.projectStep.findMany({
      where: { projectId },
      include: {
        performer: { select: { name: true } },
        freelancer: { select: { id: true, name: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    listOptions('step_type'),
    db.user.findMany({
      where: { active: true, isProducer: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.project.findUnique({
      where: { id: projectId },
      select: { sourceLang: true, targetLang: true, serviceLine: true },
    }),
    freelancerIndex({ includeRates: showRates }),
  ]);

  const candidates = filterForProject(index, {
    langFrom: project?.sourceLang,
    langTo: project?.targetLang,
    serviceLine: project?.serviceLine,
  });

  const typeLabel = new Map(stepTypes.map((t) => [t.value, t.label]));
  const totalWeighted = steps.reduce((s, x) => s + x.weightedPages, 0);

  return (
    <details className="card card-pad" open={steps.length > 0}>
      <summary className="cursor-pointer font-semibold text-slate-800">
        خطوات التنفيذ
        <span className="mr-2 text-xs font-normal text-slate-400">
          {steps.length > 0
            ? `${steps.length} خطوة · ${totalWeighted.toFixed(2)} صفحة موزونة`
            : '(اختيارية — المشروع البسيط لا يحتاجها)'}
        </span>
      </summary>

      {steps.length > 0 && (
        <div className="mt-4 table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>النوع</th>
                <th>المنفِّذ</th>
                <th>الصفحات</th>
                <th>الموزونة</th>
                {showCost && <th>التكلفة</th>}
              </tr>
            </thead>
            <tbody>
              {steps.map((step) => (
                <tr key={step.id}>
                  <td className="text-sm">{typeLabel.get(step.stepType) ?? step.stepType}</td>
                  <td className="text-sm text-slate-600">
                    {step.performer?.name ?? step.freelancer?.name ?? step.externalName ?? '—'}
                    {step.costSource === 'external' && (
                      <span className="mr-1 text-xs text-slate-400">(خارجي)</span>
                    )}
                  </td>
                  <td className="nums">{step.pages}</td>
                  <td className="nums font-medium">{step.weightedPages.toFixed(2)}</td>
                  {showCost && (
                    <td className="nums">
                      {step.costSource === 'external' && !step.externalRate ? (
                        <span className="text-rose-600">بلا أجر</span>
                      ) : (
                        step.cost.toFixed(0)
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <form
          method="post"
          action="/api/save"
          className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-4"
        >
          <input type="hidden" name="entity" value="step" />
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="back" value={`/projects/${projectId}`} />

          <SelectField
            label="نوع الخطوة"
            name="stepType"
            required
            options={stepTypes.map((t) => ({ value: t.value, label: t.label }))}
          />
          <SelectField
            label="المصدر"
            name="costSource"
            defaultValue="internal"
            placeholder="داخلي"
            options={[
              { value: 'internal', label: 'داخلي' },
              { value: 'external', label: 'خارجي' },
            ]}
          />
          <SelectField
            label="المنفِّذ الداخلي"
            name="performerId"
            options={producers.map((p) => ({ value: p.id, label: p.name }))}
          />
          <FormField label="الصفحات" name="pages" type="number" step="0.5" min="0" required />
          <div className="sm:col-span-2">
            <FreelancerPicker
              rows={candidates}
              name="freelancerId"
              label="المنفِّذ الخارجي من السجل"
              showRates={showRates}
              hint="اختياره يجلب سعره لهذا الزوج، ويُنشئ سطر استحقاق تلقائيًا"
            />
          </div>
          <FormField label="أو اسم خارجي غير مسجَّل" name="externalName" />
          <FormField
            label="الأجر"
            name="externalRate"
            type="number"
            step="0.01"
            min="0"
            dir="ltr"
            hint="فارغ ← يُجلب من ملفه"
          />
          <SelectField
            label="وحدة الأجر"
            name="rateUnit"
            defaultValue="page"
            placeholder="الصفحة"
            options={Object.entries(RATE_UNITS).map(([value, label]) => ({ value, label }))}
          />
          <FormField
            label="عدد الساعات/الوحدات"
            name="rateUnits"
            type="number"
            step="0.5"
            min="0"
            dir="ltr"
            hint="للأجر بالساعة أو بالدقيقة فقط"
          />
          <div className="sm:col-span-4">
            <SaveButton>إضافة خطوة</SaveButton>
            <p className="mt-2 text-xs text-slate-400">
              الصفحات الموزونة والتكلفة تُحسبان وقت الحفظ وتُخزَّنان، فلا يتغيّر تاريخ
              التكاليف بتغيّر معامل لاحقًا. وإسناد خطوة لفريلانسر يُنشئ له
              <b> سطر استحقاق </b>في حساب الدائنين فورًا.
            </p>
          </div>
        </form>
      )}
    </details>
  );
}
