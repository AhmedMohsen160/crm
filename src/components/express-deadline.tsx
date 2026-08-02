'use client';

import { useState } from 'react';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * الموعد، وزر **«فوري»** بضغطة واحدة (§4.3).
 *
 * الضغط على «فوري» يعني نهاية اليوم — وهو أشيع حالة في المكتب. يخفي حقل
 * التاريخ بدل أن يملأه، فالخادم هو الذي يحسب نهاية اليوم لحظة الحفظ لا
 * لحظة فتح الشاشة.
 */
export default function ExpressDeadline({ defaultDeadline }: { defaultDeadline?: string }) {
  const [express, setExpress] = useState(false);

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
          فوري — نهاية اليوم
        </button>

        {express ? (
          <input type="hidden" name="isExpress" value="on" />
        ) : (
          <input
            type="datetime-local"
            name="deadline"
            defaultValue={defaultDeadline}
            className="input w-auto"
          />
        )}
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {express
          ? 'سيُضبط الموعد على نهاية اليوم تلقائيًا.'
          : 'اتركه فارغًا إن لم يُتفق على موعد بعد.'}
      </p>
    </div>
  );
}
