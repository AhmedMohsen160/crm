import 'server-only';
import { db } from './db';
import { normalizePhone } from './phone';
import { nextClientCode } from './sequence';
import { search } from './utils';
import { REVENUE_FILTER } from './projects';
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
