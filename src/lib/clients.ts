import 'server-only';
import { db } from './db';
import { normalizePhone } from './phone';
import { nextClientCode } from './sequence';
import { search } from './utils';
import { REVENUE_FILTER } from './projects';
import { clientSegment, sortClients, type ClientSegment } from './client-segments';
import type { SessionUser } from './auth';

/**
 * منطق العملاء. القاعدة الحاكمة (§4.1): **لا يُنشأ عميل مكرر أبدًا.**
 *
 * المنع يقع على **قيد فريد في قاعدة البيانات** على الهاتف المطبَّع، لا على
 * فحص في الواجهة. الفرق جوهري: الفحص يسقط حين يحفظ شخصان في اللحظة نفسها،
 * والقيد لا يسقط أبدًا.
 */

export type ClientMatch = {
  id: string;
  code: string | null;
  name: string;
  phone: string;
  type: string;
  companyName: string | null;
  /** عدد المشاريع */
  dealCount: number;
  /** إجمالي مشترياته */
  totalValue: number;
  /** آخر تعامل */
  lastDealAt: Date | null;
};

/** يبحث بالهاتف المطبَّع — المسار السريع، فهرس مباشر */
export async function findClientByPhone(raw: string): Promise<ClientMatch | null> {
  const { value, ok } = normalizePhone(raw);
  if (!ok) return null;

  const client = await db.client.findFirst({
    where: { OR: [{ phoneNormalized: value }, { phoneAltNormalized: value }] },
    select: {
      id: true,
      code: true,
      name: true,
      phone: true,
      type: true,
      companyName: true,
    },
  });
  if (!client) return null;

  return { ...client, ...(await clientTotals(client.id)) };
}

/**
 * إجماليات بطاقة العميل.
 * **المشتريات = ما سُلّم أو حُصّل وحده** (§٣ بند ٤) — المشروع الجاري أو
 * الملغى لا يُحتسب مشترياتٍ للعميل.
 */
