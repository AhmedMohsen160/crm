import 'server-only';
import { db } from './db';
import { can, type SessionUser } from './auth';
import { callAi } from './ai-client';
import { assistantSystem, cleanText, MAX_OUTPUT_TOKENS } from './ai';
import { PERMISSIONS, type Permission } from './permissions';
import { PROJECT_STATUSES } from './projects';

/**
 * مساعد النظام.
 *
 * قاعدته الوحيدة: **المساعد لا يرى إلا ما يراه سائله.** لو بنى سياقه
 * بصلاحيات الخادم لأجاب مدير المشاريع عن سعر البيع المحجوب عنه في §٥، فيصير
 * المساعد بابًا خلفيًا لكل ما أُغلق في الشاشات. فكل استعلام هنا مشروط
 * بصلاحية، لا مُرشَّح بعد القراءة.
 */

const money = (n: number) => Math.round(n).toLocaleString('en-US');

/** لقطة أرقام النظام بحدود صلاحيات السائل */
export async function buildContext(user: SessionUser): Promise<string> {
  const seeAll = can(user, 'canViewAllLeads');
  const mine = seeAll ? {} : { ownerId: user.id };
  const lines: string[] = [];

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // ── الليدز ──────────────────────────────────────────────
  const [openLeads, monthLeads, wonLeads] = await Promise.all([
    db.lead.count({ where: { ...mine, status: { notIn: ['WON', 'LOST'] } } }),
    db.lead.count({ where: { ...mine, createdAt: { gte: monthStart } } }),
    db.lead.count({ where: { ...mine, status: 'WON', convertedAt: { gte: monthStart } } }),
  ]);
  lines.push(
    `الليدز${seeAll ? ' (كل الفروع)' : ' (سجلاتك أنت)'}: ${openLeads} مفتوح، ` +
      `${monthLeads} جديد هذا الشهر، ${wonLeads} تحوّل إلى مشروع هذا الشهر.`
  );

  // ── المشاريع ────────────────────────────────────────────
  const byStatus = await db.project.groupBy({
    by: ['status'],
    where: { ...mine, status: { not: 'cancelled' } },
    _count: { _all: true },
  });
  if (byStatus.length) {
    lines.push(
      'المشاريع القائمة: ' +
        byStatus
          .map(
            (row) =>
              `${PROJECT_STATUSES[row.status as keyof typeof PROJECT_STATUSES] ?? row.status} ${row._count._all}`
          )
          .join('، ') +
        '.'
    );
  }

  const late = await db.project.count({
    where: {
      ...mine,
      deadline: { lt: now },
      status: { notIn: ['delivered', 'collected', 'cancelled'] },
    },
  });
  lines.push(`المتأخر عن موعده: ${late} مشروعًا.`);

  // ── الأرقام المالية — لمن يراها وحده ────────────────────
  if (can(user, 'canViewSellPrice')) {
    const revenue = await db.project.aggregate({
      where: { ...mine, status: { in: ['delivered', 'collected'] }, deliveredAt: { gte: monthStart } },
      _sum: { netTotal: true },
      _count: true,
    });
    lines.push(
      `المُسلَّم هذا الشهر: ${revenue._count} مشروعًا بقيمة ${money(revenue._sum.netTotal ?? 0)}.`
    );

    const uncollected = await db.project.aggregate({
      where: { ...mine, status: 'delivered' },
      _sum: { netTotal: true },
      _count: true,
    });
    lines.push(
      `المُسلَّم غير المحصَّل: ${uncollected._count} مشروعًا بقيمة ${money(uncollected._sum.netTotal ?? 0)}.`
    );
  } else {
    lines.push('أرقام سعر البيع محجوبة عن هذا المستخدم — لا تذكرها ولا تقدّرها.');
  }

  // ── النسب — كلٌّ يرى استحقاقه هو ────────────────────────
  // القيد العكسي سالب المبلغ، فجمعه مع الأصل هو الصافي المستحق فعلًا
  const commissions = await db.commissionEntry.aggregate({
    where: { userId: user.id },
    _sum: { amount: true },
  });
  const netCommission = commissions._sum?.amount ?? 0;
  if (netCommission) lines.push(`مجموع نسبك المحتسبة: ${money(netCommission)}.`);

  // ── المهام والبريد ──────────────────────────────────────
  const tasks = await db.task.count({ where: { assigneeId: user.id, status: 'OPEN' } });
  lines.push(`مهامك المفتوحة: ${tasks}.`);

  if (can(user, 'canUseEmail')) {
    const boxes = await db.mailbox.findMany({
      where: seeAll ? {} : { OR: [{ ownerId: null }, { ownerId: user.id }] },
      select: { id: true },
    });
    if (boxes.length) {
      const unhandled = await db.emailMessage.count({
        where: {
          mailboxId: { in: boxes.map((b) => b.id) },
          direction: 'in',
          handledAt: null,
          intent: { not: 'spam' },
        },
      });
      lines.push(`بريد وارد ينتظر ردًّا: ${unhandled} رسالة.`);
    }
  }

  // ── الفريلانسرز ─────────────────────────────────────────
  if (can(user, 'canViewFreelancerCost')) {
    const due = await db.freelancerPayment.aggregate({
      where: { paidAt: null },
      _sum: { amount: true },
      _count: true,
    });
    if (due._count) {
      lines.push(`مستحقات فريلانسرز غير مصروفة: ${due._count} دفعة بقيمة ${money(due._sum?.amount ?? 0)}.`);
    }
  }

  return lines.join('\n');
}

