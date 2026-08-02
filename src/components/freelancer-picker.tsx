'use client';

import { useMemo, useState } from 'react';
import { Search, Star, X } from 'lucide-react';
import { FREELANCER_TIERS, RATE_UNITS, matchesQuery } from '@/lib/freelancers';

export type PickerRow = {
  id: string;
  code: string | null;
  name: string;
  langs: string[];
  specialisations: string[];
  defaultRate: number | null;
  rateUnit: string;
  currency: string;
  tier: string;
  rating: number | null;
  projectsCount: number;
  lastUsedAt: string | null;
};

/**
 * محرّك اختيار الفريلانسر (§١١) — **مصمَّم لألف اسم**.
 *
 * ١) لا قائمة منسدلة: عند ألف اسم تصير عديمة الفائدة.
 * ٢) **الفهرس محمَّل مرة واحدة** مع الصفحة، والبحث يقع في المتصفح —
 *    فلا نداء للخادم عند كل حرف، والنتيجة فورية لا «≤٣٠٠ ملّي ثانية».
 * ٣) الافتراضي: **المعتمدون** وحدهم، وزر واحد يكشف الباقي.
 * ٤) الترتيب جاهز من الخادم: معتمد ← الأرخص ← الأعلى تقييمًا ← الأكثر
 *    عملًا ← الأحدث.
 */
export default function FreelancerPicker({
  rows,
  name,
  label,
  hint,
  required,
  selectedId,
  onSelect,
  showRates,
}: {
  rows: PickerRow[];
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  selectedId?: string | null;
  onSelect?: (row: PickerRow | null) => void;
  showRates: boolean;
}) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [chosen, setChosen] = useState<PickerRow | null>(
    rows.find((r) => r.id === selectedId) ?? null
  );

  const visible = useMemo(() => {
    const pool = showAll ? rows : rows.filter((r) => r.tier === 'approved');
    const base = pool.length === 0 && !showAll ? rows : pool;
    const filtered = query ? base.filter((r) => matchesQuery(r.name, query)) : base;
    return filtered.slice(0, 40);
  }, [rows, query, showAll]);

  const approvedCount = rows.filter((r) => r.tier === 'approved').length;

  function pick(row: PickerRow | null) {
    setChosen(row);
    setQuery('');
    onSelect?.(row);
  }

  return (
    <div>
      <label className="label" htmlFor={`${name}-search`}>
        {label} {required && <span className="text-rose-500">*</span>}
      </label>

      <input type="hidden" name={name} value={chosen?.id ?? ''} />

      {chosen ? (
        <div
          data-testid={`${name}-chosen`}
          className="flex items-center justify-between gap-3 rounded-lg border border-brand-300 bg-brand-50 px-4 py-3"
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-800">{chosen.name}</p>
            <p className="text-xs text-slate-500">
              {chosen.code} · {FREELANCER_TIERS[chosen.tier as keyof typeof FREELANCER_TIERS] ?? chosen.tier}
              {chosen.rating !== null && ` · تقييم ${chosen.rating}/10`}
              {showRates &&
                (chosen.defaultRate
                  ? ` · ${chosen.defaultRate} ${chosen.currency} / ${
                      RATE_UNITS[chosen.rateUnit as keyof typeof RATE_UNITS] ?? chosen.rateUnit
                    }`
                  : ' · لم يُتفق على سعر')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => pick(null)}
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-white hover:text-rose-600"
            title="تغيير"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <input
              id={`${name}-search`}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="اكتب أول حروف الاسم"
              autoComplete="off"
              className="input pr-9"
            />
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>

          <div
            data-testid={`${name}-results`}
            className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200"
          >
            {visible.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">
                لا مترجم مطابق{query ? ` لـ«${query}»` : ''}
                {!showAll && ' بين المعتمدين'}
              </p>
            ) : (
              visible.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => pick(row)}
                  className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5 text-right last:border-0 hover:bg-brand-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {row.name}
                    </span>
                    <span className="block text-xs text-slate-400">
                      {row.langs.join(' · ') || 'لغات غير مسجَّلة'}
                      {row.projectsCount > 0 && ` · ${row.projectsCount} مشروعًا معنا`}
                    </span>
                  </span>
                  <span className="shrink-0 text-left">
                    {showRates && (
                      <span className="block nums text-sm text-slate-700">
                        {row.defaultRate ? row.defaultRate : '—'}
                      </span>
                    )}
                    {row.rating !== null && (
                      <span className="flex items-center gap-0.5 text-xs text-amber-600">
                        <Star className="h-3 w-3 fill-current" />
                        {row.rating}
                      </span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
            <span>{hint}</span>
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="link"
            >
              {showAll ? `المعتمدون فقط (${approvedCount})` : `عرض الكل (${rows.length})`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
