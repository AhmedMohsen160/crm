import { AlertTriangle, Calculator } from 'lucide-react';
import { db } from '@/lib/db';
import { computeProjectCost } from '@/lib/project-costing';
import { formatMoney } from '@/lib/utils';
import { Field } from '@/components/ui';

/**
 * لوحة التكلفة والهامش والإيراد المنسوب (§٨).
 *
 * تُعرض لمن يملك رؤية التكلفة وحده. **الهامش لا يُعرض لمن لا يرى سعر
 * البيع** — لأن معرفة التكلفة والهامش معًا تكشف السعر بالطرح.
 */
export default async function ProjectCostPanel({
  projectId,
  showSellPrice,
}: {
  projectId: string;
  showSellPrice: boolean;
}) {
  const result = await computeProjectCost(projectId);
  if (!result) return null;

  const names = new Map<string, string>();
  if (result.attribution.length > 0) {
    const users = await db.user.findMany({
      where: { id: { in: result.attribution.map((a) => a.userId) } },
      select: { id: true, name: true },
    });
    for (const u of users) names.set(u.id, u.name);
  }

  return (
    <section className="card card-pad">
      <h2 className="mb-3 flex items-center gap-2 section-title">
        <Calculator className="h-4 w-4 text-brand-600" />
        التكلفة والهامش
      </h2>

      {result.warnings.length > 0 && (
        <ul className="mb-4 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {result.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      )}

      <dl className="grid gap-x-6 sm:grid-cols-3">
        <Field label="الصفحات الموزونة">
          <span className="nums font-semibold">{result.weightedPages.toFixed(2)}</span>
        </Field>
        <Field label="تكلفة داخلية">
          <span className="nums">{formatMoney(result.costInternal)}</span>
        </Field>
        <Field label="تكلفة خارجية">
          <span className="nums">{formatMoney(result.costExternal)}</span>
        </Field>
        <Field label="إجمالي التكلفة">
          <span className="nums font-semibold">{formatMoney(result.costTotal)}</span>
        </Field>
        {showSellPrice && (
          <>
            <Field label="الهامش">
              <span
                className={`nums font-semibold ${
                  result.margin < 0 ? 'text-rose-600' : 'text-emerald-700'
                }`}
              >
                {formatMoney(result.margin)}
              </span>
            </Field>
            <Field label="نسبة الهامش">
              <span className="nums">{(result.marginPct * 100).toFixed(1)}٪</span>
            </Field>
          </>
        )}
      </dl>

      {result.attribution.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="mb-2 text-xs font-medium text-slate-500">
            الإيراد المنسوب — مجموعه يساوي إجمالي المشروع بالضبط
          </p>
          <ul className="space-y-1 text-sm">
            {result.attribution.map((a) => (
              <li key={a.userId} className="flex items-center justify-between gap-3">
                <span className="text-slate-700">{names.get(a.userId) ?? 'غير معروف'}</span>
                <span className="nums">{formatMoney(a.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
