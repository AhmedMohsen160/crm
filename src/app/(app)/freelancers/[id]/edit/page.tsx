import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { listOptionsMany } from '@/lib/reference';
import { PageHeader, ErrorAlert } from '@/components/ui';
import FreelancerForm from '@/components/freelancer-form';

export const metadata = { title: 'تعديل فريلانسر' };
export const dynamic = 'force-dynamic';

export default async function EditFreelancerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  await requirePermission('canManageFreelancers');

  const [freelancer, lists] = await Promise.all([
    db.freelancer.findUnique({
      where: { id },
      include: { cvFile: { select: { id: true, name: true, size: true } } },
    }),
    listOptionsMany('language', 'service_line', 'currency', 'payment_method'),
  ]);
  if (!freelancer) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="تعديل فريلانسر" subtitle={`${freelancer.code ?? ''} · ${freelancer.name}`}>
        <Link href={`/freelancers/${id}`} className="btn-secondary">
          رجوع للملف
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />

      {freelancer.importNote && (
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>ما جاء في ملف الاستيراد ولم يُحسم:</b> {freelancer.importNote}
        </p>
      )}

      <FreelancerForm
        values={freelancer}
        languages={lists.language}
        serviceLines={lists.service_line}
        currencies={lists.currency}
        paymentMethods={lists.payment_method}
        back={`/freelancers/${id}/edit`}
      />
    </div>
  );
}
