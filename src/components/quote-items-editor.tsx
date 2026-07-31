'use client';

import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { SERVICE_TYPES, LANGUAGES, UNITS } from '@/lib/constants';
import { formatMoney } from '@/lib/utils';

export type QuoteItemData = {
  description: string;
  serviceType: string | null;
  sourceLang: string | null;
  targetLang: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
};

type Row = QuoteItemData & { key: number };

const EMPTY: QuoteItemData = {
  description: '',
  serviceType: '',
  sourceLang: '',
  targetLang: '',
  unit: 'WORD',
  quantity: 1,
  unitPrice: 0,
};

/**
 * محرّر بنود عرض السعر — يحسب الإجمالي تلقائيًا أثناء الكتابة.
 * كل صف = خدمة (مثال: ترجمة معتمدة عربي←إنجليزي، 1500 كلمة، 1.5 ج.م للكلمة)
 */
export default function QuoteItemsEditor({
  initialItems,
  currency = 'EGP',
  initialDiscount = 0,
  initialTaxRate = 0,
}: {
  initialItems?: QuoteItemData[];
  currency?: string;
  initialDiscount?: number;
  initialTaxRate?: number;
}) {
  const [rows, setRows] = useState<Row[]>(
    (initialItems?.length ? initialItems : [EMPTY]).map((it, i) => ({ ...it, key: i }))
  );
  const [nextKey, setNextKey] = useState(rows.length);
  const [discount, setDiscount] = useState(initialDiscount);
  const [taxRate, setTaxRate] = useState(initialTaxRate);
  const [cur, setCur] = useState(currency);

  function update(key: number, patch: Partial<QuoteItemData>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, { ...EMPTY, key: nextKey }]);
    setNextKey((k) => k + 1);
  }

  function removeRow(key: number) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((r) => r.key !== key)));
  }

  const subtotal = rows.reduce((s, r) => s + (r.quantity || 0) * (r.unitPrice || 0), 0);
  const afterDiscount = Math.max(0, subtotal - (discount || 0));
  const taxAmount = afterDiscount * ((taxRate || 0) / 100);
  const total = afterDiscount + taxAmount;

  return (
    <>
      <input type="hidden" name="currency" value={cur} />

      <section className="card">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-800">بنود عرض السعر</h2>
          <button type="button" onClick={addRow} className="btn-secondary btn-sm">
            <Plus className="h-3.5 w-3.5" />
            إضافة بند
          </button>
        </div>

        <div className="space-y-4 p-4">
          {rows.map((row, i) => {
            const lineTotal = (row.quantity || 0) * (row.unitPrice || 0);
            return (
              <div key={row.key} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">
                    البند <span className="nums">{i + 1}</span>
                  </span>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="حذف البند"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="sm:col-span-2 lg:col-span-4">
                    <label className="label">وصف الخدمة</label>
                    <input
                      name={`items[${i}][description]`}
                      value={row.description}
                      onChange={(e) => update(row.key, { description: e.target.value })}
                      required
                      placeholder="مثال: ترجمة معتمدة لعقد شراكة تجارية"
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="label">نوع الخدمة</label>
                    <select
                      name={`items[${i}][serviceType]`}
                      value={row.serviceType ?? ''}
                      onChange={(e) => update(row.key, { serviceType: e.target.value })}
                      className="input"
                    >
                      <option value="">— اختر —</option>
                      {SERVICE_TYPES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label">من لغة</label>
                    <select
                      name={`items[${i}][sourceLang]`}
                      value={row.sourceLang ?? ''}
                      onChange={(e) => update(row.key, { sourceLang: e.target.value })}
                      className="input"
                    >
                      <option value="">—</option>
                      {LANGUAGES.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label">إلى لغة</label>
                    <select
                      name={`items[${i}][targetLang]`}
                      value={row.targetLang ?? ''}
                      onChange={(e) => update(row.key, { targetLang: e.target.value })}
                      className="input"
                    >
                      <option value="">—</option>
                      {LANGUAGES.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label">وحدة التسعير</label>
                    <select
                      name={`items[${i}][unit]`}
                      value={row.unit}
                      onChange={(e) => update(row.key, { unit: e.target.value })}
                      className="input"
                    >
                      {Object.entries(UNITS).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label">الكمية</label>
                    <input
                      name={`items[${i}][quantity]`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.quantity}
                      onChange={(e) => update(row.key, { quantity: Number(e.target.value) })}
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="label">سعر الوحدة</label>
                    <input
                      name={`items[${i}][unitPrice]`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.unitPrice}
                      onChange={(e) => update(row.key, { unitPrice: Number(e.target.value) })}
                      className="input"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="label">إجمالي البند</label>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800">
                      <span className="nums">{formatMoney(lineTotal, cur)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* الإجماليات */}
      <section className="card card-pad">
        <h2 className="mb-4 section-title">الإجماليات</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">العملة</label>
            <select value={cur} onChange={(e) => setCur(e.target.value)} className="input">
              {['EGP', 'USD', 'EUR', 'SAR', 'AED', 'GBP'].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">خصم (مبلغ ثابت)</label>
            <input
              name="discount"
              type="number"
              step="0.01"
              min="0"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
              className="input"
            />
          </div>
          <div>
            <label className="label">نسبة الضريبة %</label>
            <input
              name="taxRate"
              type="number"
              step="0.01"
              min="0"
              value={taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value))}
              className="input"
            />
          </div>
        </div>

        <dl className="mt-5 space-y-2 border-t border-slate-200 pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-600">المجموع الفرعي</dt>
            <dd className="font-medium nums">{formatMoney(subtotal, cur)}</dd>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-rose-700">
              <dt>الخصم</dt>
              <dd className="font-medium nums">− {formatMoney(discount, cur)}</dd>
            </div>
          )}
          {taxRate > 0 && (
            <div className="flex justify-between">
              <dt className="text-slate-600">
                الضريبة (<span className="nums">{taxRate}%</span>)
              </dt>
              <dd className="font-medium nums">{formatMoney(taxAmount, cur)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-3 text-base">
            <dt className="font-bold text-slate-900">الإجمالي النهائي</dt>
            <dd className="font-bold text-brand-700 nums">{formatMoney(total, cur)}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}
