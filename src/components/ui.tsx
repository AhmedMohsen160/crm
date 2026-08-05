import Link from '@/components/link';
import BackButton from '@/components/back-button';
import { cn, initials, colorFromString } from '@/lib/utils';

// ── أفاتار المستخدم ────────────────────────────────────────────
export function Avatar({
  name,
  size = 'md',
}: {
  name: string | null | undefined;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    xs: 'h-6 w-6 text-[10px]',
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-lg',
  };
  return (
    <span
      title={name ?? undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        sizes[size],
        colorFromString(name)
      )}
    >
      {initials(name)}
    </span>
  );
}

// ── شارة ملوّنة ────────────────────────────────────────────────
export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('badge', className ?? 'bg-slate-100 text-slate-700 border-slate-300')}>
      {children}
    </span>
  );
}

// ── ترويسة الصفحة ──────────────────────────────────────────────
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  /** نصٌّ عادةً — ويقبل عنصرًا حين يتغيّر في مكانه (عدّاد دفتر اليومية) */
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {/* الرجوع خطوةً للوراء — في كل شاشة بلا أن تُضيفه كل شاشة */}
        <span className="mt-0.5">
          <BackButton />
        </span>
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

// ── حالة فارغة ─────────────────────────────────────────────────
export function EmptyState({
  icon,
  title,
  description,
  actionHref,
  actionLabel,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {icon && <div className="text-slate-300">{icon}</div>}
      <h3 className="text-base font-semibold text-slate-700">{title}</h3>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {actionHref && actionLabel && (
        <Link href={actionHref} className="btn-primary mt-2">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

// ── بطاقة إحصائية ──────────────────────────────────────────────
export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = 'brand',
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
  accent?: 'brand' | 'emerald' | 'amber' | 'rose' | 'slate' | 'violet';
  href?: string;
}) {
  const accents = {
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
    slate: 'bg-slate-100 text-slate-600',
    violet: 'bg-violet-50 text-violet-600',
  };

  const inner = (
    <div className="card card-pad flex items-center gap-4 transition-shadow hover:shadow-md">
      {icon && (
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-lg', accents[accent])}>
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 text-xl font-bold text-slate-900">
          <span className="nums">{value}</span>
        </p>
        {hint && <p className="mt-0.5 truncate text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

// ── صف بيانات (مفتاح: قيمة) ────────────────────────────────────
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-2">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children ?? '—'}</dd>
    </div>
  );
}

// ── حقل إدخال بعنوان ───────────────────────────────────────────
export function FormField({
  label,
  name,
  type = 'text',
  defaultValue,
  placeholder,
  required,
  hint,
  step,
  min,
  max,
  dir,
  className,
  onChange,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  step?: string;
  min?: string;
  max?: string;
  dir?: 'rtl' | 'ltr';
  className?: string;
  /** يُمرَّر من مكوّنات العميل وحدها — الحقل يبقى غير مضبوط فيعمل بلا جافاسكربت */
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        step={step}
        min={min}
        max={max}
        dir={dir}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue ?? undefined}
        onChange={onChange}
        className="input"
      />
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

// ── قائمة منسدلة ───────────────────────────────────────────────
export function SelectField({
  label,
  name,
  options,
  defaultValue,
  required,
  disabled,
  placeholder = '— اختر —',
  hint,
  className,
  onChange,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string | null;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  hint?: string;
  className?: string;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <select
        id={name}
        name={name}
        required={required}
        disabled={disabled}
        defaultValue={defaultValue ?? ''}
        onChange={onChange}
        className="input disabled:bg-slate-100 disabled:text-slate-400"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

// ── منطقة نص ───────────────────────────────────────────────────
export function TextAreaField({
  label,
  name,
  defaultValue,
  placeholder,
  rows = 4,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={rows}
        placeholder={placeholder}
        defaultValue={defaultValue ?? undefined}
        className="input"
      />
    </div>
  );
}

// ── رسالة خطأ ──────────────────────────────────────────────────
export function ErrorAlert({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      {message}
    </div>
  );
}
