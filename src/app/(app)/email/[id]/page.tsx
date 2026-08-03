import { notFound } from 'next/navigation';
import Link from '@/components/link';
import { Sparkles, Send, CheckCircle2, Paperclip } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission, can } from '@/lib/auth';
import { canSeeMailbox, EMAIL_INTENTS, EMAIL_URGENCY, type EmailIntent } from '@/lib/email';
import { REPLY_TONES } from '@/lib/ai';
import { aiEnabled } from '@/lib/ai-client';
import { formatDateTime } from '@/lib/utils';
import { PageHeader, Badge, Field, ErrorAlert, SelectField, FormField } from '@/components/ui';

export const metadata = { title: 'رسالة' };
export const dynamic = 'force-dynamic';

/**
 * الرسالة الواحدة: نصّها، تحليلها، ربطها بسجلّ، والرد عليها.
 *
 * مسوّدة النموذج تُعرض **داخل صندوق التحرير** لا كنصّ يُنسخ: الموظف يقرأها
 * ويعدّلها ثم يرسل. ولو أُرسلت بضغطة واحدة بلا قراءة لصار النموذج هو من
 * يعِد العميل، لا المكتب.
 */
export default async function EmailMessagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requirePermission('canUseEmail');
  const { id } = await params;
  const { error } = await searchParams;

  const message = await db.emailMessage.findUnique({
    where: { id },
    include: {
      mailbox: { select: { id: true, label: true, ownerId: true, address: true } },
      lead: { select: { id: true, code: true, firstName: true, lastName: true } },
      client: { select: { id: true, code: true, name: true } },
      company: { select: { id: true, name: true } },
      project: { select: { id: true, code: true, title: true } },
      handledBy: { select: { name: true } },
    },
  });
  if (!message) notFound();

  const visible = canSeeMailbox({
    mailboxOwnerId: message.mailbox.ownerId,
    userId: user.id,
    canViewAll: can(user, 'canViewAllLeads'),
  });
  if (!visible) notFound();

  const incoming = message.direction === 'in';
  const ai = aiEnabled() && can(user, 'canUseAi');

  // خيط المراسلة كاملًا — ما قبل هذه الرسالة وما بعدها
  const thread = await db.emailMessage.findMany({
    where: { threadKey: message.threadKey, id: { not: message.id } },
    orderBy: { sentAt: 'asc' },
    select: { id: true, subject: true, direction: true, sentAt: true, fromAddress: true },
  });

  const leads = incoming
    ? await db.lead.findMany({
        where: can(user, 'canViewAllLeads') ? {} : { ownerId: user.id },
        select: { id: true, code: true, firstName: true, lastName: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
    : [];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={message.subject} subtitle={message.mailbox.label}>
        <Link href="/email" className="btn-secondary">
          رجوع للبريد
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* ── الرسالة ─────────────────────────────────── */}
          <section className="card card-pad">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
              <Badge
                className={
                  incoming
                    ? 'border-brand-200 bg-brand-50 text-brand-700'
                    : 'border-lime-300 bg-lime-50 text-lime-800'
                }
              >
                {incoming ? 'واردة' : 'صادرة'}
              </Badge>
              {message.intent && (
                <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                  {EMAIL_INTENTS[message.intent as EmailIntent] ?? message.intent}
                </Badge>
              )}
              {message.urgency === 'high' && (
                <Badge className="border-rose-200 bg-rose-50 text-rose-700">
                  {EMAIL_URGENCY.high}
                </Badge>
              )}
              <span className="mr-auto text-xs text-slate-400">
                {formatDateTime(message.sentAt)}
              </span>
            </div>

            <dl className="grid gap-x-6 border-b border-slate-100 py-2 sm:grid-cols-2">
              <Field label="من">
                {message.fromName ? `${message.fromName} — ${message.fromAddress}` : message.fromAddress}
              </Field>
              <Field label="إلى">{message.toAddresses}</Field>
              {message.ccAddresses && <Field label="نسخة">{message.ccAddresses}</Field>}
              {message.attachmentNames && (
                <Field label="المرفقات">
                  <span className="inline-flex items-center gap-1">
                    <Paperclip className="h-3.5 w-3.5" />
                    {message.attachmentNames}
                  </span>
                </Field>
              )}
            </dl>

            <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-800">
              {message.bodyText}
            </pre>
          </section>

          {/* ── الرد ────────────────────────────────────── */}
          {incoming && (
            <section id="reply" className="card card-pad">
              <h2 className="mb-3 text-sm font-bold text-slate-800">الرد</h2>

              {ai && (
                <form method="post" action="/api/save" className="mb-4 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-[10rem_1fr_auto]">
                  <input type="hidden" name="entity" value="email.suggest" />
                  <input type="hidden" name="id" value={message.id} />
                  <SelectField
                    label="النبرة"
                    name="tone"
                    defaultValue="formal"
                    placeholder="رسمي"
                    options={Object.entries(REPLY_TONES).map(([value, label]) => ({ value, label }))}
                  />
                  <FormField
                    label="توجيه للمساعد"
                    name="instruction"
                    placeholder="اذكر أننا نحتاج الملف بصيغة Word"
                  />
                  <button type="submit" className="btn-secondary self-end">
                    <Sparkles className="h-4 w-4" />
                    اقترح ردًّا
                  </button>
                </form>
              )}

              <form method="post" action="/api/save" className="space-y-3">
                <input type="hidden" name="entity" value="email.reply" />
                <input type="hidden" name="id" value={message.id} />
                <textarea
                  name="body"
                  rows={10}
                  required
                  className="input"
                  defaultValue={message.suggestedReply ?? ''}
                  placeholder="اكتب ردك هنا…"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    name="cc"
                    className="input max-w-xs"
                    dir="ltr"
                    placeholder="نسخة إلى (اختياري)"
                  />
                  <button type="submit" className="btn-primary">
                    <Send className="h-4 w-4" />
                    إرسال الرد
                  </button>
                  {message.suggestedReply && (
                    <span className="text-xs text-slate-400">
                      المكتوب أعلاه مسوّدة اقترحها المساعد — راجعها قبل الإرسال
                    </span>
                  )}
                </div>
              </form>
            </section>
          )}

          {thread.length > 0 && (
            <section className="card card-pad">
              <h2 className="mb-2 text-sm font-bold text-slate-800">بقية الخيط</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {thread.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 py-2">
                    <Badge
                      className={
                        t.direction === 'in'
                          ? 'border-brand-200 bg-brand-50 text-brand-700'
                          : 'border-lime-300 bg-lime-50 text-lime-800'
                      }
                    >
                      {t.direction === 'in' ? 'واردة' : 'صادرة'}
                    </Badge>
                    <Link href={`/email/${t.id}`} className="link truncate">
                      {t.subject}
                    </Link>
                    <span className="mr-auto shrink-0 text-xs text-slate-400">
                      {formatDateTime(t.sentAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* ── الجانب: التحليل والربط ────────────────────── */}
        <div className="space-y-4">
          <section className="card card-pad">
            <h2 className="mb-2 text-sm font-bold text-slate-800">قراءة المساعد</h2>
            {message.summary ? (
              <p className="text-sm leading-relaxed text-slate-700">{message.summary}</p>
            ) : (
              <p className="text-sm text-slate-400">
                لم تُحلَّل بعد — التصنيف الظاهر مبنيّ على كلمات الرسالة.
              </p>
            )}
            {message.sentiment === 'negative' && (
              <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                نبرة الرسالة سلبية — يُستحسن أن يقرأها مسؤول قبل الرد.
              </p>
            )}
            {ai && (
              <form method="post" action="/api/save" className="mt-3">
                <input type="hidden" name="entity" value="email.analyze" />
                <input type="hidden" name="id" value={message.id} />
                <button type="submit" className="btn-secondary w-full">
                  <Sparkles className="h-4 w-4" />
                  {message.analyzedAt ? 'أعد التحليل' : 'حلّل الرسالة'}
                </button>
              </form>
            )}
          </section>

          <section className="card card-pad">
            <h2 className="mb-2 text-sm font-bold text-slate-800">الربط بالنظام</h2>
            <dl>
              <Field label="العميل">
                {message.client ? (
                  <Link href={`/clients/${message.client.id}`} className="link">
                    {message.client.name}
                  </Link>
                ) : null}
              </Field>
              <Field label="الليد">
                {message.lead ? (
                  <Link href={`/leads/${message.lead.id}`} className="link">
                    {message.lead.code ?? `${message.lead.firstName} ${message.lead.lastName ?? ''}`}
                  </Link>
                ) : null}
              </Field>
              <Field label="الشركة">
                {message.company ? (
                  <Link href={`/companies/${message.company.id}`} className="link">
                    {message.company.name}
                  </Link>
                ) : null}
              </Field>
              <Field label="المشروع">
                {message.project ? (
                  <Link href={`/projects/${message.project.id}`} className="link">
                    {message.project.code ?? message.project.title}
                  </Link>
                ) : null}
              </Field>
            </dl>

            {incoming && (
              <form method="post" action="/api/save" className="mt-3 space-y-3">
                <input type="hidden" name="entity" value="email.link" />
                <input type="hidden" name="id" value={message.id} />
                <input type="hidden" name="clientId" value={message.clientId ?? ''} />
                <input type="hidden" name="companyId" value={message.companyId ?? ''} />
                <input type="hidden" name="projectId" value={message.projectId ?? ''} />
                <SelectField
                  label="اربطها بليد"
                  name="leadId"
                  defaultValue={message.leadId}
                  placeholder="— بلا ربط —"
                  options={leads.map((l) => ({
                    value: l.id,
                    label: `${l.code ?? ''} ${l.firstName} ${l.lastName ?? ''}`.trim(),
                  }))}
                />
                <SelectField
                  label="النوع"
                  name="intent"
                  defaultValue={message.intent}
                  placeholder="— بلا تصنيف —"
                  options={Object.entries(EMAIL_INTENTS).map(([value, label]) => ({ value, label }))}
                />
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="handled"
                    defaultChecked={Boolean(message.handledAt)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  عُولجت
                </label>
                <button type="submit" className="btn-secondary w-full">
                  <CheckCircle2 className="h-4 w-4" />
                  حفظ
                </button>
              </form>
            )}

            {message.handledAt && (
              <p className="mt-3 text-xs text-slate-400">
                عولجت في {formatDateTime(message.handledAt)}
                {message.handledBy ? ` — ${message.handledBy.name}` : ''}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
