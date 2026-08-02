import 'server-only';
import { db } from './db';
import { resolveRate, rankFreelancers, type RateContext, type ResolvedRate } from './freelancers';

/**
 * محرّك الفريلانسرز — الجانب الخادمي (§١١).
 *
 * ثلاث مسؤوليات:
 *   ١) **الفهرس الخفيف** الذي يُحمَّل مرة واحدة فيبحث المتصفح بلا نداء لكل حرف
 *   ٢) **حلّ السعر** من الاستثناءات ثم الافتراضي
 *   ٣) **سطر الاستحقاق التلقائي** عند إسناد خطوة لفريلانسر
 */

/** ما يُرسل للمتصفح ليبحث فيه محليًا — بلا أي حقل لا يلزم البحث */
export type FreelancerIndexRow = {
  id: string;
  code: string | null;
  name: string;
  langs: string[];
  specialisations: string[];
  defaultRate: number | null;
  rateUnit: string;
  currency: string;
  tier: string;
  rating: number | null;
  projectsCount: number;
  lastUsedAt: string | null;
};

const split = (v: string | null) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * الفهرس الخفيف. **لا يحمل أجرًا تفصيليًا ولا بيانات دفع** — السعر الافتراضي
 * وحده يكفي للترتيب، وما عداه يُطلب عند الاختيار.
 *
 * ومن لا يملك `canViewFreelancerCost` لا يصله السعر أصلًا: يُحذف في الخادم
 * ولا يُخفى في الواجهة (§١٥ الأمان).
 */
export async function freelancerIndex(options: {
  includeRates: boolean;
  includeInactive?: boolean;
}): Promise<FreelancerIndexRow[]> {
  const rows = await db.freelancer.findMany({
    where: options.includeInactive ? {} : { active: true },
    select: {
      id: true,
      code: true,
      name: true,
      langs: true,
      specialisations: true,
      defaultRate: true,
      rateUnit: true,
      currency: true,
      tier: true,
      rating: true,
      projectsCount: true,
      lastUsedAt: true,
    },
  });

  return rows.map((f) => ({
    id: f.id,
    code: f.code,
    name: f.name,
    langs: split(f.langs),
    specialisations: split(f.specialisations),
    defaultRate: options.includeRates ? f.defaultRate : null,
    rateUnit: f.rateUnit,
    currency: f.currency,
    tier: f.tier,
    rating: f.rating,
    projectsCount: f.projectsCount,
    lastUsedAt: f.lastUsedAt ? f.lastUsedAt.toISOString() : null,
  }));
}

/**
 * الترشيح المسبق (§١١ بند ٢): لا يظهر إلا من يعمل على هذا الزوج وهذا الخط.
 *
 * ومن لم تُسجَّل لغاته لا يُحذف — يُعرض في ذيل القائمة، لأن نقص البيانات
 * عندنا ليس ذنبه، وقد يكون هو الأنسب.
 */
export function filterForProject(
  rows: FreelancerIndexRow[],
  ctx: { langFrom?: string | null; langTo?: string | null; serviceLine?: string | null }
): FreelancerIndexRow[] {
  const wanted = [ctx.langFrom, ctx.langTo].filter(Boolean) as string[];

  const matches = (row: FreelancerIndexRow) => {
    if (row.langs.length === 0) return false;
    // يكفي أن يعرف إحدى اللغتين — التوجّه يُحسم عند اختيار السعر
    return wanted.length === 0 || wanted.some((l) => row.langs.includes(l));
  };

  const scored = rows.map((row) => {
    const langOk = matches(row);
    const lineOk =
      !ctx.serviceLine ||
      row.specialisations.length === 0 ||
      row.specialisations.includes(ctx.serviceLine);
    return { row, langOk, lineOk, unknown: row.langs.length === 0 };
  });

  const exact = scored.filter((s) => s.langOk && s.lineOk).map((s) => s.row);
  const partial = scored.filter((s) => s.langOk && !s.lineOk).map((s) => s.row);
  const unknown = scored.filter((s) => s.unknown).map((s) => s.row);

  return [
    ...rankByRate(exact),
    ...rankByRate(partial),
    ...rankByRate(unknown),
  ];
}