/** أسماء الصلاحيات بالعربية — تُمرَّر للنموذج ليعرف حدود سائله */
function permissionLabels(user: SessionUser): string[] {
  return (Object.keys(PERMISSIONS) as Permission[])
    .filter((key) => can(user, key))
    .map((key) => PERMISSIONS[key]);
}

/**
 * سؤال وجواب داخل خيط.
 *
 * السياق يُبنى في كل سؤال لا مرة واحدة: أرقام المكتب تتغيّر بين السؤالين،
 * وجوابٌ على لقطة قديمة أسوأ من لا جواب.
 */
export async function ask(params: {
  user: SessionUser;
  threadId: string;
  question: string;
}): Promise<{ ok: true; answer: string } | { ok: false; error: string }> {
  const thread = await db.aiThread.findUnique({
    where: { id: params.threadId },
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
  });
  if (!thread) return { ok: false, error: 'المحادثة غير موجودة' };
  if (thread.userId !== params.user.id) return { ok: false, error: 'لا صلاحية' };

  const context = await buildContext(params.user);
  const system = [
    assistantSystem({
      userName: params.user.name,
      roleLabel: params.user.roleLabel,
      permissions: permissionLabels(params.user),
      today: new Date().toISOString().slice(0, 10),
    }),
    '',
    '— أرقام النظام الآن —',
    context,
  ].join('\n');

  const history = thread.messages.map((m) => ({
    role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    content: m.content,
  }));

  await db.aiMessage.create({
    data: { threadId: thread.id, role: 'user', content: params.question },
  });

  const result = await callAi({
    purpose: 'assistant',
    userId: params.user.id,
    system,
    maxTokens: MAX_OUTPUT_TOKENS.assistant,
    messages: [...history, { role: 'user', content: params.question }],
  });

  if (!result.ok) {
    await db.aiMessage.create({
      data: {
        threadId: thread.id,
        role: 'assistant',
        content: `تعذّر الوصول للمساعد: ${result.error}`,
      },
    });
    return { ok: false, error: result.error };
  }

  const answer = cleanText(result.text);
  await db.aiMessage.create({
    data: { threadId: thread.id, role: 'assistant', content: answer, usedData: 'لقطة أرقام النظام' },
  });

  // عنوان المحادثة من أول سؤال — أفضل من «محادثة جديدة» في قائمة طويلة
  const patch: { updatedAt: Date; title?: string } = { updatedAt: new Date() };
  if (!thread.messages.length) patch.title = params.question.slice(0, 60);
  await db.aiThread.update({ where: { id: thread.id }, data: patch });

  return { ok: true, answer };
}
