import Link from '@/components/link';
import { Calculator, Lock, Unlock, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { rateFor } from '@/lib/branch-engine';
import { ALLOCATION_BASES, REJECTED_BASIS, MATURITY_STAGES } from '@/lib/branch-economics';
import { formatMoney, formatDateTime } from '@/lib/utils';
import { PageHeader, ErrorAlert, FormField, SelectField } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'المعدل المعياري' };
export const dynamic = 'force-dynamic';

/**
 * المعدل المعياري للتحميل — **مثبَّت لسنة كاملة**.
 *
 * لماذا لا يُحسب شهريًا (§٤٫٢): الحساب الشهري صحيح رياضيًا ومطابق للمثبَّت في
 * المتوسط، لكنه يُنتج أربعة أعطال: يُلغي التخطيط، ويعاقب الفرع على أداء غيره،
 * ويُخفي الرفع التشغيلي، ويُخفي تكلفة الطاقة العاطلة.
 */
export default async function AllocationPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    error?: string;
    saved?: string;
    suggest?: string;
    mass?: string;
    revenue?: string;
    months?: string;
  }>;
}) {
  await requirePermission('canManageAccounting');
  const sp = await searchParams;
  const year = Number(sp.year) || new Date().getFullYear();

  const [current, history, settings] = await Promise.all([
    rateFor(year),
    db.allocationRate.findMany({ orderBy: { year: 'desc' }, take: 6 }),
    db.setting.findMany({ where: { key: { startsWith: 'maturity_factor_' } } }),
  ]);

  const suggested = sp.suggest ? Number(sp.suggest) : null;
  const money = (n: number) => formatMoney(n, 'EGP');
  const factorOf = (stage: string) =>
    settings.find((s) => s.key === `maturity_factor_${stage}`)?.value ?? '—';

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="المعدل المعياري" subtitle={`سنة ${year} — مثبَّت لا متحرّك`}>
        <Link href="/finance/branches" className="btn-secondary">
          محاسبة الفروع
        </Link>
      </PageHeader>
      <ErrorAlert message={sp.error} />
      {sp.saved && (
        <p className="mb-4 rounded-lg border border-lime-300 bg-lime-50 px-4 py-3 text-sm text-lime-900">
          حُفظ المعدل.
        </p>
      )}

      <section className="card card-pad mb-5 bg-slate-50/60">
        <h2 className="mb-2 section-title">لماذا يُثبَّت ولا يُحسب شهريًا</h2>
        <p className="mb-2 text-xs leading-relaxed text-slate-600">
          التوزيع الشهري (قسمة الكتلة الفعلية بنسبة إيراد كل فرع في نفس الشهر){' '}
          <b>صحيح رياضيًا ومطابق للمثبَّت في المتوسط</b> — لكنه يُنتج أربعة أعطال:
        </p>
        <ol className="space-y-1 text-xs leading-relaxed text-slate-600">
          <li>
            <b>١) يُلغي قابلية التخطيط.</b> التارجت مشتقّ من التعادل، والتعادل من النسبة.
            فإن تحرّكت النسبة شهريًا صار التارجت مجهولًا حتى ينتهي الشهر — وهو نقضٌ لوظيفته.
          </li>
          <li>
            <b>٢) يعاقب الفرع على أداء غيره.</b> الكتلة موزَّعة بالكامل دائمًا، فتراجع فرعٍ
            يرفع تحميل الباقين رغم ثبات أدائهم.
          </li>
          <li>
            <b>٣) يُخفي الرفع التشغيلي.</b> الكتلة ثابتة، فنمو الإيراد يفترض أن يخفض نسبتها —
            وهو المكسب الأساسي من النمو.
          </li>
          <li>
            <b>٤) يُخفي تكلفة الطاقة العاطلة</b> — وهي أهم مؤشر لقرار التوسّع.
          </li>
        </ol>
        <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-slate-600">
          والتسوية: <b>المثبَّت</b> للتخطيط والتارجت والتسعير، و<b>التوزيع الفعلي</b> للإقفال —
          والفرق بينهما لا يضيع بل يظهر بندًا صريحًا اسمه «فرق استرداد التكلفة».
        </p>
      </section>

      {/* ── الاشتقاق ────────────────────────────────────── */}
      <section className="card card-pad mb-5">
        <h2 className="mb-1 flex items-center gap-2 section-title">
          <Calculator className="h-4 w-4 text-brand-600" />
          اشتقاق من التاريخ
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          المعدل = إجمالي الكتلة المشتركة ÷ إجمالي إيراد الشركة، من متوسط ٣ إلى ١٢ شهرًا.
        </p>
        <form method="post" action="/api/save" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="entity" value="allocation.derive" />
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="back" value={`/finance/branches/allocation?year=${year}`} />
          <FormField
            label="عدد الشهور"
            name="months"
            type="number"
            min="3"
            max="12"
            defaultValue={sp.months ?? 12}
            dir="ltr"
            className="w-32"
          />
          <button type="submit" className="btn-secondary mb-0.5">
            اشتقّ
          </button>
        </form>

        {suggested !== null && (
          <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm">
            <p className="font-bold text-brand-800">
              المعدل المشتقّ: <span className="nums">{(suggested * 100).toFixed(2)}%</span>
            </p>
            <p className="mt-1 text-xs text-slate-600">
              كتلة مشتركة {money(Number(sp.mass ?? 0))} ÷ إيراد {money(Number(sp.revenue ?? 0))} عبر{' '}
              {sp.months} شهرًا. انسخه في الخانة أدناه إن اعتمدته — <b>ولا يُثبَّت آليًّا</b>:
              التثبيت قرار إدارة لا نتيجة حساب.
            </p>
          </div>
        )}
      </section>

      {/* ── التثبيت ─────────────────────────────────────── */}
      <section className="card card-pad mb-5">
        <h2 className="mb-4 section-title">المعدل المثبَّت لسنة {year}</h2>
        <form method="post" action="/api/save" className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="entity" value="allocation.rate" />
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="back" value={`/finance/branches/allocation?year=${year}`} />
          <input type="hidden" name="derivedRate" value={suggested ?? current.row?.derivedRate ?? ''} />
          <input type="hidden" name="derivedMass" value={sp.mass ?? current.row?.derivedMass ?? ''} />
          <input type="hidden" name="derivedRevenue" value={sp.revenue ?? current.row?.derivedRevenue ?? ''} />

          <FormField
            label="المعدل (٠٫٤٥ = ٤٥٪)"
            name="standardRate"
            type="number"
            step="0.0001"
            min="0"
            max="0.99"
            dir="ltr"
            required
            defaultValue={suggested ?? current.standardRate}
          />
          <SelectField
            label="أساس التوزيع"
            name="basis"
            defaultValue={current.basis}
            placeholder="الإيراد"
            options={Object.entries(ALLOCATION_BASES)
              .filter(([value]) => value !== REJECTED_BASIS)
              .map(([value, label]) => ({ value, label }))}
            hint="عدد الطلبات مرفوض: قيمة الطلب تتفاوت أضعافًا بين مؤسسي وتجزئة"
          />
          <FormField
            label="عدد شهور الاشتقاق"
            name="derivedFromMonths"
            type="number"
            min="3"
            max="12"
            dir="ltr"
            defaultValue={Number(sp.months) || current.row?.derivedFromMonths || 12}
          />
          <div className="flex items-end gap-4 pb-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="lock" className="h-4 w-4 rounded border-slate-300" />
              <Lock className="h-3.5 w-3.5" /> اقفله للسنة
            </label>
            {current.locked && (
              <label className="flex items-center gap-2 text-sm text-amber-700">
                <input type="checkbox" name="unlock" className="h-4 w-4 rounded border-slate-300" />
                <Unlock className="h-3.5 w-3.5" /> افتحه
              </label>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="notes">
              سند الرقم
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              className="input"
              defaultValue={current.row?.notes ?? ''}
              placeholder="مثال: مشتقّ من فعليّ ١٢ شهرًا حتى ديسمبر، ومرفوع ٢٪ لتوقّع زيادة رواتب الإنتاج."
            />
          </div>
          <div className="sm:col-span-2">
            <SaveButton>ثبّت المعدل</SaveButton>
          </div>
        </form>

        {current.locked && (
          <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <Lock className="h-3.5 w-3.5" />
            مقفل — سنةٌ بمعدَّلين لا تُقارَن شهورها.
          </p>
        )}
      </section>

      {/* ── معاملات النضج ───────────────────────────────── */}
      <section className="card card-pad mb-5">
        <h2 className="mb-2 section-title">معاملات النضج</h2>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          نسبة التحميل المطبَّقة = المعدل المعياري × معامل مرحلة الفرع. والمبرّر اقتصادي:
          الكتلة قائمة ومدفوعة سلفًا، وطلبات الفرع الجديد تُنفَّذ بطاقة مشتراة فتكلفتها
          الحدّية تقارب الصفر. تحميل فرع جديد كناضج يشوّه ربحيته ويرفع تارجته بلا مقابل.
        </p>
        <div className="grid gap-2 sm:grid-cols-4">
          {Object.entries(MATURITY_STAGES).map(([key, label]) => (
            <div key={key} className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="nums text-lg font-bold text-slate-800">
                {((Number(factorOf(key)) || 0) * 100).toFixed(0)}%
              </p>
              <p className="nums text-[11px] text-slate-400">
                ← {((current.standardRate * (Number(factorOf(key)) || 0)) * 100).toFixed(1)}%
              </p>
            </div>
          ))}
        </div>
        <Link href="/settings/system?group=محاسبة الفروع" className="link mt-3 inline-block text-xs">
          عدّل المعاملات في الإعدادات
        </Link>
      </section>

      {history.length > 0 && (
        <section className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>السنة</th>
                <th>المعدل</th>
                <th>المشتقّ</th>
                <th>الأساس</th>
                <th>الحال</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.year}>
                  <td>
                    <Link href={`/finance/branches/allocation?year=${r.year}`} className="link">
                      {r.year}
                    </Link>
                  </td>
                  <td className="nums text-sm font-bold">{(r.standardRate * 100).toFixed(2)}%</td>
                  <td className="nums text-sm text-slate-500">
                    {r.derivedRate === null ? '—' : `${(r.derivedRate * 100).toFixed(2)}%`}
                  </td>
                  <td className="text-sm text-slate-600">
                    {ALLOCATION_BASES[r.basis as keyof typeof ALLOCATION_BASES] ?? r.basis}
                  </td>
                  <td className="text-xs text-slate-400">
                    {r.lockedAt ? `مقفل ${formatDateTime(r.lockedAt)}` : 'مفتوح'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
