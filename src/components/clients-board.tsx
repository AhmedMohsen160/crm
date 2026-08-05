'use client';

import { useEffect, useRef, useState } from 'react';
import Link from '@/components/link';
import { Search, Loader2, Briefcase, Users, Sparkles } from 'lucide-react';
import { Badge, EmptyState } from '@/components/ui';
import { FilterSelect } from '@/components/filters';
import {
  CLIENT_SEGMENTS,
  CLIENT_SEGMENT_COLORS,
  CLIENT_SEGMENT_ORDER,
  CLIENT_PERIODS,
  CLIENT_SORTS,
  type ClientSegment,
} from '@/lib/client-segments';
import { formatMoney, formatDate } from '@/lib/utils';

export type BoardClient = {
  id: string;
  code: string | null;
  name: string;
  phone: string;
  type: string;
  companyName: string | null;
  city: string | null;
  adminName: string | null;
  dealCount: number;
  totalValue: number;
  /** نصّ ISO — الخادم لا يرسل كائن تاريخ */
  lastDealAt: string | null;
  segment: string;
};

export type Option = { value: string; label: string };

const TYPE_LABELS: Record<string, string> = { individual: 'فرد', company: 'شركة' };

/**
 * سجل العملاء — البحث الفوري والفلاتر والتصنيف في شاشة واحدة.
 *
 * أربع قواعد تحكمها:
 *
 * ١) **لا ينتظر «إدخال»** — يبحث بعد ٢٠٠ ملّي ثانية من آخر حرف. والكاونتر
 *    يكتب حرفين ويرى، لا يكتب ثم يضغط ثم ينتظر تحميل صفحة.
 *
 * ٢) **الفارغ ليس فراغًا** — قبل أن يكتب حرفًا يظهر سجلُّ فريقه مرتَّبًا.
 *
 * ٣) **الفلاتر تُرسل بالعنوان** لا بالمتصفح: تغييرُ فلتر حدثٌ نادر يستحقّ
 *    عنوانًا يُحفظ ويُرسَل لغيره، بخلاف الكتابة التي تتكرّر في الثانية.
 *
 * ٤) **«مشروع جديد» بجانب كل عميل** — لا يُفتح ملفُّ العميل ليُفتح المشروع.
 *
 * وتعمل بلا جافاسكربت: الحقول كلها داخل `form` بطريقة GET، فالضغط على
 * «إدخال» يُرجع الصفحة مرشَّحةً من الخادم كما لو لم يكن هنا كودٌ أصلًا.
 */
