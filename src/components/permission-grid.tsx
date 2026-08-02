import { PERMISSIONS, PERMISSION_KEYS, PERMISSION_HINTS } from '@/lib/permissions';

/**
 * شبكة الصلاحيات الثماني عشرة كمربعات اختيار.
 *
 * تُبنى من `PERMISSION_KEYS` مباشرة، فأي صلاحية تُضاف مستقبلًا تظهر هنا
 * بلا تعديل شاشة.
 */
export function PermissionGrid({
  granted = {},
}: {
  granted?: Partial<Record<(typeof PERMISSION_KEYS)[number], boolean>>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PERMISSION_KEYS.map((key) => (
        <label
          key={key}
          className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50"
        >
          <input
            type="checkbox"
            name={key}
            defaultChecked={granted[key] ?? false}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-800">
              {PERMISSIONS[key]}
            </span>
            <span className="block text-xs leading-relaxed text-slate-500">
              {PERMISSION_HINTS[key]}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}
