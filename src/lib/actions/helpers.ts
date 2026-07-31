import 'server-only';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';

export type EntityLink = {
  companyId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  dealId?: string | null;
};

/** يسجّل حدثًا في سجل الأنشطة (من فعل ماذا ومتى) */
export async function logActivity(params: {
  type: string;
  title: string;
  detail?: string | null;
  userId?: string | null;
  link?: EntityLink;
}) {
  await db.activity.create({
    data: {
      type: params.type,
      title: params.title,
      detail: params.detail ?? null,
      userId: params.userId ?? null,
      companyId: params.link?.companyId ?? null,
      contactId: params.link?.contactId ?? null,
      leadId: params.link?.leadId ?? null,
      dealId: params.link?.dealId ?? null,
    },
  });
}

/** يقرأ رابط الكيان المرتبط من نموذج (للمهام والملاحظات) */
export function readEntityLink(fd: FormData): EntityLink {
  const pick = (k: string) => {
    const v = fd.get(k);
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
  };
  return {
    companyId: pick('companyId'),
    contactId: pick('contactId'),
    leadId: pick('leadId'),
    dealId: pick('dealId'),
  };
}

// ═══════════════════════════════════════════════════════════════
//  تحديث الصفحات بعد التعديل (Revalidation)
// ═══════════════════════════════════════════════════════════════
//
//  ثلاث قواعد تعلّمناها بالاختبار العملي، ومخالفتها تُسبب أن يحفظ
//  المستخدم بيانات ثم لا يراها على الشاشة إلا بعد إعادة تحميل يدوية:
//
//  1) المسار الحرفي لصفحة ديناميكية — revalidatePath('/deals/abc123') —
//     لا يُبطل ذاكرة الراوتر في المتصفح. الصيغة الصحيحة هي نمط المسار:
//     revalidatePath('/deals/[id]', 'page').
//
//  2) revalidatePath('/', 'layout') يُبطل الشجرة من الجذر فيتجاهل
//     المتصفح التحديث غالبًا. ممنوع استخدامه.
//
//  3) الأهم: كلما أبطلنا مسارات أكثر، أعاد المتصفح جلب روابط الصفحة كلها
//     دفعة واحدة (عشرات الطلبات المتزامنة)، وهذا السيل يُسقط تحديث الصفحة
//     الحالية نفسه. في قياسنا: 29 طلبًا ⇒ يفشل التحديث، وطلب واحد ⇒ ينجح.
//     لذلك نُبطل أضيق نطاق ممكن: الصفحة التي يقف عليها المستخدم فقط.
//
//  بقية الصفحات لا تحتاج إبطالًا لأنها كلها force-dynamic، فتُجلب من
//  جديد عند الانتقال إليها.

export type Scope = 'lead' | 'company' | 'contact' | 'deal' | 'quote' | 'task';

const DETAIL_ROUTE: Partial<Record<Scope, string>> = {
  lead: '/leads/[id]',
  company: '/companies/[id]',
  contact: '/contacts/[id]',
  deal: '/deals/[id]',
  quote: '/quotes/[id]',
};

const LIST_ROUTE: Record<Scope, string> = {
  lead: '/leads',
  company: '/companies',
  contact: '/contacts',
  deal: '/deals',
  quote: '/quotes',
  task: '/tasks',
};

/** يُحدّث صفحة التفاصيل الخاصة بنوع واحد من السجلات (أضيق نطاق ممكن) */
export function revalidateDetail(...scopes: Scope[]) {
  for (const s of new Set(scopes)) {
    const route = DETAIL_ROUTE[s];
    if (route) revalidatePath(route, 'page');
  }
}

/** يُحدّث صفحة القائمة (تُستخدم بعد الإنشاء أو الحذف) */
export function revalidateList(...scopes: Scope[]) {
  for (const s of new Set(scopes)) revalidatePath(LIST_ROUTE[s]);
}

/** يستنتج نوع السجل من الكيان المرتبط بالمهمة أو الملاحظة */
export function scopeOfLink(link: EntityLink): Scope | null {
  if (link.dealId) return 'deal';
  if (link.leadId) return 'lead';
  if (link.contactId) return 'contact';
  if (link.companyId) return 'company';
  return null;
}

/** المسار الذي نعود إليه بعد حفظ مهمة/ملاحظة مرتبطة بكيان */
export function linkPath(link: EntityLink, fallback = '/tasks'): string {
  if (link.dealId) return `/deals/${link.dealId}`;
  if (link.leadId) return `/leads/${link.leadId}`;
  if (link.contactId) return `/contacts/${link.contactId}`;
  if (link.companyId) return `/companies/${link.companyId}`;
  return fallback;
}
