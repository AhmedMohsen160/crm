import Link from '@/components/link';
import { Upload, CheckCircle2 } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { listOptionsMany } from '@/lib/reference';
import { FREELANCER_TIERS, RATE_UNITS } from '@/lib/freelancers';
import { PageHeader, SelectField, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'استيراد الفريلانسرز' };
export const dynamic = 'force-dynamic';

/**
 * الاستيراد الجماعي (§١١ بند ٦ و§١٤ المصدر ج).
 *
 * الملف الفعلي ٢١ تبويبًا، **اللغة فيه ليست حقلًا بل اسم التبويب** — لذلك
 * يُستورد تبويب واحد في كل مرة مع تحديد لغته. والشخص المكرَّر عبر تبويبات
 * يُدمج بالهاتف أو الاسم، وتُجمع لغاته.
 *
 * **لا يحذف ولا يخمّن**: ما لا يُحسم يُحفظ ويُعلَّم للمراجعة اليدوية.
 */
export default async function ImportFreelancersPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    created?: string;
    merged?: string;
    skipped?: string;
    flagged?: string;
  }>;
}) {
  const { error, created, merged, skipped, flagged } = await searchParams;
  await requirePermission('canManageFreelancers');
  const lists = await listOptionsMany('language', 'currency');

  const done = created !== undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="استيراد الفريلانسرز"
        subtitle="تبويب واحد في كل مرة — لأن اللغة في الملف هي اسم التبويب"
      >
        <Link href="/freelancers" className="btn-secondary">
          رجوع للسجل
        </Link>
      </PageHeader>
      <ErrorAlert message={error} />

      {done && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="mb-1 flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4" />
            تم الاستيراد
          </p>
          <ul className="space-y-0.5 text-xs">
            <li>
              <b className="nums">{created}</b> سجلًا جديدًا
            </li>
            <li>
              <b className="nums">{merged}</b> دُمج مع موجود (نفس الهاتف أو الاسم)
            </li>
            <li>
              <b className="nums">{skipped}</b> صفًّا استُبعد (رؤوس أو صفوف بلا اسم)
            </li>
            <li>
              <b className="nums">{flagged}</b> يحتاج مراجعة يدوية —{' '}
              <Link href="/freelancers?review=1" className="link">
                افتحها الآن
              </Link>
            </li>
          </ul>
        </div>
      )}

      <form method="post" action="/api/save" className="space-y-5">
        <input type="hidden" name="entity" value="freelancer.import" />
        <input type="hidden" name="back" value="/freelancers/import" />

        <section className="card card-pad space-y-4">
          <h2 className="section-title">إعدادات هذا التبويب</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="لغة التبويب"
              name="defaultLang"
              options={lists.language}
              placeholder="— اختر لغة التبويب —"
              hint="تُضاف للغات كل من في هذه الدفعة"
            />
            <SelectField
              label="الدرجة"
              name="defaultTier"
              defaultValue="bench"
              placeholder="مخزون"
              options={Object.entries(FREELANCER_TIERS).map(([value, label]) => ({
                value,
                label,
              }))}
              hint="تبويب «الأهم المستمرين» ← معتمد · الباقي ← مخزون"
            />
            <SelectField
              label="وحدة الأجر"
              name="rateUnit"
              defaultValue="page"
              placeholder="الصفحة"
              options={Object.entries(RATE_UNITS).map(([value, label]) => ({ value, label }))}
              hint="تبويب المترجمين الفوريين وحدته «الساعة» لا الصفحة"
            />
            <SelectField
              label="العملة الافتراضية"
              name="defaultCurrency"
              defaultValue="EGP"
              placeholder="جنيه مصري"
              options={lists.currency}
              hint="ما حمل رمز عملة في الخلية يُستنتج منه"
            />
          </div>
        </section>

        <section className="card card-pad">
          <label className="label" htmlFor="rows">
            الصفوف
          </label>
          <p className="mb-2 text-xs text-slate-500">
            انسخ الأعمدة من إكسل والصقها هنا مباشرة. الترتيب المتوقَّع:
          </p>
          <p className="mb-3 rounded bg-slate-50 px-3 py-2 text-xs text-slate-600" dir="ltr">
            الاسم ⇥ الهاتف ⇥ السعر ⇥ التقييم ⇥ البريد
          </p>
          <textarea
            id="rows"
            name="rows"
            required
            rows={12}
            dir="ltr"
            placeholder={'Donia Hamdan\t01000000000\t350 Tr - 250 Re\t7/10\tdonia@mail.com'}
            className="input font-mono text-xs"
          />
          <SaveButton>
            <Upload className="h-4 w-4" />
            استيراد
          </SaveButton>
        </section>
      </form>

      <section className="mt-6 card card-pad bg-slate-50/60 text-sm text-slate-600">
        <p className="mb-2 font-semibold text-slate-800">ما يفعله الاستيراد بلا أن تطلبه</p>
        <ul className="space-y-1 text-xs">
          <li>
            <b>الصفر ليس مجانًا.</b> خلية سعر قيمتها صفر تعني «لم يُتفق» فتُترك فارغة —
            وإلا ظهر هامش ١٠٠٪ كاذب.
          </li>
          <li>
            <b>الأسعار النصية تُفكَّك.</b> «350 Tr - 250 Re» تصير بندين: ترجمة ٣٥٠
            ومراجعة ٢٥٠. و«70 Sp-Ar \\ 80 Sp-En» بندين باتجاهين.
          </li>
          <li>
            <b>النطاق يؤخذ بحدّه الأدنى</b> ويُحفظ أصله ويُعلَّم للمراجعة.
          </li>
          <li>
            <b>صفوف الرؤوس تُرفض.</b> الصف الذي اسمه «Name» أو «Rate for 1hour» لا
            يصير شخصًا.
          </li>
          <li>
            <b>التقييم المخزَّن كتاريخ يُقرأ صحيحًا.</b> ٧ أكتوبر تعني الدرجة ١٠،
            والبريد في نفس العمود يُفصَل.
          </li>
          <li>
            <b>الألقاب تُنظَّف.</b> «د » و«Dr » و«مهندس » تُحذف من المقدمة — و«محمد
            دراز» لا يُمسّ.
          </li>
        </ul>
      </section>
    </div>
  );
}
