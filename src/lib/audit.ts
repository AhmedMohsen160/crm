import 'server-only';
import { db } from './db';

/**
 * سجل التدقيق — §٣ بند ٥: «لا شيء يُمحى».
 *
 * كل تعديل على حقل حسّاس يُقيَّد هنا بقيمته القديمة والجديدة، فيمكن الرجوع
 * لأي رقم ومعرفة من غيّره ومتى ومن أي قيمة. السجل **لا يُحذف ولا يُعدَّل**.
 */

export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'login';

type Scalar = string | number | boolean | Date | null | undefined;

function asText(value: Scalar): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** يقيّد حدثًا واحدًا بلا تفصيل حقول (إنشاء، حذف، دخول) */
export async function auditEvent(
  userId: string | null,
  action: AuditAction,
  tableName: string,
  recordId: string,
  note?: string
): Promise<void> {
  await db.auditLog.create({
    data: { userId, action, tableName, recordId, newValue: note ?? null },
  });
}

/**
 * يقارن السجل قبل وبعد، ويقيّد **سطرًا لكل حقل تغيّر فعلًا**.
 * الحقول التي لم تتغيّر لا تُقيَّد — وإلا امتلأ السجل بضجيج يخفي الحقيقة.
 */
export async function auditDiff(
  userId: string | null,
  tableName: string,
  recordId: string,
  before: Record<string, Scalar>,
  after: Record<string, Scalar>
): Promise<void> {
  const rows: {
    userId: string | null;
    action: string;
    tableName: string;
    recordId: string;
    field: string;
    oldValue: string | null;
    newValue: string | null;
  }[] = [];

  for (const field of Object.keys(after)) {
    const oldValue = asText(before[field]);
    const newValue = asText(after[field]);
    if (oldValue === newValue) continue;
    rows.push({ userId, action: 'update', tableName, recordId, field, oldValue, newValue });
  }

  if (rows.length === 0) return;
  await db.auditLog.createMany({ data: rows });
}
