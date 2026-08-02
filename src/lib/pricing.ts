import 'server-only';
import { db } from './db';
import { allSettings } from './reference';
import {
  priceProject,
  discountRatio,
  type DiscountInput,
  type PricingResult,
} from './costing';

export { discountRatio };
import type { SessionUser } from './auth';

/**
 * التسعير والخصومات والاعتماد — §١٠.
 *
 * القاعدة الحاكمة: **سعر المشروع يُقرأ بتاريخ المشروع نفسه.** تعديل قائمة
 * الأسعار اليوم لا يغيّر إجمالي مشروع أُنشئ الشهر الماضي (اختبار ١٩) —
 * والسبب أن الإجمالي **مخزَّن** على المشروع، وأن اختيار البند يقع على
 * `effectiveFrom ≤ تاريخ المشروع` لا على أحدث بند مطلقًا.
 */

export type PriceLookup = {
  unitPrice: number;
  currency: string;
  minOrder: number | null;
  /** البند الذي اُختير — للعرض والتشخيص */
  itemId: string;
  effectiveFrom: Date;
};

/**
 * يجد سعر الصفحة الساري **بتاريخ محدَّد** لزوج لغات وخط خدمة.
 * يُرجع null إن لم يوجد بند — والشاشة تطلب حينها إدخال السعر يدويًا بدل
 * أن تخترع رقمًا.
 */
