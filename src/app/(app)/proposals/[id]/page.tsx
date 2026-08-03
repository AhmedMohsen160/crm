import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { Printer, Plus, Copy } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { listOptionsMany } from '@/lib/reference';
import {
  PROPOSAL_STATUSES,
  volumeTable,
  ratePerWord,
  wordsToPages,
  type ProposalStatus,
} from '@/lib/proposals';
import { PageHeader, Badge, FormField, SelectField, TextAreaField, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  draft: 'border-slate-200 bg-slate-50 text-slate-600',
  sent: 'border-brand-200 bg-brand-50 text-brand-700',
  accepted: 'border-lime-300 bg-lime-50 text-lime-800',
  declined: 'border-rose-200 bg-rose-50 text-rose-700',
};

export default async function ProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  await requirePermission('canViewSellPrice');

  const [proposal, lists] = await Promise.all([
    db.proposal.findUnique({
      where: { id },
      include: {
        tiers: { orderBy: { fromWords: 'asc' } },
        owner: { select: { name: true } },
      },
    }),
    listOptionsMany('language', 'currency'),
  ]);
  if (!proposal) notFound();

  const samples = proposal.sampleVolumes
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v > 0);

  const table = volumeTable(proposal.tiers, samples, proposal.vatRate);
  const editable = proposal.status === 'draft' || proposal.status === 'sent';

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title={proposal.title}
        subtitle={`${proposal.code ?? ''}${proposal.revision > 1 ? ` · مراجعة ${proposal.revision}` : ''} · ${proposal.clientName}`}
      >
        <Link href={`/proposals/${id}/print`} className="btn-primary" target="_blank">
          <Printer className="h-4 w-4" />
          المستند للطباعة
        </Link>
        <form method="post" action="/api/save" className="inline">
          <input type="hidden" name="entity" value="proposal.revise" />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="back" value={`/proposals/${id}`} />
          <button type="submit" className="btn-secondary">
            <Copy className="h-4 w-4" />
            مراجعة جديدة
          </button>
        </form>
      </PageHeader>
      <ErrorAlert message={error} />

      <div className="flex flex-wrap items-center gap-2">
        <Badge className={STATUS_STYLE[proposal.status] ?? STATUS_STYLE.draft}>
          {PROPOSAL_STATUSES[proposal.status as ProposalStatus] ?? proposal.status}
        </Badge>
        {proposal.owner && <span className="text-xs text-slate-400">{proposal.owner.name}</span>}
      </div>

      {/* ── الشرائح ──────────────────────────────────────────── */}
      <section>
        <h2 className="mb-1 section-title">شرائح الحجم</h2>
        <p className="mb-3 text-xs text-slate-500">
          <b>بأثر رجعي على حجم الشهر كاملًا</b> — تجاوز العتبة يخفض سعر كل ما
          تُرجم في الشهر، لا ما فوقها وحده. (وهي عكس شرائح نسب المبيعات عمدًا.)
        </p>

        <div className="card table-wrap mb-4">
          <table className="tbl">
            <thead>
              <tr>
                <th>الشريحة</th>
                <th>الحجم الشهري (كلمة)</th>
                <th>صفحات قياسية</th>
                <th>الخصم</th>
                <th>سعر الصفحة</th>
                <th>سعر الكلمة</th>
                {editable && <th></th>}
              </tr>
            </thead>
            <tbody>
              {proposal.tiers.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-sm text-rose-500">
                    لا شرائح — العرض بلا شرائح لا يُسعّر
                  </td>
                </tr>
              )}
              {proposal.tiers.map((tier) => (
                <tr key={tier.id}>
                  <td className="font-medium text-slate-800">{tier.label}</td>
                  <td className="nums text-slate-600">
                    {tier.fromWords.toLocaleString('en-US')} –{' '}
                    {tier.toWords === null ? 'فما فوق' : tier.toWords.toLocaleString('en-US')}
                  </td>
                  <td className="nums text-slate-500">
                    {wordsToPages(tier.fromWords).toLocaleString('en-US')}+
                  </td>
                  <td className="nums">{tier.discountPct}٪</td>
                  <td className="nums font-semibold">
                    {tier.ratePerPage} {proposal.currency}
                  </td>
                  <td className="nums text-xs text-slate-500">{ratePerWord(tier.ratePerPage)}</td>
                  {editable && (
                    <td>
                      <form method="post" action="/api/mutate" className="inline">
                        <input type="hidden" name="op" value="proposalTier.delete" />
                        <input type="hidden" name="id" value={tier.id} />
                        <input type="hidden" name="redirectTo" value={`/proposals/${id}`} />
                        <button type="submit" className="text-xs text-rose-600 hover:underline">
                          حذف
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {editable && (
          <form method="post" action="/api/save" className="card card-pad grid gap-3 sm:grid-cols-5">
            <input type="hidden" name="entity" value="proposalTier" />
            <input type="hidden" name="id" value="" />
            <input type="hidden" name="proposalId" value={id} />
            <input type="hidden" name="back" value={`/proposals/${id}`} />
            <FormField label="اسم الشريحة" name="label" required />
            <FormField label="من (كلمة)" name="fromWords" type="number" min="0" required dir="ltr" />
            <FormField label="إلى (كلمة)" name="toWords" type="number" min="0" dir="ltr" hint="فارغ = فما فوق" />
            <FormField label="الخصم ٪" name="discountPct" type="number" step="0.5" min="0" dir="ltr" />
            <FormField label="سعر الصفحة" name="ratePerPage" type="number" step="0.01" min="0" required dir="ltr" />
            <div className="sm:col-span-5">
              <SaveButton>
                <Plus className="h-4 w-4" />
                إضافة شريحة
              </SaveButton>
            </div>
          </form>
        )}
      </section>

      {/* ── ما يعنيه هذا عمليًا ──────────────────────────────── */}
      <section>
        <h2 className="mb-3 section-title">ما يعنيه هذا عمليًا</h2>
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>الحجم الشهري</th>
                <th>صفحات</th>
                <th>الشريحة</th>
                <th>سعر الصفحة</th>
                <th>الإجمالي</th>
                <th>الوفر</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row) => (
                <tr key={row.words}>
                  <td className="nums">{row.words.toLocaleString('en-US')} كلمة</td>
                  <td className="nums text-slate-600">{row.pages.toLocaleString('en-US')}</td>
                  <td className="text-sm text-slate-600">{row.tierLabel}</td>
                  <td className="nums">{row.ratePerPage}</td>
                  <td className="nums font-semibold">
                    {row.total.toLocaleString('en-US')} {proposal.currency}
                  </td>
                  <td className="nums text-lime-700">
                    {row.saving > 0 ? row.saving.toLocaleString('en-US') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── الحال ────────────────────────────────────────────── */}
      <section className="card card-pad">
        <h2 className="mb-3 section-title">حال العرض</h2>
        <div className="flex flex-wrap items-end gap-4">
          {proposal.status === 'draft' && (
            <form method="post" action="/api/save">
              <input type="hidden" name="entity" value="proposal.decide" />
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="action" value="send" />
              <input type="hidden" name="back" value={`/proposals/${id}`} />
              <SaveButton>سجّل الإرسال</SaveButton>
            </form>
          )}
          {proposal.status === 'sent' && (
            <>
              <form method="post" action="/api/save">
                <input type="hidden" name="entity" value="proposal.decide" />
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="action" value="accept" />
                <input type="hidden" name="back" value={`/proposals/${id}`} />
                <SaveButton>قُبل</SaveButton>
              </form>
              <form method="post" action="/api/save" className="flex items-end gap-2">
                <input type="hidden" name="entity" value="proposal.decide" />
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="action" value="decline" />
                <input type="hidden" name="back" value={`/proposals/${id}`} />
                <div>
                  <label className="label" htmlFor="note">
                    سبب الرفض
                  </label>
                  <input id="note" name="note" required className="input w-56" />
                </div>
                <button type="submit" className="btn-danger">
                  رُفض
                </button>
              </form>
            </>
          )}
          {proposal.decisionNote && (
            <p className="text-xs text-slate-500">{proposal.decisionNote}</p>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          القبول <b>لا يفتح مشروعًا تلقائيًا</b>: العرض إطار سعري لشهور، والمشروع
          يُفتح بدفعة فعلية. الخلط بينهما يملأ لوحة التشغيل بمشاريع لم تصل ملفاتها.
        </p>
      </section>

      {/* ── التحرير ──────────────────────────────────────────── */}
      {editable && (
        <section className="card card-pad">
          <h2 className="mb-4 section-title">تحرير بيانات العرض</h2>
          <form method="post" action="/api/save" className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="entity" value="proposal" />
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="back" value={`/proposals/${id}`} />

            <FormField label="عنوان العرض" name="title" required defaultValue={proposal.title} className="sm:col-span-2" />
            <FormField label="الجهة" name="clientName" required defaultValue={proposal.clientName} />
            <FormField label="عناية" name="attention" defaultValue={proposal.attention} />
            <FormField label="صفته" name="attentionRole" defaultValue={proposal.attentionRole} />
            <SelectField label="من لغة" name="sourceLang" defaultValue={proposal.sourceLang} options={lists.language} placeholder="—" />
            <SelectField label="إلى لغة" name="targetLang" defaultValue={proposal.targetLang} options={lists.language} placeholder="—" />
            <SelectField label="العملة" name="currency" defaultValue={proposal.currency} options={lists.currency} placeholder="—" />
            <FormField label="الضريبة ٪" name="vatPct" type="number" step="0.5" min="0" defaultValue={proposal.vatRate * 100} dir="ltr" />
            <FormField label="الصلاحية (يومًا)" name="validityDays" type="number" min="1" defaultValue={proposal.validityDays} dir="ltr" />
            <FormField label="السداد (يومًا)" name="paymentDays" type="number" min="0" defaultValue={proposal.paymentDays} dir="ltr" />
            <FormField
              label="الجهة المتعاقدة"
              name="contractingEntity"
              defaultValue={proposal.contractingEntity}
              className="sm:col-span-2"
            />
            <FormField
              label="أحجام جدول الأمثلة"
              name="sampleVolumes"
              defaultValue={proposal.sampleVolumes}
              dir="ltr"
              hint="أرقام مفصولة بفواصل"
              className="sm:col-span-2"
            />
            <FormField label="اسم الموقِّع" name="signerName" defaultValue={proposal.signerName} />
            <FormField label="صفة الموقِّع" name="signerTitle" defaultValue={proposal.signerTitle} />
            <div className="sm:col-span-2">
              <TextAreaField label="افتتاحية العرض" name="intro" defaultValue={proposal.intro} />
              <TextAreaField label="موقفنا من السعر" name="positioning" defaultValue={proposal.positioning} />
              <TextAreaField label="الخطوات التالية" name="nextSteps" defaultValue={proposal.nextSteps} />
            </div>
            <div className="sm:col-span-2">
              <SaveButton>حفظ التعديلات</SaveButton>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
