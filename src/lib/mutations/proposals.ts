import 'server-only';
import { MutationError } from './base';
import { db } from '@/lib/db';
import { can, type SessionUser } from '@/lib/auth';
import { str, num, date } from '@/lib/utils';
import { auditEvent, auditDiff } from '@/lib/audit';
import { nextProposalCode } from '@/lib/sequence';
import { DEFAULT_TIERS } from '@/lib/proposals';

/**
 * عروض الأسعار الاحترافية.
 *
 * العرض **مستند يُرسَل** لا سطر في جدول، ولذلك يحمل مراجعةً ومدة صلاحية
 * وموقِّعًا. والمنقَّح يأخذ رقم مراجعة جديدًا ولا يُستبدل الأصل: العميل قد
 * يكون قرأ الأول، فمحوُه يمحو ما بنى عليه قراره.
 */
export async function saveProposal(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canViewSellPrice')) {
    throw new MutationError('إعداد العروض لمن يرى سعر البيع');
  }

  const title = str(fd, 'title');
  const clientName = str(fd, 'clientName');
  if (!title) throw new MutationError('عنوان العرض مطلوب');
  if (!clientName) throw new MutationError('اسم الجهة المستقبِلة مطلوب');

  const vatPct = num(fd, 'vatPct');
  const data = {
    title,
    clientName,
    attention: str(fd, 'attention'),
    attentionRole: str(fd, 'attentionRole'),
    sourceLang: str(fd, 'sourceLang'),
    targetLang: str(fd, 'targetLang'),
    currency: str(fd, 'currency') ?? 'SAR',
    // النسبة تُدخَل مئويةً وتُخزَّن كسرًا — فلا يكتب أحد ١٥ ويحصل على ١٥٠٠٪
    vatRate: vatPct === null ? 0.15 : vatPct / 100,
    validityDays: Math.round(num(fd, 'validityDays') ?? 30),
    paymentDays: Math.round(num(fd, 'paymentDays') ?? 30),
    contractingEntity:
      str(fd, 'contractingEntity') ?? 'فاست ترانس — الرياض، المملكة العربية السعودية',
    sampleVolumes: str(fd, 'sampleVolumes') ?? '100000,250000,500000,1000000',
    intro: str(fd, 'intro'),
    positioning: str(fd, 'positioning'),
    nextSteps: str(fd, 'nextSteps'),
    notes: str(fd, 'notes'),
    signerName: str(fd, 'signerName'),
    signerTitle: str(fd, 'signerTitle'),
    clientId: str(fd, 'clientId'),
    companyId: str(fd, 'companyId'),
    leadId: str(fd, 'leadId'),
  };

  if (!id) {
    const created = await db.proposal.create({
      data: {
        ...data,
        code: await nextProposalCode(),
        ownerId: user.id,
        // الشرائح الافتراضية تُنسخ **نسخًا** لا تُشار إليها: تعديل عرض
        // أُرسل الشهر الماضي لا يجوز أن يغيّر عرضًا أُرسل قبله
        tiers: {
          create: DEFAULT_TIERS.map((tier, i) => ({ ...tier, sortOrder: i })),
        },
      },
    });
    await auditEvent(user.id, 'create', 'Proposal', created.id, title);
    return `/proposals/${created.id}`;
  }

  const existing = await db.proposal.findUnique({ where: { id } });
  if (!existing) throw new MutationError('العرض غير موجود');
  if (existing.status !== 'draft' && existing.status !== 'sent') {
    throw new MutationError('العرض محسوم — أنشئ مراجعة جديدة بدل تعديله');
  }

  await db.proposal.update({ where: { id }, data });
  await auditDiff(user.id, 'Proposal', id, existing, data);
  return `/proposals/${id}`;
}

