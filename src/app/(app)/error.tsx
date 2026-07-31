'use client';

import { useEffect } from 'react';
import Link from '@/components/link';
import { AlertTriangle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <AlertTriangle className="h-12 w-12 text-amber-500" />
      <h1 className="text-lg font-semibold text-slate-800">حدث خطأ</h1>
      <p className="max-w-md rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-600">
        {error.message || 'خطأ غير متوقع. حاول مرة أخرى.'}
      </p>
      <div className="mt-2 flex gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          إعادة المحاولة
        </button>
        <Link href="/" className="btn-secondary">
          لوحة التحكم
        </Link>
      </div>
    </div>
  );
}
