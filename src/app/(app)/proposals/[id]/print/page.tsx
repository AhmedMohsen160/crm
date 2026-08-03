import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { listLabel } from '@/lib/reference';
import {
  volumeTable,
  ratePerWord,
  wordsToPages,
  commercialTerms,
  PRODUCTION_STAGES,
  LIFECYCLE_STEPS,
  SCOPE_INCLUDED,
  SCOPE_EXCLUDED,
  DEFECT_COMMITMENT,
  TURNAROUND_BANDS,
  WORDS_PER_STANDARD_PAGE,
} from '@/lib/proposals';
import { formatDate } from '@/lib/utils';
import { FastTransMark } from '@/components/brand';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'عرض فاست ترانس' };

/**
 * المستند القابل للطباعة — **هذا هو المُنتَج الذي يصل العميل**.
 *
 * مبنيّ بنسق عرض «Tristar» نفسه وبألوان الهوية المستخرجة من ملفاته:
 * الكحلي `#242E5B` والليموني `#C4D82E`. ويُطبَع من المتصفح إلى PDF مباشرةً
 * (Ctrl+P ← حفظ بصيغة PDF) — بلا مكتبة توليد ولا خادم إضافي، فما يراه
 * معدّ العرض على الشاشة هو ما يصل العميل حرفيًا.
 */
