import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { payslipFor } from '@/lib/hr-engine';
import {
  COMPONENT_KINDS,
  COMPONENT_FREQUENCIES,
  COMMON_ALLOWANCES,
  COMMON_DEDUCTIONS,
  EMPLOYMENT_TYPES,
  periodOf,
  tenureLabel,
  tenureMonths,
  type ComponentKind,
} from '@/lib/hr';
import { formatMoney, formatDate, toDateInput } from '@/lib/utils';
import { PageHeader, Badge, Field, FormField, SelectField, ErrorAlert } from '@/components/ui';
import { SaveButton } from '@/components/forms';

export const metadata = { title: 'ملف الموظف' };
export const dynamic = 'force-dynamic';

/**
 * هيكل أجر موظف.
 *
 * البنود **بتاريخ سريان**، والبند الذي انتهى يبقى ظاهرًا: كشوف الشهور
 * الماضية بُنيت عليه، ومحوُه يجعل رقمًا مصروفًا بلا سند.
 */
export default async function EmployeeHrPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; period?: string }>;
}) {
  await requirePermission('canManageHr');
  const { id } = await params;
  const sp = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? '') ? sp.period! : periodOf(new Date());

  const [user, components, slip, lines] = await Promise.all([
    db.user.findUnique({
      where: { id },
      include: { department: { select: { name: true } }, roleRef: { select: { label: true } } },
    }),
    db.salaryComponent.findMany({
      where: { userId: id },
      orderBy: [{ active: 'desc' }, { effectiveFrom: 'desc' }],
    }),
    payslipFor(id, period),
    db.payrollLine.findMany({
      where: { userId: id },
      include: { run: { select: { period: true, status: true } } },
      orderBy: { run: { period: 'desc' } },
      take: 12,
    }),
  ]);
  if (!user) notFound();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={user.name}
        subtitle={`${user.jobTitle ?? 'بلا مسمّى'} · ${user.department?.name ?? 'بلا قسم'}`}
      >
        {!user.canLogin && (
          <Badge className="border-lime-300 bg-lime-50 text-lime-800">منفِّذ داخلي</Badge>
        )}
        <Link href={`/settings/users/${id}`} className="btn-secondary">
          بياناته الأساسية
        </Link>
        <Link href="/hr/employees" className="btn-secondary">
          رجوع للقائمة
        </Link>
      </PageHeader>
      <ErrorAlert message={sp.error} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* ── هيكل الأجر ─────────────────────────────── */}
          <section className="card">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold text-slate-800">هيكل الأجر</h2>
              <span className="text-xs text-slate-400">
                البند المنتهي يبقى — كشوف الماضي بُنيت عليه
              </span>
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>البند</th>
                    <th>النوع</th>
                    <th>المبلغ</th>
                    <th>التكرار</th>
                    <th>السريان</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {components.map((c) => (
                    <tr key={c.id} className={c.active ? '' : 'opacity-50'}>
                      <td className="text-sm font-medium text-slate-700">{c.label}</td>
                      <td>
                        <Badge
                          className={
                            c.kind === 'deduction'
                              ? 'border-rose-200 bg-rose-50 text-rose-700'
                              : c.kind === 'basic'
                                ? 'border-brand-200 bg-brand-50 text-brand-700'
                                : 'border-slate-200 bg-slate-50 text-slate-600'
                          }
                        >
                          {COMPONENT_KINDS[c.kind as ComponentKind] ?? c.kind}
                        </Badge>
                      </td>
                      <td className="nums text-sm">
                        {c.isPercent ? `${c.amount}% من الأساسي` : formatMoney(c.amount, 'EGP')}
                      </td>
                      <td className="text-sm text-slate-600">
                        {COMPONENT_FREQUENCIES[c.frequency as keyof typeof COMPONENT_FREQUENCIES] ??
                          c.frequency}
                        {c.period && <span className="mr-1 text-xs text-slate-400">{c.period}</span>}
                      </td>
                      <td className="text-xs text-slate-500">
                        {formatDate(c.effectiveFrom)}
                        {c.effectiveTo && ` ← ${formatDate(c.effectiveTo)}`}
                      </td>
                      <td>
                        {c.active && (
                          <form method="post" action="/api/save" className="inline">
                            <input type="hidden" name="entity" value="salaryComponent.end" />
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="back" value={`/hr/employees/${id}`} />
                            <button
                              type="submit"
                              className="text-xs text-slate-400 hover:text-rose-600"
                            >
                              إنهاء
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                  {components.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                        لا بنود أجر بعد — أضف الأساسي أولًا، فالنسب تُحسب عليه.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── إضافة بند ──────────────────────────────── */}
          <section className="card card-pad">
            <h2 className="mb-4 flex items-center gap-2 section-title">
              <Plus className="h-4 w-4 text-brand-600" />
              بند جديد
            </h2>
            <form method="post" action="/api/save" className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="entity" value="salaryComponent" />
              <input type="hidden" name="id" value="" />
              <input type="hidden" name="userId" value={id} />
              <input type="hidden" name="back" value={`/hr/employees/${id}`} />

              <SelectField
                label="النوع"
                name="kind"
                required
                defaultValue="allowance"
                placeholder="— اختر —"
                options={Object.entries(COMPONENT_KINDS).map(([value, label]) => ({ value, label }))}
              />
              <FormField
                label="اسم البند"
                name="label"
                required
                placeholder="بدل انتقالات"
                hint={`شائع: ${COMMON_ALLOWANCES.slice(0, 3).join(' · ')} — وللاستقطاع: ${COMMON_DEDUCTIONS.slice(0, 2).join(' · ')}`}
              />
              <FormField label="المبلغ" name="amount" type="number" step="0.01" min="0" required dir="ltr" />
              <SelectField
                label="التكرار"
                name="frequency"
                defaultValue="monthly"
                placeholder="شهري متكرر"
                options={Object.entries(COMPONENT_FREQUENCIES).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
              <FormField
                label="السريان من"
                name="effectiveFrom"
                type="date"
                defaultValue={toDateInput(new Date())}
              />
              <FormField
                label="شهر البند (لمرة واحدة)"
                name="period"
                placeholder={period}
                dir="ltr"
                hint="بصيغة YYYY-MM — يلزم للبند غير المتكرر"
              />
              <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                <input type="checkbox" name="isPercent" className="h-4 w-4 rounded border-slate-300" />
                المبلغ نسبة مئوية من الأساسي
                <span className="text-xs text-slate-400">
                  (النسبة على الأساسي لا على الإجمالي — وإلا تغيّر الراتب بترتيب الإدخال)
                </span>
              </label>
              <div className="sm:col-span-2">
                <SaveButton>إضافة البند</SaveButton>
              </div>
            </form>
          </section>

          {/* ── كشوف سابقة ─────────────────────────────── */}
          {lines.length > 0 && (
            <section className="card table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>الشهر</th>
                    <th>الأساسي</th>
                    <th>البدلات</th>
                    <th>الحوافز</th>
                    <th>الاستقطاع</th>
                    <th>الصافي</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td className="text-sm text-slate-600">{line.run.period}</td>
                      <td className="nums text-sm">{formatMoney(line.basic, 'EGP')}</td>
                      <td className="nums text-sm">{formatMoney(line.allowances, 'EGP')}</td>
                      <td className="nums text-sm">{formatMoney(line.incentives, 'EGP')}</td>
                      <td className="nums text-sm text-rose-700">
                        {formatMoney(line.deductions, 'EGP')}
                      </td>
                      <td className="nums text-sm font-bold">{formatMoney(line.net, 'EGP')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>

        {/* ── كشف الشهر الحالي ──────────────────────────── */}
        <div className="space-y-5">
          <section className="card card-pad">
            <h2 className="mb-3 section-title">أجر شهر {period}</h2>
            <dl className="space-y-2 text-sm">
              <Row label="الأساسي" value={formatMoney(slip.basic, 'EGP')} />
              <Row label="البدلات" value={formatMoney(slip.allowances, 'EGP')} />
              <Row label="الحوافز والمكافآت" value={formatMoney(slip.incentives, 'EGP')} />
              <div className="border-t border-slate-200 pt-2">
                <Row label="الإجمالي" value={formatMoney(slip.gross, 'EGP')} bold />
              </div>
              <Row label="الاستقطاع" value={`− ${formatMoney(slip.deductions, 'EGP')}`} danger />
              <div className="border-t border-slate-200 pt-2">
                <Row label="الصافي" value={formatMoney(slip.net, 'EGP')} bold />
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-400">
              الإجمالي هو ما يُقاس عليه العائد — لا الأساسي وحده.
            </p>
          </section>

          <section className="card card-pad">
            <h2 className="mb-3 section-title">بيانات التوظيف</h2>
            <dl>
              <Field label="الدور">{user.roleRef?.label ?? 'منفِّذ داخلي'}</Field>
              <Field label="نوع التعاقد">
                {EMPLOYMENT_TYPES[user.employmentType as keyof typeof EMPLOYMENT_TYPES] ?? '—'}
              </Field>
              <Field label="تاريخ التعيين">
                {user.hireDate ? formatDate(user.hireDate) : null}
              </Field>
              <Field label="مدة الخدمة">
                {tenureLabel(tenureMonths(user.hireDate, new Date()))}
              </Field>
              <Field label="طريقة الصرف">{user.payMethod ?? null}</Field>
              <Field label="بيانات الصرف">
                {user.bankAccount ? <span dir="ltr">{user.bankAccount}</span> : null}
              </Field>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  danger,
}: {
  label: string;
  value: string;
  bold?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <dt className={danger ? 'text-rose-700' : 'text-slate-600'}>{label}</dt>
      <dd
        className={`nums ${bold ? 'font-bold text-slate-900' : 'font-medium'} ${
          danger ? 'text-rose-700' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
