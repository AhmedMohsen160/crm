import Link from '@/components/link';
import { requirePermission } from '@/lib/auth';
import { listOptionsMany } from '@/lib/reference';
import { PageHeader, ErrorAlert } from '@/components/ui';
import FreelancerForm from '@/components/freelancer-form';

export const metadata = { title: 'فريلانسر جديد' };
export const dynamic = 'force-dynamic';

export default async function NewFreelancerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  await requirePermission('canManageFreelancers');
  const lists = await listOptionsMany('language', 'service_line', 'currency');

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="فريلانسر جديد"
        subtitle="ألف اسم لا يُدخل يدويًا — للدفعات استخدم الاستيراد"
      >
        <Link href="/freelancers/import" className="btn-secondary">
          استيراد من ملف
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />

      <FreelancerForm
        values={{ active: true }}
        languages={lists.language}
        serviceLines={lists.service_line}
        currencies={lists.currency}
        back="/freelancers/new"
      />
    </div>
  );
}
