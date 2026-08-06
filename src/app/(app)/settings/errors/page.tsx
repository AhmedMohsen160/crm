import Link from '@/components/link';
import { ShieldAlert, CheckCircle2 } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { kindLabel } from '@/lib/error-log';
import { formatDate } from '@/lib/utils';
import { PageHeader, Badge, EmptyState } from '@/components/ui';

export const metadata = { title: 'أعطال النظام' };
export const dynamic = 'force-dynamic';

/**
 * سجلّ الأعطال.
 *
 * **أغلب الأعطال لا يشتكي منها أحد.** يلتفّ الموظف حول الشاشة التي لا تعمل
 * ويكمل يومه، فيبقى العطل شهورًا ولا يعلم به صاحب القرار. وهذه الشاشة تجعله
 * يصل بلا وسيط.
 *
 * **وليست سجلّ تدقيق**: ذاك يوثّق ما فعله الناس ويبقى، وهذا يوثّق ما انكسر
 * ويُقلَّم. ولا يحمل سرًّا — يُنقّى قبل الكتابة.
 */
export default async function ErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  await requirePermission('canManageSettings');
  const { all } = await searchParams;

  const [rows, unseen] = await Promise.all([
    db.errorLog.findMany({
      where: all ? {} : { seen: false },
      include: { user: { select: { name: true } } },
      orderBy: [{ updatedAt: 'desc' }],
      take: 100,
    }),
    db.errorLog.count({ where: { seen: false } }),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="أعطال النظام"
        subtitle={
          unseen === 0
            ? 'لا عطل جديد — والقائمة تُحدَّث لحظةَ وقوعه'
            : `${unseen} عطلًا لم يُطّلع عليه`
        }
      >
        <Link href={all ? '/settings/errors' : '/settings/errors?all=1'} className="btn-secondary">
          {all ? 'الجديد فقط' : 'عرض الكل'}
        </Link>
        {unseen > 0 && (
          <form method="post" action="/api/save" className="inline">
            <input type="hidden" name="entity" value="errors.seen" />
            <input type="hidden" name="back" value="/settings/errors" />
            <button type="submit" className="btn-primary">
              <CheckCircle2 className="h-4 w-4" />
              اطّلعت على الكل
            </button>
          </form>
        )}
      </PageHeader>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<ShieldAlert className="h-12 w-12" />}
            title={all ? 'لا أعطال مسجَّلة' : 'لا عطل جديد'}
            description="يظهر هنا كل ما انكسر في الخادم — بلا أن ينتظر شكوى موظف."
          />
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="tbl tbl-wide">
            <thead>
              <tr>
                <th>آخر مرة</th>
                <th>أين</th>
                <th>ماذا</th>
                <th>التكرار</th>
                <th>من كان يعمل</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={row.seen ? 'opacity-60' : undefined}>
                  <td className="whitespace-nowrap text-sm text-slate-600">
                    {formatDate(row.updatedAt)}
                    {!row.seen && (
                      <Badge className="mr-2 border-rose-200 bg-rose-50 text-rose-700">جديد</Badge>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-sm text-slate-700">
                    {kindLabel(row.kind)}
                    {row.path && (
                      <span className="block text-[11px] text-slate-400" dir="ltr">
                        {row.path}
                      </span>
                    )}
                  </td>
                  <td className="min-w-[18rem]">
                    <span className="block text-sm text-slate-800">{row.message}</span>
                    {row.detail && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[11px] text-brand-600">
                          التفصيل التقني
                        </summary>
                        <pre
                          dir="ltr"
                          className="mt-1 max-h-48 overflow-auto rounded bg-slate-50 p-2 text-left text-[10px] leading-relaxed text-slate-600"
                        >
                          {row.detail}
                        </pre>
                      </details>
                    )}
                  </td>
                  {/* التكرار هو ما يفرز العطل العابر من العطل المقيم */}
                  <td className="nums font-semibold">
                    {row.count > 1 ? (
                      <span className="text-rose-700">{row.count}×</span>
                    ) : (
                      <span className="text-slate-400">1</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-sm text-slate-600">
                    {row.user?.name ?? <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400">
        الرسائل تُنقّى قبل حفظها: لا كلمة مرور ولا مفتاح ولا رابط اتصال يدخل هذا
        السجل.
      </p>
    </div>
  );
}
