'use client';

import { useState, useRef } from 'react';
import Link from '@/components/link';
import { GripVertical, Loader2, AlertTriangle } from 'lucide-react';
import {
  PROJECT_STATUSES,
  PROJECT_FLOW,
  allowedTransitions,
  type ProjectStatus,
} from '@/lib/projects';
import { formatMoney, formatDate, cn, isOverdue } from '@/lib/utils';
import { Avatar } from '@/components/ui';

export type BoardProject = {
  id: string;
  code: string | null;
  title: string;
  netTotal: number;
  currency: string;
  status: string;
  deadline: string | null;
  clientName: string | null;
  ownerName: string | null;
  serviceLineLabel: string | null;
  alert: string;
  /** هل يرى هذا المستخدم سعر البيع؟ يُقرّر في الخادم */
  showPrice: boolean;
};

const COLUMN_ACCENT: Record<string, string> = {
  pending_assignment: 'border-t-slate-400',
  in_progress: 'border-t-blue-500',
  in_review: 'border-t-indigo-500',
  ready: 'border-t-sky-500',
  delivered: 'border-t-emerald-500',
  collected: 'border-t-teal-600',
  rework: 'border-t-amber-500',
  cancelled: 'border-t-slate-300',
};

/**
 * لوحة التشغيل — أعمدتها حالات §٦ الست في المسار الرئيسي.
 *
 * السحب والإفلات **لا يتجاوز قواعد الانتقال**: العمود الذي لا يجوز الانتقال
 * إليه من حالة البطاقة المسحوبة لا يقبلها أصلًا، والخادم يفحص القاعدة مرة
 * ثانية. الواجهة تريح المستخدم، والخادم هو الذي يحرس.
 */
export default function PipelineBoard({
  projects,
  showOwner,
  redirectTo,
  columns = PROJECT_FLOW,
}: {
  projects: BoardProject[];
  showOwner: boolean;
  redirectTo: string;
  columns?: ProjectStatus[];
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const dragged = projects.find((p) => p.id === dragId) ?? null;

  /** هل يقبل هذا العمود البطاقة المسحوبة الآن؟ */
  function accepts(status: ProjectStatus): boolean {
    if (!dragged) return false;
    if (dragged.status === status) return false;
    return allowedTransitions(dragged.status).some((t) => t.to === status);
  }

  // النقل بإرسال نموذج عادي (POST ثم تحويل) — أسلوب مضمون النتيجة
  function handleDrop(status: ProjectStatus) {
    setOverStatus(null);
    const id = dragId;
    setDragId(null);
    if (!id || !accepts(status)) return;

    setMovingId(id);
    const form = formRef.current;
    if (!form) return;
    (form.elements.namedItem('id') as HTMLInputElement).value = id;
    (form.elements.namedItem('value') as HTMLInputElement).value = status;
    form.submit();
  }

  return (
    <>
      <form ref={formRef} method="post" action="/api/mutate" className="hidden">
        <input type="hidden" name="op" value="project.status" />
        <input type="hidden" name="id" defaultValue="" />
        <input type="hidden" name="value" defaultValue="" />
        <input type="hidden" name="redirectTo" value={redirectTo} />
      </form>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((status) => {
          const column = projects.filter((p) => p.status === status);
          const total = column.reduce((s, p) => s + (p.showPrice ? p.netTotal : 0), 0);
          const showTotal = column.some((p) => p.showPrice);
          const isOver = overStatus === status;
          const canDrop = accepts(status);

          return (
            <div
              key={status}
              onDragOver={(e) => {
                if (!canDrop) return;
                e.preventDefault();
                setOverStatus(status);
              }}
              onDragLeave={() => setOverStatus((s) => (s === status ? null : s))}
              onDrop={() => handleDrop(status)}
              className={cn(
                'flex w-[280px] shrink-0 flex-col rounded-xl border border-t-4 bg-slate-100/70 transition-colors',
                COLUMN_ACCENT[status] ?? 'border-t-slate-300',
                isOver && canDrop
                  ? 'border-brand-400 bg-brand-50'
                  : dragged && !canDrop
                    ? 'border-slate-200 opacity-40'
                    : 'border-slate-200'
              )}
            >
              <div className="border-b border-slate-200 px-3 py-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">
                    {PROJECT_STATUSES[status]}
                  </h3>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 nums">
                    {column.length}
                  </span>
                </div>
                {showTotal && (
                  <p className="mt-1 text-xs font-medium text-slate-500 nums">
                    {formatMoney(total)}
                  </p>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-2 p-2">
                {column.length === 0 && (
                  <p className="py-8 text-center text-xs text-slate-400">لا مشاريع هنا</p>
                )}

                {column.map((project) => (
                  <div
                    key={project.id}
                    draggable
                    onDragStart={() => setDragId(project.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverStatus(null);
                    }}
                    className={cn(
                      'group cursor-grab rounded-lg border bg-white p-3 shadow-sm transition-all hover:shadow-md active:cursor-grabbing',
                      project.alert ? 'border-rose-300' : 'border-slate-200',
                      dragId === project.id && 'opacity-40',
                      movingId === project.id && 'animate-pulse'
                    )}
                  >
                    <div className="flex items-start gap-1.5">
                      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/projects/${project.id}`}
                          className="line-clamp-2 text-sm font-medium text-slate-800 hover:text-brand-700"
                        >
                          {project.title}
                        </Link>
                        <p className="mt-0.5 truncate text-xs text-slate-400" dir="ltr">
                          {project.code}
                        </p>
                        {project.clientName && (
                          <p className="truncate text-xs text-slate-500">
                            {project.clientName}
                          </p>
                        )}
                      </div>
                      {movingId === project.id && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500" />
                      )}
                    </div>

                    {project.alert && (
                      <p className="mt-2 flex items-start gap-1 rounded bg-rose-50 px-1.5 py-1 text-[11px] text-rose-700">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        {project.alert}
                      </p>
                    )}

                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      {project.showPrice ? (
                        <span className="text-sm font-semibold text-slate-900 nums">
                          {formatMoney(project.netTotal, project.currency)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {project.serviceLineLabel ?? ''}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                      {project.deadline ? (
                        <span
                          className={cn(
                            'text-[11px]',
                            isOverdue(project.deadline) &&
                              status !== 'delivered' &&
                              status !== 'collected'
                              ? 'font-medium text-rose-600'
                              : 'text-slate-400'
                          )}
                        >
                          {formatDate(project.deadline)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-300">بلا موعد</span>
                      )}
                      {showOwner && project.ownerName && (
                        <Avatar name={project.ownerName} size="xs" />
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
