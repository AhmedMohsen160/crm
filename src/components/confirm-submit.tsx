'use client';

/**
 * نموذج يسأل المستخدم للتأكيد قبل الإرسال.
 * الإرسال نفسه تقليدي (POST ثم تحويل)، والجافاسكربت هنا للتأكيد فقط.
 */
export default function ConfirmSubmit({
  confirmText,
  children,
  className,
}: {
  confirmText: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <form
      method="post"
      action="/api/mutate"
      className={className}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
