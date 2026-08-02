import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { PageHeader, ErrorAlert } from '@/components/ui';
import ClientForm from '@/components/client-form';

export const metadata = { title: 'تعديل عميل' };
export const dynamic = 'force-dynamic';

export default async function EditClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  await requireUser();

  const client = await db.client.findUnique({ where: { id } });
  if (!client) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="تعديل عميل" subtitle={client.code ?? undefined} />
      <ErrorAlert message={error} />
      <ClientForm
        recordId={id}
        backPath={`/clients/${id}/edit`}
        client={client}
        cancelHref={`/clients/${id}`}
      />
    </div>
  );
}
