import Link from '@/components/link';
import { Send } from 'lucide-react';
import { requirePermission, can } from '@/lib/auth';
import { visibleMailboxes } from '@/lib/email-engine';
import { PageHeader, FormField, SelectField, ErrorAlert } from '@/components/ui';

export const metadata = { title: 'رسالة جديدة' };
export const dynamic = 'force-dynamic';

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; to?: string; leadId?: string; clientId?: string; projectId?: string }>;
}) {
  const user = await requirePermission('canUseEmail');
  const { error, to, leadId, clientId, projectId } = await searchParams;
  const boxes = await visibleMailboxes(user.id, can(user, 'canViewAllLeads'));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="رسالة جديدة" subtitle="تُرسل من الصندوق المختار وتُحفظ في ملفّ العميل">
        <Link href="/email" className="btn-secondary">
          رجوع للبريد
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />

      <form method="post" action="/api/save" className="card card-pad space-y-4">
        <input type="hidden" name="entity" value="email.compose" />
        <input type="hidden" name="id" value="" />
        {leadId && <input type="hidden" name="leadId" value={leadId} />}
        {clientId && <input type="hidden" name="clientId" value={clientId} />}
        {projectId && <input type="hidden" name="projectId" value={projectId} />}

        <SelectField
          label="من صندوق"
          name="mailboxId"
          required
          defaultValue={boxes[0]?.id}
          placeholder="— اختر الصندوق —"
          options={boxes.map((b) => ({ value: b.id, label: `${b.label} — ${b.address}` }))}
        />
        <FormField label="إلى" name="to" required dir="ltr" defaultValue={to} placeholder="client@example.com" />
        <FormField label="الموضوع" name="subject" required />
        <div>
          <label className="label" htmlFor="body">
            النص <span className="text-rose-500">*</span>
          </label>
          <textarea id="body" name="body" rows={12} required className="input" />
          <p className="mt-1 text-xs text-slate-400">التوقيع يُضاف آليًّا من إعداد الصندوق.</p>
        </div>

        <button type="submit" className="btn-primary">
          <Send className="h-4 w-4" />
          إرسال
        </button>
      </form>
    </div>
  );
}
