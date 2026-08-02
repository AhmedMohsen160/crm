'use client';

import { useEffect, useRef, useState } from 'react';
import { Phone, Loader2, UserCheck, UserPlus } from 'lucide-react';
import { formatMoney, formatDate } from '@/lib/utils';

type Found = {
  id: string;
  code: string;
  name: string;
  phone: string;
  companyName: string | null;
  dealCount: number;
  totalValue: number;
  lastDealAt: string | null;
};

/**
 * حقل الهاتف أولًا — أول عنصر في شاشة «ليد جديد» (§7.1).
 *
 * مع الكتابة يبحث في العملاء فورًا عبر `fetch` مباشر (لا تنقّل من جهة
 * المتصفح). إن وُجد العميل ظهرت بطاقته وزرّ «مشروع جديد مباشرة» — فالعميل
 * العائد لا يمرّ بمرحلة الليد أصلًا.
 *
 * البحث مؤجَّل ٢٥٠ ملّي ثانية بعد آخر حرف: يكفي ليبدو فوريًا، ويمنع نداءً
 * لكل ضغطة زر.
 */
export function PhoneLookup({ defaultValue }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue ?? '');
  const [state, setState] = useState<'idle' | 'searching' | 'found' | 'new'>('idle');
  const [client, setClient] = useState<Found | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    const digits = value.replace(/\D/g, '');
    if (digits.length < 8) {
      setState('idle');
      setClient(null);
      return;
    }

    const token = ++latest.current;
    setState('searching');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients/lookup?phone=${encodeURIComponent(value)}`);
        const data = await res.json();
        if (token !== latest.current) return; // وصلت استجابة قديمة — نتجاهلها
        if (data.found) {
          setClient(data.client);
          setState('found');
        } else {
          setClient(null);
          setState(data.valid ? 'new' : 'idle');
        }
      } catch {
        if (token === latest.current) setState('idle');
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor="phone">
          رقم الهاتف <span className="text-rose-500">*</span>
        </label>
        <div className="relative">
          <Phone className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            required
            autoFocus
            autoComplete="off"
            dir="ltr"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="01xxxxxxxxx"
            className="input py-3 pr-10 text-left text-lg"
          />
          {state === 'searching' && (
            <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-brand-500" />
          )}
        </div>
        <p className="mt-1 text-xs text-slate-400">
          اكتب الرقم وسيبحث تلقائيًا في العملاء
        </p>
      </div>

      {state === 'found' && client && (
        <div
          data-testid="client-found"
          className="rounded-lg border border-emerald-300 bg-emerald-50 p-4"
        >
          <div className="mb-3 flex items-start gap-2">
            <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">
                {client.name}
                <span className="mr-2 text-xs font-normal text-slate-500" dir="ltr">
                  {client.code}
                </span>
              </p>
              {client.companyName && (
                <p className="text-sm text-slate-600">{client.companyName}</p>
              )}
              <p className="mt-1 text-sm text-emerald-800">
                عميل مسجَّل — {client.dealCount} مشروع · إجمالي مشترياته{' '}
                {formatMoney(client.totalValue)}
                {client.lastDealAt && ` · آخر تعامل ${formatDate(client.lastDealAt)}`}
              </p>
            </div>
          </div>

          <input type="hidden" name="clientId" value={client.id} />

          <div className="flex flex-wrap gap-2">
            <a href={`/deals/new?clientId=${client.id}`} className="btn-primary">
              مشروع جديد مباشرة
            </a>
            <a href={`/clients/${client.id}`} className="btn-secondary">
              بطاقة العميل
            </a>
          </div>
          <p className="mt-2 text-xs text-emerald-700">
            أو أكمل النموذج أدناه لتسجيل ليد جديد على العميل نفسه.
          </p>
        </div>
      )}

      {state === 'new' && (
        <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <UserPlus className="h-4 w-4 text-brand-600" />
          رقم جديد — سيُنشأ عميل جديد عند الحفظ.
        </p>
      )}
    </div>
  );
}
