import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { Pencil, Plus, AlertTriangle, FileText } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser, can } from '@/lib/auth';
import { listOptionsMany, listLabel } from '@/lib/reference';
import { FREELANCER_TIERS, RATE_UNITS, PAYMENT_STATUSES } from '@/lib/freelancers';
import { formatMoney, formatDate } from '@/lib/utils';
import { formatBytes } from '@/lib/files';
import { PageHeader, Badge, Field, FormField, SelectField } from '@/components/ui';
import { SaveButton, ConfirmMutateButton } from '@/components/forms';

export const dynamic = 'force-dynamic';

export default async function FreelancerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const manages = can(user, 'canManageFreelancers');
  const seesCost = can(user, 'canViewFreelancerCost');

  const freelancer = await db.freelancer.findUnique({
    where: { id },
    include: {
      cvFile: { select: { id: true, name: true, size: true, mimeType: true } },
      rates: { orderBy: { rate: 'asc' } },
      payments: {
        include: { project: { select: { id: true, code: true, title: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });
  if (!freelancer) notFound();

  const lists = await listOptionsMany('language', 'service_line', 'step_type', 'currency');
  const paymentLabel = freelancer.paymentMethod
    ? await listLabel('payment_method', freelancer.paymentMethod)
    : null;

  const langNames = await Promise.all(
    (freelancer.langs ?? '')
      .split(',')
      .filter(Boolean)
      .map((l) => listLabel('language', l.trim()))
  );
  const lineNames = await Promise.all(
    (freelancer.specialisations ?? '')
      .split(',')
      .filter(Boolean)
      .map((l) => listLabel('service_line', l.trim()))
  );

  const due = freelancer.payments
    .filter((p) => p.status === 'due')
    .reduce((s, p) => s + p.amount, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={freelancer.name}
        subtitle={`${freelancer.code ?? ''} · ${
          FREELANCER_TIERS[freelancer.tier as keyof typeof FREELANCER_TIERS] ?? freelancer.tier
        }`}
      >
        {manages && (
          <>
            <Link href={`/freelancers/${id}/edit`} className="btn-secondary">
              <Pencil className="h-4 w-4" />
              تعديل
            </Link>
            <ConfirmMutateButton
              op="freelancer.deactivate"
              id={id}
              redirectTo={`/freelancers/${id}`}
              label={freelancer.active ? 'إيقاف' : 'تفعيل'}
              confirmText={
                freelancer.active
                  ? 'إيقاف الفريلانسر يُخرجه من محرّك الاختيار ولا يمسّ مشاريعه ولا مستحقاته. متابعة؟'
                  : 'إعادة تفعيله؟'
              }
              className="btn-secondary"
            />
          </>
        )}
      </PageHeader>

      {freelancer.needsReview && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>يحتاج مراجعة يدوية.</b>{' '}
            {freelancer.importNote ?? 'جاء من الاستيراد بما لم يُحسم.'} صحّح ما يلزم
            من التعديل ثم أزِل العلامة.
          </span>
        </div>
      )}

      <section className="card card-pad">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="الهاتف">
            <span dir="ltr">{freelancer.phone ?? '—'}</span>
          </Field>
          <Field label="هاتف بديل">
            <span dir="ltr">{freelancer.phoneAlt ?? '—'}</span>
          </Field>
          <Field label="البريد">
            <span dir="ltr">{freelancer.email ?? '—'}</span>
          </Field>
          <Field label="الدولة والمدينة">
            {[freelancer.country, freelancer.city].filter(Boolean).join(' · ') || '—'}
          </Field>
          <Field label="اللغات">{langNames.join(' · ') || '—'}</Field>
          <Field label="التخصصات">{lineNames.join(' · ') || '—'}</Field>
          {seesCost && (
            <Field label="السعر الافتراضي">
              {freelancer.defaultRate ? (
                <>
                  {formatMoney(freelancer.defaultRate, freelancer.currency)} /{' '}
                  {RATE_UNITS[freelancer.rateUnit as keyof typeof RATE_UNITS]}
                </>
              ) : (
                <span className="text-amber-600">لم يُتفق</span>
              )}
            </Field>
          )}
          <Field label="التقييم">
            {freelancer.rating === null ? '—' : `${freelancer.rating}/10`}
          </Field>
          <Field label="مشاريع معنا">
            <span className="nums">{freelancer.projectsCount}</span>
            {freelancer.lastUsedAt && (
              <span className="mr-2 text-xs text-slate-400">
                آخرها {formatDate(freelancer.lastUsedAt)}
              </span>
            )}
          </Field>
          {seesCost && (
            <Field label="طريقة الدفع">
              {paymentLabel ?? '—'}
              {freelancer.paymentRef && (
                <span className="block text-xs text-slate-400" dir="ltr">
                  {freelancer.paymentRef}
                </span>
              )}
            </Field>
          )}
          <Field label="السيرة الذاتية">
            {freelancer.cvFile ? (
              <a
                href={`/api/files/${freelancer.cvFile.id}`}
                className="link inline-flex items-center gap-1.5"
              >
                <FileText className="h-3.5 w-3.5" />
                {freelancer.cvFile.name}
                <span className="text-xs text-slate-400">
                  ({formatBytes(freelancer.cvFile.size)})
                </span>
              </a>
            ) : freelancer.cvUrl ? (
              <a href={freelancer.cvUrl} target="_blank" rel="noreferrer" className="link" dir="ltr">
                رابط خارجي
              </a>
            ) : null}
          </Field>
        </dl>
        {freelancer.notes && (
          <p className="mt-4 whitespace-pre-line rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {freelancer.notes}
          </p>
        )}
      </section>

      {/* ── الأسعار الاستثنائية ─────────────────────────────── */}
      {seesCost && (
        <section>
          <h2 className="mb-3 section-title">
            أسعاره الخاصة
            <span className="mr-2 text-xs font-normal text-slate-400">
              أدقّ بند مطابق يفوز · الحقل الفارغ يعني «أي قيمة»
            </span>
          </h2>

          <div className="card table-wrap mb-4">
            <table className="tbl">
              <thead>
                <tr>
                  <th>من لغة</th>
                  <th>إلى لغة</th>
                  <th>خط الخدمة</th>
                  <th>نوع الخطوة</th>
                  <th>السعر</th>
                  {manages && <th></th>}
                </tr>
              </thead>
              <tbody>
                {freelancer.rates.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-sm text-slate-400">
                      لا استثناءات — يُستخدم السعر الافتراضي
                    </td>
                  </tr>
                )}
                {freelancer.rates.map((r) => (
                  <tr key={r.id}>
                    <td className="text-xs text-slate-500">{r.langFrom ?? 'أي'}</td>
                    <td className="text-xs text-slate-500">{r.langTo ?? 'أي'}</td>
                    <td className="text-xs text-slate-500">{r.serviceLine ?? 'أي'}</td>
                    <td className="text-xs text-slate-500">{r.stepType ?? 'أي'}</td>
                    <td className="nums font-medium">
                      {formatMoney(r.rate, r.currency)}
                      <span className="block text-xs text-slate-400">
                        / {RATE_UNITS[r.rateUnit as keyof typeof RATE_UNITS] ?? r.rateUnit}
                      </span>
                      {r.notes && (
                        <span className="block text-xs text-amber-600">{r.notes}</span>
                      )}
                    </td>
                    {manages && (
                      <td>
                        <form method="post" action="/api/mutate" className="inline">
                          <input type="hidden" name="op" value="freelancerRate.delete" />
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="redirectTo" value={`/freelancers/${id}`} />
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

          {manages && (
            <form
              method="post"
              action="/api/save"
              className="card card-pad grid gap-3 sm:grid-cols-3"
            >
              <input type="hidden" name="entity" value="freelancerRate" />
              <input type="hidden" name="id" value="" />
              <input type="hidden" name="freelancerId" value={id} />
              <input type="hidden" name="back" value={`/freelancers/${id}`} />

              <SelectField label="من لغة" name="langFrom" options={lists.language} placeholder="أي لغة" />
              <SelectField label="إلى لغة" name="langTo" options={lists.language} placeholder="أي لغة" />
              <SelectField
                label="خط الخدمة"
                name="serviceLine"
                options={lists.service_line}
                placeholder="أي خط"
              />
              <SelectField
                label="نوع الخطوة"
                name="stepType"
                options={lists.step_type}
                placeholder="أي نوع"
              />
              <FormField label="السعر" name="rate" type="number" step="0.01" min="0" required dir="ltr" />
              <SelectField
                label="وحدة الأجر"
                name="rateUnit"
                defaultValue={freelancer.rateUnit}
                placeholder="الصفحة"
                options={Object.entries(RATE_UNITS).map(([value, label]) => ({ value, label }))}
              />
              <SelectField
                label="العملة"
                name="currency"
                defaultValue={freelancer.currency}
                placeholder="جنيه"
                options={lists.currency}
              />
              <div className="flex items-end pb-1 sm:col-span-2">
                <SaveButton>
                  <Plus className="h-4 w-4" />
                  إضافة بند سعر
                </SaveButton>
              </div>
            </form>
          )}
        </section>
      )}

      {/* ── مستحقاته ────────────────────────────────────────── */}
      {seesCost && freelancer.payments.length > 0 && (
        <section>
          <h2 className="mb-3 section-title">
            مستحقاته
            {due > 0 && (
              <span className="mr-2 text-xs font-normal text-rose-600">
                مستحق الآن {formatMoney(due)}
              </span>
            )}
          </h2>
          <div className="card table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>المشروع</th>
                  <th>المبلغ</th>
                  <th>الحال</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {freelancer.payments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.project ? (
                        <Link href={`/projects/${p.project.id}`} className="link">
                          {p.project.title}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="nums font-medium">{formatMoney(p.amount, p.currency)}</td>
                    <td>
                      <Badge
                        className={
                          p.status === 'paid'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : p.status === 'held'
                              ? 'border-slate-200 bg-slate-50 text-slate-500'
                              : 'border-amber-200 bg-amber-50 text-amber-700'
                        }
                      >
                        {PAYMENT_STATUSES[p.status as keyof typeof PAYMENT_STATUSES] ?? p.status}
                      </Badge>
                    </td>
                    <td className="text-xs text-slate-400">
                      {p.paidAt ? formatDate(p.paidAt) : formatDate(p.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
