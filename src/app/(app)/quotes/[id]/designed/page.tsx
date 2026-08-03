import { notFound } from 'next/navigation';
import Link from '@/components/link';
import { Sparkles, Trash2, Printer } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import ConfirmSubmit from '@/components/confirm-submit';

export const metadata = { title: 'العرض المصمَّم' };
export const dynamic = 'force-dynamic';

/**
 * عرض المستند المولَّد.
 *
 * يُعقَّم **مرة ثانية عند العرض** رغم تعقيمه قبل الحفظ: مستندٌ حُفظ بقواعد
 * الأمس قد يُعرض بقواعد اليوم، والتعقيم المزدوج أرخص من ثقةٍ في صفٍّ قديم.
 */
export default async function DesignedQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('canViewSellPrice');
  const { id } = await params;

  const quote = await db.quote.findUnique({
    where: { id },
    select: { id: true, number: true, title: true, designHtml: true },
  });
  if (!quote) notFound();

  if (!quote.designHtml) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card card-pad text-center">
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="mb-4 text-slate-600">لم يُصمَّم هذا العرض بعد.</p>
          <Link href={`/quotes/${id}/design`} className="btn-primary">
            صمّمه الآن
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <h1 className="text-lg font-bold text-slate-800">
          {quote.number} · {quote.title}
        </h1>
        <div className="mr-auto flex flex-wrap items-center gap-2">
          {/* الطباعة من الصفحة المستقلّة لا من الإطار: طباعة الإطار تقصّه
              عند حدّ ارتفاعه، فتُطبع الصفحة الأولى وحدها */}
          <a
            href={`/api/quote-design/${id}`}
            target="_blank"
            rel="noreferrer"
            className="btn-primary"
          >
            <Printer className="h-4 w-4" />
            افتح للطباعة / PDF
          </a>
          <Link href={`/quotes/${id}/design`} className="btn-secondary">
            <Sparkles className="h-4 w-4" />
            أعد التصميم
          </Link>
          <Link href={`/quotes/${id}`} className="btn-secondary">
            العرض القياسي
          </Link>
          <ConfirmSubmit
            action="/api/save"
            confirmText="حذف التصميم المولَّد؟ يبقى العرض القياسي كما هو."
          >
            <input type="hidden" name="entity" value="quote.clearDesign" />
            <input type="hidden" name="id" value={id} />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 className="h-4 w-4" />
              احذف التصميم
            </button>
          </ConfirmSubmit>
        </div>
      </div>

      {/*
        المستند داخل إطار معزول: `sandbox` بلا `allow-scripts` يمنع تنفيذ أي
        شيء ولو أفلت من التعقيم، و`srcDoc` يبقيه بلا أصل يشارك جلستنا.
      */}
      {/*
        المستند داخل إطار معزول: `sandbox` بلا `allow-scripts` يمنع التنفيذ ولو
        أفلت شيء من التعقيم، والمسار نفسه يرسل سياسة محتوى تمنع كل سكربت.
      */}
      <iframe
        title={`عرض ${quote.number}`}
        src={`/api/quote-design/${id}`}
        sandbox=""
        className="h-[297mm] w-full rounded-xl border border-slate-200 bg-white shadow-sm"
      />
    </div>
  );
}
