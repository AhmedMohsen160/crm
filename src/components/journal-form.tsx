'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, Scale } from 'lucide-react';
import { SaveButton } from '@/components/forms';
import { DOCUMENT_TYPES, checkBalance, round2 } from '@/lib/accounting';

type Option = { value: string; label: string };

export type JournalLineValue = {
  accountId: string;
  debit: string;
  credit: string;
  memo: string;
  branch: string;
  costCenterId: string;
  salesAdminId: string;
  currency: string;
  fxRate: string;
};

const emptyLine = (): JournalLineValue => ({
  accountId: '',
  debit: '',
  credit: '',
  memo: '',
  branch: '',
  costCenterId: '',
  salesAdminId: '',
  currency: 'EGP',
  fxRate: '1',
});

/**
 * محرّر قيد اليومية.
 *
 * **الميزان أمام عين المحاسب دائمًا:** شريط سفلي يعرض مجموع المدين والدائن
 * والفرق لحظةً بلحظة، وزر الحفظ لا يعمل قبل أن يتوازن القيد. أرخص من أن
 * يكتشف الخطأ بعد الإرسال.
 *
 * والأبعاد (الفرع · مركز التكلفة · أدمن المبيعات) على **كل سطر** لا على
 * القيد، لأن قيدًا واحدًا قد يوزّع مصروفًا على فرعين.
 */