export async function clientTotals(clientId: string): Promise<{
  dealCount: number;
  totalValue: number;
  lastDealAt: Date | null;
}> {
  const [all, won] = await Promise.all([
    db.project.aggregate({
      where: { clientId },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    db.project.aggregate({
      where: { clientId, ...REVENUE_FILTER },
      _sum: { netTotal: true },
    }),
  ]);

  return {
    dealCount: all._count._all,
    totalValue: won._sum.netTotal ?? 0,
    lastDealAt: all._max.createdAt,
  };
}

/**
 * بحث الشاشة: بالهاتف أو الاسم أو المعرّف التسلسلي.
 * معيار القبول ≤٣٠٠ ملّي ثانية — لذلك: فهرس على كل عمود مقصود، وحد أعلى
 * للنتائج، ولا تجميع لكل صف.
 */
export async function searchClients(
  term: string,
  scope: Record<string, unknown> = {},
  limit = 25
) {
  const trimmed = term.trim();
  if (!trimmed) return [];

  const { value, ok } = normalizePhone(trimmed);
  const conditions: Record<string, unknown>[] = [
    { name: search(trimmed) },
    { code: search(trimmed) },
    { companyName: search(trimmed) },
  ];
  if (ok) {
    conditions.unshift({ phoneNormalized: value }, { phoneAltNormalized: value });
  }

  // النطاق يدخل الاستعلام نفسه — لا يُسحب سجل خارج النطاق ثم يُرشَّح بعده
  return db.client.findMany({
    where: { AND: [scope, { OR: conditions }] },
    select: {
      id: true,
      code: true,
      name: true,
      phone: true,
      type: true,
      companyName: true,
      city: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

// ── سجل عملاء الفريق ───────────────────────────────────────────

export type TeamClientRow = {
  id: string;
  code: string | null;
  name: string;
  phone: string;
  type: string;
  companyName: string | null;
  city: string | null;
  /** أدمن المبيعات صاحب آخر مشروع لهذا العميل */
  adminName: string | null;
  dealCount: number;
  /** صفر لمن لا يملك صلاحية رؤية السعر — ولا يُقرأ من القاعدة أصلًا */
  totalValue: number;
  lastDealAt: Date | null;
  segment: ClientSegment;
};

/**
 * عملاء الفريق — **بمن باع لهم لا بمن أنشأ سجلّهم**.
 *
 * كان سجل العملاء يُرشَّح بـ`Client.ownerId`، وهو **مَن كتب البطاقة**. وبيانات
 * المكتب استُوردت دفعةً واحدة فحملت البطاقات كلها اسم المستورد — فكان مدير
 * المبيعات يفتح الشاشة فلا يجد أحدًا، وفريقه قد باع لستّةٍ وستين عميلًا.
 *
 * والقاعدة الصحيحة: **العميل يتبع من أتمّ معه بيعًا.** فالنطاق هنا اتحاد
 * مجموعتين — من له مشروع يملكه أحد الفريق، ومن أنشأ الفريق بطاقته ولم يشترِ
 * بعد (فلا يختفي العميل الجديد في اليوم الذي أُضيف فيه).
 *
 * **والترشيح كلّه في الخادم** (§٣ بند ٢): من لا يملك رؤية السعر لا يُجمَع له
 * مبلغ ولا يُرسَل إليه.
 */
export async function teamClients(opts: {
  /** المستخدمون الذين تدخل سجلاتهم في نطاق الرؤية — null يعني كل الشركة */
  ownerIds: string[] | null;
  /** ترشيح على أدمن بعينه من داخل النطاق */
  adminId?: string | null;
  from?: Date | null;
  to?: Date | null;
  branch?: string | null;
  type?: string | null;
  segment?: string | null;
  term?: string | null;
  sort?: string | null;
  showValue: boolean;
  limit?: number;
  now?: Date;
}): Promise<{ rows: TeamClientRow[]; total: number }> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 200;

  // الأدمن المختار لا يُوسّع النطاق أبدًا — يضيّقه داخله
  const scoped =
    opts.adminId && (opts.ownerIds === null || opts.ownerIds.includes(opts.adminId))
      ? [opts.adminId]
      : opts.ownerIds;

  const dateFilter =
    opts.from || opts.to
      ? { createdAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lt: opts.to } : {}) } }
      : {};

  const projectWhere = {
    clientId: { not: null },
    ...(scoped ? { ownerId: { in: scoped } } : {}),
    ...(opts.branch ? { branch: opts.branch } : {}),
    ...dateFilter,
  };

  const [all, earned, owned] = await Promise.all([
    db.project.groupBy({
      by: ['clientId'],
      where: projectWhere,
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    opts.showValue
      ? db.project.groupBy({
          by: ['clientId'],
          where: { ...projectWhere, ...REVENUE_FILTER },
          _sum: { netTotal: true },
        })
      : Promise.resolve([] as { clientId: string | null; _sum: { netTotal: number | null } }[]),
    // من أنشأ الفريق بطاقته ولم يشترِ بعد
    db.client.findMany({
      where: { ...(scoped ? { ownerId: { in: scoped } } : {}), ...dateFilter },
      select: { id: true },
      take: 2000,
    }),
  ]);

  const counts = new Map<string, { deals: number; last: Date | null }>();
  for (const row of all) {
    if (row.clientId) counts.set(row.clientId, { deals: row._count._all, last: row._max.createdAt });
  }
  const values = new Map<string, number>();
  for (const row of earned) {
    if (row.clientId) values.set(row.clientId, row._sum.netTotal ?? 0);
  }

  const ids = [...new Set([...counts.keys(), ...owned.map((o) => o.id)])];
  if (ids.length === 0) return { rows: [], total: 0 };

  const conditions: Record<string, unknown>[] = [];
  const term = (opts.term ?? '').trim();
  if (term) {
    const { value, ok } = normalizePhone(term);
    if (ok) conditions.push({ phoneNormalized: value }, { phoneAltNormalized: value });
    conditions.push(
      { name: search(term) },
      { code: search(term) },
      { companyName: search(term) }
    );
  }

  const clients = await db.client.findMany({
    where: {
      id: { in: ids },
      ...(opts.type ? { type: opts.type } : {}),
      ...(conditions.length ? { OR: conditions } : {}),
    },
    select: {
      id: true,
      code: true,
      name: true,
      phone: true,
      type: true,
      companyName: true,
      city: true,
    },
    take: 2000,
  });

  const enriched = clients.map((c) => {
    const stat = counts.get(c.id);
    const lastDealAt = stat?.last ?? null;
    const dealCount = stat?.deals ?? 0;
    return {
      ...c,
      adminName: null as string | null,
      dealCount,
      totalValue: values.get(c.id) ?? 0,
      lastDealAt,
      segment: clientSegment({ dealCount, lastDealAt }, now),
    };
  });

  const filtered = opts.segment
    ? enriched.filter((c) => c.segment === opts.segment)
    : enriched;

  const sorted = sortClients(filtered, opts.sort ?? undefined);
  const page = sorted.slice(0, limit);

  // أدمن المبيعات = مالك آخر مشروع. يُقرأ للصفحة المعروضة وحدها
  if (page.length > 0) {
    const recent = await db.project.findMany({
      where: { ...projectWhere, clientId: { in: page.map((c) => c.id) } },
      select: { clientId: true, ownerId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const latest = new Map<string, string>();
    for (const p of recent) {
      if (p.clientId && p.ownerId && !latest.has(p.clientId)) latest.set(p.clientId, p.ownerId);
    }
    const owners = await db.user.findMany({
      where: { id: { in: [...new Set(latest.values())] } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(owners.map((u) => [u.id, u.name]));
    for (const row of page) {
      const ownerId = latest.get(row.id);
      row.adminName = ownerId ? (nameOf.get(ownerId) ?? null) : null;
    }
  }

  return { rows: page, total: sorted.length };
}

export class DuplicateClientError extends Error {
  constructor(
    message: string,
    readonly clientId: string
  ) {
    super(message);
  }
}

/**
 * يجد العميل بهاتفه أو ينشئه. **لا ينشئ مكررًا أبدًا** — إن وُجد الرقم
 * أعاد الموجود بدل رفض العملية، فالمستخدم في شاشة «ليد جديد» يريد المضيّ
 * قدمًا لا رسالة خطأ.
 */
export async function findOrCreateClient(
  data: {
    name: string;
    phone: string;
    email?: string | null;
    type?: string | null;
    companyName?: string | null;
    city?: string | null;
  },
  user: SessionUser
): Promise<{ id: string; code: string | null; created: boolean }> {
  const { value, ok, reason } = normalizePhone(data.phone);
  if (!ok) throw new Error(`رقم الهاتف غير صالح: ${reason}`);

  const existing = await db.client.findUnique({
    where: { phoneNormalized: value },
    select: { id: true, code: true },
  });
  if (existing) return { ...existing, created: false };

  try {
    const client = await db.client.create({
      data: {
        code: await nextClientCode(),
        name: data.name,
        phone: data.phone,
        phoneNormalized: value,
        email: data.email ?? null,
        type: data.type === 'company' ? 'company' : 'individual',
        companyName: data.companyName ?? null,
        city: data.city ?? null,
        firstBranch: user.branch,
        createdById: user.id,
        ownerId: user.id,
      },
      select: { id: true, code: true },
    });
    return { ...client, created: true };
  } catch {
    // سباق: أنشأه شخص آخر بين الفحص والكتابة. القيد الفريد أمسكه —
    // نعيد الموجود بدل أن نفشل.
    const raced = await db.client.findUnique({
      where: { phoneNormalized: value },
      select: { id: true, code: true },
    });
    if (raced) return { ...raced, created: false };
    throw new Error('تعذّر حفظ العميل');
  }
}