/** شريحة في جدول العرض — تُضاف وتُعدَّل بحرية، فلا رقم مثبَّت في الكود */
export async function saveProposalTier(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canViewSellPrice')) throw new MutationError('لا صلاحية');

  const proposalId = str(fd, 'proposalId');
  if (!proposalId) throw new MutationError('معرّف العرض مفقود');

  const ratePerPage = num(fd, 'ratePerPage');
  const fromWords = num(fd, 'fromWords');
  if (ratePerPage === null || ratePerPage <= 0) throw new MutationError('سعر الصفحة مطلوب');
  if (fromWords === null || fromWords < 0) throw new MutationError('بداية الشريحة مطلوبة');

  const toWords = num(fd, 'toWords');
  if (toWords !== null && toWords <= fromWords) {
    throw new MutationError('نهاية الشريحة يجب أن تتجاوز بدايتها');
  }

  const data = {
    proposalId,
    label: str(fd, 'label') ?? 'شريحة',
    fromWords: Math.round(fromWords),
    toWords: toWords === null ? null : Math.round(toWords),
    discountPct: num(fd, 'discountPct') ?? 0,
    ratePerPage,
    sortOrder: Math.round(fromWords),
  };

  if (!id) await db.proposalTierRow.create({ data });
  else await db.proposalTierRow.update({ where: { id }, data });

  await auditEvent(user.id, id ? 'update' : 'create', 'ProposalTierRow', id ?? proposalId, data.label);
  return `/proposals/${proposalId}`;
}

/**
 * حال العرض: أُرسل · قُبل · رُفض.
 *
 * والقبول **لا يُنشئ مشروعًا تلقائيًا**: العرض إطار سعري لشهور، والمشروع
 * يُفتح بدفعة فعلية. الخلط بينهما يملأ لوحة التشغيل بمشاريع لم تصل ملفاتها.
 */
export async function decideProposal(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canViewSellPrice')) throw new MutationError('لا صلاحية');
  if (!id) throw new MutationError('معرّف العرض مفقود');

  const action = str(fd, 'action') ?? 'send';
  const proposal = await db.proposal.findUnique({ where: { id } });
  if (!proposal) throw new MutationError('العرض غير موجود');

  const note = str(fd, 'note');
  if ((action === 'decline') && !note) {
    throw new MutationError('سبب الرفض مطلوب — بلا سبب لا نتعلّم شيئًا');
  }

  const patch =
    action === 'send'
      ? { status: 'sent', sentAt: proposal.sentAt ?? new Date() }
      : action === 'accept'
        ? { status: 'accepted', decidedAt: new Date(), decisionNote: note }
        : { status: 'declined', decidedAt: new Date(), decisionNote: note };

  await db.proposal.update({ where: { id }, data: patch });
  await auditEvent(user.id, 'update', 'Proposal', id, `حال العرض: ${patch.status}`);
  return `/proposals/${id}`;
}

/**
 * مراجعة جديدة من عرض قائم.
 *
 * تُنسخ بكل بنودها وشرائحها برقم مراجعة تالٍ، **ويبقى الأصل كما أُرسل**.
 */
export async function reviseProposal(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canViewSellPrice')) throw new MutationError('لا صلاحية');
  if (!id) throw new MutationError('معرّف العرض مفقود');

  const source = await db.proposal.findUnique({ where: { id }, include: { tiers: true } });
  if (!source) throw new MutationError('العرض غير موجود');

  const {
    id: _drop, code: _code, revision, createdAt: _c, updatedAt: _u,
    sentAt: _s, decidedAt: _d, decisionNote: _n, status: _st, tiers, ...rest
  } = source;

  const created = await db.proposal.create({
    data: {
      ...rest,
      code: await nextProposalCode(),
      revision: revision + 1,
      status: 'draft',
      ownerId: user.id,
      tiers: {
        create: tiers.map((t) => ({
          label: t.label,
          fromWords: t.fromWords,
          toWords: t.toWords,
          discountPct: t.discountPct,
          ratePerPage: t.ratePerPage,
          sortOrder: t.sortOrder,
        })),
      },
    },
  });

  await auditEvent(user.id, 'create', 'Proposal', created.id, `مراجعة ${revision + 1} من ${source.code}`);
  return `/proposals/${created.id}`;
}

export { date };
