'use client';

import { useEffect, useRef, useState } from 'react';
import Link from '@/components/link';
import { Search, Loader2, Plus, Users, Sparkles } from 'lucide-react';
import { Badge, EmptyState } from '@/components/ui';
import { CLIENT_TYPES, type ClientType } from '@/lib/constants';
import { formatPhone, normalizePhone } from '@/lib/phone';
import { formatDate } from '@/lib/utils';

export type ClientRow = {
  id: string;
  code: string | null;
  name: string;
  phone: string;
  type: string;
  companyName: string | null;
  city: string | null;
  createdAt: string;
  projects?: number;
};

/**
 * سجل العملاء بالبحث الفوري.
 *
 * ثلاث قواعد تحكم هذه الشاشة:
 *
 * ١) **لا ينتظر «إدخال»** — يبحث بعد ٢٠٠ ملّي ثانية من آخر حرف. والكاونتر
 *    يكتب حرفين ويرى، لا يكتب ثم يضغط ثم ينتظر تحميل صفحة.
 *
 * ٢) **الفارغ ليس فراغًا** — قبل أن يكتب حرفًا تظهر قائمة أكثر العملاء
 *    تعاملًا. وأغلب فتحات الشاشة تنتهي عند واحد منهم.
 *
 * ٣) **«مشروع جديد» بجانب كل عميل** — لا يُفتح ملفُّ العميل ليُفتح المشروع.
 *    والعميل العائد أشيع من الجديد في هذا المكتب.
 *
 * والنموذج يعمل بلا جافاسكربت: الحقل داخل `form` بطريقة GET، فالضغط على
 * «إدخال» يُرسل ويُرجع الصفحة مرشَّحةً من الخادم كما كانت.
 */
export default function ClientSearch({
  initialQuery = '',
  initialRows,
  initialSuggested,
}: {
  initialQuery?: string;
  initialRows: ClientRow[];
  /** هل الصفوف الأولى اقتراحٌ (أكثر تعاملًا) لا نتيجةَ بحث؟ */
  initialSuggested: boolean;
}) {
  const [term, setTerm] = useState(initialQuery);
  const [rows, setRows] = useState(initialRows);
  const [suggested, setSuggested] = useState(initialSuggested);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
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
    const started = Date.now();

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients/search?q=${encodeURIComponent(term)}`);
        const data = await res.json();
        // استجابةٌ قديمة وصلت متأخرةً لا تكتب فوق الأحدث
        if (token !== latest.current) return;
        setRows(data.clients ?? []);
        setSuggested(Boolean(data.suggested));
        setElapsed(Date.now() - started);
      } catch {
        if (token === latest.current) setRows([]);
      } finally {
        if (token === latest.current) setBusy(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [term]);

  return (
    <>
      <form method="get" className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-96">
          <input
            type="search"
            name="q"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            autoComplete="off"
            placeholder="اكتب حرفًا واحدًا — رقم الهاتف أو الاسم أو CL-00001"
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

        {suggested ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-lime-500" />
            أكثر عملائك تعاملًا — اكتب لتبحث في الجميع
          </span>
        ) : (
          <span className="text-xs text-slate-400">
            {rows.length} نتيجة
            {elapsed !== null && ` في ${elapsed} ملّي ثانية`}
          </span>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title={term ? 'لا عميل بهذا الرقم أو الاسم' : 'لا عملاء بعد'}
          description={
            term
              ? 'يمكنك تسجيله كعميل جديد — لن يتكرر لأن الرقم مفتاح فريد.'
              : 'أول عميل يُسجَّل تلقائيًا مع أول ليد.'
          }
          actionHref={term ? `/clients/new?name=${encodeURIComponent(term)}` : '/clients/new'}
          actionLabel="عميل جديد"
        />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>رقم العميل</th>
                <th>الاسم</th>
                <th>الهاتف</th>
                <th>النوع</th>
                <th>المدينة</th>
                <th>مسجَّل منذ</th>
                <th className="text-left">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap text-xs text-slate-500" dir="ltr">
                    {c.code}
                  </td>
                  <td>
                    <Link href={`/clients/${c.id}`} className="link font-medium">
                      {c.name}
                    </Link>
                    {c.companyName && (
                      <span className="block text-xs text-slate-400">{c.companyName}</span>
                    )}
                    {suggested && c.projects ? (
                      <span className="block text-xs text-lime-700">{c.projects} مشروعًا</span>
                    ) : null}
                  </td>
                  <td dir="ltr" className="text-left text-sm text-slate-600">
                    {formatPhone(normalizePhone(c.phone).value)}
                  </td>
                  <td>
                    <Badge
                      className={
                        c.type === 'company'
                          ? 'border-indigo-300 bg-indigo-100 text-indigo-700'
                          : 'border-slate-300 bg-slate-100 text-slate-600'
                      }
                    >
                      {CLIENT_TYPES[c.type as ClientType] ?? c.type}
                    </Badge>
                  </td>
                  <td className="text-sm text-slate-600">{c.city ?? '—'}</td>
                  <td className="whitespace-nowrap text-xs text-slate-500">
                    {formatDate(new Date(c.createdAt))}
                  </td>
                  <td className="text-left">
                    {/* المشروع يُفتح من هنا مباشرةً — بلا فتح ملف العميل */}
                    <Link
                      href={`/projects/new?clientId=${c.id}`}
                      className="btn-secondary whitespace-nowrap px-2.5 py-1.5 text-xs"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      مشروع جديد
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