export default async function ProposalPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission('canViewSellPrice');

  const proposal = await db.proposal.findUnique({
    where: { id },
    include: { tiers: { orderBy: { fromWords: 'asc' } }, owner: { select: { name: true } } },
  });
  if (!proposal) notFound();

  const [sourceName, targetName] = await Promise.all([
    listLabel('language', proposal.sourceLang),
    listLabel('language', proposal.targetLang),
  ]);

  const samples = proposal.sampleVolumes
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v > 0);
  const table = volumeTable(proposal.tiers, samples, proposal.vatRate);

  const terms = commercialTerms({
    currency: proposal.currency === 'SAR' ? 'ريال سعودي' : proposal.currency,
    vatPct: Math.round(proposal.vatRate * 100),
    validityDays: proposal.validityDays,
    entity: proposal.contractingEntity,
    paymentDays: proposal.paymentDays,
  });

  const pair = `${sourceName} ← ${targetName}`;
  const money = (v: number) => `${v.toLocaleString('en-US')} ${proposal.currency}`;

  return (
    <div className="mx-auto max-w-3xl bg-white print:max-w-none">
      {/* شريط لا يُطبَع */}
      <div className="mb-6 flex items-center justify-between rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800 print:hidden">
        <span>
          هذه صفحة المستند كما سيصل العميل. اطبعها بـ<b> Ctrl+P </b>واختر «حفظ بصيغة PDF».
        </span>
        <a href={`/proposals/${id}`} className="link">
          رجوع للتحرير
        </a>
      </div>

      <article className="space-y-10 text-slate-800">
        {/* ── الغلاف ────────────────────────────────────────── */}
        <header className="rounded-xl bg-brand-600 p-8 text-white print:rounded-none">
          <div className="mb-8 flex items-center justify-between">
            {/* على الغلاف الكحلي: النسخة السماوية — الزرقاء تختفي فيه */}
            <FastTransMark className="h-12 w-7" tone="sky" />
            <span className="text-[10px] font-medium tracking-[0.2em] text-brand-200">
              CERTIFIED TRANSLATION &amp; LANGUAGE SOLUTIONS
            </span>
          </div>

          <p className="mb-2 text-xs font-semibold tracking-[0.2em] text-lime-400">
            عرض تجاري وفني
            {proposal.revision > 1 && ` · مراجعة ${proposal.revision}`}
          </p>
          <h1 className="mb-3 text-3xl font-extrabold leading-tight">{proposal.title}</h1>
          {proposal.sourceLang && proposal.targetLang && (
            <p className="mb-6 text-lg text-brand-100">{pair}</p>
          )}

          <p className="mb-8 max-w-xl text-sm leading-relaxed text-brand-100">
            {proposal.intro ??
              `أُعدّ هذا العرض لـ${proposal.clientName} استجابةً لطلبكم سعرًا للصفحة وهيكلًا تجاريًا أوضح. الدقة عندنا ليست محل تفاوض، كما أن السلامة عندكم ليست محل تفاوض.`}
          </p>

          <dl className="grid gap-4 border-t border-white/20 pt-6 text-xs sm:grid-cols-4">
            <div>
              <dt className="mb-1 tracking-[0.15em] text-brand-300">عناية</dt>
              <dd className="font-semibold">
                {proposal.attention ?? proposal.clientName}
                {proposal.attentionRole && (
                  <span className="block font-normal text-brand-200">{proposal.attentionRole}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="mb-1 tracking-[0.15em] text-brand-300">المرجع</dt>
              <dd className="font-semibold" dir="ltr">
                {proposal.code}
              </dd>
            </div>
            <div>
              <dt className="mb-1 tracking-[0.15em] text-brand-300">تاريخ الإصدار</dt>
              <dd className="font-semibold">{formatDate(proposal.createdAt)}</dd>
            </div>
            <div>
              <dt className="mb-1 tracking-[0.15em] text-brand-300">الصلاحية</dt>
              <dd className="font-semibold">{proposal.validityDays} يومًا تقويميًا</dd>
            </div>
          </dl>
        </header>

        {/* ── كيف نعمل ──────────────────────────────────────── */}
        <section className="break-inside-avoid">
          <SectionTitle number="01" title="كيف نعمل" lead="ثلاثة متخصصين. كل ملف. بلا استثناء." />
          <p className="mb-5 text-sm leading-relaxed text-slate-600">
            نموذج الإنتاج عندنا يقوم على قاعدة واحدة لا تُخترق: لا يصل العميلَ مستندٌ
            رآه زوج عيون واحد. كل ملف يمرّ بثلاثة مهنيين منفصلين، لكل واحد مهمة
            مختلفة ونوع خطأ مختلف يلتقطه. وهذه الدورة الثلاثية <b>داخل السعر</b>،
            ليست إضافة تُباع.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {PRODUCTION_STAGES.map((stage, i) => (
              <div key={stage.title} className="rounded-lg border border-slate-200 p-4">
                <p className="mb-1 text-[10px] font-bold tracking-[0.15em] text-lime-600">
                  المرحلة {['الأولى', 'الثانية', 'الثالثة'][i]}
                </p>
                <p className="mb-2 font-bold text-brand-600">{stage.title}</p>
                <p className="text-xs leading-relaxed text-slate-600">{stage.body}</p>
              </div>
            ))}
          </div>

          <h3 className="mb-3 mt-6 text-xs font-bold tracking-[0.15em] text-slate-500">
            دورة حياة المشروع — من بريدكم إلى بريدكم
          </h3>
          <ol className="space-y-2">
            {LIFECYCLE_STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3 text-sm">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-brand-600 text-xs font-bold text-white">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>
                  <b className="text-slate-800">{step.title}</b>
                  <span className="block text-xs leading-relaxed text-slate-600">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* ── العرض التجاري ─────────────────────────────────── */}
        <section className="break-inside-avoid">
          <SectionTitle
            number="02"
            title="العرض التجاري"
            lead="تسعير بالصفحة، والحجم مبنيّ داخل الهيكل"
          />

          <p className="mb-5 text-sm leading-relaxed text-slate-600">
            وحدة التسعير عندنا <b>الصفحة القياسية = {WORDS_PER_STANDARD_PAGE} كلمة مصدر</b>،
            وهي الوحدة المعتمدة عالميًا في هذه الصناعة. ولا نحاسب بالصفحة الورقية
            عمدًا، وهذا الفرق في مصلحتكم: صفحة ممسوحة تحمل ستين كلمة تُحاسَب ستين
            كلمة — نحو ربع صفحة — لا صفحةً كاملة. والعدّ يُتفق عليه كتابةً قبل بدء
            العمل.
          </p>

          <table className="mb-3 w-full border-collapse text-sm">
            <thead>
              <tr className="bg-brand-600 text-white">
                <Th>الشريحة</Th>
                <Th>الحجم الشهري (كلمة)</Th>
                <Th>صفحات قياسية</Th>
                <Th>الخصم</Th>
                <Th>سعر الصفحة</Th>
                <Th>سعر الكلمة</Th>
              </tr>
            </thead>
            <tbody>
              {proposal.tiers.map((tier, i) => (
                <tr key={tier.id} className={i % 2 ? 'bg-slate-50' : ''}>
                  <Td strong>{tier.label}</Td>
                  <Td>
                    {tier.fromWords.toLocaleString('en-US')} –{' '}
                    {tier.toWords === null ? 'فما فوق' : tier.toWords.toLocaleString('en-US')}
                  </Td>
                  <Td>{wordsToPages(tier.fromWords).toLocaleString('en-US')}+</Td>
                  <Td>{tier.discountPct > 0 ? `${tier.discountPct}٪` : '—'}</Td>
                  <Td strong>{money(tier.ratePerPage)}</Td>
                  <Td>{ratePerWord(tier.ratePerPage)}</Td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mb-6 rounded-lg bg-lime-50 px-4 py-3 text-xs leading-relaxed text-slate-700">
            <b>الشرائح تُطبَّق بأثر رجعي على حجم الشهر كاملًا</b> — لا على ما يتجاوز
            العتبة وحده. فتجاوز العتبة يخفض السعر على كل ما تُرجم في ذلك الشهر.
            ويُجمَّع الحجم عبر كل الإدارات ومراكز التكلفة، ويُقيَّم شهريًا، بلا التزام
            بحد أدنى وبلا غرامة في شهر منخفض. الأسعار غير شاملة ضريبة القيمة المضافة{' '}
            {Math.round(proposal.vatRate * 100)}٪.
          </p>

          <h3 className="mb-3 text-xs font-bold tracking-[0.15em] text-slate-500">
            ما يعنيه هذا عمليًا
          </h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-brand-600 text-brand-700">
                <Th light>الحجم الشهري</Th>
                <Th light>صفحات</Th>
                <Th light>السعر المنطبق</Th>
                <Th light>الإجمالي الشهري</Th>
                <Th light>الوفر مقابل القياسي</Th>
              </tr>
            </thead>
            <tbody>
              {table.map((row, i) => (
                <tr key={row.words} className={i % 2 ? 'bg-slate-50' : ''}>
                  <Td>{row.words.toLocaleString('en-US')} كلمة</Td>
                  <Td>{row.pages.toLocaleString('en-US')}</Td>
                  <Td>{money(row.ratePerPage)}</Td>
                  <Td strong>{money(row.total)}</Td>
                  <Td>
                    {row.saving > 0 ? (
                      <span className="font-semibold text-lime-700">{money(row.saving)}</span>
                    ) : (
                      '—'
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-slate-400">
            للتوضيح فقط، غير شامل ضريبة القيمة المضافة.
          </p>
        </section>

        {/* ── نطاق السعر والمدد ─────────────────────────────── */}
        <section className="break-inside-avoid">
          <SectionTitle
            number="03"
            title="نطاق السعر والبنود التجارية"
            lead="ما يشمله السعر — وما لا يشمله"
          />

          <div className="mb-6 grid gap-5 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-bold tracking-[0.15em] text-lime-600">
                مشمول — بلا رسوم إضافية
              </h3>
              <ul className="space-y-1.5 text-xs leading-relaxed text-slate-600">
                {SCOPE_INCLUDED.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-bold tracking-[0.15em] text-slate-400">
                يُسعَّر مستقلًا — عند الحاجة وحدها
              </h3>
              <ul className="space-y-1.5 text-xs leading-relaxed text-slate-600">
                {SCOPE_EXCLUDED.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <h3 className="mb-2 text-xs font-bold tracking-[0.15em] text-slate-500">
            الطاقة ومدد التنفيذ
          </h3>
          <table className="mb-6 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-brand-600 text-brand-700">
                <Th light>حجم الدفعة (كلمات المصدر)</Th>
                <Th light>المدة القياسية</Th>
              </tr>
            </thead>
            <tbody>
              {TURNAROUND_BANDS.map((band, i) => (
                <tr key={band.days} className={i % 2 ? 'bg-slate-50' : ''}>
                  <Td>
                    {band.upTo === null
                      ? 'أكثر من 50,000'
                      : i === 0
                        ? `حتى ${band.upTo.toLocaleString('en-US')}`
                        : `${(TURNAROUND_BANDS[i - 1].upTo! + 1).toLocaleString('en-US')} – ${band.upTo.toLocaleString('en-US')}`}
                  </Td>
                  <Td strong>{band.days}</Td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mb-6 rounded-lg border-r-4 border-lime-400 bg-lime-50 p-4">
            <p className="mb-1 text-xs font-bold tracking-[0.15em] text-slate-600">
              التزامنا عند الخلل
            </p>
            <p className="text-xs leading-relaxed text-slate-700">{DEFECT_COMMITMENT}</p>
          </div>

          <h3 className="mb-2 text-xs font-bold tracking-[0.15em] text-slate-500">
            البنود التجارية
          </h3>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {terms.map((term, i) => (
                <tr key={term.label} className={i % 2 ? 'bg-slate-50' : ''}>
                  <Td strong>{term.label}</Td>
                  <Td>{term.value}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ── الخاتمة ───────────────────────────────────────── */}
        <section className="break-inside-avoid">
          <SectionTitle number="04" title="موقفنا والخطوات التالية" />

          <p className="mb-6 text-sm leading-relaxed text-slate-600">
            {proposal.positioning ??
              'نظرنا في خفض سعر الصفحة الأساسي وقرّرنا ألا نفعل، عن عمد. فعند سعر أقل ماديًا لا يبقى متغيّر يُحذف إلا طبقة المراجعة المستقلة — وهي بعينها ما يجعل بندًا تعاقديًا أو تقرير حادثة أو إفادة رقابية آمنًا للاعتماد عليه. وحذفها لا يخفض تكلفتكم، بل ينقلها إلى وقت فريقكم في المراجعة وإلى المخاطرة التي يحملها المستند نفسه. لذلك وضعنا التنازل حيث يصنع الحجمُ كفاءةً حقيقية عندنا، ورددناه إليكم كاملًا.'}
          </p>

          <h3 className="mb-3 text-xs font-bold tracking-[0.15em] text-slate-500">
            الخطوات التالية المقترحة
          </h3>
          <ol className="mb-8 space-y-2 text-sm">
            {(proposal.nextSteps
              ? proposal.nextSteps.split('\n').filter(Boolean)
              : [
                  'اعتماد هيكل الشرائح والبنود التجارية.',
                  'توقيع اتفاقية عدم إفصاح متبادلة.',
                  'ننفّذ ترجمة تجريبية مجانية حتى ثلاث صفحات قياسية من مادتكم، ليحكم فريقكم على مخرجاتنا على مستنداتكم أنتم قبل أي التزام.',
                  'تجهيز الحساب والمسرد، وقبول أول دفعة خلال ٢٤ ساعة من موافقتكم.',
                ]
            ).map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-lime-400 text-xs font-bold text-brand-700">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-slate-700">{step}</span>
              </li>
            ))}
          </ol>

          <footer className="border-t border-slate-200 pt-6">
            <p className="font-bold text-brand-600">
              {proposal.signerName ?? proposal.owner?.name ?? 'فاست ترانس'}
            </p>
            <p className="text-xs text-slate-500">{proposal.signerTitle ?? proposal.contractingEntity}</p>
            <p className="mt-3 text-[10px] tracking-[0.15em] text-slate-400">
              RIYADH · CAIRO · ALEXANDRIA
            </p>
          </footer>
        </section>

        <p className="border-t border-slate-200 pt-3 text-center text-[10px] tracking-[0.15em] text-slate-400">
          فاست ترانس · سرّي — أُعدّ خصيصًا لـ{proposal.clientName}
        </p>
      </article>
    </div>
  );
}

function SectionTitle({
  number,
  title,
  lead,
}: {
  number: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className="mb-4 border-b-2 border-brand-600 pb-2">
      <span className="text-[10px] font-bold tracking-[0.2em] text-lime-600">{number}</span>
      <h2 className="text-xl font-extrabold text-brand-600">{title}</h2>
      {lead && <p className="text-sm text-slate-500">{lead}</p>}
    </div>
  );
}

function Th({ children, light }: { children: React.ReactNode; light?: boolean }) {
  return (
    <th
      className={`px-3 py-2 text-right text-[11px] font-bold tracking-wide ${
        light ? '' : 'first:rounded-r-lg last:rounded-l-lg'
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <td
      className={`border-b border-slate-100 px-3 py-2 text-xs ${
        strong ? 'font-semibold text-slate-800' : 'text-slate-600'
      }`}
    >
      {children}
    </td>
  );
}
