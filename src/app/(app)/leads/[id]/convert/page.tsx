import Link from '@/components/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowRightLeft, Building2, User, Handshake } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser, can, ownerFilter } from '@/lib/auth';
import { CURRENCIES, CURRENCY_LABELS } from '@/lib/constants';
import { fullName } from '@/lib/utils';
import { PageHeader, FormField, SelectField } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'تحويل عميل محتمل' };

export default async function ConvertLeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const seeAll = can(user, 'canViewAllLeads');

  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) notFound();
  if (!seeAll && lead.ownerId !== user.id) notFound();
  if (lead.status === 'WON') redirect(`/leads/${id}`);

  const companies = await db.company.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: 500,
  });

  const name = fullName(lead.firstName, lead.lastName);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="تحويل إلى صفقة"
        subtitle={`تحويل "${name}" من عميل محتمل إلى عميل فعلي`}
      />

      <div className="mb-6 card card-pad bg-brand-50/50">
        <p className="mb-3 flex items-center gap-2 text-sm font-medium text-brand-900">
          <ArrowRightLeft className="h-4 w-4" />
          ماذا سيحدث عند الضغط على &laquo;تحويل&raquo;؟
        </p>
        <ul className="space-y-2 text-sm text-slate-700">
          <li className="flex items-start gap-2">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <span>يُنشأ سجل <strong>شركة</strong> (أو يُربط بشركة موجودة).</span>
          </li>
          <li className="flex items-start gap-2">
            <User className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <span>يُنشأ سجل <strong>جهة اتصال</strong> باسم العميل.</span>
          </li>
          <li className="flex items-start gap-2">
            <Handshake className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <span>
              تُنشأ <strong>صفقة</strong> في مرحلة &laquo;جديدة&raquo;، وتُنقل إليها كل المهام
              والملاحظات.
            </span>
          </li>
        </ul>
      </div>

      <form method="post" action="/api/save" className="space-y-6">
        <input type="hidden" name="entity" value="lead.convert" />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="back" value={`/leads/${id}/convert`} />
        <section className="card card-pad">
          <h2 className="mb-4 section-title">الشركة</h2>
          <div className="space-y-4">
            <SelectField
              label="ربط بشركة موجودة"
              name="existingCompanyId"
              placeholder="— إنشاء شركة جديدة —"
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
              hint="اتركه فارغًا لإنشاء شركة جديدة بالاسم أدناه"
            />
            <FormField
              label="اسم الشركة الجديدة"
              name="companyName"
              defaultValue={lead.companyName}
              placeholder="اتركه فارغًا إن كان العميل فردًا"
            />
          </div>
        </section>

        <section className="card card-pad">
          <h2 className="mb-4 section-title">الصفقة</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="عنوان الصفقة"
              name="dealTitle"
              className="sm:col-span-2"
              defaultValue={`${lead.serviceInterest ?? 'مشروع ترجمة'} — ${name}`}
            />
            <FormField
              label="قيمة الصفقة"
              name="dealAmount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={lead.estimatedValue}
            />
            <SelectField
              label="العملة"
              name="dealCurrency"
              defaultValue="EGP"
              placeholder="جنيه مصري"
              options={CURRENCIES.map((c) => ({
                value: c,
                label: `${c} — ${CURRENCY_LABELS[c]}`,
              }))}
            />
          </div>
        </section>

        <div className="flex items-center gap-3">
          <SaveButton>تحويل الآن</SaveButton>
          <Link href={`/leads/${id}`} className="btn-secondary">
            إلغاء
          </Link>
        </div>
      </form>
    </div>
  );
}
