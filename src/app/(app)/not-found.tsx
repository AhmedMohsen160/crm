import Link from '@/components/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-6xl font-bold text-slate-200">404</p>
      <h1 className="text-lg font-semibold text-slate-800">الصفحة غير موجودة</h1>
      <p className="max-w-sm text-sm text-slate-500">
        قد يكون السجل محذوفًا، أو ليست لديك صلاحية الاطلاع عليه.
      </p>
      <Link href="/" className="btn-primary mt-2">
        العودة إلى لوحة التحكم
      </Link>
    </div>
  );
}
