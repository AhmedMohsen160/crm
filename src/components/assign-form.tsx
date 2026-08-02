'use client';

import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { SaveButton } from '@/components/forms';

type Option = { value: string; label: string };

/**
 * نموذج الإسناد + **مؤشر التكلفة المجرّد**.
 *
 * المؤشر هو الاستثناء الوحيد المقصود في §٥: رقمان مجرّدان يظهران لمدير
 * المشاريع لحظة اختياره بين الداخلي والخارجي — **بلا أي إشارة إلى راتب
 * أحد، ولا اسم، ولا نسبة**. الغرض المنصوص عليه: ألا يتخذ أهم قرار تكلفة
 * يومي وهو أعمى.
 *
 * الرقمان يأتيان من الخادم عبر `fetch` — الحساب لا يقع في المتصفح، فلا
 * تصله معطيات الراتب أصلًا.
 */
export default function AssignForm({
  projectId,
  workModes,
  producers,
  sourcingTypes,
  current,
  showCostIndicator,
}: {
  projectId: string;
  workModes: Option[];
  producers: { id: string; name: string }[];
  sourcingTypes: Option[];
  current: {
    workMode: string | null;
    sourcing: string | null;
    primaryProducerId: string | null;
    reviewerId: string | null;
    externalName: string | null;
    externalRate: number | null;
  };
  showCostIndicator: boolean;
}) {
  const [sourcing, setSourcing] = useState(current.sourcing ?? 'internal');
  const [producerId, setProducerId] = useState(current.primaryProducerId ?? '');
  const [externalRate, setExternalRate] = useState(
    current.externalRate ? String(current.externalRate) : ''
  );
  const [indicator, setIndicator] = useState<{
    internal: number | null;
    external: number | null;
  } | null>(null);

  const isExternal = sourcing === 'external';

  useEffect(() => {
    if (!showCostIndicator) return;
    if (!producerId && !externalRate) {
      setIndicator(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ projectId });
        if (producerId) qs.set('producerId', producerId);
        if (externalRate) qs.set('externalRate', externalRate);
        const res = await fetch(`/api/cost-indicator?${qs.toString()}`);
        const data = await res.json();
        if (!cancelled) setIndicator(data);
      } catch {
        if (!cancelled) setIndicator(null);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId, producerId, externalRate, showCostIndicator]);

  return (
    <form method="post" action="/api/save" className="space-y-5">
      <input type="hidden" name="entity" value="project.assign" />
      <input type="hidden" name="id" value={projectId} />
      <input type="hidden" name="back" value={`/projects/${projectId}/assign`} />

      <section className="card card-pad space-y-4">
        <div>
          <label className="label" htmlFor="workMode">
            نمط التشغيل <span className="text-rose-500">*</span>
          </label>
          <select
            id="workMode"
            name="workMode"
            required
            defaultValue={current.workMode ?? ''}
            className="input"
          >
            <option value="">— اختر —</option>
            {workModes.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">
            يحدد معامل الجهد الذي تُحسب به الصفحات الموزونة
          </p>
        </div>

        <div>
          <span className="label">مصدر التنفيذ</span>
          <div className="flex flex-wrap gap-2">
            {sourcingTypes.map((t) => (
              <label
                key={t.value}
                className={`cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors ${
                  sourcing === t.value
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="sourcing"
                  value={t.value}
                  checked={sourcing === t.value}
                  onChange={() => setSourcing(t.value)}
                  className="sr-only"
                />
                {t.label}
              </label>
            ))}
          </div>
        </div>

        {isExternal ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="externalName">
                المنفِّذ الخارجي <span className="text-rose-500">*</span>
              </label>
              <input
                id="externalName"
                name="externalName"
                required
                defaultValue={current.externalName ?? ''}
                placeholder="اسم الفريلانسر"
                className="input"
              />
              <p className="mt-1 text-xs text-slate-400">
                محرّك اختيار الفريلانسر يصل في المرحلة القادمة
              </p>
            </div>
            <div>
              <label className="label" htmlFor="externalRate">
                الأجر للصفحة
              </label>
              <input
                id="externalRate"
                name="externalRate"
                type="number"
                step="0.01"
                min="0"
                value={externalRate}
                onChange={(e) => setExternalRate(e.target.value)}
                dir="ltr"
                className="input text-left"
              />
              <p className="mt-1 text-xs text-amber-700">
                بلا أجر مسجَّل تصير التكلفة صفرًا ويُفتح تنبيه
              </p>
            </div>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="primaryProducerId">
              المنتِج الرئيسي <span className="text-rose-500">*</span>
            </label>
            <select
              id="primaryProducerId"
              name="primaryProducerId"
              required
              value={producerId}
              onChange={(e) => setProducerId(e.target.value)}
              className="input"
            >
              <option value="">— اختر —</option>
              {producers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label" htmlFor="reviewerId">
            المراجع
          </label>
          <select
            id="reviewerId"
            name="reviewerId"
            defaultValue={current.reviewerId ?? ''}
            className="input"
          >
            <option value="">— بلا مراجع —</option>
            {producers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">
            تكلفته لا تُحتسب إن كان هو المنتِج نفسه، أو إن كان النمط مراجعة أصلًا
          </p>
        </div>

        {showCostIndicator && indicator && (
          <div
            data-testid="cost-indicator"
            className="flex items-center gap-3 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm"
          >
            <Gauge className="h-4 w-4 shrink-0 text-slate-500" />
            <span className="text-slate-700">
              {indicator.internal !== null && (
                <>
                  تقدير التكلفة الداخلية:{' '}
                  <b className="nums">{indicator.internal.toLocaleString('ar-EG')}</b>
                </>
              )}
              {indicator.internal !== null && indicator.external !== null && ' · '}
              {indicator.external !== null && (
                <>
                  تكلفة هذا المنفِّذ الخارجي:{' '}
                  <b className="nums">{indicator.external.toLocaleString('ar-EG')}</b>
                </>
              )}
            </span>
          </div>
        )}
      </section>

      <SaveButton>حفظ الإسناد وبدء التنفيذ</SaveButton>
    </form>
  );
}