export async function lookupUnitPrice(params: {
  serviceLine: string;
  langFrom: string;
  langTo: string;
  /** تاريخ المشروع — لا «اليوم» */
  asOf?: Date;
}): Promise<PriceLookup | null> {
  const asOf = params.asOf ?? new Date();

  const item = await db.priceListItem.findFirst({
    where: {
      serviceLine: params.serviceLine,
      langFrom: params.langFrom,
      langTo: params.langTo,
      active: true,
      effectiveFrom: { lte: asOf },
    },
    // الأحدث بين ما سرى **قبل** هذا التاريخ — لا الأحدث مطلقًا
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!item) return null;

  return {
    unitPrice: item.unitPrice,
    currency: item.currency,
    minOrder: item.minOrder,
    itemId: item.id,
    effectiveFrom: item.effectiveFrom,
  };
}

// ═══════════════════════════════════════════════════════════════
//  الخصومات (§١٠ بند ٣)
// ═══════════════════════════════════════════════════════════════

export type ResolvedDiscount = {
  type: string;
  value: number;
  /** شرح يُعرض للمستخدم: من أين جاء هذا الخصم */
  reason: string;
};

/**
 * شرائح الخصم الكمّي — تُقرأ من قائمة `volume_discount`.
 * مفتاح العنصر هو عتبة الصفحات، و`extra` هو الخصم العشري.
 */
export async function volumeDiscountFor(pages: number): Promise<ResolvedDiscount | null> {
  const tiers = await db.listItem.findMany({
    where: { listName: 'volume_discount', active: true },
  });

  let best: { threshold: number; value: number; label: string } | null = null;
  for (const tier of tiers) {
    const threshold = Number(tier.value);
    const value = Number(tier.extra);
    if (!Number.isFinite(threshold) || !Number.isFinite(value)) continue;
    if (pages < threshold) continue;
    if (!best || threshold > best.threshold) {
      best = { threshold, value, label: tier.label };
    }
  }

  if (!best) return null;
  return {
    type: 'volume',
    value: best.value,
    reason: `شريحة كمية: ${best.label}`,
  };
}

/**
 * **خصم العميل المتكرر — يُطبَّق تلقائيًا** من تاريخ العميل (§١٠ بند ٣).
 * العميل متكرر إن كان له مشروع سابق سُلّم أو حُصّل.
 */
export async function repeatClientDiscount(
  clientId: string | null
): Promise<ResolvedDiscount | null> {
  if (!clientId) return null;

  const settings = await allSettings();
  const value = Number(settings.repeat_client_discount);
  if (!Number.isFinite(value) || value <= 0) return null;

  const previous = await db.project.count({
    where: { clientId, status: { in: ['delivered', 'collected'] } },
  });
  if (previous === 0) return null;

  return {
    type: 'repeat_client',
    value,
    reason: `عميل متكرر — ${previous} مشروع سابق`,
  };
}

/**
 * يختار الخصم المطبَّق: ما أدخله المستخدم، أو الأفضل للعميل من الخصمين
 * التلقائيين (المتكرر والكمّي) إن لم يُدخل شيئًا.
 *
 * **لا تُجمع الخصومات** — يُؤخذ الأعلى وحده، وإلا تراكمت بلا سقف.
 */
export async function resolveDiscount(params: {
  manualType: string | null;
  manualValue: number | null;
  pages: number;
  clientId: string | null;
}): Promise<ResolvedDiscount> {
  if (params.manualType && params.manualType !== 'none' && params.manualValue) {
    return {
      type: params.manualType,
      value: params.manualValue,
      reason: 'خصم مُدخَل يدويًا',
    };
  }

  const [repeat, volume] = await Promise.all([
    repeatClientDiscount(params.clientId),
    volumeDiscountFor(params.pages),
  ]);

  const candidates = [repeat, volume].filter(Boolean) as ResolvedDiscount[];
  if (candidates.length === 0) return { type: 'none', value: 0, reason: '' };

  return candidates.reduce((best, c) => (c.value > best.value ? c : best));
}

// ═══════════════════════════════════════════════════════════════
//  حدود الخصم والاعتماد (§١٠ بند ٤)
// ═══════════════════════════════════════════════════════════════

/** أقصى نسبة خصم يمنحها هذا المستخدم بلا اعتماد — من دوره */
export async function discountLimitOf(user: SessionUser): Promise<number> {
  if (!user.roleName) return 0;
  const role = await db.role.findUnique({
    where: { name: user.roleName },
    select: { discountLimit: true },
  });
  return role?.discountLimit ?? 0;
}

export type PriceOutcome = PricingResult & {
  discountReason: string;
  discountType: string;
  discountValue: number;
  /** هل تجاوز الخصم حدّ الدور فيحتاج اعتمادًا؟ */
  needsApproval: boolean;
  ratio: number;
  limit: number;
  unitPrice: number;
  /** مصدر السعر — قائمة الأسعار أم إدخال يدوي */
  priceSource: 'list' | 'manual' | 'none';
};

/**
 * التسعير الكامل لمشروع: السعر من القائمة، ثم الاستعجال، ثم الخصم، ثم
 * الحد الأدنى — ثم فحص حدّ الدور.
 */
export async function priceForProject(params: {
  serviceLine: string | null;
  langFrom: string | null;
  langTo: string | null;
  pages: number;
  isRush: boolean;
  clientId: string | null;
  manualUnitPrice: number | null;
  manualDiscountType: string | null;
  manualDiscountValue: number | null;
  user: SessionUser;
  asOf?: Date;
}): Promise<PriceOutcome> {
  const settings = await allSettings();

  let unitPrice = params.manualUnitPrice ?? 0;
  let priceSource: PriceOutcome['priceSource'] = params.manualUnitPrice ? 'manual' : 'none';
  let minOrder = Number(settings.min_order_value) || 0;

  if (!params.manualUnitPrice && params.serviceLine && params.langFrom && params.langTo) {
    const found = await lookupUnitPrice({
      serviceLine: params.serviceLine,
      langFrom: params.langFrom,
      langTo: params.langTo,
      asOf: params.asOf,
    });
    if (found) {
      unitPrice = found.unitPrice;
      priceSource = 'list';
      // الحد الأدنى الخاص بالبند يعلو على العام
      if (found.minOrder !== null) minOrder = found.minOrder;
    }
  }

  const discount = await resolveDiscount({
    manualType: params.manualDiscountType,
    manualValue: params.manualDiscountValue,
    pages: params.pages,
    clientId: params.clientId,
  });

  const result = priceProject({
    pages: params.pages,
    unitPrice,
    isRush: params.isRush,
    discount: { type: discount.type, value: discount.value },
    settings: {
      rushSurcharge: Number(settings.rush_surcharge) || 0,
      minOrderValue: minOrder,
    },
  });

  const limit = await discountLimitOf(params.user);
  const ratio = discountRatio({ type: discount.type, value: discount.value }, result.afterRush);

  return {
    ...result,
    discountReason: discount.reason,
    discountType: discount.type,
    discountValue: discount.value,
    // الخصم التلقائي (المتكرر والكمّي) سياسة معتمدة سلفًا فلا يحتاج اعتمادًا
    needsApproval:
      discount.type !== 'none' &&
      discount.type !== 'repeat_client' &&
      discount.type !== 'volume' &&
      ratio > limit + 1e-9,
    ratio,
    limit,
    unitPrice,
    priceSource,
  };
}
