'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

/**
 * زر الرجوع خطوةً للوراء.
 *
 * **السهم إلى اليمين** لا اليسار: الواجهة عربية، والرجوع في اتجاه القراءة.
 *
 * ولا يظهر إلا حين يكون في التاريخ ما يُرجع إليه: زرٌّ لا يفعل شيئًا أسوأ
 * من غياب الزر. ولذلك يُفحص `history.length` عند أول رسم.
 */
export default function BackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      title="رجوع خطوة للوراء"
      aria-label="رجوع خطوة للوراء"
      className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 sm:inline-flex"
    >
      <ArrowRight className="h-4 w-4" />
      <span className="hidden md:inline">رجوع</span>
    </button>
  );
}