function rankByRate(rows: FreelancerIndexRow[]): FreelancerIndexRow[] {
  return rankFreelancers(
    rows.map((r) => ({ ...r, effectiveRate: r.defaultRate }))
  ).map(({ effectiveRate: _drop, ...rest }) => rest as FreelancerIndexRow);
}

/** يحلّ سعر فريلانسر لسياق مشروع/خطوة — بقراءة استثناءاته من القاعدة */
export async function resolveFreelancerRate(
  freelancerId: string,
  ctx: RateContext
): Promise<ResolvedRate & { name: string }> {
  const freelancer = await db.freelancer.findUnique({
    where: { id: freelancerId },
    include: { rates: true },
  });
  if (!freelancer) {
    return { rate: null, rateUnit: 'page', currency: 'EGP', source: 'none', specificity: 0, name: '' };
  }

  const resolved = resolveRate(
    {
      defaultRate: freelancer.defaultRate,
      rateUnit: freelancer.rateUnit,
      currency: freelancer.currency,
    },
    freelancer.rates,
    ctx
  );
  return { ...resolved, name: freelancer.name };
}

/**
 * سطر الاستحقاق التلقائي (§١١ بند ٨).
 *
 * **يُنشأ عند الإسناد لا عند التسليم** — لأن الالتزام نشأ لحظة تكليفه.
 * وتعديل الخطوة يُحدّث السطر ما دام **مستحقًا**؛ فإن كان قد صُرف فعلًا
 * فلا يُلمس المبلغ المدفوع، ويُضاف الفرق سطرًا جديدًا يشرح نفسه.
 */
export async function syncStepPayment(params: {
  stepId: string;
  freelancerId: string | null;
  projectId: string;
  amount: number;
  currency: string;
  dueDate?: Date | null;
}): Promise<'created' | 'updated' | 'adjusted' | 'removed' | 'none'> {
  const { stepId, freelancerId, projectId, amount, currency } = params;

  const existing = await db.freelancerPayment.findMany({ where: { stepId } });
  const due = existing.find((p) => p.status === 'due');
  const paidTotal = existing
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);

  // لم يعد للخطوة فريلانسر (صارت داخلية): نلغي المستحق غير المصروف فقط
  if (!freelancerId || amount <= 0) {
    if (due) {
      await db.freelancerPayment.delete({ where: { id: due.id } });
      return 'removed';
    }
    return 'none';
  }

  const outstanding = amount - paidTotal;

  if (due) {
    if (Math.abs(due.amount - outstanding) < 0.005 && due.freelancerId === freelancerId) {
      return 'none';
    }
    if (outstanding <= 0) {
      await db.freelancerPayment.delete({ where: { id: due.id } });
      return 'removed';
    }
    await db.freelancerPayment.update({
      where: { id: due.id },
      data: { freelancerId, amount: outstanding, currency, dueDate: params.dueDate ?? due.dueDate },
    });
    return 'updated';
  }

  if (outstanding <= 0) return 'none';

  await db.freelancerPayment.create({
    data: {
      freelancerId,
      projectId,
      stepId,
      amount: outstanding,
      currency,
      dueDate: params.dueDate ?? null,
      status: 'due',
      notes: paidTotal > 0 ? 'فرق بعد تعديل الخطوة عقب صرف دفعة' : null,
    },
  });
  return paidTotal > 0 ? 'adjusted' : 'created';
}

/** يحدّث عدّادات الترتيب — «الأكثر عملًا معنا» و«الأحدث تعاملًا» */
export async function recordFreelancerUse(freelancerId: string, at = new Date()) {
  await db.freelancer.update({
    where: { id: freelancerId },
    data: { projectsCount: { increment: 1 }, lastUsedAt: at },
  });
}

/** أعمار المستحقات — نفس تقسيم مستحقات العملاء (§١٣) */
export function agingBucket(dueDate: Date | null, now = new Date()): 'fresh' | 'mid' | 'late' {
  if (!dueDate) return 'fresh';
  const days = Math.floor((now.getTime() - dueDate.getTime()) / 86_400_000);
  if (days < 7) return 'fresh';
  if (days <= 30) return 'mid';
  return 'late';
}
