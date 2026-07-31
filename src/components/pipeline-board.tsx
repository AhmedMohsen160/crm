'use client';

import { useState, useRef } from 'react';
import Link from '@/components/link';
import { GripVertical, Loader2 } from 'lucide-react';
import {
  DEAL_STAGES,
  DEAL_STAGE_ORDER,
  type DealStage,
} from '@/lib/constants';
import { formatMoney, formatDate, cn, isOverdue } from '@/lib/utils';
import { Avatar } from '@/components/ui';

export type BoardDeal = {
  id: string;
  title: string;
  amount: number;
  currency: string;
  stage: string;
  probability: number;
  expectedCloseDate: string | null;
  companyName: string | null;
  contactName: string | null;
  ownerName: string | null;
  serviceType: string | null;
};

const COLUMN_ACCENT: Record<DealStage, string> = {
  NEW: 'border-t-slate-400',
  QUOTED: 'border-t-blue-500',
  NEGOTIATION: 'border-t-amber-500',
  WON: 'border-t-emerald-500',
  LOST: 'border-t-rose-400',
};

export default function PipelineBoard({
  deals,
  showOwner,
  redirectTo,
}: {
  deals: BoardDeal[];
  showOwner: boolean;
  /** المسار الذي نعود إليه بعد نقل الصفقة */
  redirectTo: string;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // ننقل الصفقة بإرسال نموذج عادي (POST ثم تحويل) — أسلوب مضمون النتيجة
  function handleDrop(stage: DealStage) {
    setOverStage(null);
    const id = dragId;
    setDragId(null);
    if (!id) return;

    const deal = deals.find((d) => d.id === id);
    if (!deal || deal.stage === stage) return;

    setMovingId(id);
    const form = formRef.current;
    if (!form) return;
    (form.elements.namedItem('id') as HTMLInputElement).value = id;
    (form.elements.namedItem('value') as HTMLInputElement).value = stage;
    form.submit();
  }

  return (
    <>
      {/* نموذج مخفي يُستخدم عند إفلات البطاقة في عمود آخر */}
      <form ref={formRef} method="post" action="/api/mutate" className="hidden">
        <input type="hidden" name="op" value="deal.stage" />
        <input type="hidden" name="id" defaultValue="" />
        <input type="hidden" name="value" defaultValue="" />
        <input type="hidden" name="redirectTo" value={redirectTo} />
      </form>

      <div className="flex gap-4 overflow-x-auto pb-4">
      {DEAL_STAGE_ORDER.map((stage) => {
        const column = deals.filter((d) => d.stage === stage);
        const total = column.reduce((s, d) => s + d.amount, 0);
        const isOver = overStage === stage;

        return (
          <div
            key={stage}
            onDragOver={(e) => {
              e.preventDefault();
              setOverStage(stage);
            }}
            onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
            onDrop={() => handleDrop(stage)}
            className={cn(
              'flex w-[280px] shrink-0 flex-col rounded-xl border border-t-4 bg-slate-100/70 transition-colors',
              COLUMN_ACCENT[stage],
              isOver ? 'border-brand-400 bg-brand-50' : 'border-slate-200'
            )}
          >
            <div className="border-b border-slate-200 px-3 py-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">{DEAL_STAGES[stage]}</h3>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 nums">
                  {column.length}
                </span>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-500 nums">
                {formatMoney(total)}
              </p>
            </div>

            <div className="flex flex-1 flex-col gap-2 p-2">
              {column.length === 0 && (
                <p className="py-8 text-center text-xs text-slate-400">
                  اسحب صفقة إلى هنا
                </p>
              )}

              {column.map((deal) => (
                <div
                  key={deal.id}
                  draggable
                  onDragStart={() => setDragId(deal.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverStage(null);
                  }}
                  className={cn(
                    'group cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-all hover:shadow-md active:cursor-grabbing',
                    dragId === deal.id && 'opacity-40',
                    movingId === deal.id && 'animate-pulse'
                  )}
                >
                  <div className="flex items-start gap-1.5">
                    <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/deals/${deal.id}`}
                        className="line-clamp-2 text-sm font-medium text-slate-800 hover:text-brand-700"
                      >
                        {deal.title}
                      </Link>
                      {(deal.companyName || deal.contactName) && (
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {deal.companyName ?? deal.contactName}
                        </p>
                      )}
                    </div>
                    {movingId === deal.id && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500" />
                    )}
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 nums">
                      {formatMoney(deal.amount, deal.currency)}
                    </span>
                    {stage !== 'WON' && stage !== 'LOST' && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 nums">
                        {deal.probability}%
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                    {deal.expectedCloseDate ? (
                      <span
                        className={cn(
                          'text-[11px]',
                          isOverdue(deal.expectedCloseDate) &&
                            stage !== 'WON' &&
                            stage !== 'LOST'
                            ? 'font-medium text-rose-600'
                            : 'text-slate-400'
                        )}
                      >
                        {formatDate(deal.expectedCloseDate)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-300">بدون موعد</span>
                    )}
                    {showOwner && deal.ownerName && (
                      <Avatar name={deal.ownerName} size="xs" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      </div>
    </>
  );
}
