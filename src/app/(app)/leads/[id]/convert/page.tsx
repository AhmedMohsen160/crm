import Link from '@/components/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser, can } from '@/lib/auth';
import { listOptionsMany, settingNumber } from '@/lib/reference';
import { discountLimitOf } from '@/lib/pricing';
import { DISCOUNT_TYPES } from '@/lib/projects';
import { fullName } from '@/lib/utils';
import { PageHeader, FormField, SelectField, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';
import ExpressDeadline from '@/components/express-deadline';
import LiveTotal from '@/components/live-total';

export const metadata = { title: 'تحويل إلى مشروع' };
export const dynamic = 'force-dynamic';

/**
 * تحويل ليد → مشروع (§7.1).
 *
 * **ستة حقول، أغلبها قوائم، والمعيار ≤٢٠ ثانية.** كل ما يمكن اشتقاقه
 * مشتقّ: العميل من الليد، الفرع وأدمن المبيعات من الحساب، اللغات وخط
 * الخدمة مبدئيًا من الليد. ما يبقى للمستخدم: الصفحات والسعر والمقدم والموعد.
 */
export default async function ConvertLeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await requireUser();
  const seeAll = can(user, 'canViewAllLeads');
  if (!can(user, 'canConvertProject')) redirect(`/leads/${id}`);

  const lead = await db.lead.findUnique({
    where: { id },
    include: { client: { select: { name: true, code: true } } },
  });
  if (!lead) notFound();
  if (!seeAll && lead.ownerId !== user.id) notFound();
  if (lead.status === 'WON') redirect(`/leads/${id}`);

  const [lists, depositPct, limit] = await Promise.all([
    listOptionsMany('service_line', 'language', 'currency'),
    settingNumber('default_deposit_pct'),
    discountLimitOf(user),
  ]);

  const name = lead.client?.name ?? fullName(lead.firstName, lead.lastName);
  const estimated = lead.estimatedValue ?? 0;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="تحويل إلى مشروع"
        subtitle={`${lead.code ?? ''} · ${name}`}
      />
      <ErrorAlert message={error} />

      <p className="mb-6 rounded-lg bg-brand-50/60 px-4 py-3 text-sm text-slate-700">
        عند الحفظ: يتولّد رقم المشروع، ويصير الليد <b>فائزًا</b>، ويدخل المشروع{' '}
        <b>قيد الإسناد</b> فيراه مدير المشاريع فورًا. المهام والملاحظات تنتقل معه.
        <span className="mt-1 block text-xs text-slate-500">
          السعر يُقرأ من قائمة الأسعار تلقائيًا، وخصم العميل المتكرر وشرائح الكمية
          تُطبَّق بلا إدخال.
        </span>
      </p>

      <form method="post" action="/api/save" className="space-y-5">
        <input type="hidden" name="entity" value="lead.convert" />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="back" value={`/leads/${id}/convert`} />

        <section className="card card-pad">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="خط الخدمة"
              name="serviceLine"
              required
              defaultValue={lead.serviceInterest}
              options={lists.service_line.map((s) => ({ value: s.value, label: s.label }))}
              className="sm:col-span-2"
            />
            <SelectField
              label="من لغة"
              name="sourceLang"
              required
              defaultValue={lead.sourceLang}
              options={lists.language.map((l) => ({ value: l.value, label: l.label }))}
            />
            <SelectField
              label="إلى لغة"
              name="targetLang"
              required
              defaultValue={lead.targetLang}
              options={lists.language.map((l) => ({ value: l.value, label: l.label }))}
            />
            {/* الصفحات والسعر والخصم — والإجمالي يظهر أثناء الكتابة */}
            <LiveTotal
              defaultPages={lead.estPages}
              defaultNetTotal={estimated || null}
              discountTypes={Object.entries(DISCOUNT_TYPES)
                .filter(([v]) => v === 'percent' || v === 'amount')
                .map(([value, label]) => ({ value, label }))}
              discountHint={`حدّك ${(limit * 100).toFixed(0)}٪ — ما فوقه يوقف المشروع للاعتماد`}
              showPrice={can(user, 'canViewSellPrice')}
              canDiscount={can(user, 'canDiscount')}
            />
            {can(user, 'canViewSellPrice') && (
              <>
                <FormField
                  label="المقدم المقبوض"
                  name="deposit"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={estimated ? Math.round(estimated * depositPct) : undefined}
                  hint={`الافتراضي ${Math.round(depositPct * 100)}٪ من الإجمالي`}
                />
                <SelectField
                  label="العملة"
                  name="currency"
                  defaultValue="EGP"
                  placeholder="جنيه مصري"
                  options={lists.currency.map((c) => ({ value: c.value, label: c.label }))}
                />
              </>
            )}
          </div>

          <ExpressDeadline />

          <label className="mt-3 flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              name="isRush"
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-slate-700">
              طلب مستعجل
              <span className="mr-2 text-xs text-slate-400">
                (يضيف رسم الاستعجال عند التسعير)
              </span>
            </span>
          </label>
        </section>

        <div className="flex items-center gap-3">
          <SaveButton>تحويل إلى مشروع</SaveButton>
          <Link href={`/leads/${id}`} className="btn-secondary">
            إلغاء
          </Link>
        </div>
      </form>
    </div>
  );
}
