import Link from '@/components/link';
import { Mail, RefreshCw, PenLine, Paperclip } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/auth';
import { visibleMailboxes } from '@/lib/email-engine';
import { EMAIL_INTENTS, EMAIL_URGENCY, type EmailIntent } from '@/lib/email';
import { aiEnabled } from '@/lib/ai-client';
import { formatDate } from '@/lib/utils';
import { PageHeader, Badge, EmptyState, ErrorAlert } from '@/components/ui';
import { FilterBar, SearchInput, FilterSelect } from '@/components/filters';

export const metadata = { title: 'البريد' };
export const dynamic = 'force-dynamic';

const URGENCY_STYLE: Record<string, string> = {
  high: 'border-rose-200 bg-rose-50 text-rose-700',
  normal: 'border-slate-200 bg-slate-50 text-slate-600',
  low: 'border-slate-200 bg-slate-50 text-slate-400',
};

/**
 * صندوق بريد النظام.
 *
 * المعروض هنا **الوارد الذي ينتظر ردًّا** أولًا: قائمة بريد مرتّبة بالتاريخ
 * تُخفي ما تأخّر أسبوعًا خلف ما وصل قبل دقيقة.
 */
export default async function EmailPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    intent?: string;
    mailbox?: string;
    state?: string;
    error?: string;
    synced?: string;
  }>;
}) {
  const user = await requirePermission('canUseEmail');
  const { q, intent, mailbox, state, error, synced } = await searchParams;

  const boxes = await visibleMailboxes(user.id, can(user, 'canViewAllLeads'));

  if (!boxes.length) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="البريد" subtitle="لا صندوق مربوط بعد" />
        <EmptyState
          icon={<Mail className="h-8 w-8" />}
          title="لا صندوق بريد مربوط"
          description="يُربط الصندوق من الإعدادات: عنوانه وخادم الوارد والصادر وكلمة مرور التطبيق. ويمكن أن يكون صندوقًا واحدًا مشتركًا للفريق، أو صندوقًا لكل أدمن يراه وحده."
          actionHref="/settings/mailboxes/new"
          actionLabel="ربط صندوق"
        />
      </div>
    );
  }

  const allowed = boxes.map((b) => b.id);
  const messages = await db.emailMessage.findMany({
    where: {
      mailboxId: mailbox && allowed.includes(mailbox) ? mailbox : { in: allowed },
      ...(state === 'sent'
        ? { direction: 'out' }
        : state === 'handled'
          ? { direction: 'in', handledAt: { not: null } }
          : state === 'all'
            ? {}
            : { direction: 'in', handledAt: null }),
      ...(intent ? { intent } : {}),
      ...(q
        ? {
            OR: [
              { subject: { contains: q } },
              { fromAddress: { contains: q } },
              { fromName: { contains: q } },
              { bodyText: { contains: q } },
            ],
          }
        : {}),
    },
    include: { mailbox: { select: { label: true } } },
    orderBy: { sentAt: 'desc' },
    take: 100,
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="البريد"
        subtitle={
          aiEnabled()
            ? 'الوارد يُصنَّف ويُلخَّص آليًّا — والرد يبقى بيد الموظف'
            : 'الوارد يُصنَّف بالكلمات — فعِّل مفتاح الذكاء الاصطناعي للتلخيص والمسوّدات'
        }
      >
        <form method="post" action="/api/save" className="inline">
          <input type="hidden" name="entity" value="email.sync" />
          <input type="hidden" name="id" value={mailbox ?? ''} />
          <button type="submit" className="btn-secondary">
            <RefreshCw className="h-4 w-4" />
            سحب الجديد
          </button>
        </form>
        <Link href="/email/new" className="btn-primary">
          <PenLine className="h-4 w-4" />
          رسالة جديدة
        </Link>
      </PageHeader>

      <ErrorAlert message={error} />
      {synced && (
        <p className="mb-4 rounded-lg border border-lime-300 bg-lime-50 px-4 py-3 text-sm text-lime-900">
          {Number(synced) > 0 ? `وصلت ${synced} رسالة جديدة.` : 'لا جديد في الصناديق.'}
        </p>
      )}

      <FilterBar className="mb-4">
        <SearchInput defaultValue={q} placeholder="الموضوع أو المرسِل أو النص" />
        <FilterSelect
          name="state"
          defaultValue={state}
          placeholder="ينتظر ردًّا"
          options={[
            { value: 'handled', label: 'وارد معالَج' },
            { value: 'sent', label: 'الصادر' },
            { value: 'all', label: 'الكل' },
          ]}
        />
        <FilterSelect
          name="intent"
          defaultValue={intent}
          placeholder="كل الأنواع"
          options={Object.entries(EMAIL_INTENTS).map(([value, label]) => ({ value, label }))}
        />
        {boxes.length > 1 && (
          <FilterSelect
            name="mailbox"
            defaultValue={mailbox}
            placeholder="كل الصناديق"
            options={boxes.map((b) => ({ value: b.id, label: b.label }))}
          />
        )}
      </FilterBar>

      {messages.length === 0 ? (
        <EmptyState
          icon={<Mail className="h-8 w-8" />}
          title="لا رسائل هنا"
          description="اضغط «سحب الجديد» لقراءة ما وصل الصندوق، أو غيّر المرشّح لرؤية المعالَج والصادر."
        />
      ) : (
        <div className="space-y-2">
          {messages.map((m) => (
            <Link
              key={m.id}
              href={`/email/${m.id}`}
              className="card block px-4 py-3 transition-colors hover:border-brand-300"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-800">
                  {m.direction === 'out' ? `إلى ${m.toAddresses}` : m.fromName || m.fromAddress}
                </span>
                {m.intent && (
                  <Badge className="border-brand-200 bg-brand-50 text-brand-700">
                    {EMAIL_INTENTS[m.intent as EmailIntent] ?? m.intent}
                  </Badge>
                )}
                {m.urgency && m.urgency !== 'normal' && (
                  <Badge className={URGENCY_STYLE[m.urgency] ?? URGENCY_STYLE.normal}>
                    {EMAIL_URGENCY[m.urgency as keyof typeof EMAIL_URGENCY] ?? m.urgency}
                  </Badge>
                )}
                {m.attachmentNames && <Paperclip className="h-3.5 w-3.5 text-slate-400" />}
                <span className="mr-auto text-xs text-slate-400">{formatDate(m.sentAt)}</span>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-700">{m.subject}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                {m.summary || (m.cleanText ?? m.bodyText).slice(0, 200)}
              </p>
              {boxes.length > 1 && (
                <span className="mt-1 block text-[11px] text-slate-400">{m.mailbox.label}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
