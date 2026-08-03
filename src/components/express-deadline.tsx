'use client';

import { useState } from 'react';
import { Zap, CalendarCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * الموعد، وزر **«فوري»** بضغطة واحدة (§4.3).
 *
 * «فوري» يعني نهاية اليوم — وهو أشيع حالة في المكتب. يخفي حقل التاريخ بدل
 * أن يملأه، فالخادم هو الذي يحسب نهاية اليوم لحظة الحفظ لا لحظة فتح الشاشة.
 *
 * **وتأكيد الموعد مكتوب تحت الحقل.** نافذة التقويم التي يفتحها المتصفح
 * ملكُ المتصفح لا ملكُنا — لا نستطيع أن نضيف فيها زر «موافق». فالبديل أن
 * يُقرأ التاريخ المختار بالعربية تحت الحقل فور اختياره: تأكيدٌ يراه المستخدم
 * بلا أن ينتظر الحفظ ليعرف أنّ اختياره وقع.
 */
export default function ExpressDeadline({ defaultDeadline }: { defaultDeadline?: string }) {
  const [express, setExpress] = useState(false);
  const [value, setValue] = useState(defaultDeadline ?? '');

  const chosen = readable(value);

  return (
    <div className="mt-4">
      <span className="label">الموعد</span>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setExpress((v) => !v)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
            express
              ? 'border-amber-400 bg-amber-100 text-amber-900'
              : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
          )}
        >
          <Zap className="h-4 w-4" />
          فوري
        </button>

        {express ? (
          <input type="hidden" name="isExpress" value="on" />
        ) : (
          <input
            type="datetime-local"
            name="deadline"
            defaultValue={defaultDeadline}
            onChange={(e) => setValue(e.target.value)}
            className="input w-auto"
          />
        )}
      </div>

      {express ? (
        <p className="mt-1.5 text-xs text-amber-700">
          الموعد نهاية اليوم — يُضبط لحظة الحفظ.
        </p>
      ) : chosen ? (
        <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
          <CalendarCheck className="h-3.5 w-3.5" />
          الموعد المختار: {chosen}
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-400">اتركه فارغًا إن لم يُتفق على موعد بعد.</p>
      )}
    </div>
  );
}

/** `2026-08-04T17:00` ← «الثلاثاء ٤ أغسطس ٢٠٢٦، ٥:٠٠ م» */
function readable(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
