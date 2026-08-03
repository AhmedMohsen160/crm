/**
 * التنبيهات (§١٢) — الوحدة الخالصة.
 *
 * **القاعدة الحاكمة، وهي منصوصة حرفيًا:**
 *
 * > «اجمع التنبيهات في رسالة واحدة لكل شخص لكل حدث — لا رسالة لكل سجل.»
 *
 * وهي ليست تفصيلة شكلية: ثلاثون مشروعًا متأخرًا تعني ثلاثين رسالة يُغلقها
 * المستقبِل بلا قراءة، فيفقد التنبيه معناه. رسالة واحدة تُقرأ.
 */

// ── الأحداث الثمانية ───────────────────────────────────────────

/** كيف يُحدَّد المستقبِل — لا اسمًا ولا دورًا، بل قاعدة */
export type RecipientRule =
  | { kind: 'permission'; permission: string }
  | { kind: 'record_owner' }
  | { kind: 'record_manager' }
  | { kind: 'owner_and_manager' };

export type Cadence =
  | { kind: 'immediate' }
  /** ملخص يومي عند ساعة محدَّدة (٠–٢٣ بتوقيت الخادم) */
  | { kind: 'daily'; hour: number }
  | { kind: 'weekly'; weekday: number; hour: number }
  | { kind: 'interval'; hours: number };

export type NotificationEvent = {
  key: string;
  label: string;
  /** ما يقوله السطر الواحد في الملخص */
  hint: string;
  recipient: RecipientRule;
  cadence: Cadence;
  severity: 'info' | 'warn' | 'urgent';
};

/**
 * الأحداث الثمانية كما وردت في §١٢ — بترتيبها ومستقبِليها وتوقيتاتها.
 *
 * التوقيت **بيانات لا كود**: تغيير ساعة الملخص اليومي يقع هنا وحده، ولا
 * يحتاج تعديل محرّك ولا شاشة.
 */
export const NOTIFICATION_EVENTS: NotificationEvent[] = [
  {
    key: 'project_awaiting_assignment',
    label: 'مشاريع بانتظار الإسناد',
    hint: 'مشروع جديد لم يُسند بعد',
    recipient: { kind: 'permission', permission: 'canAssignProduction' },
    cadence: { kind: 'immediate' },
    severity: 'warn',
  },
  {
    key: 'project_delivered',
    label: 'مشاريع سُلّمت',
    hint: 'مشروعك سُلّم للعميل',
    recipient: { kind: 'record_owner' },
    cadence: { kind: 'immediate' },
    severity: 'info',
  },
  {
    key: 'discount_needs_approval',
    label: 'خصومات تنتظر الاعتماد',
    hint: 'خصم تجاوز حدّ صاحبه ويوقف المشروع',
    recipient: { kind: 'permission', permission: 'canApproveDiscount' },
    cadence: { kind: 'immediate' },
    severity: 'urgent',
  },
  {
    key: 'due_tomorrow',
    label: 'مشاريع تستحق غدًا',
    hint: 'موعد التسليم غدًا',
    recipient: { kind: 'permission', permission: 'canAssignProduction' },
    cadence: { kind: 'daily', hour: 18 },
    severity: 'warn',
  },
  {
    key: 'overdue',
    label: 'مشاريع متأخرة',
    hint: 'تجاوز موعد تسليمه ولم يُسلَّم',
    recipient: { kind: 'permission', permission: 'canAssignProduction' },
    cadence: { kind: 'daily', hour: 9 },
    severity: 'urgent',
  },
  {
    key: 'delivered_uncollected',
    label: 'سُلّم ولم يُحصَّل',
    hint: 'مشروع مسلَّم ولم يصل مقابله',
    recipient: { kind: 'permission', permission: 'canRecordCollection' },
    cadence: { kind: 'weekly', weekday: 0, hour: 9 },
    severity: 'warn',
  },
  {
    key: 'lead_no_reply',
    label: 'ليدز بلا رد',
    hint: 'تجاوز مهلة أول رد ولم يُرَدّ عليه',
    recipient: { kind: 'owner_and_manager' },
    cadence: { kind: 'interval', hours: 3 },
    severity: 'urgent',
  },
  {
    key: 'freelancer_payment_late',
    label: 'مستحقات فريلانسرز متأخرة',
    hint: 'مستحق مضى عليه أكثر من ثلاثين يومًا',
    recipient: { kind: 'permission', permission: 'canPayFreelancers' },
    cadence: { kind: 'weekly', weekday: 0, hour: 9 },
    severity: 'warn',
  },
];

