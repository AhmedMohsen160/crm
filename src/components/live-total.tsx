'use client';

import { useEffect, useRef, useState } from 'react';
import { FormField, SelectField } from '@/components/ui';
import { formatMoney } from '@/lib/utils';

/** بند من قائمة الأسعار — يصل من الخادم مرة واحدة مع الصفحة */
export type PriceListEntry = {
  serviceLine: string;
  langFrom: string;
  langTo: string;
  unitPrice: number;
};

/**
 * حاسبة السعر أمام عين المستخدم.
 *
 * كان الإجمالي والخصم يُحسبان في الخادم فلا يظهران إلا **بعد** الحفظ.
 * والحساب هنا **عرضٌ لا قرار**: الرقم المعتمد يبقى ما يحسبه الخادم من
 * قائمة الأسعار ورسم الاستعجال وشرائح الكمية وخصم العميل المتكرر. ولذلك
 * يُسمّى «تقديري» صراحةً، ولا يُكتب في حقل مخفيّ يتجاوز الخادم.
 *
 * والنموذج يعمل بلا جافاسكربت كما كان: الحقول حقولٌ عادية تُرسل بأسمائها،
 * وما يضيفه هذا المكوّن هو الرقم المعروض وحده.
 *
 * **ونسبة الخصم تُكتب مئويّة** (١٠ تعني ١٠٪) كما في شاشة عرض السعر — وكانت
 * تُطلب عشريّة هنا وحدها، فمن كتب «١٠» منح ألفًا بالمئة.
 */
