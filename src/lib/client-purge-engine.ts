import "server-only";
import { db } from "./db";
import { round2 } from "./settlement";
import type { PurgeInventory } from "./client-purge";

/**
 * الحذف النهائيّ لسجل عميل — ما يلمس القاعدة.
 *
 * القواعد في `client-purge.ts`، وهذا تنفيذُها. وثلاث ملاحظاتٍ على التنفيذ:
 *
 * ١) **الجرد يُبنى مرة ويُعرض ثم يُبنى مرة أخرى قبل الحذف.** الشاشة تعرضه،
 *    وقد يمرّ وقتٌ يدخل فيه مشروعٌ جديد — فيُعاد الفحص لحظةَ الضغط.
 *
 * ٢) **والترتيب لازم: الأبناء قبل الآباء.** أغلب العلاقات هنا `SetNull` لا
 *    `Cascade` — فحذفُ العميل أولًا يترك مشاريعه يتامى بلا عميل بدل أن
 *    يحذفها، وهي أسوأ حالٍ من الترك.
 *
 * ٣) **وسجلُّ التدقيق لا يُمسّ.** هو الأثر الباقي على أن هذا العميل كان
 *    ومُحي — ومحوُه يمحو أثر المحو نفسه.
 */

/** يجرد كل ما يتعلّق بعميل — قبل الحذف وقبل عرض الشاشة */
export async function clientPurgeInventory(
  clientId: string,
): Promise<PurgeInventory | null> {
  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, importTag: true },
  });
  if (!client) return null;

  const projects = await db.project.findMany({
    where: { clientId },
    select: { id: true, netTotal: true, status: true },
  });
  const projectIds = projects.map((p) => p.id);
  const leads = await db.lead.findMany({
    where: { clientId },
    select: { id: true },
  });
  const leadIds = leads.map((l) => l.id);
  const accounts = await db.account.findMany({
    where: { clientId },
    select: { id: true },
  });
  const accountIds = accounts.map((a) => a.id);

  /**
   * قيودُ الدفتر المتّصلة بهذا العميل — من مشاريعه أو من حسابه في الشجرة.
   *
   * **والحسابُ طريقٌ ثانٍ لا يُنسى**: بطاقةُ العميل تُربط بحساب في شجرة
   * «العملاء»، وقيودُ تحصيله تقع عليه ولو لم تُربط بمشروع.
   */
  const entryIds = new Set<string>();
  if (projectIds.length > 0) {
    const rows = await db.journalEntry.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    });
    rows.forEach((r) => entryIds.add(r.id));
  }
  if (accountIds.length > 0) {
    const rows = await db.journalLine.findMany({
      where: { accountId: { in: accountIds } },
      select: { entryId: true },
    });
    rows.forEach((r) => entryIds.add(r.entryId));
  }

  const entries =
    entryIds.size > 0
      ? await db.journalEntry.findMany({
          where: { id: { in: [...entryIds] } },
          select: { id: true, status: true, period: true },
        })
      : [];

  // الفترات المقفلة — هي وحدها ما يحجب الحذف
  const posted = entries.filter((e) => e.status === "posted");
  const periods = [...new Set(posted.map((e) => e.period))];
  const closedRows = periods.length
    ? await db.fiscalPeriod.findMany({
        where: { period: { in: periods }, closedAt: { not: null } },
        select: { period: true },
      })
    : [];
  const closedSet = new Set(closedRows.map((r) => r.period));
  const closedEntries = [...closedSet]
    .map((period) => ({
      period,
      entries: posted.filter((e) => e.period === period).length,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));

  const counts: Record<string, number> = {};
  const put = (label: string, n: number) => {
    if (n > 0) counts[label] = n;
  };

  put("مشاريع", projects.length);
  put("ليدز", leads.length);
  put("قيود يومية", entries.length);
  put("حسابات في شجرة العملاء", accounts.length);
  put(
    "خطوات مشاريع",
    projectIds.length
      ? await db.projectStep.count({ where: { projectId: { in: projectIds } } })
      : 0,
  );
  put(
    "عروض أسعار",
    projectIds.length
      ? await db.quote.count({ where: { projectId: { in: projectIds } } })
      : 0,
  );
  put(
    "نسب مبيعات",
    projectIds.length
      ? await db.commissionEntry.count({
          where: { projectId: { in: projectIds } },
        })
      : 0,
  );
  put(
    "مدفوعات فريلانسرز",
    projectIds.length
      ? await db.freelancerPayment.count({
          where: { projectId: { in: projectIds } },
        })
      : 0,
  );
  put("عروض احترافية", await db.proposal.count({ where: { clientId } }));
  put("رسائل بريد", await db.emailMessage.count({ where: { clientId } }));

  const scope = [
    ...(projectIds.length ? [{ projectId: { in: projectIds } }] : []),
    ...(leadIds.length ? [{ leadId: { in: leadIds } }] : []),
  ];
  if (scope.length > 0) {
    put("مهامّ", await db.task.count({ where: { OR: scope } }));
    put("ملاحظات", await db.note.count({ where: { OR: scope } }));
    put("أنشطة", await db.activity.count({ where: { OR: scope } }));
  }

  return {
    clientName: client.name,
    counts,
    // الإيراد المعترَف به وحده — الجاري والملغى ليس إيرادًا (§٣ بند ٤)
    revenue: round2(
      projects
        .filter((p) => p.status === "delivered" || p.status === "collected")
        .reduce((sum, p) => sum + p.netTotal, 0),
    ),
    closedEntries,
    postedEntries:
      posted.length - closedEntries.reduce((s, r) => s + r.entries, 0),
    importTag: client.importTag,
  };
}