export function eventByKey(key: string): NotificationEvent | undefined {
  return NOTIFICATION_EVENTS.find((e) => e.key === key);
}

// ── متى يحين الملخص ────────────────────────────────────────────

/**
 * هل حان وقت هذا الحدث؟
 *
 * **الفوري** يُرسَل دائمًا (يمنعه مفتاح التكرار لا التوقيت).
 * **اليومي** لا يُرسَل قبل ساعته، ولا مرتين في اليوم نفسه.
 * **الأسبوعي** لا يُرسَل إلا في يومه، ولا مرتين في الأسبوع نفسه.
 * **الدوري** يحترم الفاصل بالساعات مهما كانت ساعة التشغيل.
 *
 * ولو تأخّر التشغيل عن الساعة المحدَّدة (انقطع الخادم مثلًا) يُرسَل عند أول
 * تشغيل بعدها في اليوم نفسه — **الملخص المتأخر أنفع من الملخص المفقود**.
 */
export function isDue(
  cadence: Cadence,
  lastSentAt: Date | null,
  now: Date
): { due: boolean; reason: string } {
  switch (cadence.kind) {
    case 'immediate':
      return { due: true, reason: 'فوري' };

    case 'daily': {
      if (now.getHours() < cadence.hour) {
        return { due: false, reason: `قبل ساعة الملخص (${cadence.hour}:00)` };
      }
      if (lastSentAt && sameDay(lastSentAt, now)) {
        return { due: false, reason: 'أُرسل اليوم' };
      }
      return { due: true, reason: 'ملخص يومي' };
    }

    case 'weekly': {
      if (now.getDay() !== cadence.weekday) {
        return { due: false, reason: 'ليس يوم الملخص الأسبوعي' };
      }
      if (now.getHours() < cadence.hour) {
        return { due: false, reason: `قبل ساعة الملخص (${cadence.hour}:00)` };
      }
      if (lastSentAt && daysBetween(lastSentAt, now) < 6) {
        return { due: false, reason: 'أُرسل هذا الأسبوع' };
      }
      return { due: true, reason: 'ملخص أسبوعي' };
    }

    case 'interval': {
      if (!lastSentAt) return { due: true, reason: 'أول تشغيل' };
      const hours = (now.getTime() - lastSentAt.getTime()) / 3_600_000;
      return hours >= cadence.hours
        ? { due: true, reason: `مضى ${Math.floor(hours)} ساعة` }
        : { due: false, reason: `لم يمضِ ${cadence.hours} ساعات بعد` };
    }
  }
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / 86_400_000);
}

// ── التجميع: رسالة واحدة لكل شخص لكل حدث ───────────────────────

export type Finding = {
  /** المستقبِل */
  userId: string;
  /** السجل الذي أثار التنبيه — للربط وللتكرار */
  recordId: string;
  recordLabel: string;
  link: string;
  /** رقم يظهر في الملخص (مبلغ · أيام تأخير · ساعات انتظار) */
  amount?: number;
  detail?: string;
};

export type Digest = {
  userId: string;
  eventKey: string;
  count: number;
  title: string;
  body: string;
  /** مفتاح يمنع تكرار نفس الملخص لنفس الشخص في نفس الدورة */
  dedupeKey: string;
  recordIds: string[];
  link: string;
};

