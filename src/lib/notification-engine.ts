import 'server-only';
import { db } from './db';
import { allSettings } from './reference';
import { endOfToday } from './projects';
import {
  NOTIFICATION_EVENTS,
  isDue,
  buildDigests,
  periodKeyOf,
  daysLate,
  hoursWaiting,
  type Finding,
  type NotificationEvent,
} from './notifications';

/**
 * محرّك التنبيهات (§١٢).
 *
 * لكل حدث **جامع** يمسح السجلات ويُخرج ما يستحق التنبيه، ثم يُجمَّع في
 * **ملخص واحد لكل شخص** ويُكتب مرة واحدة لكل دورة.
 *
 * والتشغيل **آمن التكرار**: مفتاح منع التكرار يجعل تشغيلين في الدقيقة
 * نفسها لا يُنتجان رسالتين. فيمكن استدعاؤه من مؤقّت خارجي بلا حذر.
 */

/** من يملك صلاحية بعينها — القاعدة تفحص الصلاحية لا الدور */
async function usersWithPermission(permission: string): Promise<{ id: string }[]> {
  return db.user.findMany({
    where: { active: true, roleRef: { [permission]: true } },
    select: { id: true },
  });
}

type Collector = (now: Date) => Promise<Finding[]>;

const COLLECTORS: Record<string, Collector> = {
  // ── مشروع بانتظار الإسناد ───────────────────────────────────
  async project_awaiting_assignment() {
    const [projects, recipients] = await Promise.all([
      db.project.findMany({
        where: { status: 'pending_assignment' },
        select: { id: true, code: true, title: true, createdAt: true, deadline: true },
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
      usersWithPermission('canAssignProduction'),
    ]);

    return projects.flatMap((project) =>
      recipients.map((user) => ({
        userId: user.id,
        recordId: project.id,
        recordLabel: `${project.code ?? ''} ${project.title}`.trim(),
        link: `/projects/${project.id}`,
        detail: project.deadline
          ? `يستحق ${project.deadline.toISOString().slice(0, 10)}`
          : 'بلا موعد تسليم',
      }))
    );
  },

  /**
   * سُلّم — **لصاحبه ولمديره، لا لكل المبيعات**.
   *
   * التسليم إشارةُ بدءٍ لا خبرًا: الأدمن يتّصل ويحصّل، ومديره ينتبه لما
   * سُلّم ولم يصل مقابله. وكان يصل الأدمن وحده، فيمرّ المشروع أسابيع بلا
   * تحصيل ولا يعلم به أحد فوقه.
   */
  async project_delivered(now) {
    const since = new Date(now.getTime() - 3 * 86_400_000);
    const projects = await db.project.findMany({
      where: { status: 'delivered', deliveredAt: { gte: since }, ownerId: { not: null } },
      select: {
        id: true,
        code: true,
        title: true,
        ownerId: true,
        netTotal: true,
        owner: { select: { reportsToId: true } },
      },
      take: 200,
    });

    return projects.flatMap((project) => {
      const base = {
        recordId: project.id,
        recordLabel: `${project.code ?? ''} ${project.title}`.trim(),
        link: `/projects/${project.id}`,
        detail: 'سُلّم للعميل — تابع التحصيل',
      };
      const rows = [{ ...base, userId: project.ownerId! }];
      const manager = project.owner?.reportsToId;
      // ولا يُرسَل لمن هو نفسه صاحبه — بطاقتان لحدثٍ واحد تشويش
      if (manager && manager !== project.ownerId) rows.push({ ...base, userId: manager });
      return rows;
    });
  },

  // ── خصم يتجاوز الحد ─────────────────────────────────────────
  async discount_needs_approval() {
    const [projects, recipients] = await Promise.all([
      db.project.findMany({
        where: { approvalState: 'pending' },
        select: { id: true, code: true, title: true, discountValue: true, netTotal: true },
        take: 200,
      }),
      usersWithPermission('canApproveDiscount'),
    ]);

    return projects.flatMap((project) =>
      recipients.map((user) => ({
        userId: user.id,
        recordId: project.id,
        recordLabel: `${project.code ?? ''} ${project.title}`.trim(),
        link: `/projects/${project.id}`,
        detail: 'موقوف حتى تعتمد الخصم',
      }))
    );
  },

  // ── تستحق غدًا ──────────────────────────────────────────────
  async due_tomorrow(now) {
    const start = endOfToday(now);
    const end = new Date(start.getTime() + 86_400_000);

    const [projects, recipients] = await Promise.all([
      db.project.findMany({
        where: {
          deadline: { gte: start, lt: end },
          status: { in: ['pending_assignment', 'in_progress', 'in_review', 'ready', 'rework'] },
        },
        select: { id: true, code: true, title: true },
        take: 200,
      }),
      usersWithPermission('canAssignProduction'),
    ]);

    return projects.flatMap((project) =>
      recipients.map((user) => ({
        userId: user.id,
        recordId: project.id,
        recordLabel: `${project.code ?? ''} ${project.title}`.trim(),
        link: `/projects/${project.id}`,
        detail: 'موعده غدًا',
      }))
    );
  },

  // ── متأخرة ──────────────────────────────────────────────────
  async overdue(now) {
    const [projects, recipients] = await Promise.all([
      db.project.findMany({
        where: {
          deadline: { lt: now },
          status: { in: ['pending_assignment', 'in_progress', 'in_review', 'ready', 'rework'] },
        },
        select: { id: true, code: true, title: true, deadline: true },
        orderBy: { deadline: 'asc' },
        take: 200,
      }),
      usersWithPermission('canAssignProduction'),
    ]);

    return projects.flatMap((project) => {
      const days = Math.floor((now.getTime() - project.deadline!.getTime()) / 86_400_000);
      return recipients.map((user) => ({
        userId: user.id,
        recordId: project.id,
        recordLabel: `${project.code ?? ''} ${project.title}`.trim(),
        link: `/projects/${project.id}`,
        detail: daysLate(days),
      }));
    });
  },

  // ── سُلّم ولم يُحصَّل ────────────────────────────────────────
  async delivered_uncollected(now) {
    const [projects, recipients] = await Promise.all([
      db.project.findMany({
        where: { status: 'delivered' },
        select: {
          id: true, code: true, title: true, deliveredAt: true,
          netTotal: true, deposit: true, collectedAmount: true, ownerId: true,
        },
        take: 300,
      }),
      usersWithPermission('canRecordCollection'),
    ]);

    const findings: Finding[] = [];
    for (const project of projects) {
      const outstanding = (project.netTotal ?? 0) - project.deposit - project.collectedAmount;
      if (outstanding <= 0) continue;

      const days = project.deliveredAt
        ? Math.floor((now.getTime() - project.deliveredAt.getTime()) / 86_400_000)
        : 0;
      const detail = `${Math.round(outstanding).toLocaleString('en-US')} ج.م · ${daysLate(days)}`;

      // الماليات كلها **وصاحبه** — §١٢ ينصّ على «المبيعات + الماليات»
      const targets = new Set(recipients.map((r) => r.id));
      if (project.ownerId) targets.add(project.ownerId);

      for (const userId of targets) {
        findings.push({
          userId,
          recordId: project.id,
          recordLabel: `${project.code ?? ''} ${project.title}`.trim(),
          link: `/projects/${project.id}`,
          amount: outstanding,
          detail,
        });
      }
    }
    return findings;
  },

  // ── ليد بلا رد ──────────────────────────────────────────────
  async lead_no_reply(now) {
    const settings = await allSettings();
    const slaHours = Number(settings.sla_first_reply_hours) || 3;
    const cutoff = new Date(now.getTime() - slaHours * 3_600_000);

    const leads = await db.lead.findMany({
      where: { status: 'NEW', firstReplyAt: null, createdAt: { lt: cutoff } },
      select: {
        id: true, code: true, firstName: true, lastName: true, createdAt: true,
        ownerId: true, owner: { select: { reportsToId: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 300,
    });

    const findings: Finding[] = [];
    for (const lead of leads) {
      const hours = (now.getTime() - lead.createdAt.getTime()) / 3_600_000;
      const label = `${lead.code ?? ''} ${lead.firstName} ${lead.lastName ?? ''}`.trim();

      // §١٢: «أدمن المبيعات **ومديره**»
      const targets = new Set<string>();
      if (lead.ownerId) targets.add(lead.ownerId);
      if (lead.owner?.reportsToId) targets.add(lead.owner.reportsToId);

      for (const userId of targets) {
        findings.push({
          userId,
          recordId: lead.id,
          recordLabel: label,
          link: `/leads/${lead.id}`,
          detail: hoursWaiting(hours),
        });
      }
    }
    return findings;
  },

  // ── مستحق فريلانسر > ٣٠ يومًا ───────────────────────────────
  async freelancer_payment_late(now) {
    const cutoff = new Date(now.getTime() - 30 * 86_400_000);
    const [payments, recipients] = await Promise.all([
      db.freelancerPayment.findMany({
        where: { status: 'due', createdAt: { lt: cutoff } },
        include: { freelancer: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
      usersWithPermission('canPayFreelancers'),
    ]);

    return payments.flatMap((payment) => {
      const days = Math.floor((now.getTime() - payment.createdAt.getTime()) / 86_400_000);
      return recipients.map((user) => ({
        userId: user.id,
        recordId: payment.id,
        recordLabel: payment.freelancer.name,
        link: '/freelancers/payments',
        amount: payment.amount,
        detail: `${Math.round(payment.amount).toLocaleString('en-US')} ج.م · ${daysLate(days)}`,
      }));
    });
  },
};

const LIST_URL: Record<string, string> = {
  project_awaiting_assignment: '/production',
  project_delivered: '/projects?status=delivered',
  discount_needs_approval: '/projects?approval=pending',
  due_tomorrow: '/projects',
  overdue: '/projects',
  delivered_uncollected: '/projects?status=delivered',
  lead_no_reply: '/leads?status=NEW',
  freelancer_payment_late: '/freelancers/payments',
};

export type RunResult = {
  eventKey: string;
  label: string;
  due: boolean;
  reason: string;
  findings: number;
  written: number;
};

/**
 * يشغّل حدثًا واحدًا: يفحص التوقيت، ثم يجمع، ثم يكتب ملخصًا لكل شخص.
 *
 * **لا يكتب رسالة إن لم يجد شيئًا.** «لا مشاريع متأخرة» ليست خبرًا يستحق
 * تنبيهًا — والتنبيه الفارغ يُعلّم المستقبِل أن يتجاهل التنبيهات.
 */
export async function runEvent(event: NotificationEvent, now = new Date()): Promise<RunResult> {
  const state = await db.notificationRun.findUnique({ where: { eventKey: event.key } });
  const verdict = isDue(event.cadence, state?.lastSentAt ?? null, now);

  const base = { eventKey: event.key, label: event.label, ...verdict, findings: 0, written: 0 };
  if (!verdict.due) return base;

  const collector = COLLECTORS[event.key];
  if (!collector) return { ...base, reason: 'لا جامع لهذا الحدث' };

  const findings = await collector(now);

  let written = 0;
  if (findings.length > 0) {
    written = await writeDigests(event, findings, periodKeyOf(event.cadence, now));
  }

  await db.notificationRun.upsert({
    where: { eventKey: event.key },
    update: {
      lastRunAt: now,
      lastCount: findings.length,
      // الملخص الدوري يُبصم وقتَه حتى لو لم يجد شيئًا: وإلا أعاد المحاولة
      // كل دقيقة طوال اليوم بحثًا عن نتيجة
      ...(event.cadence.kind === 'immediate' ? {} : { lastSentAt: now }),
    },
    create: {
      eventKey: event.key,
      lastRunAt: now,
      lastCount: findings.length,
      lastSentAt: event.cadence.kind === 'immediate' ? null : now,
    },
  });

  return { ...base, findings: findings.length, written };
}

/**
 * يكتب الملخصات — **بطاقة واحدة لكل شخص لكل حدث، دائمًا**.
 *
 * وحين توجد بطاقة **لم تُقرأ** لنفس الشخص ونفس الحدث، تُحدَّث في مكانها بدل
 * أن تُضاف ثانية. وهذا ما يجعل القاعدة المنصوصة حقيقيةً لا شعارًا: مشروع
 * جديد بانتظار الإسناد يرفع العدّاد في البطاقة القائمة، ولا يفتح بطاقة
 * تاسعة عشرة بجانب ثمانية عشر أخواتها.
 *
 * وبعد أن تُقرأ البطاقة تُفتح غيرها عند الحدث التالي — فالقراءة إقرار
 * بالاطلاع، وما يقع بعدها خبر جديد.
 */
async function writeDigests(
  event: NotificationEvent,
  findings: Finding[],
  periodKey: string
): Promise<number> {
  const digests = buildDigests(event.key, event.label, findings, {
    periodKey,
    listUrl: LIST_URL[event.key] ?? '/',
  });

  let written = 0;
  for (const digest of digests) {
    const payload = {
      title: digest.title,
      body: digest.body,
      link:
        digest.count === 1
          ? (findings.find((f) => f.userId === digest.userId)?.link ?? digest.link)
          : digest.link,
      severity: event.severity,
      count: digest.count,
      recordIds: digest.recordIds.join(','),
    };

    const open = await db.notification.findFirst({
      where: { eventKey: event.key, userId: digest.userId, readAt: null },
    });

    if (open) {
      // لا شيء تغيّر ← لا نلمسها، فلا تقفز إلى أعلى القائمة بلا سبب
      if (open.recordIds === payload.recordIds) continue;
      await db.notification.update({ where: { id: open.id }, data: payload });
      written += 1;
      continue;
    }

    try {
      await db.notification.create({
        data: {
          eventKey: digest.eventKey,
          userId: digest.userId,
          ...payload,
          dedupeKey: digest.dedupeKey,
        },
      });
      written += 1;
    } catch {
      // القيد الفريد أمسك تكرارًا — وهو المطلوب لا خطأ يُبلَّغ عنه
    }
  }
  return written;
}

/** يشغّل كل الأحداث — يُستدعى من مؤقّت خارجي أو من زر في الشاشة */
export async function runAllEvents(now = new Date()): Promise<RunResult[]> {
  const results: RunResult[] = [];
  for (const event of NOTIFICATION_EVENTS) {
    results.push(await runEvent(event, now));
  }
  return results;
}

export async function unreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}
