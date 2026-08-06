'use client';

import { useState } from 'react';
import { Wallet, Loader2, Check, AlertCircle } from 'lucide-react';
import { formatMoney } from '@/lib/utils';

/**
 * تحصيل من الصف — بلا فتح المشروع.
 *
 * **أدمن المبيعات يحصّل عشرة مشاريع في الجلسة**، وكان كلٌّ منها رحلةً: يفتح
 * البطاقة، ويقرأ المتبقي، ويكتبه، ويحفظ، ويعود. فصار الزرّ في الصف: يفتح
 * لوحةً صغيرة **بالمتبقي مكتوبًا سلفًا**، فيؤكّد أو يعدّل المبلغ إن كانت
 * دفعةً جزئية.
 *
 * **والمبلغ المرسَل هو دفعةُ اليوم لا الرصيد كلّه** — الخادم يجمعها على ما
 * سبق. ولو حَسَبَ المتصفحُ المجموع، لكفى أن يفتح أدمنان الصفَّ نفسه في
 * لحظتين متقاربتين حتى تُكتب دفعةٌ فوق أختها فيضيع مبلغٌ من الدفتر.
 *
 * **وتعمل بلا جافاسكربت**: اللوحة `<details>` أصيلة، والنموذج POST عاديّ
 * يعود بالمحصِّل إلى حيث كان.
 */
export default function CollectButton({
  id,
  balance,
  back,
  compact = false,
}: {
  id: string;
  /** المتبقي على المشروع — يُقترح مبلغًا للتحصيل */
  balance: number;
  /** الصفحة التي يعود إليها النموذج العاديّ عند تعطّل الجافاسكربت */
  back: string;
  compact?: boolean;
}) {
  const [amount, setAmount] = useState(balance > 0 ? String(balance) : '');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function collect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          entity: 'project.move',
          id,
          status: 'collected',
          collectNow: amount,
          back,
          json: '1',
        }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        setError(result.error ?? 'تعذّر تسجيل التحصيل. حاول مرة أخرى.');
        return;
      }
      setDone(true);
    } catch {
      setError('انقطع الاتصال — لم يُسجَّل التحصيل. حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <span
        data-testid="collected-ok"
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700"
      >
        <Check className="h-3.5 w-3.5" />
        حُصّل {formatMoney(Number(amount) || 0)}
      </span>
    );
  }

  return (
    <details className="inline-block text-right">
      <summary
        data-testid="collect-open"
        className="inline-flex cursor-pointer list-none items-center gap-1 whitespace-nowrap rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
      >
        <Wallet className="h-3.5 w-3.5" />
        تحصيل
      </summary>

      <div className="absolute z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
        <p className="mb-2 text-xs text-slate-500">
          المتبقي <b className="text-slate-800 nums">{formatMoney(balance)}</b>
        </p>

        <form method="post" action="/api/save" onSubmit={collect} className="space-y-2">
          <input type="hidden" name="entity" value="project.move" />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="collected" />
          <input type="hidden" name="back" value={back} />

          <label className="block text-xs font-medium text-slate-600">
            المبلغ المحصَّل الآن
            <input
              type="number"
              name="collectNow"
              step="0.01"
              min="0.01"
              max={balance}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input mt-1 text-sm"
            />
          </label>

          {/* الجزئي مقصود: العميل يدفع على دفعات ولا يُجبَر على السداد كاملًا */}
          <p className="text-[11px] text-slate-400">
            عدّله إن كانت دفعةً جزئية — تُجمَع على ما سبق.
          </p>

          {error && (
            <p className="flex items-start gap-1 text-[11px] text-rose-600">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            data-testid="collect-confirm"
            className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {busy ? 'جارٍ التسجيل' : 'تأكيد التحصيل'}
          </button>
        </form>
      </div>

      {compact && <span className="sr-only">تحصيل</span>}
    </details>
  );
}
