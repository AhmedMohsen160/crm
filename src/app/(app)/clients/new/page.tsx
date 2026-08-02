import { requireUser } from '@/lib/auth';
import { PageHeader, ErrorAlert } from '@/components/ui';
import ClientForm from '@/components/client-form';

export const metadata = { title: 'عميل جديد' };

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  await requireUser();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="عميل جديد"
        subtitle="الهاتف مفتاح العميل — لن يُنشأ سجل ثانٍ لنفس الرقم"
      />
      <ErrorAlert message={error} />
      <ClientForm backPath="/clients/new" cancelHref="/clients" />
    </div>
  );
}
