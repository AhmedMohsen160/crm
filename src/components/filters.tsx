'use client';

import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * شريط البحث والفلاتر.
 *
 * نموذج GET عادي: الضغط على Enter أو تغيير أي فلتر يُعيد تحميل الصفحة
 * بالعنوان الجديد. اخترنا هذا بدل التنقّل من جهة المتصفح لأن الأخير كان
 * يتوقّف أحيانًا فلا تتغيّر النتائج.
 */
export function FilterBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <form method="get" className={cn('flex flex-wrap items-center gap-3', className)}>
      {children}
    </form>
  );
}

/** مربع البحث — يبحث عند الضغط على Enter أو على زر البحث */
export function SearchInput({
  defaultValue,
  placeholder = 'بحث...',
}: {
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full sm:w-72">
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="input pr-9"
      />
      <button
        type="submit"
        title="بحث"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-brand-600"
      >
        <Search className="h-4 w-4" />
      </button>
    </div>
  );
}

/** قائمة فلترة — تُطبَّق فور الاختيار */
export function FilterSelect({
  name,
  options,
  placeholder,
  defaultValue,
  className,
}: {
  name: string;
  options: { value: string; label: string }[];
  placeholder: string;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue ?? ''}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={cn('input w-auto min-w-[9rem]', className)}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** حقل مخفي للحفاظ على بقية معايير العنوان عند البحث */
export function KeepParam({ name, value }: { name: string; value?: string }) {
  if (!value) return null;
  return <input type="hidden" name={name} value={value} />;
}
