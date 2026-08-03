'use client';

/**
 * نموذج يسأل المستخدم للتأكيد قبل الإرسال.
 * الإرسال نفسه تقليدي (POST ثم تحويل)، والجافاسكربت هنا للتأكيد فقط.
 */
export default function ConfirmSubmit({
  confirmText,
  children,
  className,
  action = '/api/mutate',
}: {
  confirmText: string;
  children: React.ReactNode;
  className?: string;
  /** الحذف السريع يمرّ بـ/api/mutate، وما يمرّ بمنطق مجاله يمرّ بـ/api/save */
  action?: string;
}) {
  return (
    <form
      method="post"
      action={action}
      className={className}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
