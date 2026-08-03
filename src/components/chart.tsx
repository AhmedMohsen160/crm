import { cn } from '@/lib/utils';

/**
 * رسوم التحليلات — بلا مكتبة رسم.
 *
 * أشرطة HTML خالصة: تعمل في الخادم، وتُطبع، وتُقرأ بقارئ الشاشة، ولا تضيف
 * كيلوبايتًا واحدًا إلى المتصفح. ومع كل شريط **رقمُه مكتوبًا** — فلا يُقاس
 * شيء بالعين، ولا يعتمد المعنى على اللون وحده.
 *
 * **لونٌ واحد للمقدار** (كحلي الهوية بتدرّج واحد لا قوس قزح)، وألوان الحالة
 * (أخضر/أحمر/كهرماني) محجوزةٌ للحكم — موجب أو سالب — ولا تُستعمل «لونًا
 * رابعًا لسلسلة رابعة». والمقارنة كلها على **محور واحد**: لا محورين في رسم.
 */

export type BarRow = {
  key: string;
  label: string;
  /** يُرسم بطول نسبته من الأكبر */
  value: number;
  /** النص المعروض بجانب الشريط — الرقم بصيغته لا خامًا */
  display: string;
  /** سطر صغير تحت الاسم */
  hint?: string;
  /** حكمٌ على الصف: يلوّن الشريط ويُكتب معه دائمًا */
  tone?: 'default' | 'good' | 'bad' | 'warn';
  href?: string;
};

const TONE: Record<NonNullable<BarRow['tone']>, string> = {
  default: 'bg-brand-600',
  good: 'bg-emerald-600',
  bad: 'bg-rose-600',
  warn: 'bg-amber-500',
};

/**
 * قائمة أشرطة أفقية — الشكل الصحيح لمقارنة مقدارٍ بين فئات.
 *
 * أفقيّة لا رأسية: الأسماء عربية طويلة، والرأسي يقلبها أو يقصّها.
 */
export function BarList({
  rows,
  emptyLabel = 'لا بيانات في هذا المدى',
  max,
}: {
  rows: BarRow[];
  emptyLabel?: string;
  /** أقصى قيمة للمقياس — تُشتقّ من الصفوف حين لا تُمرَّر */
  max?: number;
}) {
  if (rows.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-slate-400">{emptyLabel}</p>;
  }

  const ceiling = Math.max(max ?? 0, ...rows.map((r) => Math.abs(r.value)), 1);

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => {
        const width = Math.max(1.5, (Math.abs(row.value) / ceiling) * 100);
        const body = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-medium text-slate-800">
                {row.label}
                {row.hint && (
                  <span className="mr-2 text-xs font-normal text-slate-400">{row.hint}</span>
                )}
              </span>
              <span className="nums shrink-0 text-sm font-semibold text-slate-900">
                {row.display}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn('h-full rounded-full transition-all', TONE[row.tone ?? 'default'])}
                style={{ width: `${width}%` }}
              />
            </div>
          </>
        );

        return (
          <li key={row.key}>
            {row.href ? (
              <a href={row.href} className="block rounded-lg p-1 -m-1 hover:bg-slate-50">
                {body}
              </a>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * أعمدة زمنية — للسنوات والشهور.
 *
 * الزمن محورٌ ترتيبه معنى، فيُرسم أعمدةً بترتيبه. والعمود الناقص يُعلَّم
 * مخطَّطًا لا يُحذف: حذفُه يُخفي أن السنة ناقصة، وتلوينُه كالكامل يكذب.
 */
export function ColumnChart({
  columns,
  height = 140,
}: {
  columns: { key: string; label: string; value: number; display: string; muted?: boolean }[];
  height?: number;
}) {
  if (columns.length === 0) return null;
  const ceiling = Math.max(...columns.map((c) => Math.abs(c.value)), 1);

  return (
    <div className="flex items-end gap-3">
      {columns.map((col) => {
        const pct = Math.max(3, (Math.abs(col.value) / ceiling) * 100);
        return (
          <div key={col.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <span className="nums text-[11px] font-semibold text-slate-700">{col.display}</span>
            {/* منطقة الرسم وحدها ذات ارتفاع ثابت — والعناوين خارجها، وإلا
                دفع العمودُ الأطولُ عنوانَه خارج الإطار فاختفى */}
            <div className="flex w-full items-end" style={{ height }}>
              <div
                className={cn(
                  'w-full rounded-t-md transition-all',
                  col.muted
                    ? 'border border-dashed border-brand-300 bg-brand-100'
                    : 'bg-gradient-to-t from-brand-700 to-marine-500'
                )}
                style={{ height: `${pct}%` }}
              />
            </div>
            <span className="truncate text-[11px] text-slate-500">{col.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * قمع المبيعات — كل مرحلة بعرضها من الأولى.
 *
 * الأشرطة **متدرّجة العرض** لأن القمع يضيق: العين تقرأ الفقد بين المرحلتين
 * قبل أن تقرأ الرقم.
 */
export function Funnel({
  steps,
}: {
  steps: { stage: string; count: number }[];
}) {
  if (steps.length === 0) return null;
  const top = Math.max(steps[0]?.count ?? 0, 1);

  return (
    <ol className="space-y-2">
      {steps.map((step, index) => {
        const share = (step.count / top) * 100;
        const previous = index > 0 ? steps[index - 1].count : null;
        const drop = previous && previous > 0 ? 1 - step.count / previous : null;
        return (
          <li key={step.stage} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-sm text-slate-600">{step.stage}</span>
            <div className="h-7 min-w-0 flex-1 overflow-hidden rounded-md bg-slate-100">
              <div
                className="flex h-full items-center justify-end rounded-md bg-gradient-to-l from-brand-600 to-marine-600 px-2"
                style={{ width: `${Math.max(6, share)}%` }}
              >
                <span className="nums text-xs font-bold text-white">{step.count}</span>
              </div>
            </div>
            <span className="nums w-16 shrink-0 text-left text-xs text-slate-400">
              {index === 0 ? '—' : drop === null ? '—' : `−${Math.round(drop * 100)}٪`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * الرقم البطل — سؤالٌ واحد بجوابٍ واحد.
 *
 * حين يكون الجواب رقمًا واحدًا فالرسم البياني تشويش. يُكتب كبيرًا ومعه
 * سطرٌ يفسّره.
 */
export function HeroNumber({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'good' | 'bad';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-5',
        tone === 'good'
          ? 'border-emerald-200 bg-emerald-50/60'
          : tone === 'bad'
            ? 'border-rose-200 bg-rose-50/60'
            : 'border-slate-200 bg-white'
      )}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p
        className={cn(
          'nums mt-1 text-3xl font-extrabold tracking-tight',
          tone === 'good' ? 'text-emerald-800' : tone === 'bad' ? 'text-rose-800' : 'text-brand-700'
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}

/** جدول الأرقام الكامل — مطويّ تحت الرسم لمن يريد الرقم بعينه */
export function NumbersDetails({
  label = 'الأرقام كاملةً',
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="mt-4 group">
      <summary className="cursor-pointer select-none text-xs font-medium text-slate-500 hover:text-brand-700">
        {label}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
