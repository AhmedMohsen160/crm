'use client';

import { useEffect, useState } from 'react';
import { Gauge, UserCog, AlertTriangle } from 'lucide-react';
import { SaveButton } from '@/components/forms';
import FreelancerPicker, { type PickerRow } from '@/components/freelancer-picker';
import { performerRole, workModeIsReview } from '@/lib/projects';

type Option = { value: string; label: string };

/**
 * نموذج الإسناد — **من يدير، ومن ينفّذ، ومن يراجع** (§٧.٢، معيار ≤١٥ ثانية).
 *
 * الحقول تتبع نمط التشغيل المختار أعلاه:
 *   - اسم دور المنفِّذ يتغيّر: «المترجم» في الترجمة، «المدقّق اللغوي» في
 *     التدقيق، «معدّ السبتايتل» في السبتايتل… فمدير المشاريع يعرف من يختار.
 *   - **حقل المراجع يختفي** إن كان النمط مراجعة أو تدقيقًا أصلًا، لأن
 *     تكلفته لا تُحتسب حينها (§٨) — فطلبه وعدٌ كاذب.
 *   - داخلي ← قائمة المنتِجين · خارجي ← محرّك اختيار الفريلانسر ·
 *     مختلط ← الاثنان معًا.
 *
 * ويبقى **مؤشر التكلفة المجرّد** كما نصّت §٥: رقمان بلا أي إشارة إلى راتب
 * أحد، يأتيان من الخادم فلا تصل المتصفحَ معطياتُ الراتب أصلًا.
 */
