import Link from '@/components/link';
import { Bell, BellOff, CheckCheck, RefreshCw } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUser, can } from '@/lib/auth';
import { NOTIFICATION_EVENTS, eventByKey } from '@/lib/notifications';
import { formatDate } from '@/lib/utils';
import { PageHeader, Badge, EmptyState, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';
import { FilterBar, FilterSelect } from '@/components/filters';

export const metadata = { title: 'التنبيهات' };
export const dynamic = 'force-dynamic';

const SEVERITY_STYLE: Record<string, string> = {
  urgent: 'border-rose-200 bg-rose-50 text-rose-700',
  warn: 'border-amber-200 bg-amber-50 text-amber-700',
  info: 'border-brand-200 bg-brand-50 text-brand-700',
};

const CADENCE_LABEL: Record<string, string> = {
  immediate: 'فوري',
  daily: 'ملخص يومي',
  weekly: 'ملخص أسبوعي',
  interval: 'دوري',
};

/**
 * صندوق التنبيهات.
 *
 * كل بطاقة **ملخص واحد** لا رسالة لكل سجل (§١٢): «مشاريع متأخرة (٧)»
 * بسبعة أسطر، لا سبع بطاقات. من يتلقى سبعًا يُغلقها، ومن يتلقى واحدة
 * يقرأها.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; event?: string; saved?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { filter, event, saved, error } = await searchParams;
  const showRead = filter === 'all';

  const [items, unread, runs] = await Promise.all([
    db.notification.findMany({
      where: {
        userId: user.id,
        ...(showRead ? {} : { readAt: null }),
        ...(event ? { eventKey: event } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    can(user, 'canManageSettings')
      ? db.notificationRun.findMany()
      : Promise.resolve([]),
  ]);

  const runByKey = new Map(runs.map((r) => [r.eventKey, r]));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="التنبيهات"
        subtitle={unread > 0 ? `${unread} لم تُقرأ` : 'لا جديد'}
      >
        {unread > 0 && (
          <form method="post" action="/api/save">
            <input type="hidden" name="entity" value="notifications.read" />
            <input type="hidden" name="scope" value="all" />
            <input type="hidden" name="back" value="/notifications" />
            <SaveButton>
              <CheckCheck className="h-4 w-4" />
              علّم الكل مقروءًا
            </SaveButton>
          </form>
        )}
      </PageHeader>
      <ErrorAlert message={error} />

      {saved && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCheck className="h-4 w-4 shrink-0" />
          تم.
        </div>
      )}

      <FilterBar>
        <FilterSelect
          name="filter"
          defaultValue={filter}
          placeholder="غير المقروءة"
          options={[{ value: 'all', label: 'الكل' }]}
        />
        <FilterSelect
          name="event"
          defaultValue={event}
          placeholder="كل الأحداث"
          options={NOTIFICATION_EVENTS.map((e) => ({ value: e.key, label: e.label }))}
        />
      </FilterBar>

      {items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<BellOff className="h-10 w-10" />}
            title={showRead ? 'لا تنبيهات' : 'لا تنبيهات غير مقروءة'}
            description="التنبيه لا يُرسَل إلا حين يوجد ما يستحقه — و«لا مشاكل» ليست خبرًا يستحق رسالة."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const def = eventByKey(item.eventKey);
            return (
              <article
                key={item.id}
                className={`card card-pad ${item.readAt ? 'opacity-60' : ''}`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge className={SEVERITY_STYLE[item.severity] ?? SEVERITY_STYLE.info}>
                    {item.severity === 'urgent'
                      ? 'عاجل'
                      : item.severity === 'warn'
                        ? 'يحتاج انتباهًا'
                        : 'للعلم'}
                  </Badge>
                  <span className="font-semibold text-slate-800">{item.title}</span>
                  {def && (
                    <span className="text-xs text-slate-400">
                      {CADENCE_LABEL[def.cadence.kind] ?? ''}
                    </span>
                  )}
                  <span className="mr-auto text-xs text-slate-400">
                    {formatDate(item.createdAt)}
                  </span>
                </div>

                <pre className="whitespace-pre-wrap text-sm text-slate-600">{item.body}</pre>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {item.link && (
                    <Link href={item.link} className="btn-secondary btn-sm">
                      افتح
                    </Link>
                  )}
                  {!item.readAt && (
                    <form method="post" action="/api/save">
                      <input type="hidden" name="entity" value="notifications.read" />
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="back" value="/notifications" />
                      <button type="submit" className="text-xs text-slate-500 hover:underline">
                        علّم مقروءًا
                      </button>
                    </form>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ── جدول §١٢ لمن يدير الإعدادات ─────────────────────── */}
      {can(user, 'canManageSettings') && (
        <section className="card card-pad">
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-800">
            <Bell className="h-4 w-4 text-brand-600" />
            أحداث التنبيه الثمانية
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            المستقبِل يُحدَّد <b>بالصلاحية</b> لا بالدور، فمن تمنحه الصلاحية غدًا
            تصله التنبيهات بلا تعديل.
          </p>

          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>الحدث</th>
                  <th>التوقيت</th>
                  <th>آخر تشغيل</th>
                  <th>آخر عدد</th>
                </tr>
              </thead>
              <tbody>
                {NOTIFICATION_EVENTS.map((e) => {
                  const run = runByKey.get(e.key);
                  return (
                    <tr key={e.key}>
                      <td className="text-sm">
                        {e.label}
                        <span className="block text-xs text-slate-400">{e.hint}</span>
                      </td>
                      <td className="text-xs text-slate-500">
                        {CADENCE_LABEL[e.cadence.kind]}
                        {e.cadence.kind === 'daily' && ` ${e.cadence.hour}:00`}
                        {e.cadence.kind === 'weekly' && ` الأحد ${e.cadence.hour}:00`}
                        {e.cadence.kind === 'interval' && ` كل ${e.cadence.hours} ساعات`}
                      </td>
                      <td className="text-xs text-slate-400">
                        {run ? formatDate(run.lastRunAt) : '—'}
                      </td>
                      <td className="nums text-slate-600">{run?.lastCount ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <form method="post" action="/api/save" className="mt-4">
            <input type="hidden" name="entity" value="notifications.run" />
            <input type="hidden" name="back" value="/notifications" />
            <SaveButton>
              <RefreshCw className="h-4 w-4" />
              افحص الآن
            </SaveButton>
            <p className="mt-2 text-xs text-slate-400">
              يُستدعى عادةً من مؤقّت خارجي كل ساعة. والتشغيل <b>آمن التكرار</b>:
              فحصان متتاليان لا يُنتجان رسالتين — ومفتاح منع التكرار هو الحارس.
            </p>
          </form>
        </section>
      )}
    </div>
  );
}
