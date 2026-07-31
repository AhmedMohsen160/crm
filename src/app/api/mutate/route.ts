import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser, canSeeAll, type SessionUser } from '@/lib/auth';
import { logActivity } from '@/lib/actions/helpers';
import {
  DEAL_STAGES,
  STAGE_DEFAULT_PROBABILITY,
  type DealStage,
} from '@/lib/constants';

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
  if (!user) return NextResponse.redirect(new URL('/login', request.url), 303);

  const fd = await request.formData();
  const op = String(fd.get('op') ?? '');
  const id = String(fd.get('id') ?? '');
  const value = String(fd.get('value') ?? '');

  const requested = String(fd.get('redirectTo') ?? '');
  const backPath = requested.startsWith('/') ? requested : '/';

  try {
    const override = await handle(op, id, value, user);
    return NextResponse.redirect(new URL(override ?? backPath, request.url), 303);
  } catch (error) {
    console.error(`فشل تنفيذ العملية ${op}:`, error);
    // نعود إلى الصفحة نفسها مع إشارة إلى الخطأ
    const url = new URL(backPath, request.url);
    url.searchParams.set('error', '1');
    return NextResponse.redirect(url, 303);
  }
}

/** ينفّذ العملية، ويُرجع مسار تحويل بديل عند الحاجة (كالحذف) */
async function handle(
  op: string,
  id: string,
  value: string,
  user: SessionUser
): Promise<string | null> {
  const seeAll = canSeeAll(user);

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

    // ── مرحلة الصفقة ──────────────────────────────────────────
    case 'deal.stage': {
      const deal = await db.deal.findUnique({ where: { id } });
      if (!deal) return null;
      if (!seeAll && deal.ownerId !== user.id) throw new Error('لا صلاحية');
      if (deal.stage === value) return null;

      const closing = value === 'WON' || value === 'LOST';
      await db.deal.update({
        where: { id },
        data: {
          stage: value,
          probability: STAGE_DEFAULT_PROBABILITY[value as DealStage] ?? deal.probability,
          closedAt: closing ? new Date() : null,
        },
      });

      await logActivity({
        type: 'STAGE_CHANGED',
        title: 'تغيّرت مرحلة الصفقة',
        detail: `${DEAL_STAGES[deal.stage as DealStage] ?? deal.stage} ← ${
          DEAL_STAGES[value as DealStage] ?? value
        }`,
        userId: user.id,
        link: { dealId: id },
      });
      return null;
    }

    // ── حالة العميل المحتمل ───────────────────────────────────
    case 'lead.status': {
      const lead = await db.lead.findUnique({ where: { id } });
      if (!lead) return null;
      if (!seeAll && lead.ownerId !== user.id) throw new Error('لا صلاحية');

      await db.lead.update({ where: { id }, data: { status: value } });
      await logActivity({
        type: 'STATUS_CHANGED',
        title: 'تغيّرت حالة العميل المحتمل',
        detail: `${lead.status} ← ${value}`,
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

      // إرسال العرض أو قبوله ينقل الصفقة تلقائيًا إلى المرحلة المناسبة
      if (quote.dealId) {
        const deal = await db.deal.findUnique({ where: { id: quote.dealId } });
        const open = deal && deal.stage !== 'WON' && deal.stage !== 'LOST';
        if (open && value === 'ACCEPTED') {
          await db.deal.update({
            where: { id: quote.dealId },
            data: { stage: 'NEGOTIATION', probability: 75 },
          });
        } else if (open && value === 'SENT' && deal.stage === 'NEW') {
          await db.deal.update({
            where: { id: quote.dealId },
            data: { stage: 'QUOTED', probability: 50 },
          });
        }
      }

      await logActivity({
        type: 'QUOTE_SENT',
        title: `تغيّرت حالة عرض السعر ${quote.number}`,
        detail: `${quote.status} ← ${value}`,
        userId: user.id,
        link: { dealId: quote.dealId, companyId: quote.companyId },
      });
      return null;
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

    case 'deal.delete': {
      const rec = await db.deal.findUnique({ where: { id } });
      if (!rec) return '/deals';
      if (!seeAll && rec.ownerId !== user.id) throw new Error('لا صلاحية');
      await db.deal.delete({ where: { id } });
      return '/deals';
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

    // ── حذف مستخدم (لمدير النظام فقط) ────────────────────────
    case 'user.delete': {
      if (user.role !== 'ADMIN') throw new Error('لا صلاحية');
      if (user.id === id) throw new Error('لا يمكنك حذف حسابك الخاص');

      const target = await db.user.findUnique({ where: { id } });
      if (!target) return '/settings/users';
      if (target.role === 'ADMIN') {
        const others = await db.user.count({
          where: { role: 'ADMIN', active: true, id: { not: id } },
        });
        if (others === 0) throw new Error('يجب أن يبقى مدير نظام نشط واحد على الأقل');
      }
      await db.user.delete({ where: { id } });
      return '/settings/users';
    }

    default:
      throw new Error(`عملية غير معروفة: ${op}`);
  }
}