export default function ClientsBoard({
  initialRows,
  initialTotal,
  initialQuery = '',
  filters,
  branches,
  team,
  seeAll,
  showValue,
}: {
  initialRows: BoardClient[];
  initialTotal: number;
  initialQuery?: string;
  /** الفلاتر المطبَّقة — تُرسل مع البحث الفوري فلا تختلف نتيجته عن الصفحة */
  filters: Record<string, string>;
  branches: Option[];
  team: Option[];
  seeAll: boolean;
  showValue: boolean;
}) {
  const [term, setTerm] = useState(initialQuery);
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);
  const first = useRef(true);

  useEffect(() => {
    // لا نُعيد جلب ما جاء مع الصفحة
    if (first.current) {
      first.current = false;
      return;
    }

    const token = ++latest.current;
    setBusy(true);

    const timer = setTimeout(async () => {
      try {
        const qs = new URLSearchParams(filters);
        qs.set('q', term);
        const res = await fetch(`/api/clients/search?${qs.toString()}`);
        const data = await res.json();
        // استجابةٌ قديمة وصلت متأخرةً لا تكتب فوق الأحدث
        if (token !== latest.current) return;
        setRows(data.clients ?? []);
        setTotal(data.total ?? 0);
      } catch {
        if (token === latest.current) setRows([]);
      } finally {
        if (token === latest.current) setBusy(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [term, filters]);

  const sortHref = (value: string) => {
    const qs = new URLSearchParams(filters);
    if (term) qs.set('q', term);
    qs.set('sort', value);
    return `/clients?${qs.toString()}`;
  };

  return (
    <>
      <div className="card card-pad">
        <form method="get" className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-80">
            <input
              type="search"
              name="q"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              autoComplete="off"
              placeholder="اكتب حرفًا — الهاتف أو الاسم أو CL-00001"
              className="input pr-9"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </span>
          </div>

          {filters.sort && <input type="hidden" name="sort" value={filters.sort} />}

          <FilterSelect
            name="admin"
            defaultValue={filters.admin}
            placeholder={seeAll ? 'كل الموظفين' : 'كل الفريق'}
            options={team}
          />
          <FilterSelect
            name="period"
            defaultValue={filters.period}
            placeholder="كل الفترات"
            options={Object.entries(CLIENT_PERIODS).map(([value, label]) => ({ value, label }))}
          />
          <FilterSelect
            name="segment"
            defaultValue={filters.segment}
            placeholder="كل التصنيفات"
            options={CLIENT_SEGMENT_ORDER.map((value) => ({
              value,
              label: CLIENT_SEGMENTS[value],
            }))}
          />
          <FilterSelect
            name="type"
            defaultValue={filters.type}
            placeholder="أفراد وشركات"
            options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <FilterSelect
            name="branch"
            defaultValue={filters.branch}
            placeholder="كل الفروع"
            options={branches}
          />
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-400">الترتيب:</span>
          {Object.entries(CLIENT_SORTS).map(([value, label]) => {
            const active = (filters.sort || 'value') === value;
            return (
              <Link
                key={value}
                href={sortHref(value)}
                className={
                  active
                    ? 'rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white'
                    : 'rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50'
                }
              >
                {label}
              </Link>
            );
          })}
          <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-slate-500">
            {term ? (
              <>
                <b className="nums">{total}</b> نتيجة
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 text-lime-500" />
                <b className="nums">{total}</b> عميلًا في نطاقك
              </>
            )}
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Users className="h-10 w-10" />}
            title={term ? 'لا عميل بهذا الرقم أو الاسم' : 'لا عملاء مطابقون'}
            description={
              term
                ? 'يمكنك تسجيله عميلًا جديدًا — ولن يتكرّر لأن الرقم مفتاح فريد.'
                : 'وسّع الفترة أو امسح الفلاتر. والعميل يدخل السجل بأول ليد أو مشروع باسمه.'
            }
            actionHref={term ? `/clients/new?name=${encodeURIComponent(term)}` : '/clients/new'}
            actionLabel="عميل جديد"
          />
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="tbl tbl-wide">
            <thead>
              <tr>
                <th>العميل</th>
                <th>النوع</th>
                <th>التصنيف</th>
                <th>مشاريعه</th>
                {showValue && <th>مشترياته</th>}
                <th>آخر تعامل</th>
                <th>أدمن المبيعات</th>
                <th className="text-left">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="min-w-[13rem]">
                    <Link href={`/clients/${c.id}`} className="link font-medium">
                      {c.name}
                    </Link>
                    <span className="block text-[11px] text-slate-400" dir="ltr">
                      {c.code ?? ''} {c.phone}
                    </span>
                    {c.companyName && (
                      <span className="block text-[11px] text-slate-500">{c.companyName}</span>
                    )}
                  </td>

                  <td className="whitespace-nowrap text-sm text-slate-600">
                    {TYPE_LABELS[c.type] ?? c.type}
                    {c.city && <span className="block text-[11px] text-slate-400">{c.city}</span>}
                  </td>

                  <td>
                    <Badge className={CLIENT_SEGMENT_COLORS[c.segment as ClientSegment]}>
                      {CLIENT_SEGMENTS[c.segment as ClientSegment] ?? c.segment}
                    </Badge>
                  </td>

                  <td className="nums">
                    {c.dealCount || <span className="text-slate-300">—</span>}
                  </td>

                  {showValue && (
                    <td className="nums font-semibold">
                      {c.totalValue ? (
                        formatMoney(c.totalValue)
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  )}

                  {/* «غير مقيس» تُعرض شرطةً لا صفرًا — الفرق قرارٌ في حق أحد */}
                  <td className="whitespace-nowrap text-sm text-slate-600">
                    {c.lastDealAt ? (
                      formatDate(new Date(c.lastDealAt))
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>

                  <td className="whitespace-nowrap text-sm text-slate-700">
                    {c.adminName ?? <span className="text-slate-300">—</span>}
                  </td>

                  <td className="text-left">
                    {/* المشروع يُفتح من هنا مباشرةً — بلا فتح ملف العميل */}
                    <Link
                      href={`/projects/new?clientId=${c.id}`}
                      className="btn-secondary inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1.5 text-xs"
                    >
                      <Briefcase className="h-3.5 w-3.5" />
                      مشروع جديد
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > rows.length && (
        <p className="text-xs text-slate-400">
          يُعرض <b className="nums">{rows.length}</b> من <b className="nums">{total}</b> — ضيّق
          بالبحث أو بالفترة لترى الباقي.
        </p>
      )}
    </>
  );
}
