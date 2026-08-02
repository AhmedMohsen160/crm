'use client';

import { useState } from 'react';
import { ShieldAlert, Check, X } from 'lucide-react';
import { SaveButton } from '@/components/forms';

/**
 * لوحة اعتماد الخصم (§١٠ بند ٤).
 *
 * > «ضابط رقابي بلا احتكاك.»
 *
 * تظهر لصاحب المشروع **كإخطار** بأنه موقوف، ولمن يملك `canApproveDiscount`
 * **كقرار**. الرفض يتطلب سببًا، ويعيد السعر إلى ما قبل الخصم بدل ترك
 * المشروع معلّقًا إلى الأبد.
 */
export default function ApprovalPanel({
  projectId,
  state,
  canDecide,
  discountLabel,
  approverName,
  note,
}: {
  projectId: string;
  state: string;
  canDecide: boolean;
  discountLabel: string;
  approverName: string | null;
  note: string | null;
}) {
  const [rejecting, setRejecting] = useState(false);

  if (state === 'approved') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <Check className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          الخصم <b>معتمَد</b>
          {approverName ? ` — اعتمده ${approverName}` : ''}. المشروع يتحرك طبيعيًا.
        </span>
      </div>
    );
  }

  if (state === 'rejected') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <X className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          الخصم <b>مرفوض</b>
          {note ? ` — ${note}` : ''}. أُعيد السعر إلى ما قبل الخصم.
        </span>
      </div>
    );
  }

  if (state !== 'pending') return null;

  return (
    <div
      data-testid="approval-pending"
      className="rounded-lg border border-amber-300 bg-amber-50 p-4"
    >
      <div className="mb-3 flex items-start gap-2 text-sm text-amber-900">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <b>موقوف بانتظار اعتماد الخصم</b> — {discountLabel}
          <span className="block text-xs">
            المشروع <b>لا ينتقل خطوة واحدة</b> قبل الاعتماد. الإلغاء وحده متاح.
          </span>
        </span>
      </div>

      {!canDecide ? (
        <p className="text-xs text-amber-800">
          الاعتماد لمن يملك صلاحية «اعتماد خصم» — تواصل مع مديرك.
        </p>
      ) : rejecting ? (
        <form method="post" action="/api/save" className="space-y-3">
          <input type="hidden" name="entity" value="project.approval" />
          <input type="hidden" name="id" value={projectId} />
          <input type="hidden" name="decision" value="reject" />
          <input type="hidden" name="back" value={`/projects/${projectId}`} />

          <div>
            <label className="label" htmlFor="approvalNote">
              سبب الرفض <span className="text-rose-500">*</span>
            </label>
            <input
              id="approvalNote"
              name="approvalNote"
              required
              placeholder="مثال: الخصم يتجاوز سياسة الشركة لهذا الحجم"
              className="input"
            />
            <p className="mt-1 text-xs text-amber-800">
              الرفض يعيد السعر إلى ما قبل الخصم ويرفع الإيقاف.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <SaveButton>تأكيد الرفض</SaveButton>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="btn-secondary"
            >
              تراجع
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <form method="post" action="/api/save" className="inline">
            <input type="hidden" name="entity" value="project.approval" />
            <input type="hidden" name="id" value={projectId} />
            <input type="hidden" name="decision" value="approve" />
            <input type="hidden" name="back" value={`/projects/${projectId}`} />
            <button type="submit" className="btn-primary">
              اعتماد الخصم
            </button>
          </form>
          <button type="button" onClick={() => setRejecting(true)} className="btn-danger">
            رفض
          </button>
        </div>
      )}
    </div>
  );
}
