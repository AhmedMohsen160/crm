import 'server-only';
import { db } from './db';
import { yearMonth } from './sequence-keys';

export { yearMonth };

/**
 * المعرّفات التسلسلية — `CL-00001` للعملاء و`LD-2608-0001` للّيدز.
 *
 * لماذا عدّاد في جدول لا `COUNT(*) + 1`: العدّ يعطي الرقم نفسه لشخصين
 * يحفظان في اللحظة ذاتها، ويعيد استخدام أرقام المحذوف. الزيادة الذرّية
 * داخل معاملة تمنع الاثنين.
 */

/** يزيد العدّاد ويعيد قيمته الجديدة — ذرّي */
async function nextValue(key: string): Promise<number> {
  const counter = await db.counter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 },
  });
  return counter.value;
}

/** `CL-00001` — سلسلة واحدة لا تتجدّد */
export async function nextClientCode(): Promise<string> {
  const value = await nextValue('client');
  return `CL-${String(value).padStart(5, '0')}`;
}

/** `LD-2608-0001` — العدّاد يتجدّد مع كل شهر */
export async function nextLeadCode(date = new Date()): Promise<string> {
  const period = yearMonth(date);
  const value = await nextValue(`lead-${period}`);
  return `LD-${period}-${String(value).padStart(4, '0')}`;
}

/** `FL-0001` — سلسلة واحدة لا تتجدّد، فالفريلانسر ليس حدثًا شهريًا */
export async function nextFreelancerCode(): Promise<string> {
  const value = await nextValue('freelancer');
  return `FL-${String(value).padStart(4, '0')}`;
}

/** `PR-2608-0042` — يُستخدم في المرحلة ٣ */
export async function nextProjectCode(date = new Date()): Promise<string> {
  const period = yearMonth(date);
  const value = await nextValue(`project-${period}`);
  return `PR-${period}-${String(value).padStart(4, '0')}`;
}
