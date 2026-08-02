import 'server-only';
import { db } from './db';
import { SETTING_DEFINITIONS, settingDefinition } from './settings-defs';

/**
 * قراءة القوائم والإعدادات **من قاعدة البيانات** — لا من الكود.
 *
 * هذا هو الفارق العملي بين «قائمة قابلة للتعديل من الواجهة» و«قائمة مشفّرة»:
 * كل شاشة تنادي هذه الدوال، فتغيير عنصر واحد من شاشة القوائم يظهر فورًا في
 * كل النظام بلا نشر جديد.
 */

export type Option = { value: string; label: string; extra?: string | null };

/** عناصر قائمة واحدة مرتّبة — النشطة فقط */
export async function listOptions(listName: string): Promise<Option[]> {
  const items = await db.listItem.findMany({
    where: { listName, active: true },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    select: { value: true, label: true, extra: true },
  });
  return items;
}

/** عدة قوائم في نداء واحد — لتفادي نداء لكل حقل في الشاشة الواحدة */
export async function listOptionsMany(
  ...listNames: string[]
): Promise<Record<string, Option[]>> {
  const items = await db.listItem.findMany({
    where: { listName: { in: listNames }, active: true },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    select: { listName: true, value: true, label: true, extra: true },
  });

  const grouped: Record<string, Option[]> = Object.fromEntries(
    listNames.map((n) => [n, [] as Option[]])
  );
  for (const item of items) {
    grouped[item.listName]?.push({
      value: item.value,
      label: item.label,
      extra: item.extra,
    });
  }
  return grouped;
}

/** الاسم المعروض لقيمة مخزّنة — يرجع القيمة نفسها إن لم تُعرف */
export async function listLabel(listName: string, value: string | null): Promise<string> {
  if (!value) return '—';
  const item = await db.listItem.findUnique({
    where: { listName_value: { listName, value } },
    select: { label: true },
  });
  return item?.label ?? value;
}

/** معامل عنصر قائمة (`extra`) رقمًا — مع افتراض آمن عند غيابه */
export async function listFactor(
  listName: string,
  value: string | null,
  fallback = 1
): Promise<number> {
  if (!value) return fallback;
  const item = await db.listItem.findUnique({
    where: { listName_value: { listName, value } },
    select: { extra: true },
  });
  const parsed = Number(item?.extra);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ── الإعدادات ──────────────────────────────────────────────────

/** كل الإعدادات دفعة واحدة، مع الافتراضي لأي مفتاح لم يُزرع بعد */
export async function allSettings(): Promise<Record<string, string>> {
  const rows = await db.setting.findMany({ select: { key: true, value: true } });
  const map: Record<string, string> = Object.fromEntries(
    SETTING_DEFINITIONS.map((d) => [d.key, d.value])
  );
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export async function setting(key: string): Promise<string> {
  const row = await db.setting.findUnique({ where: { key }, select: { value: true } });
  return row?.value ?? settingDefinition(key)?.value ?? '';
}

export async function settingNumber(key: string): Promise<number> {
  const parsed = Number(await setting(key));
  if (Number.isFinite(parsed)) return parsed;
  const fallback = Number(settingDefinition(key)?.value);
  return Number.isFinite(fallback) ? fallback : 0;
}

export async function settingBool(key: string): Promise<boolean> {
  return (await setting(key)) === 'true';
}
