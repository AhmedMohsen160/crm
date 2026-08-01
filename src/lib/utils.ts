import { CURRENCY_LABELS } from './constants';

/** دمج أسماء كلاسات CSS بشكل آمن */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

/** تنسيق المبالغ المالية — مثال: 1,250.00 ج.م */
const CURRENCY_SYMBOLS: Record<string, string> = {
  EGP: 'ج.م',
  USD: '$',
  EUR: '€',
  SAR: 'ر.س',
  AED: 'د.إ',
  GBP: '£',
};

export function formatMoney(amount: number | null | undefined, currency = 'EGP'): string {
  const value = amount ?? 0;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${formatted} ${CURRENCY_SYMBOLS[currency] ?? currency}`;
}

export function currencyLabel(code: string): string {
  return CURRENCY_LABELS[code] ?? code;
}

/** تنسيق الأرقام العادية */
export function formatNumber(n: number | null | undefined): string {
  return new Intl.NumberFormat('en-US').format(n ?? 0);
}

/** تنسيق التاريخ — مثال: 31 يوليو 2026 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-EG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/** تنسيق التاريخ والوقت */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-EG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** صيغة مناسبة لحقل input type="date" */
export function toDateInput(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/** "منذ 3 أيام" / "بعد يومين" */
export function relativeTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = d.getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86_400_000);

  if (diffDays === 0) return 'اليوم';
  if (diffDays === 1) return 'غدًا';
  if (diffDays === -1) return 'أمس';
  const rtf = new Intl.RelativeTimeFormat('ar-EG', { numeric: 'auto' });
  if (Math.abs(diffDays) < 30) return rtf.format(diffDays, 'day');
  if (Math.abs(diffDays) < 365) return rtf.format(Math.round(diffDays / 30), 'month');
  return rtf.format(Math.round(diffDays / 365), 'year');
}

/** هل تاريخ الاستحقاق قد فات؟ */
export function isOverdue(date: Date | string | null | undefined): boolean {
  if (!date) return false;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return false;
  const endOfDay = new Date(d);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay.getTime() < Date.now();
}

/** الأحرف الأولى من الاسم للأفاتار */
export function initials(name: string | null | undefined): string {
  if (!name) return '؟';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join('');
}

/** لون ثابت مشتق من نص (لأفاتار المستخدمين) */
const AVATAR_COLORS = [
  'bg-rose-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-lime-600',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-600',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-fuchsia-500',
  'bg-pink-500',
];

export function colorFromString(str: string | null | undefined): string {
  if (!str) return 'bg-slate-400';
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** قراءة قيمة نصية من FormData وتحويل الفراغ إلى null */
export function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/** قراءة قيمة نصية مطلوبة */
export function reqStr(fd: FormData, key: string): string {
  return str(fd, key) ?? '';
}

/** قراءة رقم من FormData */
export function num(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** قراءة تاريخ من FormData */
export function date(fd: FormData, key: string): Date | null {
  const v = str(fd, key);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** اسم كامل من جزأين */
export function fullName(first: string, last?: string | null): string {
  return [first, last].filter(Boolean).join(' ');
}

/**
 * شرط بحث نصّي غير حسّاس لحالة الأحرف.
 *
 * PostgreSQL يفرّق بين الحروف الكبيرة والصغيرة في البحث، فلا يجد
 * "Ahmed" عند كتابة "ahmed". نضيف mode: 'insensitive' لحلّ ذلك — لكن
 * SQLite لا يدعم هذا الخيار (وهو أصلًا غير حسّاس)، لذا نضيفه فقط عند
 * استخدام PostgreSQL. العربية بلا حالة أحرف فلا تتأثر في الحالتين.
 */
export function search(value: string) {
  const insensitive = process.env.DATABASE_PROVIDER === 'postgresql';
  return insensitive
    ? { contains: value, mode: 'insensitive' as const }
    : { contains: value };
}
