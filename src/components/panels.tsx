import Link from '@/components/link';
import { MessageSquare, ListChecks, History, Plus } from 'lucide-react';
import { db } from '@/lib/db';
import {
  TASK_STATUSES,
  TASK_STATUS_COLORS,
  TASK_PRIORITIES,
  TASK_PRIORITY_COLORS,
  TASK_TYPES,
  type TaskStatus,
  type TaskPriority,
  type TaskType,
} from '@/lib/constants';
import { formatDateTime, formatDate, isOverdue, cn } from '@/lib/utils';
import { Avatar, Badge } from '@/components/ui';
import { TaskToggle, ConfirmMutateButton } from '@/components/forms';
import type { EntityLink } from '@/lib/actions/helpers';

/** الحقول المخفية التي تربط الملاحظة بالكيان الحالي */
function linkFields(link: EntityLink): Record<string, string> {
  const fields: Record<string, string> = {};
  if (link.companyId) fields.companyId = link.companyId;
  if (link.contactId) fields.contactId = link.contactId;
  if (link.leadId) fields.leadId = link.leadId;
  if (link.dealId) fields.dealId = link.dealId;
  return fields;
}

// ═══════════════════════════════════════════════════════════════
//  لوحة الملاحظات
// ═══════════════════════════════════════════════════════════════
export async function NotesPanel({
  link,
  currentUserId,
  canModerate,
  currentPath,
}: {
  link: EntityLink;
  currentUserId: string;
  canModerate: boolean;
  /** مسار الصفحة الحالية — نعود إليه بعد حفظ الملاحظة */
  currentPath: string;
}) {
  const notes = await db.note.findMany({
    where: {
      companyId: link.companyId ?? undefined,
      contactId: link.contactId ?? undefined,
      leadId: link.leadId ?? undefined,
      dealId: link.dealId ?? undefined,
    },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <section className="card">
      <h2 className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 font-semibold text-slate-800">
        <MessageSquare className="h-4 w-4 text-brand-600" />
        الملاحظات
        <span className="text-sm font-normal text-slate-400 nums">({notes.length})</span>
      </h2>

      {/* نموذج عادي: يُرسل ثم يعيد تحميل الصفحة — مضمون في كل مرة */}
      <form method="post" action="/api/notes" className="border-b border-slate-200 p-4">
        {Object.entries(linkFields(link)).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <input type="hidden" name="redirectTo" value={currentPath} />
        <textarea
          name="body"
          required
          rows={3}
          placeholder="اكتب ملاحظة عن هذا العميل... (مثال: تحدثت معه اليوم وطلب عرض سعر لترجمة عقد)"
          className="input"
        />
        <div className="mt-2 flex justify-end">
          <button type="submit" className="btn-primary btn-sm">
            إضافة ملاحظة
          </button>
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-400">
          لا توجد ملاحظات بعد
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {notes.map((note) => (
            <li key={note.id} className="flex gap-3 px-5 py-4">
              <Avatar name={note.author?.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium text-slate-800">
                    {note.author?.name ?? 'مستخدم محذوف'}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatDateTime(note.createdAt)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                  {note.body}
                </p>
              </div>
              {(canModerate || note.authorId === currentUserId) && (
                <ConfirmMutateButton
                  op="note.delete"
                  id={note.id}
                  redirectTo={currentPath}
                  label="حذف"
                  confirmText="حذف هذه الملاحظة؟"
                  className="btn-ghost btn-sm shrink-0 text-slate-400 hover:text-rose-600"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
//  لوحة المهام المرتبطة
// ═══════════════════════════════════════════════════════════════
export async function TasksPanel({
  link,
  newTaskHref,
  showAssignee = true,
  currentPath,
}: {
  link: EntityLink;
  newTaskHref: string;
  showAssignee?: boolean;
  /** مسار الصفحة الحالية — نعود إليه بعد تعديل المهمة */
  currentPath: string;
}) {
  const tasks = await db.task.findMany({
    where: {
      companyId: link.companyId ?? undefined,
      contactId: link.contactId ?? undefined,
      leadId: link.leadId ?? undefined,
      dealId: link.dealId ?? undefined,
    },
    include: { assignee: { select: { name: true } } },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    take: 50,
  });

  const open = tasks.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS');

  return (
    <section className="card">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold text-slate-800">
          <ListChecks className="h-4 w-4 text-brand-600" />
          المهام
          <span className="text-sm font-normal text-slate-400 nums">
            ({open.length} مفتوحة)
          </span>
        </h2>
        <Link href={newTaskHref} className="btn-secondary btn-sm">
          <Plus className="h-3.5 w-3.5" />
          مهمة
        </Link>
      </div>

      {tasks.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-400">
          لا توجد مهام مرتبطة —{' '}
          <Link href={newTaskHref} className="link">
            أضف مهمة متابعة
          </Link>
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {tasks.map((task) => {
            const done = task.status === 'DONE' || task.status === 'CANCELLED';
            return (
              <li key={task.id} className="flex items-start gap-3 px-5 py-3">
                <div className="pt-0.5">
                  <TaskToggle id={task.id} done={task.status === 'DONE'} redirectTo={currentPath} />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'text-sm font-medium',
                      done ? 'text-slate-400 line-through' : 'text-slate-800'
                    )}
                  >
                    {task.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                      {TASK_TYPES[task.type as TaskType] ?? task.type}
                    </Badge>
                    <Badge className={TASK_PRIORITY_COLORS[task.priority as TaskPriority]}>
                      {TASK_PRIORITIES[task.priority as TaskPriority] ?? task.priority}
                    </Badge>
                    {task.dueDate && (
                      <span
                        className={cn(
                          !done && isOverdue(task.dueDate)
                            ? 'font-medium text-rose-600'
                            : 'text-slate-500'
                        )}
                      >
                        {formatDate(task.dueDate)}
                      </span>
                    )}
                    {showAssignee && task.assignee && (
                      <span className="text-slate-400">• {task.assignee.name}</span>
                    )}
                  </div>
                </div>
                <Link
                  href={`/tasks/${task.id}/edit`}
                  className="shrink-0 text-xs text-slate-400 hover:text-brand-700"
                >
                  تعديل
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
//  سجل النشاط
// ═══════════════════════════════════════════════════════════════
const ACTIVITY_LABELS: Record<string, string> = {
  CREATED: 'إنشاء',
  UPDATED: 'تعديل',
  STAGE_CHANGED: 'تغيير مرحلة',
  STATUS_CHANGED: 'تغيير حالة',
  NOTE_ADDED: 'ملاحظة',
  TASK_CREATED: 'مهمة',
  TASK_UPDATED: 'مهمة',
  CONVERTED: 'تحويل',
  QUOTE_CREATED: 'عرض سعر',
  QUOTE_SENT: 'إرسال عرض',
};

export async function ActivityPanel({ link }: { link: EntityLink }) {
  const items = await db.activity.findMany({
    where: {
      companyId: link.companyId ?? undefined,
      contactId: link.contactId ?? undefined,
      leadId: link.leadId ?? undefined,
      dealId: link.dealId ?? undefined,
    },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  return (
    <section className="card">
      <h2 className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 font-semibold text-slate-800">
        <History className="h-4 w-4 text-brand-600" />
        سجل النشاط
      </h2>

      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-400">لا يوجد نشاط مسجّل</p>
      ) : (
        <ol className="relative px-5 py-4">
          <span className="absolute bottom-6 right-[30px] top-6 w-px bg-slate-200" aria-hidden />
          {items.map((a) => (
            <li key={a.id} className="relative flex gap-3 py-2.5">
              <span className="relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white bg-brand-400 ring-1 ring-slate-200" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-800">
                  <span className="font-medium">{a.title}</span>
                  {a.detail && <span className="text-slate-500"> — {a.detail}</span>}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {a.user?.name ?? 'النظام'} • {formatDateTime(a.createdAt)}
                  {ACTIVITY_LABELS[a.type] && <> • {ACTIVITY_LABELS[a.type]}</>}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** شارة حالة المهمة (تُستخدم في قوائم المهام) */
export function TaskStatusBadge({ status }: { status: string }) {
  return (
    <Badge className={TASK_STATUS_COLORS[status as TaskStatus]}>
      {TASK_STATUSES[status as TaskStatus] ?? status}
    </Badge>
  );
}
