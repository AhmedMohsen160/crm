'use client';

import { useState } from 'react';
import { SaveButton } from '@/components/forms';

type Transition = { to: string; label: string };

/**
 * أزرار نقل حالة المشروع (§٦).
 *
 * الانتقالات الواصلة هنا **مرشَّحة في الخادم** بصلاحية المستخدم؛ هذا
 * المكوّن يعرضها فقط. الانتقالان اللذان يطلبان بيانات إضافية — التحصيل
 * والإلغاء — يفتحان حقلهما بدل أن يُنفَّذا بضغطة، لأن الخادم يرفضهما
 * بدونها على أي حال.
 */
export default function ProjectTransitions({
  projectId,
  status,
  transitions,
  netTotal,
  alreadyCollected,
  deposit,
}: {
  projectId: string;
  status: string;
  transitions: Transition[];
  /** null لمن لا يملك رؤية سعر البيع */
  netTotal: number | null;
  alreadyCollected: number;
  deposit: number;
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (transitions.length === 0) {
    return (
      <div className="card card-pad text-sm text-slate-500">
        لا انتقال متاح لك من حالة «{status === 'cancelled' ? 'ملغى' : status}».
      </div>
    );
  }

  const remaining = netTotal === null ? null : netTotal - deposit - alreadyCollected;

  return (
    <div className="card card-pad">
      <p className="mb-3 section-title">الانتقال التالي</p>

      <div className="flex flex-wrap gap-2">
        {transitions.map((t) => {
          const needsInput = t.to === 'collected' || t.to === 'cancelled';
          if (!needsInput) {
            return (
              <form key={t.to} method="post" action="/api/save" className="inline">
                <input type="hidden" name="entity" value="project.move" />
                <input type="hidden" name="id" value={projectId} />
                <input type="hidden" name="status" value={t.to} />
                <input type="hidden" name="back" value={`/projects/${projectId}`} />
                <button
                  type="submit"
                  className={
                    t.to === 'delivered'
                      ? 'btn-primary'
                      : 'btn-secondary'
                  }
                >
                  {t.label}
                </button>
              </form>
            );
          }
          return (
            <button
              key={t.to}
              type="button"
              onClick={() => setOpen(open === t.to ? null : t.to)}
              className={t.to === 'cancelled' ? 'btn-danger' : 'btn-primary'}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {open === 'collected' && (
        <form method="post" action="/api/save" className="mt-4 rounded-lg bg-slate-50 p-4">
          <input type="hidden" name="entity" value="project.move" />
          <input type="hidden" name="id" value={projectId} />
          <input type="hidden" name="status" value="collected" />
          <input type="hidden" name="back" value={`/projects/${projectId}`} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="collectedAmount">
                المبلغ المحصَّل <span className="text-rose-500">*</span>
              </label>
              <input
                id="collectedAmount"
                name="collectedAmount"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={remaining !== null && remaining > 0 ? remaining : undefined}
                className="input"
              />
              {remaining !== null && (
                <p className="mt-1 text-xs text-slate-400 nums">
                  المتبقي على العميل: {remaining.toLocaleString('ar-EG')}
                </p>
              )}
            </div>
            <div>
              <label className="label" htmlFor="collectedAt">
                تاريخ التحصيل
              </label>
              <input id="collectedAt" name="collectedAt" type="date" className="input" />
              <p className="mt-1 text-xs text-slate-400">اتركه فارغًا لتاريخ اليوم</p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <SaveButton>تأكيد التحصيل</SaveButton>
            <button type="button" onClick={() => setOpen(null)} className="btn-secondary">
              إلغاء
            </button>
          </div>
        </form>
      )}

      {open === 'cancelled' && (
        <form method="post" action="/api/save" className="mt-4 rounded-lg bg-rose-50 p-4">
          <input type="hidden" name="entity" value="project.move" />
          <input type="hidden" name="id" value={projectId} />
          <input type="hidden" name="status" value="cancelled" />
          <input type="hidden" name="back" value={`/projects/${projectId}`} />

          <label className="label" htmlFor="cancelReason">
            سبب الإلغاء <span className="text-rose-500">*</span>
          </label>
          <input
            id="cancelReason"
            name="cancelReason"
            required
            placeholder="مثال: العميل ألغى الطلب قبل البدء"
            className="input"
          />
          <p className="mt-1 text-xs text-slate-500">
            المشروع لا يُحذف — يخرج من كل تقرير مالي ويبقى في السجل بسببه.
          </p>

          <div className="mt-3 flex items-center gap-3">
            <SaveButton>تأكيد الإلغاء</SaveButton>
            <button type="button" onClick={() => setOpen(null)} className="btn-secondary">
              تراجع
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
