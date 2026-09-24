import 'server-only';
import { db } from './db';

/**
 * مسحُ البيانات التجريبية — ما زُرع لتجريب النظام قبل أن يحمل بيانات المكتب.
 *
 * قالها أحمد صراحةً: **«البيانات الحالية الموجودة على النظام كلها افتراضية
 * وغير حقيقية… امسحها وقم بإدخال الداتا التي معك.»**
 *
 * ── وأربعة حدود تحكم ما يُمسح ────────────────────────────────
 *
 * ١) **الحركة وحدها تُمسح، والإعدادات تبقى.** المستخدمون والأدوار
 *    والصلاحيات وشجرة الحسابات وقائمة الأسعار وخطط النسب والقوائم المرجعية
 *    كلُّها يبقى — هذه هيكل النظام لا بياناته، ومسحُها يُعيد التجهيز من أوله.
 *
 * ٢) **وسجلّ التدقيق يبقى.** هو ذاكرة النظام لما جرى، ومسحُه يمحو أثر
 *    المسح نفسه.
 *
 * ٣) **وما رُحِّل من ملفات المكتب لا يُمسّ.** الموسوم بـ`importTag` بياناتٌ
 *    حقيقية دخلت من دفاتر المحاسب وشيت المبيعات — والغاية مسحُ التجريبيّ
 *    لا مسحُ ما جاء ليحلّ محلّه.
 *
 * ٤) **ولا يُنفَّذ إلا بعد تنزيل نسخة احتياطية.** الشاشة تطلبها أولًا،
 *    والنسخة التي لا يملكها المكتب ليست نسخة (§٤).
 */

export type ResetCounts = Record<string, number>;

/**
 * يمسح كل حركةٍ لا تحمل وسم ترحيل.
 *
 * **والترتيب مقصود**: الأبناء قبل الآباء. علاقاتٌ كثيرة هنا `SetNull` لا
 * `Cascade`، فحذفُ العميل أولًا يترك مشاريعه يتامى بلا عميل بدل أن يحذفها.
 */
export async function wipeDemoData(): Promise<ResetCounts> {
  const counts: ResetCounts = {};
  const untagged = { importTag: null };

  /** يحذف ويسجّل العدد باسمٍ عربيّ يقرؤه المالك */
  const wipe = async (label: string, run: () => Promise<{ count: number }>) => {
    const { count } = await run();
    if (count) counts[label] = count;
  };

  // ── الأبناء: ما يتعلّق بمشروعٍ أو عميل ──────────────────────
  await wipe('نسب مبيعات', () =>
    db.commissionEntry.deleteMany({ where: { project: { is: untagged } } })
  );
  await wipe('مدفوعات فريلانسرز', () =>
    db.freelancerPayment.deleteMany({ where: { project: { is: untagged } } })
  );
  await wipe('خطوات مشاريع', () =>
    db.projectStep.deleteMany({ where: { project: { is: untagged } } })
  );
  await wipe('بنود عروض أسعار', () =>
    db.quoteItem.deleteMany({ where: { quote: { project: { is: untagged } } } })
  );
  await wipe('عروض أسعار', () => db.quote.deleteMany({ where: { project: { is: untagged } } }));
  await wipe('صفوف العروض الاحترافية', () => db.proposalTierRow.deleteMany({}));
  await wipe('عروض احترافية', () => db.proposal.deleteMany({}));
  await wipe('مهامّ', () => db.task.deleteMany({}));
  await wipe('ملاحظات', () => db.note.deleteMany({}));
  await wipe('أنشطة', () => db.activity.deleteMany({}));
  await wipe('رسائل بريد', () => db.emailMessage.deleteMany({}));
  await wipe('تنبيهات', () => db.notification.deleteMany({}));

  // ── الدفتر: القيود التجريبية وحدها ─────────────────────────
  await wipe('قيود يومية', () => db.journalEntry.deleteMany({ where: untagged }));
  await wipe('نتائج إقفال الفروع', () => db.branchPeriodResult.deleteMany({}));
  await wipe('فترات النسب', () => db.commissionPeriod.deleteMany({}));

  // ── الآباء ─────────────────────────────────────────────────
  await wipe('مشاريع', () => db.project.deleteMany({ where: untagged }));
  await wipe('ليدز', () => db.lead.deleteMany({ where: untagged }));
  await wipe('عملاء', () => db.client.deleteMany({ where: untagged }));
  await wipe('جهات اتصال', () => db.contact.deleteMany({}));
  await wipe('شركات', () => db.company.deleteMany({}));
  await wipe('صفوف مراجعة الترحيل', () => db.migrationReview.deleteMany({}));

  return counts;
}

/** ما سيُمسح لو ضُغط الزرّ — يُعرض قبل الضغط لا بعده */
export async function previewReset(): Promise<ResetCounts> {
  const untagged = { importTag: null };
  const [projects, leads, clients, entries, companies, contacts] = await Promise.all([
    db.project.count({ where: untagged }),
    db.lead.count({ where: untagged }),
    db.client.count({ where: untagged }),
    db.journalEntry.count({ where: untagged }),
    db.company.count(),
    db.contact.count(),
  ]);
  const counts: ResetCounts = {};
  if (projects) counts['مشاريع'] = projects;
  if (leads) counts['ليدز'] = leads;
  if (clients) counts['عملاء'] = clients;
  if (entries) counts['قيود يومية'] = entries;
  if (companies) counts['شركات'] = companies;
  if (contacts) counts['جهات اتصال'] = contacts;
  return counts;
}

/** ما هو محميّ لأنه مُرحَّل — يُعرض ليطمئنّ المالك أنه لا يُمسّ */
export async function protectedCounts(): Promise<ResetCounts> {
  const tagged = { importTag: { not: null } };
  const [projects, leads, clients, entries] = await Promise.all([
    db.project.count({ where: tagged }),
    db.lead.count({ where: tagged }),
    db.client.count({ where: tagged }),
    db.journalEntry.count({ where: tagged }),
  ]);
  const counts: ResetCounts = {};
  if (projects) counts['مشاريع'] = projects;
  if (leads) counts['ليدز'] = leads;
  if (clients) counts['عملاء'] = clients;
  if (entries) counts['قيود يومية'] = entries;
  return counts;
}
