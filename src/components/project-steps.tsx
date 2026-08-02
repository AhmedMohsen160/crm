import { db } from '@/lib/db';
import { listOptions } from '@/lib/reference';
import { FormField, SelectField } from '@/components/ui';
import { SaveButton } from '@/components/forms';

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
}: {
  projectId: string;
  canEdit: boolean;
  /** تكلفة الخطوة تظهر لمن يملك رؤية التكلفة وحده */
  showCost: boolean;
}) {
  const [steps, stepTypes, producers] = await Promise.all([
    db.projectStep.findMany({
      where: { projectId },
      include: { performer: { select: { name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    listOptions('step_type'),
    db.user.findMany({
      where: { active: true, isProducer: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

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
                    {step.performer?.name ?? step.externalName ?? '—'}
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
          <FormField label="المنفِّذ الخارجي" name="externalName" />
          <FormField
            label="أجر الصفحة"
            name="externalRate"
            type="number"
            step="0.01"
            min="0"
            dir="ltr"
          />
          <div className="sm:col-span-4">
            <SaveButton>إضافة خطوة</SaveButton>
            <p className="mt-2 text-xs text-slate-400">
              الصفحات الموزونة والتكلفة تُحسبان وقت الحفظ وتُخزَّنان، فلا يتغيّر تاريخ
              التكاليف بتغيّر معامل لاحقًا.
            </p>
          </div>
        </form>
      )}
    </details>
  );
}