/**
 * يحوّل النتائج المتفرقة إلى **ملخص واحد لكل شخص** — القاعدة المنصوصة.
 *
 * ويحدّ المعروض في المتن بعشرة أسطر مع ذكر الباقي صراحةً: قائمة بأربعين
 * سطرًا لا تُقرأ، وحذفها بلا ذكر يخفي حجم المشكلة. «وعشرون غيرها» يقول
 * الحجم في كلمتين.
 */
export function buildDigests(
  eventKey: string,
  label: string,
  findings: Finding[],
  options: { periodKey: string; listUrl: string; maxLines?: number }
): Digest[] {
  const max = options.maxLines ?? 10;

  const byUser = new Map<string, Finding[]>();
  for (const finding of findings) {
    if (!finding.userId) continue;
    byUser.set(finding.userId, [...(byUser.get(finding.userId) ?? []), finding]);
  }

  return [...byUser.entries()].map(([userId, list]) => {
    const shown = list.slice(0, max);
    const rest = list.length - shown.length;

    const lines = shown.map((f) => {
      const parts = [f.recordLabel];
      if (f.detail) parts.push(f.detail);
      return `• ${parts.join(' — ')}`;
    });
    if (rest > 0) lines.push(`• و${rest} غيرها`);

    return {
      userId,
      eventKey,
      count: list.length,
      title: `${label} (${list.length})`,
      body: lines.join('\n'),
      // الحدث + الشخص + الدورة: تشغيلان في الدورة نفسها لا يُنتجان رسالتين
      dedupeKey: `${eventKey}:${userId}:${options.periodKey}`,
      recordIds: list.map((f) => f.recordId),
      link: options.listUrl,
    };
  });
}

/**
 * مفتاح الدورة الذي يمنع التكرار.
 *
 * **الفوري يُفرَّق بمجموعة السجلات**: ما دامت المجموعة نفسها فلا رسالة
 * جديدة، وبدخول سجل جديد تتغيّر المجموعة فتُحدَّث البطاقة القائمة أو
 * تُفتح واحدة إن كانت السابقة قد قُرئت.
 * والملخصات تُفرَّق باليوم أو بالأسبوع أو بالنافذة الزمنية.
 */
export function periodKeyOf(cadence: Cadence, now: Date, recordId?: string): string {
  switch (cadence.kind) {
    case 'immediate':
      return `rec:${recordId ?? now.getTime()}`;
    case 'daily':
      return dayKey(now);
    case 'weekly':
      return weekKey(now);
    case 'interval': {
      const slot = Math.floor(now.getTime() / (cadence.hours * 3_600_000));
      return `w${slot}`;
    }
  }
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

export function weekKey(date: Date): string {
  // بداية الأسبوع الأحد — كما في التقويم المصري والسعودي
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  return `w:${dayKey(start)}`;
}

// ── صياغة الأرقام في المتن ─────────────────────────────────────

/** «متأخر ٣ أيام» · «متأخر يومًا» — العربية تعدّ بثلاث صيغ لا صيغتين */
export function daysLate(days: number): string {
  if (days <= 0) return 'اليوم';
  if (days === 1) return 'متأخر يومًا';
  if (days === 2) return 'متأخر يومين';
  if (days <= 10) return `متأخر ${days} أيام`;
  return `متأخر ${days} يومًا`;
}

export function hoursWaiting(hours: number): string {
  const rounded = Math.floor(hours);
  if (rounded < 1) return 'أقل من ساعة';
  if (rounded === 1) return 'منذ ساعة';
  if (rounded === 2) return 'منذ ساعتين';
  if (rounded <= 10) return `منذ ${rounded} ساعات`;
  if (rounded < 48) return `منذ ${rounded} ساعة`;
  return `منذ ${Math.floor(rounded / 24)} يومًا`;
}
