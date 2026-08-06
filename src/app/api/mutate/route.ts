import { type NextRequest } from 'next/server';
import { redirectTo, redirectWithError } from '@/lib/http';
import { db } from '@/lib/db';
import { getCurrentUser, can, type SessionUser } from '@/lib/auth';
import { logActivity } from '@/lib/actions/helpers';
import { auditEvent, auditDiff } from '@/lib/audit';
import { LEAD_STATUSES, LEAD_CLOSED_STATUSES, type LeadStatus } from '@/lib/constants';

/**
 * نقطة واحدة لكل التعديلات السريعة التي تتم من داخل الصفحة
 * (إنهاء مهمة، تغيير مرحلة صفقة، حذف سجل...).
 *
 * تعمل بأسلوب النماذج التقليدي: إرسال (POST) ثم تحويل إلى نفس الصفحة.
 * السبب: رحلة Server Action كانت تتعطّل أحيانًا في المتصفح فيبقى الزر
 * معلّقًا ولا تظهر النتيجة، بينما هذا المسار يعمل في كل مرة — حتى لو كان
 * الجافاسكربت معطّلًا.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return redirectTo('/login');

  const fd = await request.formData();
  const op = String(fd.get('op') ?? '');
  const id = String(fd.get('id') ?? '');
  const value = String(fd.get('value') ?? '');

  const requested = String(fd.get('redirectTo') ?? '');

  try {
    const override = await handle(op, id, value, user);
    return redirectTo(override ?? requested, '/');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'تعذّر تنفيذ العملية. حاول مرة أخرى.';
    console.error(`فشل تنفيذ العملية ${op}:`, error);
    const { logError } = await import('@/lib/error-log-engine');
    await logError({ kind: 'mutate', error, path: op, userId: user.id });
    return redirectWithError(requested, message);
  }
}

/** ينفّذ العملية، ويُرجع مسار تحويل بديل عند الحاجة (كالحذف) */
async function handle(
  op: string,
  id: string,
  value: string,
  user: SessionUser
): Promise<string | null> {
  const seeAll = can(user, 'canViewAllLeads');

  switch (op) {
    // ── المهام ────────────────────────────────────────────────
    case 'task.toggle': {
      const task = await db.task.findUnique({ where: { id } });
      if (!task) return null;
      const allowed = seeAll || task.assigneeId === user.id || task.creatorId === user.id;
      if (!allowed) throw new Error('لا صلاحية');

      const done = task.status === 'DONE';
      await db.task.update({
        where: { id },
        data: { status: done ? 'OPEN' : 'DONE', completedAt: done ? null : new Date() },
      });
      return null;
    }

    case 'task.delete': {
      const task = await db.task.findUnique({ where: { id } });
      if (!task) return null;
      const allowed = seeAll || task.assigneeId === user.id || task.creatorId === user.id;
      if (!allowed) throw new Error('لا صلاحية');
      await db.task.delete({ where: { id } });
      return null;
    }

    // ── حالة المشروع ──────────────────────────────────────────
    // تمرّ كلها عبر moveProject في /api/save، فهي البوابة الوحيدة التي
    // تفرض قواعد §٦. اللوحة ترسل هنا للسحب والإفلات، فنمرّرها إليها.
    case 'project.status': {
      const { moveProject } = await import('@/lib/mutations');
      const fd = new FormData();
      fd.set('status', value);
      return moveProject(fd, user, id);
    }

    // ── حالة العميل المحتمل ───────────────────────────────────
    case 'lead.status': {
      const lead = await db.lead.findUnique({ where: { id } });
      if (!lead) return null;
      if (!seeAll && lead.ownerId !== user.id) throw new Error('لا صلاحية');

      // «خاسر» لا يُضبط بضغطة — سبب الخسارة إلزامي، فيمرّ بنموذج التعديل
      if (value === 'LOST' && !lead.lossReason) {
        throw new Error('سبب الخسارة إلزامي — عدّل الليد واختر السبب');
      }

      const now = new Date();
      const closed = LEAD_CLOSED_STATUSES.includes(value as LeadStatus);
      const data = {
        status: value,
        // أول انتقال عن «جديد» يبصم سرعة الرد — ولا يُعاد ضبطه أبدًا
        firstReplyAt:
          lead.firstReplyAt ?? (lead.status === 'NEW' && value !== 'NEW' ? now : null),
        closedAt: closed ? (lead.closedAt ?? now) : null,
        convertedAt: value === 'WON' ? (lead.convertedAt ?? now) : null,
      };

      await db.lead.update({ where: { id }, data });
      await auditDiff(user.id, 'Lead', id, lead, data);
      await logActivity({
        type: 'STATUS_CHANGED',
        title: 'تغيّرت مرحلة الليد',
        detail: `${LEAD_STATUSES[lead.status as LeadStatus] ?? lead.status} ← ${
          LEAD_STATUSES[value as LeadStatus] ?? value
        }`,
        userId: user.id,
        link: { leadId: id },
      });
      return null;
    }

    // ── حالة عرض السعر ────────────────────────────────────────
    case 'quote.status': {
      const quote = await db.quote.findUnique({ where: { id } });
      if (!quote) return null;
      if (!seeAll && quote.ownerId !== user.id) throw new Error('لا صلاحية');

      await db.quote.update({
        where: { id },
        data: {
          status: value,
          sentAt: value === 'SENT' ? (quote.sentAt ?? new Date()) : quote.sentAt,
        },
      });

      // عرض السعر أداة بيعية على الليد؛ حالة المشروع تشغيلية ولا تتحرك
      // بقبول عرض. ما ينقل المشروع هو انتقالات §٦ وحدها.

      await logActivity({
        type: 'QUOTE_SENT',
        title: `تغيّرت حالة عرض السعر ${quote.number}`,
        detail: `${quote.status} ← ${value}`,
        userId: user.id,
        link: { projectId: quote.projectId, companyId: quote.companyId },
      });
      return null;
    }

    // ── حذف شريحة نسب ─────────────────────────────────────────
    case 'commissionTier.delete': {
      if (!can(user, 'canManageSettings')) throw new Error('لا صلاحية');
      const tier = await db.commissionTier.findUnique({ where: { id } });
      if (!tier) return null;
      await db.commissionTier.delete({ where: { id } });
      await auditEvent(user.id, 'delete', 'CommissionTier', id, `من ${tier.fromAmount}`);
      return null;
    }

    // ── حذف شريحة في عرض احترافي ──────────────────────────────
    // الشريحة سطر في مستند لم يُرسل بعد، لا سجلًّا تشغيليًّا؛ وحذفها من
    // مسوّدة أنظف من إبقاء سطر ميت في جدول يقرأه العميل.
    case 'proposalTier.delete': {
      if (!can(user, 'canViewSellPrice')) throw new Error('لا صلاحية');
      const tier = await db.proposalTierRow.findUnique({
        where: { id },
        include: { proposal: { select: { id: true, status: true } } },
      });
      if (!tier) return null;
      if (tier.proposal.status !== 'draft' && tier.proposal.status !== 'sent') {
        throw new Error('العرض محسوم — أنشئ مراجعة جديدة بدل تعديله');
      }
      await db.proposalTierRow.delete({ where: { id } });
      await auditEvent(user.id, 'delete', 'ProposalTierRow', id, tier.label);
      return `/proposals/${tier.proposal.id}`;
    }

    // ── حذف بند سعر فريلانسر ──────────────────────────────────
    case 'freelancerRate.delete': {
      if (!can(user, 'canManageFreelancers')) throw new Error('لا صلاحية');
      const rate = await db.freelancerRate.findUnique({ where: { id } });
      if (!rate) return null;
      await db.freelancerRate.delete({ where: { id } });
      await auditEvent(user.id, 'delete', 'FreelancerRate', id, `بند بـ${rate.rate}`);
      return null;
    }

    // ── إيقاف فريلانسر ────────────────────────────────────────
    // §٣ بند ٥: لا شيء يُمحى. الإيقاف يُخرجه من محرّك الاختيار
    // ويُبقي مشاريعه ومستحقاته منسوبة له.
    case 'freelancer.deactivate': {
      if (!can(user, 'canManageFreelancers')) throw new Error('لا صلاحية');
      const target = await db.freelancer.findUnique({ where: { id } });
      if (!target) return '/freelancers';
      await db.freelancer.update({
        where: { id },
        data: { active: !target.active, tier: target.active ? 'suspended' : target.tier },
      });
      await auditEvent(
        user.id,
        'update',
        'Freelancer',
        id,
        target.active ? 'إيقاف الفريلانسر' : 'إعادة تفعيله'
      );
      return `/freelancers/${id}`;
    }

    // ── حذف ملاحظة ────────────────────────────────────────────
    case 'note.delete': {
      const note = await db.note.findUnique({ where: { id } });
      if (!note) return null;
      if (!seeAll && note.authorId !== user.id) throw new Error('لا صلاحية');
      await db.note.delete({ where: { id } });
      return null;
    }

    // ── حذف السجلات الرئيسية ─────────────────────────────────
    case 'lead.delete': {
      const rec = await db.lead.findUnique({ where: { id } });
      if (!rec) return '/leads';
      if (!seeAll && rec.ownerId !== user.id) throw new Error('لا صلاحية');
      await db.lead.delete({ where: { id } });
      return '/leads';
    }

    // المشروع لا يُحذف — يُلغى بسبب صريح ويبقى في اللوحة التشغيلية
    // خارج كل تقرير مالي (§٣ بند ٥ و§٦)
    case 'project.delete':
    case 'deal.delete': {
      const rec = await db.project.findUnique({ where: { id } });
      if (!rec) return '/projects';
      if (!seeAll && rec.ownerId !== user.id) throw new Error('لا صلاحية');
      if (rec.status === 'cancelled') return `/projects/${id}`;

      await db.project.update({
        where: { id },
        data: {
          status: 'cancelled',
          closedAt: new Date(),
          revenueMonth: null,
          cancelReason: value || 'أُلغي من الشاشة',
        },
      });
      await auditEvent(user.id, 'update', 'Project', id, 'إلغاء المشروع');

      // ألغِي بعد تحصيله ← نسبته تُخصم (قرار الإدارة)
      if (rec.status === 'collected') {
        const { reverseProjectCommission } = await import('@/lib/commission-engine');
        await reverseProjectCommission(id, 'إلغاء المشروع بعد التحصيل');
      }
      return `/projects/${id}`;
    }

    case 'company.delete': {
      const rec = await db.company.findUnique({ where: { id } });
      if (!rec) return '/companies';
      if (!seeAll && rec.ownerId !== user.id) throw new Error('لا صلاحية');
      await db.company.delete({ where: { id } });
      return '/companies';
    }

    case 'contact.delete': {
      const rec = await db.contact.findUnique({ where: { id } });
      if (!rec) return '/contacts';
      if (!seeAll && rec.ownerId !== user.id) throw new Error('لا صلاحية');
      await db.contact.delete({ where: { id } });
      return '/contacts';
    }

    case 'quote.delete': {
      const rec = await db.quote.findUnique({ where: { id } });
      if (!rec) return '/quotes';
      if (!seeAll && rec.ownerId !== user.id) throw new Error('لا صلاحية');
      await db.quote.delete({ where: { id } });
      return '/quotes';
    }

    // ── إيقاف مستخدم ──────────────────────────────────────────
    // §٣ بند ٥: لا شيء يُمحى. الإيقاف يمنع الدخول ويُبقي كل السجلات
    // منسوبة لصاحبها، فتظل التقارير التاريخية صحيحة.
    case 'user.deactivate':
    case 'user.delete': {
      if (!can(user, 'canManageUsers')) throw new Error('لا صلاحية');
      if (user.id === id) throw new Error('لا يمكنك إيقاف حسابك الخاص');

      const target = await db.user.findUnique({
        where: { id },
        include: { roleRef: { select: { canManageUsers: true } } },
      });
      if (!target) return '/settings/users';
      if (!target.active) return '/settings/users';

      if (target.roleRef?.canManageUsers) {
        const others = await db.user.count({
          where: { active: true, id: { not: id }, roleRef: { canManageUsers: true } },
        });
        if (others === 0) {
          throw new Error('يجب أن يبقى مستخدم نشط واحد يملك صلاحية «إدارة المستخدمين»');
        }
      }

      await db.user.update({ where: { id }, data: { active: false } });
      await auditEvent(user.id, 'update', 'User', id, 'إيقاف الحساب');
      return '/settings/users';
    }

    default:
      throw new Error(`عملية غير معروفة: ${op}`);
  }
}