export default function AssignForm({
  projectId,
  workModes,
  producers,
  managers,
  freelancers,
  sourcingTypes,
  current,
  showCostIndicator,
  showRates,
  canPickFreelancer,
}: {
  projectId: string;
  workModes: Option[];
  producers: { id: string; name: string; jobTitle: string | null }[];
  managers: { id: string; name: string }[];
  freelancers: PickerRow[];
  sourcingTypes: Option[];
  current: {
    workMode: string | null;
    sourcing: string | null;
    projectManagerId: string | null;
    primaryProducerId: string | null;
    primaryFreelancerId: string | null;
    reviewerId: string | null;
    reviewerFreelancerId: string | null;
    externalName: string | null;
    externalRate: number | null;
    reviewerRate: number | null;
  };
  showCostIndicator: boolean;
  showRates: boolean;
  canPickFreelancer: boolean;
}) {
  const [workMode, setWorkMode] = useState(current.workMode ?? '');
  const [sourcing, setSourcing] = useState(current.sourcing ?? 'internal');
  const [producerId, setProducerId] = useState(current.primaryProducerId ?? '');
  const [externalRate, setExternalRate] = useState(
    current.externalRate ? String(current.externalRate) : ''
  );
  const [indicator, setIndicator] = useState<{
    internal: number | null;
    external: number | null;
  } | null>(null);

  const wantsExternal = sourcing === 'external' || sourcing === 'mixed';
  const wantsInternal = sourcing === 'internal' || sourcing === 'mixed';
  const role = performerRole(workMode);
  const modeIsReview = workModeIsReview(workMode);
  /** نمط الآلة: المنفّذ من شغّلها، والمراجعة البشرية خطوةٌ تالية مستقلّة */
  const machineMode = workMode === 'mtpe_full' || workMode === 'mtpe_light';

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

      {/* ── من يدير المشروع ──────────────────────────────────── */}
      <section className="card card-pad space-y-4">
        <div>
          <label className="label" htmlFor="projectManagerId">
            <UserCog className="ml-1 inline h-4 w-4 text-slate-400" />
            مدير المشروع
          </label>
          <select
            id="projectManagerId"
            name="projectManagerId"
            defaultValue={current.projectManagerId ?? ''}
            className="input"
          >
            <option value="">— أنا (من يُسند) —</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">
            المسؤول عن متابعة التنفيذ حتى التسليم — تصله تنبيهات هذا المشروع
          </p>
        </div>
      </section>

      {/* ── نمط التشغيل ومصدره ───────────────────────────────── */}
      <section className="card card-pad space-y-4">
        <div>
          <label className="label" htmlFor="workMode">
            نمط التشغيل <span className="text-rose-500">*</span>
          </label>
          <select
            id="workMode"
            name="workMode"
            required
            value={workMode}
            onChange={(e) => setWorkMode(e.target.value)}
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
            يحدد معامل الجهد الذي تُحسب به الصفحات الموزونة — ويحدد من تُسند
            إليه المهمة أدناه
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
      </section>

      {/* ── من ينفّذ ─────────────────────────────────────────── */}
      <section className="card card-pad space-y-4">
        <h2 className="section-title">
          {machineMode ? '١ · من شغّل الذكاء الاصطناعي' : `من ينفّذ: ${role}`}
        </h2>
        {machineMode && (
          <p className="rounded-lg bg-marine-400/10 px-4 py-2.5 text-sm text-slate-600">
            في نمط الآلة <b>خطوتان لا واحدة</b>: من شغّل الترجمة الآليّة، ثم من راجعها
            بشريًّا. وكانت الشاشة تسأل عن مراجعٍ مرتين ولا تسأل عن مشغّل الآلة أصلًا.
          </p>
        )}

        {wantsInternal && (
          <div>
            <label className="label" htmlFor="primaryProducerId">
              {role} من الفريق الداخلي{' '}
              {sourcing === 'internal' && <span className="text-rose-500">*</span>}
            </label>
            {producers.length === 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  لا يوجد موظف مُعلَّم كـ«منتِج» بعد. افتح{' '}
                  <a href="/settings/users" className="link">
                    شاشة المستخدمين
                  </a>{' '}
                  وفعّل «ينتج فعليًا» لمن يترجم أو يراجع — أو اختر تشغيلًا
                  خارجيًا وأسنِد لفريلانسر.
                </span>
              </div>
            ) : (
              <>
                <select
                  id="primaryProducerId"
                  name="primaryProducerId"
                  required={sourcing === 'internal'}
                  value={producerId}
                  onChange={(e) => setProducerId(e.target.value)}
                  className="input"
                >
                  <option value="">— اختر —</option>
                  {producers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.jobTitle ? ` — ${p.jobTitle}` : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-400">
                  القائمة تعرض من فُعّل له «ينتج فعليًا» — مستقلًا تمامًا عن دوره
                </p>
              </>
            )}
          </div>
        )}

        {wantsExternal &&
          (canPickFreelancer ? (
            <>
              <FreelancerPicker
                rows={freelancers}
                name="primaryFreelancerId"
                label={`${role} من الفريلانسرز`}
                required={sourcing === 'external'}
                selectedId={current.primaryFreelancerId}
                showRates={showRates}
                hint="مرشَّحون مسبقًا بزوج لغة المشروع وخط خدمته"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="externalName">
                    أو اسم منفِّذ خارجي غير مسجَّل
                  </label>
                  <input
                    id="externalName"
                    name="externalName"
                    defaultValue={current.externalName ?? ''}
                    placeholder="اسم يدوي — يُفضَّل تسجيله في السجل"
                    className="input"
                  />
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
                    اتركه فارغًا ليُجلب سعر الفريلانسر لهذا الزوج تلقائيًا
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="externalName">
                  المنفِّذ الخارجي <span className="text-rose-500">*</span>
                </label>
                <input
                  id="externalName"
                  name="externalName"
                  required={sourcing === 'external'}
                  defaultValue={current.externalName ?? ''}
                  className="input"
                />
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
              </div>
            </div>
          ))}
      </section>

      {/* ── من يراجع ─────────────────────────────────────────── */}
      <section className="card card-pad space-y-4">
        <h2 className="section-title">{machineMode ? '٢ · من يراجع بعد الآلة' : 'من يراجع'}</h2>

        {modeIsReview ? (
          <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            النمط المختار <b>هو نفسه مراجعة</b>، فلا يُسند مراجع ثانٍ — تكلفته
            محتسَبة في النمط أصلًا، وإضافته تحتسب المراجعة مرتين (§٨).
          </p>
        ) : (
          <>
            <div>
              <label className="label" htmlFor="reviewerId">
                مراجع من الفريق الداخلي
              </label>
              <select
                id="reviewerId"
                name="reviewerId"
                defaultValue={current.reviewerId ?? ''}
                className="input"
              >
                <option value="">— بلا مراجع داخلي —</option>
                {producers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400">
                تكلفته لا تُحتسب إن كان هو {role} نفسه
              </p>
            </div>

            {canPickFreelancer && (
              <>
                <FreelancerPicker
                  rows={freelancers}
                  name="reviewerFreelancerId"
                  label="أو مراجع من الفريلانسرز"
                  selectedId={current.reviewerFreelancerId}
                  showRates={showRates}
                  hint="يُحتسب أجره على الصفحات كأي تشغيل خارجي"
                />
                <div className="sm:w-1/2">
                  <label className="label" htmlFor="reviewerRate">
                    أجر المراجع للصفحة
                  </label>
                  <input
                    id="reviewerRate"
                    name="reviewerRate"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={current.reviewerRate ?? ''}
                    dir="ltr"
                    className="input text-left"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    اتركه فارغًا ليُجلب سعره تلقائيًا
                  </p>
                </div>
              </>
            )}
          </>
        )}

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
