/**
 * هوية فاست ترانس.
 *
 * اللونان مستخرجان من عروض الشركة الرسمية بعينها — الكحلي `#242E5B`
 * والليموني `#B9D716` — لا مختاران بالذوق. والشعار مرسوم بـSVG لا صورة:
 * يبقى حادًّا على كل شاشة، ويأخذ لونه من سياقه فيعمل على الفاتح والداكن معًا.
 */

export function FastTransMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden fill="none">
      <rect width="40" height="40" rx="9" fill="#242E5B" />
      {/* السهم: النقل من لغة إلى لغة — وهو معنى الاسم */}
      <path
        d="M11 15.5h13.5M20 10.5l5 5-5 5"
        stroke="#B9D716"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M29 24.5H15.5M20 29.5l-5-5 5-5"
        stroke="#FFFFFF"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** الشعار كاملًا: العلامة والاسم — يُستعمل في الترويسة وشاشة الدخول */
export function FastTransLogo({
  compact = false,
  invert = false,
}: {
  compact?: boolean;
  invert?: boolean;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <FastTransMark className={compact ? 'h-8 w-8' : 'h-10 w-10'} />
      {!compact && (
        <span className="leading-tight">
          <span
            className={`block text-sm font-extrabold tracking-tight ${
              invert ? 'text-white' : 'text-brand-600'
            }`}
          >
            FAST TRANS
          </span>
          <span
            className={`block text-[10px] font-medium tracking-[0.18em] ${
              invert ? 'text-brand-200' : 'text-slate-400'
            }`}
          >
            CERTIFIED TRANSLATION
          </span>
        </span>
      )}
    </span>
  );
}