export default function LiveTotal({
  currency = 'EGP',
  defaultPages,
  defaultUnitPrice,
  defaultNetTotal,
  defaultDiscountType,
  defaultDiscountPercent,
  defaultDiscountAmount,
  discountTypes,
  discountHint,
  showPrice,
  canDiscount,
  priceList = [],
}: {
  currency?: string;
  defaultPages?: number | null;
  defaultUnitPrice?: number | null;
  defaultNetTotal?: number | null;
  defaultDiscountType?: string | null;
  defaultDiscountPercent?: number | null;
  defaultDiscountAmount?: number | null;
  discountTypes: { value: string; label: string }[];
  discountHint: string;
  showPrice: boolean;
  canDiscount: boolean;
  priceList?: PriceListEntry[];
}) {
  const [pages, setPages] = useState(defaultPages ?? null);
  const [unitPrice, setUnitPrice] = useState(defaultUnitPrice ?? null);
  const [discountType, setDiscountType] = useState(defaultDiscountType ?? '');
  const [percent, setPercent] = useState(defaultDiscountPercent ?? null);
  const [amount, setAmount] = useState(defaultDiscountAmount ?? null);
  /** السعر الساري لخط الخدمة وزوج اللغات المختارَين — من القائمة لا من اليد */
  const [listPrice, setListPrice] = useState<number | null>(null);

  const num = (raw: string) => {
    const value = Number(raw);
    return raw.trim() === '' || !Number.isFinite(value) ? null : value;
  };

  /**
   * **سعر القائمة يظهر قبل الحفظ لا بعده.**
   *
   * خط الخدمة واللغتان في قسمٍ آخر من النموذج، فتُقرأ قيمها من النموذج نفسه
   * عند أي تغيير — بدل نقل الحقول من مكانها الطبيعي في الشاشة.
   *
   * وهذا **عرضٌ لا قرار**: الخادم يقرأ القائمة بنفسه عند الحفظ، فمن عطّل
   * جافاسكربت يُسعَّر مشروعه صحيحًا كما كان.
   */
  const anchor = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = anchor.current?.form;
    if (!form || priceList.length === 0) return;

    const read = () => {
      const value = (name: string) =>
        (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '';
      const line = value('serviceLine');
      const from = value('sourceLang');
      const to = value('targetLang');
      if (!line || !from || !to) return setListPrice(null);
      const match = priceList.find(
        (p) => p.serviceLine === line && p.langFrom === from && p.langTo === to
      );
      setListPrice(match?.unitPrice ?? null);
    };

    read();
    form.addEventListener('change', read);
    return () => form.removeEventListener('change', read);
  }, [priceList]);

  /** ما يُحسب به: المكتوب باليد يعلو على القائمة */
  const effectivePrice = unitPrice ?? listPrice;

  /**
   * **الصفحة هي الوحدة، والإجمالي مشتقّ منها ومن سعرها.**
   *
   * كانت هناك خانةٌ ثالثة اسمها «إجمالي المشروع» تُكتب باليد — فصار للرقم
   * الواحد مصدران يختلفان، ولا يُعرف أيّهما الصحيح حين يختلفان. حُذفت،
   * والإجمالي يُحسب: هنا للعرض، وفي الخادم للحفظ.
   */
  const gross =
    pages !== null && effectivePrice !== null
      ? pages * effectivePrice
      : (defaultNetTotal ?? null);

  const discount =
    gross === null
      ? null
      : discountType === 'percent' && percent !== null
        ? (gross * percent) / 100
        : discountType === 'amount' && amount !== null
          ? amount
          : null;

  const net = gross === null ? null : Math.max(0, gross - (discount ?? 0));

  return (
    <>
      <input ref={anchor} type="hidden" name="__priceAnchor" value="" />
      <FormField
        label="عدد الصفحات"
        name="pages"
        type="number"
        step="0.5"
        min="0"
        required
        defaultValue={defaultPages}
        onChange={(e) => setPages(num(e.target.value))}
      />

      {showPrice && (
        <>
          <FormField
            label="سعر الصفحة"
            name="unitPrice"
            type="number"
            step="0.01"
            min="0"
            dir="ltr"
            defaultValue={defaultUnitPrice}
            hint={
              listPrice !== null
                ? `قائمة الأسعار: ${listPrice} لهذا الزوج — اتركه فارغًا ليُؤخذ منها`
                : 'اتركه فارغًا ليُقرأ من قائمة الأسعار تلقائيًا'
            }
            onChange={(e) => setUnitPrice(num(e.target.value))}
          />
        </>
      )}

      {canDiscount && (
        <>
          <SelectField
            label="نوع الخصم"
            name="discountType"
            defaultValue={defaultDiscountType}
            placeholder="بلا خصم"
            options={discountTypes}
            onChange={(e) => setDiscountType(e.target.value)}
          />
          {discountType === 'amount' ? (
            <FormField
              label="مبلغ الخصم"
              name="discountValue"
              type="number"
              step="0.01"
              min="0"
              dir="ltr"
              defaultValue={defaultDiscountAmount}
              hint={discountHint}
              onChange={(e) => setAmount(num(e.target.value))}
            />
          ) : (
            <FormField
              label="نسبة الخصم ٪"
              name="discountPercent"
              type="number"
              step="0.5"
              min="0"
              max="100"
              dir="ltr"
              defaultValue={defaultDiscountPercent}
              hint={`اكتبها مئويّة: ١٠ تعني ١٠٪ · ${discountHint}`}
              onChange={(e) => setPercent(num(e.target.value))}
            />
          )}
        </>
      )}

      {showPrice && gross !== null && (
        <div className="sm:col-span-2 rounded-lg border border-brand-200 bg-brand-50/60 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-sm">
            <span className="text-slate-600">
              الإجمالي قبل الخصم
              {pages !== null && effectivePrice !== null && (
                <span className="mr-1 text-xs text-slate-400">
                  ({pages} صفحة × {effectivePrice}
                  {unitPrice === null && listPrice !== null ? ' من القائمة' : ''})
                </span>
              )}
            </span>
            <span className="nums font-medium text-slate-800">{formatMoney(gross, currency)}</span>
          </div>
          {discount !== null && discount > 0 && (
            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-6 text-sm">
              <span className="text-slate-600">
                الخصم
                {discountType === 'percent' && percent !== null && (
                  <span className="mr-1 text-xs text-slate-400">({percent}٪)</span>
                )}
              </span>
              <span className="nums font-medium text-rose-700">
                − {formatMoney(discount, currency)}
              </span>
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-6 border-t border-brand-200 pt-1 text-sm">
            <span className="font-semibold text-slate-700">الصافي التقديري</span>
            <span className="nums text-base font-bold text-brand-700">
              {formatMoney(net ?? 0, currency)}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
            تقديري — وقد يختلف عند الحفظ بقائمة الأسعار ورسم الاستعجال وشرائح الكمية
            وخصم العميل المتكرر.
          </p>
        </div>
      )}
    </>
  );
}
