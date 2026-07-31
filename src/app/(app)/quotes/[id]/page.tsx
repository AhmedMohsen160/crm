import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser, canSeeAll } from '@/lib/auth';
import {
  QUOTE_STATUSES,
  QUOTE_STATUS_COLORS,
  UNITS,
  type QuoteStatus,
  type Unit,
} from '@/lib/constants';
import { formatMoney, formatDate, formatNumber, fullName, cn } from '@/lib/utils';
import { PageHeader, Badge } from '@/components/ui';
import { MutateButton, ConfirmMutateButton } from '@/components/forms';
import PrintButton from '@/components/print-button';

export const dynamic = 'force-dynamic';

const COMPANY_AR = process.env.NEXT_PUBLIC_COMPANY_NAME_AR || 'مكتب الترجمة';
const COMPANY_EN = process.env.NEXT_PUBLIC_COMPANY_NAME || '';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = await db.quote.findUnique({ where: { id }, select: { number: true } });
  return { title: q?.number ?? 'عرض سعر' };
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const seeAll = canSeeAll(user);

  const quote = await db.quote.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      company: { select: { id: true, name: true, address: true, taxNumber: true, city: true, country: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      deal: { select: { id: true, title: true } },
      owner: { select: { name: true, email: true, phone: true } },
    },
  });
  if (!quote) notFound();
  if (!seeAll && quote.ownerId !== user.id) notFound();

  const status = quote.status as QuoteStatus;

  return (
    <div className="space-y-6">
      <div className="no-print">
        <PageHeader title={`عرض سعر ${quote.number}`} subtitle={quote.title}>
          <PrintButton />
          <Link href={`/quotes/${id}/edit`} className="btn-secondary">
            <Pencil className="h-4 w-4" />
            تعديل
          </Link>
          <ConfirmMutateButton
            op="quote.delete"
            id={id}
            redirectTo="/quotes"
            label="حذف"
            className="btn-danger"
            confirmText={`حذف عرض السعر ${quote.number} نهائيًا؟`}
          />
        </PageHeader>

        {/* تغيير الحالة */}
        <div className="card card-pad">
          <p className="mb-3 section-title">حالة العرض</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(QUOTE_STATUSES) as QuoteStatus[]).map((s) => (
              <MutateButton
                key={s}
                op="quote.status"
                id={id}
                value={s}
                redirectTo={`/quotes/${id}`}
                className={cn(
                  'badge cursor-pointer transition-all hover:scale-105',
                  status === s
                    ? QUOTE_STATUS_COLORS[s] + ' ring-2 ring-slate-300 ring-offset-1'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                )}
              >
                {QUOTE_STATUSES[s]}
              </MutateButton>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            💡 عند تغيير الحالة إلى &laquo;مُرسل&raquo; تنتقل الصفقة تلقائيًا إلى مرحلة عرض
            السعر، وعند &laquo;مقبول&raquo; تنتقل إلى التفاوض.
          </p>
        </div>
      </div>

      {/* ═══ المستند القابل للطباعة ═══ */}
      <article className="card mx-auto max-w-3xl bg-white p-6 sm:p-10 print:border-0 print:shadow-none">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b-2 border-brand-600 pb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{COMPANY_AR}</h1>
            {COMPANY_EN && (
              <p dir="ltr" className="text-sm text-slate-500">
                {COMPANY_EN}
              </p>
            )}
          </div>
          <div className="text-left">
            <p className="text-lg font-bold text-brand-700">عرض سعر</p>
            <p className="font-mono text-sm text-slate-600">{quote.number}</p>
            <p className="mt-1 text-xs text-slate-500">
              التاريخ: {formatDate(quote.createdAt)}
            </p>
            {quote.validUntil && (
              <p className="text-xs text-slate-500">
                صالح حتى: {formatDate(quote.validUntil)}
              </p>
            )}
          </div>
        </header>

        <section className="mb-8 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              مقدَّم إلى
            </p>
            {quote.company ? (
              <>
                <p className="font-semibold text-slate-900">{quote.company.name}</p>
                {quote.company.address && (
                  <p className="text-sm text-slate-600">{quote.company.address}</p>
                )}
                {(quote.company.city || quote.company.country) && (
                  <p className="text-sm text-slate-600">
                    {[quote.company.city, quote.company.country].filter(Boolean).join('، ')}
                  </p>
                )}
                {quote.company.taxNumber && (
                  <p className="text-sm text-slate-600">
                    الرقم الضريبي: <span dir="ltr">{quote.company.taxNumber}</span>
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400">—</p>
            )}
            {quote.contact && (
              <div className="mt-2 text-sm text-slate-600">
                <p>عناية: {fullName(quote.contact.firstName, quote.contact.lastName)}</p>
                {quote.contact.email && <p dir="ltr" className="text-left">{quote.contact.email}</p>}
                {quote.contact.phone && <p dir="ltr" className="text-left">{quote.contact.phone}</p>}
              </div>
            )}
          </div>

          <div className="sm:text-left">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              مسؤول العرض
            </p>
            {quote.owner ? (
              <>
                <p className="font-semibold text-slate-900">{quote.owner.name}</p>
                {quote.owner.email && (
                  <p dir="ltr" className="text-sm text-slate-600">
                    {quote.owner.email}
                  </p>
                )}
                {quote.owner.phone && (
                  <p dir="ltr" className="text-sm text-slate-600">
                    {quote.owner.phone}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400">—</p>
            )}
            <div className="mt-3 no-print">
              <Badge className={QUOTE_STATUS_COLORS[status]}>
                {QUOTE_STATUSES[status] ?? quote.status}
              </Badge>
            </div>
          </div>
        </section>

        <h2 className="mb-3 text-base font-bold text-slate-900">{quote.title}</h2>

        <div className="table-wrap mb-6">
          <table className="tbl min-w-[560px]">
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th>الوصف</th>
                <th>الوحدة</th>
                <th>الكمية</th>
                <th>سعر الوحدة</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((it, i) => (
                <tr key={it.id}>
                  <td className="nums text-slate-400">{i + 1}</td>
                  <td>
                    <p className="font-medium text-slate-800">{it.description}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[
                        it.serviceType,
                        it.sourceLang && it.targetLang
                          ? `${it.sourceLang} ← ${it.targetLang}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' • ')}
                    </p>
                  </td>
                  <td className="text-xs">{UNITS[it.unit as Unit] ?? it.unit}</td>
                  <td className="nums">{formatNumber(it.quantity)}</td>
                  <td className="nums">{formatMoney(it.unitPrice, quote.currency)}</td>
                  <td className="nums font-semibold">
                    {formatMoney(it.lineTotal, quote.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mb-8 flex justify-end">
          <dl className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">المجموع الفرعي</dt>
              <dd className="nums font-medium">{formatMoney(quote.subtotal, quote.currency)}</dd>
            </div>
            {quote.discount > 0 && (
              <div className="flex justify-between text-rose-700">
                <dt>الخصم</dt>
                <dd className="nums font-medium">
                  − {formatMoney(quote.discount, quote.currency)}
                </dd>
              </div>
            )}
            {quote.taxRate > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-600">
                  الضريبة (<span className="nums">{quote.taxRate}%</span>)
                </dt>
                <dd className="nums font-medium">
                  {formatMoney(quote.taxAmount, quote.currency)}
                </dd>
              </div>
            )}
            <div className="flex justify-between border-t-2 border-slate-800 pt-2 text-base">
              <dt className="font-bold text-slate-900">الإجمالي</dt>
              <dd className="nums font-bold text-brand-700">
                {formatMoney(quote.total, quote.currency)}
              </dd>
            </div>
          </dl>
        </div>

        {quote.notes && (
          <section className="mb-6">
            <h3 className="mb-1.5 text-sm font-semibold text-slate-800">ملاحظات</h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
              {quote.notes}
            </p>
          </section>
        )}

        {quote.terms && (
          <section className="border-t border-slate-200 pt-4">
            <h3 className="mb-1.5 text-sm font-semibold text-slate-800">الشروط والأحكام</h3>
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
              {quote.terms}
            </p>
          </section>
        )}

        <footer className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
          شكرًا لثقتكم — {COMPANY_AR}
        </footer>
      </article>

      {quote.deal && (
        <p className="text-center text-sm text-slate-500 no-print">
          مرتبط بالصفقة:{' '}
          <Link href={`/deals/${quote.deal.id}`} className="link">
            {quote.deal.title}
          </Link>
        </p>
      )}
    </div>
  );
}
