import { notFound } from 'next/navigation';
import Link from '@/components/link';
import { Sparkles, Globe, FileText } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission, can } from '@/lib/auth';
import { aiEnabled } from '@/lib/ai-client';
import { PROMPT_PRESETS } from '@/lib/quote-design';
import { formatDateTime } from '@/lib/utils';
import { PageHeader, ErrorAlert, FormField } from '@/components/ui';

export const metadata = { title: 'تصميم العرض بالذكاء الاصطناعي' };
export const dynamic = 'force-dynamic';

/**
 * الطريق الثاني لعرض السعر.
 *
 * خطوتان مقصودتان لا واحدة: **يُقرأ الموقع أولًا ويُعرض ما قُرئ**، ثم يُصمَّم.
 * لأن التوليد بلا مراجعة موجزٍ يُنتج عرضًا عن شركة أخرى حين يخطئ الرابط،
 * ولا يكتشفه أحد إلا بعد إرساله للعميل.
 */
export default async function QuoteDesignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requirePermission('canViewSellPrice');
  const { id } = await params;
  const { error } = await searchParams;

  const quote = await db.quote.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: 'asc' }, select: { description: true } },
      company: { select: { name: true, website: true } },
    },
  });
  if (!quote) notFound();

  const ready = aiEnabled() && can(user, 'canUseAi');

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="تصميم العرض بالذكاء الاصطناعي"
        subtitle={`${quote.number} · ${quote.title}`}
      >
        <Link href={`/quotes/${id}`} className="btn-secondary">
          رجوع للعرض
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />

      {!ready && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          التصميم الذكي غير متاح — يلزم مفتاح <code dir="ltr">ANTHROPIC_API_KEY</code> وصلاحية
          «المساعد الذكي».
        </p>
      )}

      {quote.items.length === 0 && (
        <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          العرض بلا بنود — أضف بندًا واحدًا على الأقل قبل التصميم، فالتصميم ينقل الأرقام
          ولا يخترعها.
        </p>
      )}

      {/* ── ١) قراءة موقع العميل ───────────────────────── */}
      <section className="card card-pad mb-5">
        <h2 className="mb-1 flex items-center gap-2 section-title">
          <Globe className="h-4 w-4 text-brand-600" />
          ١ · موقع العميل
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          يُقرأ الموقع ليُستوحى منه أسلوب العرض ومحتواه: طبيعة عمل العميل، ولغته،
          وألوان هويته. خطوة اختيارية — والتصميم يعمل بدونها.
        </p>

        <form method="post" action="/api/save" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="entity" value="quote.readSite" />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="back" value={`/quotes/${id}/design`} />
          <FormField
            label="رابط الموقع"
            name="clientWebsite"
            dir="ltr"
            className="min-w-64 flex-1"
            defaultValue={quote.clientWebsite ?? quote.company?.website}
            placeholder="example.com"
          />
          <button type="submit" className="btn-secondary">
            اقرأ الموقع
          </button>
        </form>

        {quote.clientBrief && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-1 text-xs font-bold text-slate-600">ما قُرئ من الموقع</p>
            <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-slate-600">
              {quote.clientBrief}
            </pre>
          </div>
        )}
      </section>

      {/* ── ٢) التوجيه والتوليد ────────────────────────── */}
      <section className="card card-pad">
        <h2 className="mb-1 flex items-center gap-2 section-title">
          <Sparkles className="h-4 w-4 text-brand-600" />
          ٢ · توجيهك للمصمّم
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          اكتب ما يميّز هذا العرض: نوع المشروع، ونبرة الخطاب، وما تريد إبرازه.
          الأرقام والبنود تُنقل من العرض كما هي — ولا يُخترع سعر ولا موعد.
        </p>

        <form method="post" action="/api/save" className="space-y-4">
          <input type="hidden" name="entity" value="quote.design" />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="back" value={`/quotes/${id}/design`} />

          <div>
            <label className="label" htmlFor="instruction">
              التوجيه
            </label>
            <textarea
              id="instruction"
              name="instruction"
              rows={5}
              className="input"
              defaultValue={quote.designPrompt ?? ''}
              placeholder="مثال: العميل شركة مقاولات سعودية، والعرض لترجمة عقود. نبرة رسمية، وأبرز الاعتماد والسرّية والالتزام بالمواعيد."
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-bold text-slate-600">نقاط بدء — انسخ وعدّل</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PROMPT_PRESETS.map((preset) => (
                <div
                  key={preset.label}
                  className="rounded-lg border border-slate-200 bg-slate-50/60 p-3"
                >
                  <p className="text-sm font-medium text-slate-800">{preset.label}</p>
                  <p className="mb-1.5 text-[11px] text-slate-400">{preset.hint}</p>
                  <p className="text-xs leading-relaxed text-slate-600">{preset.prompt}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-primary" disabled={!ready}>
              <Sparkles className="h-4 w-4" />
              {quote.designHtml ? 'أعد التصميم' : 'صمّم العرض'}
            </button>
            {quote.designHtml && (
              <Link href={`/quotes/${id}/designed`} className="btn-secondary">
                <FileText className="h-4 w-4" />
                افتح التصميم الحالي
              </Link>
            )}
            <span className="text-xs text-slate-400">
              قد يستغرق دقيقة — لا تغلق الصفحة.
            </span>
          </div>
        </form>

        {quote.designedAt && (
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
            آخر تصميم {formatDateTime(quote.designedAt)}
            {quote.designModel ? ` · ${quote.designModel}` : ''}
          </p>
        )}
      </section>
    </div>
  );
}
