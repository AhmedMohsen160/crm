import Link from '@/components/link';
import { Sparkles, MessageSquare } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { aiEnabled } from '@/lib/ai-client';
import { formatDateTime } from '@/lib/utils';
import { PageHeader, EmptyState, ErrorAlert } from '@/components/ui';

export const metadata = { title: 'المساعد' };
export const dynamic = 'force-dynamic';

/** أسئلة جاهزة — أسرع من صفحة فارغة، وتُعلّم ما يُسأل عنه أصلًا */
const STARTERS = [
  'ما أهم ما ينتظرني اليوم؟',
  'كم ليدًا مفتوحًا لديّ، وأيها تأخّر التواصل معه؟',
  'ما المشاريع المتأخرة عن موعدها؟',
  'لخّص أداء هذا الشهر مقارنةً بما قبله',
];

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requirePermission('canUseAi');
  const { error } = await searchParams;

  const threads = await db.aiThread.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    take: 30,
    include: { _count: { select: { messages: true } } },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="المساعد"
        subtitle="يقرأ أرقام النظام — بحدود ما تراه أنت لا أكثر"
      />
      <ErrorAlert message={error} />

      {!aiEnabled() && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          المساعد غير مفعَّل — يلزم ضبط <code dir="ltr">ANTHROPIC_API_KEY</code> في متغيّرات البيئة.
        </p>
      )}

      <form method="post" action="/api/save" className="card card-pad mb-6 space-y-3">
        <input type="hidden" name="entity" value="assistant.start" />
        <input type="hidden" name="id" value="" />
        <input type="hidden" name="back" value="/assistant" />
        <label className="label" htmlFor="question">
          اسأل
        </label>
        <textarea
          id="question"
          name="question"
          rows={3}
          required
          className="input"
          placeholder="ما أهم ما ينتظرني اليوم؟"
        />
        <div className="flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <span key={s} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
              {s}
            </span>
          ))}
        </div>
        <button type="submit" className="btn-primary">
          <Sparkles className="h-4 w-4" />
          اسأل المساعد
        </button>
      </form>

      {threads.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-8 w-8" />}
          title="لا محادثات بعد"
          description="محادثاتك خاصة بك — لا يقرؤها زميل ولا مدير."
        />
      ) : (
        <div className="space-y-2">
          {threads.map((t) => (
            <Link
              key={t.id}
              href={`/assistant/${t.id}`}
              className="card flex items-center gap-3 px-4 py-3 transition-colors hover:border-brand-300"
            >
              <MessageSquare className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                {t.title}
              </span>
              <span className="shrink-0 text-xs text-slate-400">
                {t._count.messages} رسالة · {formatDateTime(t.updatedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
