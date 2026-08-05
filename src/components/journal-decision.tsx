'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import Link from '@/components/link';
import { Badge } from '@/components/ui';
import { ENTRY_STATUSES } from '@/lib/accounting';

const STATUS_STYLE: Record<string, string> = {
  draft: 'border-amber-200 bg-amber-50 text-amber-700',
  posted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  void: 'border-slate-300 bg-slate-100 text-slate-400',
};

/** إشارة داخل الصفحة: قيدٌ رُحِّل، فتُصحِّح الترويسة عدّتها */
const POSTED_EVENT = 'journal:posted';

/**
 * خانتا «الحال» و«الإجراء» في دفتر اليومية.
 *
 * **الترحيل ضغطةٌ لا رحلة.** كان الزر نموذجًا يُرسل ثم يُحوِّل، فتُبنى
 * الصفحة كلها من جديد — مئتا قيدٍ وحساباتها — لأجل تغيير كلمةٍ في صفٍّ
 * واحد. والمحاسب يرحّل عشرات القيود في الجلسة، فيدفع الانتظار عشرات المرات.
 *
 * فصار الطلب يذهب وحده ويعود بنتيجته، ويُبدَّل الصفّ في مكانه. **والقواعد
 * لم تتغيّر**: نفس بوابة `/api/save` ونفس فحص الصلاحية ونفس سجلّ التدقيق —
 * ما تغيّر شكل الردّ لا مساره.
 *
 * **ويعمل بلا جافاسكربت**: ما تراه نموذج POST عاديّ بأزراره وحقوله؛ فإن لم
 * يعمل الجافاسكربت أُرسل كما كان وعاد المحاسب إلى القائمة بشهرها.
 */
export function JournalDecision({
  id,
  period,
  status: initialStatus,
  postedBy: initialPostedBy,
  currentUserName,
  locked,
}: {
  id: string;
  period: string;
  status: string;
  /** اسم من رحّله — إن كان مرحَّلًا */
  postedBy: string | null;
  /** اسم المستخدم الحالي — يُوقَّع به الصفّ فور نجاح الترحيل */
  currentUserName: string;
  /** الشهر مقفل: للعرض فقط */
  locked: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [postedBy, setPostedBy] = useState(initialPostedBy);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const back = `/finance/journal?period=${period}`;

  async function post(event: React.FormEvent<HTMLFormElement>) {
    // بلا جافاسكربت لا يصل هذا السطر أصلًا، فيمضي النموذج بطريقه المعتاد
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const body = new URLSearchParams({
        entity: 'journalEntry.decide',
        id,
        action: 'post',
        stay: '1',
        period,
        back,
        json: '1',
      });
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !result.ok) {
        setError(result.error ?? 'تعذّر الترحيل. حاول مرة أخرى.');
        return;
      }

      setStatus('posted');
      setPostedBy(currentUserName);
      window.dispatchEvent(new CustomEvent(POSTED_EVENT));
    } catch {
      setError('انقطع الاتصال — لم يُرحَّل القيد. حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <td>
        <Badge className={STATUS_STYLE[status] ?? STATUS_STYLE.draft}>
          {ENTRY_STATUSES[status as keyof typeof ENTRY_STATUSES] ?? status}
        </Badge>
        {postedBy && status === 'posted' && (
          <span className="block text-[11px] text-slate-400">رحّله {postedBy}</span>
        )}
      </td>

      <td className="text-left">
        {status === 'draft' && !locked ? (
          <form method="post" action="/api/save" className="inline" onSubmit={post}>
            <input type="hidden" name="entity" value="journalEntry.decide" />
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="action" value="post" />
            <input type="hidden" name="stay" value="1" />
            <input type="hidden" name="period" value={period} />
            <input type="hidden" name="back" value={back} />
            <button
              type="submit"
              disabled={busy}
              data-testid="post-entry"
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {busy ? 'جارٍ الترحيل' : 'اعتماد وترحيل'}
            </button>
            {error && (
              <span className="mt-1 flex items-center justify-end gap-1 text-[11px] text-rose-600">
                <AlertCircle className="h-3 w-3 shrink-0" />
                {error}
              </span>
            )}
          </form>
        ) : (
          <Link
            href={`/finance/journal/${id}`}
            className="btn-secondary whitespace-nowrap px-2.5 py-1.5 text-xs"
          >
            فتح
          </Link>
        )}
      </td>
    </>
  );
}

/**
 * عدّاد الترويسة — يتحرّك مع كل ترحيل بلا إعادة بناء الصفحة.
 *
 * لولاه لبقيت الترويسة تقول «١٢ مسوَّدة» بعد أن رُحِّلت منها خمسة، فيشكّ
 * المحاسب في أن ضغطاته وصلت أصلًا.
 */
export function JournalTally({
  drafts: initialDrafts,
  posted: initialPosted,
  prefix,
}: {
  drafts: number;
  posted: number;
  /** اسم الشهر — يسبق العدّتين */
  prefix: string;
}) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [posted, setPosted] = useState(initialPosted);

  useEffect(() => {
    function onPosted() {
      setDrafts((n) => Math.max(0, n - 1));
      setPosted((n) => n + 1);
    }
    window.addEventListener(POSTED_EVENT, onPosted);
    return () => window.removeEventListener(POSTED_EVENT, onPosted);
  }, []);

  return (
    <span data-testid="journal-tally">
      {prefix} — {drafts} مسوَّدة · {posted} مرحَّل
    </span>
  );
}
