import { cn } from '@/lib/utils';
import ConfirmSubmit from './confirm-submit';

/**
 * نموذج تعديل سريع: يرسل إلى /api/mutate ثم يعود إلى نفس الصفحة.
 *
 * نستخدم النماذج التقليدية بدل Server Actions في التعديلات التي تتم من
 * داخل الصفحة، لأنها تعمل بشكل مؤكد في كل مرة (ولا تحتاج جافاسكربت).
 */
export function MutateForm({
  op,
  id,
  value,
  redirectTo,
  children,
  className,
}: {
  op: string;
  id: string;
  value?: string;
  redirectTo: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <form method="post" action="/api/mutate" className={className}>
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="id" value={id} />
      {value !== undefined && <input type="hidden" name="value" value={value} />}
      <input type="hidden" name="redirectTo" value={redirectTo} />
      {children}
    </form>
  );
}

/** زر تعديل سريع (مثال: تغيير مرحلة الصفقة) */
export function MutateButton({
  op,
  id,
  value,
  redirectTo,
  children,
  className,
  title,
}: {
  op: string;
  id: string;
  value?: string;
  redirectTo: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <MutateForm op={op} id={id} value={value} redirectTo={redirectTo}>
      <button type="submit" title={title} className={className}>
        {children}
      </button>
    </MutateForm>
  );
}

/** زر حذف يسأل المستخدم للتأكيد قبل الإرسال */
export function ConfirmMutateButton({
  op,
  id,
  redirectTo,
  label = 'حذف',
  confirmText = 'هل أنت متأكد من الحذف؟ لا يمكن التراجع عن هذه الخطوة.',
  className = 'btn-danger btn-sm',
}: {
  op: string;
  id: string;
  redirectTo: string;
  label?: string;
  confirmText?: string;
  className?: string;
}) {
  return (
    <ConfirmSubmit confirmText={confirmText}>
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <button type="submit" className={className}>
        {label}
      </button>
    </ConfirmSubmit>
  );
}

/** مربع إتمام المهمة — نموذج عادي بمظهر مربع اختيار */
export function TaskToggle({
  id,
  done,
  redirectTo,
}: {
  id: string;
  done: boolean;
  redirectTo: string;
}) {
  return (
    <MutateForm op="task.toggle" id={id} redirectTo={redirectTo} className="flex">
      <button
        type="submit"
        title={done ? 'إعادة فتح المهمة' : 'تحديد كمنجزة'}
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
          done
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-slate-300 bg-white hover:border-emerald-400'
        )}
      >
        {done && (
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path
              fillRule="evenodd"
              d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 111.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>
    </MutateForm>
  );
}

/** زر حفظ عادي (إرسال نموذج تقليدي — لا يحتاج جافاسكربت) */
export function SaveButton({ children }: { children: React.ReactNode }) {
  return (
    <button type="submit" className="btn-primary">
      {children}
    </button>
  );
}
