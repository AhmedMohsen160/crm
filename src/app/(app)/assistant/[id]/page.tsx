import { notFound } from 'next/navigation';
import Link from '@/components/link';
import { Sparkles, Trash2 } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { formatDateTime } from '@/lib/utils';
import { PageHeader, ErrorAlert } from '@/components/ui';
import ConfirmSubmit from '@/components/confirm-submit';

export const metadata = { title: 'محادثة المساعد' };
export const dynamic = 'force-dynamic';

export default async function AssistantThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requirePermission('canUseAi');
  const { id } = await params;
  const { error } = await searchParams;

  const thread = await db.aiThread.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  // المحادثة ملك سائلها — لا يقرؤها غيره ولو ملك رؤية كل السجلات
  if (!thread || thread.userId !== user.id) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={thread.title} subtitle="محادثة خاصة بك">
        <Link href="/assistant" className="btn-secondary">
          كل المحادثات
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />

      <div className="mb-6 space-y-3">
        {thread.messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === 'user'
                ? 'card card-pad border-brand-200 bg-brand-50/50'
                : 'card card-pad'
            }
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">
                {m.role === 'user' ? user.name : 'المساعد'}
              </span>
              <span className="mr-auto text-[11px] text-slate-400">
                {formatDateTime(m.createdAt)}
              </span>
            </div>
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-800">
              {m.content}
            </pre>
          </div>
        ))}
      </div>

      <form method="post" action="/api/save" className="card card-pad space-y-3">
        <input type="hidden" name="entity" value="assistant.ask" />
        <input type="hidden" name="id" value={thread.id} />
        <input type="hidden" name="back" value={`/assistant/${thread.id}`} />
        <textarea
          name="question"
          rows={3}
          required
          className="input"
          placeholder="اكتب سؤالك التالي…"
        />
        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary">
            <Sparkles className="h-4 w-4" />
            أرسل
          </button>
          <span className="text-xs text-slate-400">
            المساعد يرى أرقام النظام بحدود صلاحياتك، ولا يخترع رقمًا لم يُعطَه.
          </span>
        </div>
      </form>

      <ConfirmSubmit
        action="/api/save"
        className="mt-4"
        confirmText="حذف هذه المحادثة؟ نصّها الحواري لا يُسترجع."
      >
        <input type="hidden" name="entity" value="assistant.delete" />
        <input type="hidden" name="id" value={thread.id} />
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-rose-600"
        >
          <Trash2 className="h-3.5 w-3.5" />
          حذف المحادثة
        </button>
      </ConfirmSubmit>
    </div>
  );
}