export default function JournalForm({
  entryId,
  accounts,
  branches,
  costCenters,
  salesAdmins,
  currencies,
  defaults,
  lines: initialLines,
  back,
}: {
  entryId?: string;
  accounts: Option[];
  branches: Option[];
  costCenters: Option[];
  salesAdmins: Option[];
  currencies: Option[];
  defaults: {
    date: string;
    description: string;
    docType: string;
    docNumber: string;
  };
  lines?: JournalLineValue[];
  back: string;
}) {
  const [lines, setLines] = useState<JournalLineValue[]>(
    initialLines && initialLines.length > 0 ? initialLines : [emptyLine(), emptyLine()]
  );

  const balance = useMemo(
    () =>
      checkBalance(
        lines.map((l) => ({
          accountId: l.accountId,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
        }))
      ),
    [lines]
  );

  function update(index: number, patch: Partial<JournalLineValue>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)));
  }

  /** يوازن القيد بوضع الفرق في السطر المُركَّز عليه — اختصار يومي للمحاسب */
  function balanceInto(index: number) {
    const diff = round2(balance.totalDebit - balance.totalCredit);
    if (diff === 0) return;
    update(index, diff > 0 ? { credit: String(diff), debit: '' } : { debit: String(-diff), credit: '' });
  }

  return (
    <form method="post" action="/api/save" className="space-y-4">
      <input type="hidden" name="entity" value="journalEntry" />
      <input type="hidden" name="id" value={entryId ?? ''} />
      <input type="hidden" name="back" value={back} />

      <section className="card card-pad grid gap-4 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="date">
            التاريخ <span className="text-rose-500">*</span>
          </label>
          <input id="date" name="date" type="date" required defaultValue={defaults.date} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="docType">
            نوع المستند
          </label>
          <select id="docType" name="docType" defaultValue={defaults.docType} className="input">
            {Object.entries(DOCUMENT_TYPES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="docNumber">
            رقم المستند
          </label>
          <input id="docNumber" name="docNumber" defaultValue={defaults.docNumber} dir="ltr" className="input" />
        </div>
        <div className="sm:col-span-4">
          <label className="label" htmlFor="description">
            البيان <span className="text-rose-500">*</span>
          </label>
          <input
            id="description"
            name="description"
            required
            defaultValue={defaults.description}
            placeholder="ما الذي يوثّقه هذا القيد؟"
            className="input"
          />
        </div>
      </section>

      <section className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th className="w-64">الحساب</th>
                <th>مدين</th>
                <th>دائن</th>
                <th>الفرع</th>
                <th>مركز التكلفة</th>
                <th>أدمن المبيعات</th>
                <th>البيان</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i}>
                  <td>
                    <select
                      name={`lines[${i}][accountId]`}
                      value={line.accountId}
                      onChange={(e) => update(i, { accountId: e.target.value })}
                      className="input min-w-56 py-1 text-sm"
                    >
                      <option value="">— اختر حسابًا —</option>
                      {accounts.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      name={`lines[${i}][debit]`}
                      type="number"
                      step="0.01"
                      min="0"
                      dir="ltr"
                      value={line.debit}
                      onChange={(e) => update(i, { debit: e.target.value, credit: '' })}
                      onFocus={() => balanceInto(i)}
                      className="input w-28 py-1 text-left text-sm"
                    />
                  </td>
                  <td>
                    <input
                      name={`lines[${i}][credit]`}
                      type="number"
                      step="0.01"
                      min="0"
                      dir="ltr"
                      value={line.credit}
                      onChange={(e) => update(i, { credit: e.target.value, debit: '' })}
                      onFocus={() => balanceInto(i)}
                      className="input w-28 py-1 text-left text-sm"
                    />
                  </td>
                  <td>
                    <select
                      name={`lines[${i}][branch]`}
                      value={line.branch}
                      onChange={(e) => update(i, { branch: e.target.value })}
                      className="input w-32 py-1 text-sm"
                    >
                      <option value="">—</option>
                      {branches.map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      name={`lines[${i}][costCenterId]`}
                      value={line.costCenterId}
                      onChange={(e) => update(i, { costCenterId: e.target.value })}
                      className="input w-36 py-1 text-sm"
                    >
                      <option value="">—</option>
                      {costCenters.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      name={`lines[${i}][salesAdminId]`}
                      value={line.salesAdminId}
                      onChange={(e) => update(i, { salesAdminId: e.target.value })}
                      className="input w-32 py-1 text-sm"
                    >
                      <option value="">—</option>
                      {salesAdmins.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      name={`lines[${i}][memo]`}
                      value={line.memo}
                      onChange={(e) => update(i, { memo: e.target.value })}
                      className="input w-40 py-1 text-sm"
                    />
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <select
                        name={`lines[${i}][currency]`}
                        value={line.currency}
                        onChange={(e) => update(i, { currency: e.target.value })}
                        className="input w-20 py-1 text-xs"
                        title="العملة"
                      >
                        {currencies.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.value}
                          </option>
                        ))}
                      </select>
                      <input
                        name={`lines[${i}][fxRate]`}
                        type="number"
                        step="0.0001"
                        min="0"
                        dir="ltr"
                        value={line.fxRate}
                        onChange={(e) => update(i, { fxRate: e.target.value })}
                        className="input w-20 py-1 text-left text-xs"
                        title="سعر التحويل وقت القيد"
                      />
                      {lines.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          title="حذف السطر"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-4">
          <button type="button" onClick={addLine} className="btn-secondary btn-sm">
            <Plus className="h-4 w-4" />
            سطر جديد
          </button>

          <div
            data-testid="entry-balance"
            className={`flex items-center gap-3 rounded-lg px-4 py-2 text-sm ${
              balance.balanced
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-amber-50 text-amber-900'
            }`}
          >
            <Scale className="h-4 w-4 shrink-0" />
            <span className="nums">
              مدين {balance.totalDebit.toLocaleString('en-US')} · دائن{' '}
              {balance.totalCredit.toLocaleString('en-US')}
            </span>
            <span className="font-semibold">
              {balance.balanced ? 'متوازن' : `الفرق ${balance.difference.toLocaleString('en-US')}`}
            </span>
          </div>
        </div>
      </section>

      {!balance.balanced && balance.problems.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          {balance.problems.map((p) => (
            <li key={p}>• {p}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        {/* الزر معطَّل حتى يتوازن القيد — الخطأ يُمنع لا يُبلَّغ عنه بعد وقوعه */}
        <span className={balance.balanced ? '' : 'pointer-events-none opacity-40'}>
          <SaveButton>حفظ مسوَّدة</SaveButton>
        </span>
        <p className="text-xs text-slate-500">
          يُحفظ مسوَّدةً — والترحيل فعل منفصل بعد المراجعة.
        </p>
      </div>
    </form>
  );
}