/**
 * يحذف العميل وكلَّ ما يتعلّق به.
 *
 * **ولا يُنادى إلا بعد `purgeVerdict`** — الفحص قاعدةٌ خالصة تُختبر بلا
 * قاعدة بيانات، والتنفيذ هنا يثق بها ولا يعيدها.
 */
export async function purgeClient(
  clientId: string,
): Promise<Record<string, number>> {
  const projects = await db.project.findMany({
    where: { clientId },
    select: { id: true },
  });
  const projectIds = projects.map((p) => p.id);
  const leads = await db.lead.findMany({
    where: { clientId },
    select: { id: true },
  });
  const leadIds = leads.map((l) => l.id);
  const accounts = await db.account.findMany({
    where: { clientId },
    select: { id: true },
  });
  const accountIds = accounts.map((a) => a.id);

  const entryIds = new Set<string>();
  if (projectIds.length > 0) {
    (
      await db.journalEntry.findMany({
        where: { projectId: { in: projectIds } },
        select: { id: true },
      })
    ).forEach((r) => entryIds.add(r.id));
  }
  if (accountIds.length > 0) {
    (
      await db.journalLine.findMany({
        where: { accountId: { in: accountIds } },
        select: { entryId: true },
      })
    ).forEach((r) => entryIds.add(r.entryId));
  }
  const entries = [...entryIds];

  const removed: Record<string, number> = {};
  const drop = async (label: string, run: () => Promise<{ count: number }>) => {
    const { count } = await run();
    if (count) removed[label] = (removed[label] ?? 0) + count;
  };

  /**
   * **والحذف كلُّه في معاملةٍ واحدة.**
   *
   * فشلٌ في منتصف الطريق يترك مشاريعَ بلا عميل وقيودًا بلا حساب — وهي حالٌ
   * أسوأ من ألّا يُحذف شيء.
   */
  await db.$transaction(
    async (tx) => {
      // ── الأبناء ────────────────────────────────────────────────
      if (projectIds.length > 0) {
        await drop("نسب مبيعات", () =>
          tx.commissionEntry.deleteMany({
            where: { projectId: { in: projectIds } },
          }),
        );
        await drop("مدفوعات فريلانسرز", () =>
          tx.freelancerPayment.deleteMany({
            where: { projectId: { in: projectIds } },
          }),
        );
        await drop("خطوات مشاريع", () =>
          tx.projectStep.deleteMany({
            where: { projectId: { in: projectIds } },
          }),
        );
        await drop("بنود عروض أسعار", () =>
          tx.quoteItem.deleteMany({
            where: { quote: { projectId: { in: projectIds } } },
          }),
        );
        await drop("عروض أسعار", () =>
          tx.quote.deleteMany({ where: { projectId: { in: projectIds } } }),
        );
      }

      const scope = [
        ...(projectIds.length ? [{ projectId: { in: projectIds } }] : []),
        ...(leadIds.length ? [{ leadId: { in: leadIds } }] : []),
      ];
      if (scope.length > 0) {
        await drop("مهامّ", () => tx.task.deleteMany({ where: { OR: scope } }));
      }
      // الملاحظة والنشاط يتعلّقان بليدٍ أو مشروع لا بالعميل مباشرةً
      if (scope.length > 0) {
        await drop("ملاحظات", () =>
          tx.note.deleteMany({ where: { OR: scope } }),
        );
        await drop("أنشطة", () =>
          tx.activity.deleteMany({ where: { OR: scope } }),
        );
      }
      await drop("رسائل بريد", () =>
        tx.emailMessage.deleteMany({ where: { clientId } }),
      );
      await drop("صفوف العروض الاحترافية", () =>
        tx.proposalTierRow.deleteMany({ where: { proposal: { clientId } } }),
      );
      await drop("عروض احترافية", () =>
        tx.proposal.deleteMany({ where: { clientId } }),
      );

      // ── الدفتر: السطور قبل القيود ──────────────────────────────
      if (entries.length > 0) {
        await drop("سطور قيود", () =>
          tx.journalLine.deleteMany({ where: { entryId: { in: entries } } }),
        );
        await drop("قيود يومية", () =>
          tx.journalEntry.deleteMany({ where: { id: { in: entries } } }),
        );
      }

      // ── الآباء ─────────────────────────────────────────────────
      await drop("مشاريع", () =>
        tx.project.deleteMany({ where: { clientId } }),
      );
      await drop("ليدز", () => tx.lead.deleteMany({ where: { clientId } }));
      if (accountIds.length > 0) {
        // مركزُ الربحية يشير إلى العميل بحقلٍ بلا علاقة — يُفرَّغ باليد
        await tx.costCenter.updateMany({
          where: { clientId },
          data: { clientId: null },
        });
        await drop("حسابات في شجرة العملاء", () =>
          tx.account.deleteMany({ where: { id: { in: accountIds } } }),
        );
      }
      await drop("بطاقة عميل", () =>
        tx.client.deleteMany({ where: { id: clientId } }),
      );
    },
    /**
     * **ومهلةٌ تكفي أكبرَ عميل.** المهلة الافتراضية خمس ثوان، وحذفُ عميلٍ له
     * ثلاثة عشر مشروعًا ومئاتُ سطورِ قيدٍ يتجاوزها — فتُلغى المعاملة في
     * منتصفها ولا يُحذف شيء.
     */
    { timeout: 120_000, maxWait: 10_000 },
  );

  return removed;
}
