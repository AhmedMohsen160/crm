import Link from '@/components/link';
import { TASK_STATUSES, TASK_PRIORITIES, TASK_TYPES } from '@/lib/constants';
import { FormField, SelectField, TextAreaField } from '@/components/ui';
import { SaveButton } from '@/components/forms';
import { toDateInput } from '@/lib/utils';

type TaskData = {
  title: string;
  description: string | null;
  status: string;
  priority: string;
  type: string;
  dueDate: Date | null;
  assigneeId: string | null;
  companyId: string | null;
  contactId: string | null;
  leadId: string | null;
  dealId: string | null;
};

export default function TaskForm({
  recordId,
  backPath,
  task,
  users,
  currentUserId,
  canAssign,
  cancelHref,
  redirectTo,
  link,
  relatedLabel,
  companies,
  contacts,
  deals,
  leads,
}: {
  recordId?: string;
  backPath: string;
  task?: TaskData;
  users: { id: string; name: string }[];
  currentUserId: string;
  canAssign: boolean;
  cancelHref: string;
  redirectTo?: string;
  link?: { companyId?: string; contactId?: string; leadId?: string; dealId?: string };
  relatedLabel?: string | null;
  companies?: { id: string; name: string }[];
  contacts?: { id: string; firstName: string; lastName: string | null }[];
  deals?: { id: string; title: string }[];
  leads?: { id: string; firstName: string; lastName: string | null }[];
}) {
  // إذا جاءت المهمة من صفحة كيان (عميل/صفقة) نثبّت الربط عبر حقول مخفية،
  // وإلا نعرض قوائم اختيار ليختار المستخدم ما تتعلق به المهمة.
  const pinned = Boolean(
    link?.companyId || link?.contactId || link?.leadId || link?.dealId
  );

  return (
    <form method="post" action="/api/save" className="space-y-6">
      <input type="hidden" name="entity" value="task" />
      <input type="hidden" name="id" value={recordId ?? ''} />
      <input type="hidden" name="back" value={backPath} />
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}

      {pinned && (
        <>
          {link?.companyId && <input type="hidden" name="companyId" value={link.companyId} />}
          {link?.contactId && <input type="hidden" name="contactId" value={link.contactId} />}
          {link?.leadId && <input type="hidden" name="leadId" value={link.leadId} />}
          {link?.dealId && <input type="hidden" name="dealId" value={link.dealId} />}
        </>
      )}

      <section className="card card-pad">
        <h2 className="mb-4 section-title">بيانات المهمة</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="عنوان المهمة"
            name="title"
            required
            className="sm:col-span-2"
            defaultValue={task?.title}
            placeholder="مثال: الاتصال بالعميل لمتابعة عرض السعر"
          />
          <SelectField
            label="نوع المهمة"
            name="type"
            defaultValue={task?.type ?? 'FOLLOW_UP'}
            placeholder="متابعة"
            options={Object.entries(TASK_TYPES).map(([v, l]) => ({ value: v, label: l }))}
          />
          <SelectField
            label="الأولوية"
            name="priority"
            defaultValue={task?.priority ?? 'NORMAL'}
            placeholder="عادية"
            options={Object.entries(TASK_PRIORITIES).map(([v, l]) => ({ value: v, label: l }))}
          />
          <FormField
            label="تاريخ الاستحقاق"
            name="dueDate"
            type="date"
            defaultValue={toDateInput(task?.dueDate)}
          />
          <SelectField
            label="الحالة"
            name="status"
            defaultValue={task?.status ?? 'OPEN'}
            placeholder="مفتوحة"
            options={Object.entries(TASK_STATUSES).map(([v, l]) => ({ value: v, label: l }))}
          />
          <SelectField
            label="مسنَدة إلى"
            name="assigneeId"
            defaultValue={task?.assigneeId ?? currentUserId}
            options={users.map((u) => ({ value: u.id, label: u.name }))}
            className="sm:col-span-2"
            hint={canAssign ? 'يمكنك إسناد المهمة لأي موظف في الفريق' : undefined}
          />
        </div>
      </section>

      <section className="card card-pad">
        <h2 className="mb-4 section-title">مرتبطة بـ</h2>
        {pinned ? (
          <p className="rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-900">
            {relatedLabel ?? 'السجل الحالي'}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="صفقة"
              name="dealId"
              defaultValue={task?.dealId}
              options={(deals ?? []).map((d) => ({ value: d.id, label: d.title }))}
            />
            <SelectField
              label="عميل محتمل"
              name="leadId"
              defaultValue={task?.leadId}
              options={(leads ?? []).map((l) => ({
                value: l.id,
                label: [l.firstName, l.lastName].filter(Boolean).join(' '),
              }))}
            />
            <SelectField
              label="شركة"
              name="companyId"
              defaultValue={task?.companyId}
              options={(companies ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
            <SelectField
              label="جهة اتصال"
              name="contactId"
              defaultValue={task?.contactId}
              options={(contacts ?? []).map((c) => ({
                value: c.id,
                label: [c.firstName, c.lastName].filter(Boolean).join(' '),
              }))}
            />
          </div>
        )}
      </section>

      <section className="card card-pad">
        <TextAreaField
          label="تفاصيل"
          name="description"
          defaultValue={task?.description}
          rows={4}
        />
      </section>

      <div className="flex items-center gap-3">
        <SaveButton>{task ? 'حفظ التعديلات' : 'إنشاء المهمة'}</SaveButton>
        <Link href={cancelHref} className="btn-secondary">
          إلغاء
        </Link>
      </div>
    </form>
  );
}
