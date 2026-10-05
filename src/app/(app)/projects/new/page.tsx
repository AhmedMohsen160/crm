import { db } from '@/lib/db';
import { requireUser, can } from '@/lib/auth';
import { listOptionsMany } from '@/lib/reference';
import { DISCOUNT_TYPES } from '@/lib/projects';
import { discountLimitOf, activePriceList } from '@/lib/pricing';
import { PageHeader, ErrorAlert } from '@/components/ui';
import ProjectForm, { type ProjectFormLists } from '@/components/project-form';

export const metadata = { title: 'مشروع جديد' };
export const dynamic = 'force-dynamic';

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string; contactId?: string; clientId?: string; error?: string }>;
}) {
  const user = await requireUser();
  const seeAll = can(user, 'canViewAllLeads');
  const params = await searchParams;

  const [lists, companies, contacts, users, client, limit, priceList] = await Promise.all([
    listOptionsMany('service_line', 'language', 'currency'),
    db.company.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 500,
    }),
    db.contact.findMany({
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
      take: 500,
    }),
    seeAll
      ? db.user.findMany({
          where: { active: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
    params.clientId
      ? db.client.findUnique({
          where: { id: params.clientId },
          select: { id: true, name: true, code: true },
        })
      : Promise.resolve(null),
    discountLimitOf(user),
    activePriceList(),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="مشروع جديد"
        subtitle={
          client
            ? `مشروع مباشر للعميل ${client.name} (${client.code ?? ''})`
            : 'يدخل «قيد الإسناد» فور الحفظ'
        }
      />
      <ErrorAlert message={params.error} />
      <ProjectForm
        backPath={`/projects/new${params.clientId ? `?clientId=${params.clientId}` : ''}`}
        lists={lists as ProjectFormLists}
        project={
          client
            ? ({ clientId: client.id } as never)
            : undefined
        }
        companies={companies}
        contacts={contacts}
        users={users}
        currentUserId={user.id}
        canAssign={seeAll}
        showPrice={can(user, 'canViewSellPrice')}
        canDiscount={can(user, 'canDiscount')}
        priceList={priceList}
        discountTypes={Object.entries(DISCOUNT_TYPES)
          .filter(([v]) => v === 'percent' || v === 'amount')
          .map(([value, label]) => ({ value, label }))}
        discountHint={`حدّك ${(limit * 100).toFixed(0)}٪ — ما فوقه يوقف المشروع للاعتماد`}
        cancelHref="/projects"
      />
    </div>
  );
}
