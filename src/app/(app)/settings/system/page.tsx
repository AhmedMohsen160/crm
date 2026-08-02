import { CheckCircle2, Info } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { allSettings } from '@/lib/reference';
import { SETTING_DEFINITIONS, SETTING_GROUPS } from '@/lib/settings-defs';
import { PageHeader, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'إعدادات النظام' };
export const dynamic = 'force-dynamic';

const KIND_HINT: Record<string, string> = {
  percent: 'نسبة عشرية — ٠٫٢٥ تعني ٢٥٪',
  money: 'بالجنيه المصري',
  number: 'رقم',
};

export default async function SystemSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; group?: string }>;
}) {
  const { saved, error } = await searchParams;
  await requirePermission('canManageSettings');

  const values = await allSettings();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="إعدادات النظام"
        subtitle="المعاملات التي تبني عليها كل الحسابات والتقارير"
      />
      <ErrorAlert message={error} />

      {saved && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          تم الحفظ — كل التقارير تعكس القيم الجديدة فورًا.
        </div>
      )}

      <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          المعاملات المزروعة <b>تقديرات مبدئية لا قياسات لهذا الفريق</b>. عايِرها بعد
          ٦٠ يومًا من التشغيل الفعلي بالأرقام الحقيقية.
        </p>
      </div>

      <form method="post" action="/api/save" className="space-y-6">
        <input type="hidden" name="entity" value="settings" />
        <input type="hidden" name="id" value="" />
        <input type="hidden" name="back" value="/settings/system" />

        {SETTING_GROUPS.map((group) => {
          const items = SETTING_DEFINITIONS.filter((d) => d.group === group);
          if (items.length === 0) return null;
          return (
            <section key={group} className="card card-pad">
              <h2 className="mb-4 font-semibold text-slate-800">{group}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {items.map((def) =>
                  def.kind === 'boolean' ? (
                    <label
                      key={def.key}
                      className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-3 sm:col-span-2"
                    >
                      <input
                        type="checkbox"
                        name={def.key}
                        defaultChecked={values[def.key] === 'true'}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-800">
                          {def.label}
                        </span>
                        {def.hint && (
                          <span className="block text-xs text-slate-500">{def.hint}</span>
                        )}
                      </span>
                    </label>
                  ) : (
                    <div key={def.key}>
                      <label className="label" htmlFor={def.key}>
                        {def.label}
                      </label>
                      <input
                        id={def.key}
                        name={def.key}
                        defaultValue={values[def.key]}
                        dir="ltr"
                        className="input text-left"
                      />
                      <p className="mt-1 text-xs text-slate-400">
                        {def.hint ?? KIND_HINT[def.kind] ?? ''}
                      </p>
                    </div>
                  )
                )}
              </div>
            </section>
          );
        })}

        <SaveButton>حفظ الإعدادات</SaveButton>
      </form>
    </div>
  );
}
