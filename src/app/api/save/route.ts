import { NextResponse, type NextRequest } from 'next/server';
import { redirectTo, redirectWithError } from '@/lib/http';
import { getCurrentUser } from '@/lib/auth';
import {
  MutationError,
  saveLead,
  convertLead,
  saveClient,
  saveCompany,
  saveContact,
  saveProject,
  moveProject,
  assignProject,
  saveStep,
  deliverProject,
  saveStaffCost,
  decideApproval,
  savePriceItem,
  saveFreelancer,
  saveFreelancerRate,
  payFreelancer,
  importFreelancers,
  saveMailbox,
  checkMailbox,
  syncEmail,
  analyzeEmail,
  suggestReply,
  sendEmailReply,
  composeEmail,
  linkEmail,
  startThread,
  askAssistant,
  deleteThread,
  saveBranch,
  seedBranches,
  saveCostCenterKinds,
  saveAccountCashFlags,
  saveAllocationRate,
  deriveAllocationRate,
  closeBranchPeriod,
  saveDepartment,
  saveEmployee,
  saveSalaryComponent,
  endSalaryComponent,
  runPayroll,
  decidePayroll,
  readClientSite,
  designQuoteDocument,
  clearQuoteDesign,
  saveProposal,
  saveProposalTier,
  decideProposal,
  reviseProposal,
  markNotificationsRead,
  runNotifications,
  importLegacySheet,
  importAccountingLedger,
  resolveMigrationRow,
  saveAccount,
  saveCostCenter,
  saveJournalEntry,
  decideJournalEntry,
  closeFiscalPeriod,
  saveBudget,
  saveBudgetLines,
  saveFixedAsset,
  generateDraftEntries,
  fillBudgetFromHistory,
  saveAccountBehaviour,
  saveBudgetPlanSettings,
  saveCommissionScheme,
  saveCommissionTier,
  saveCommissionAssignment,
  closeCommissionPeriod,
  saveTask,
  saveQuote,
  saveUser,
  saveRole,
  saveListItem,
  saveSettings,
  saveTargets,
  changeOwnPassword,
} from '@/lib/mutations';

/**
 * نقطة حفظ موحّدة لكل نماذج النظام.
 *
 * النموذج يرسل الحقول عاديًا مع:
 *   entity : نوع السجل (lead | company | contact | project | task | quote |
 *            client | user | role | listItem | settings | password)
 *   id     : فارغ عند الإنشاء، ويحمل المعرّف عند التعديل
 *   back   : الصفحة التي نعود إليها عند وجود خطأ
 *
 * وعند النجاح ننتقل إلى صفحة السجل المحفوظ.
 *
 * **وحقل `json=1` يغيّر شكل الردّ لا مساره**: نفس البوابة ونفس القواعد
 * ونفس التدقيق، لكن الردّ `{ ok, destination }` بدل تحويل ٣٠٣. يستعمله
 * الزرّ الذي يريد نتيجةً في مكانه بلا إعادة بناء الصفحة كلها. والنموذج
 * العادي لا يرسل الحقل، فيبقى عمله كما هو حتى لو تعطّل الجافاسكربت.
 */
export async function POST(request: NextRequest) {
  const fd = await request.formData();
  const wantsJson = String(fd.get('json') ?? '') === '1';

  const user = await getCurrentUser();
  if (!user) {
    // الجلسة انتهت: نقول ذلك صراحةً بدل أن نُعيد صفحة الدخول كأنها نتيجة
    return wantsJson
      ? NextResponse.json({ ok: false, error: 'انتهت الجلسة — سجّل الدخول من جديد' }, { status: 401 })
      : redirectTo('/login');
  }

  const entity = String(fd.get('entity') ?? '');
  const rawId = String(fd.get('id') ?? '').trim();
  const id = rawId === '' ? undefined : rawId;

  try {
    let destination: string;

    switch (entity) {
      case 'lead':
        destination = await saveLead(fd, user, id);
        break;
      case 'lead.convert':
        if (!id) throw new MutationError('معرّف العميل المحتمل مفقود');
        destination = await convertLead(fd, user, id);
        break;
      case 'client':
        destination = await saveClient(fd, user, id);
        break;
      case 'company':
        destination = await saveCompany(fd, user, id);
        break;
      case 'contact':
        destination = await saveContact(fd, user, id);
        break;
      case 'project':
        destination = await saveProject(fd, user, id);
        break;
      case 'project.move':
        if (!id) throw new MutationError('معرّف المشروع مفقود');
        destination = await moveProject(fd, user, id);
        break;
      case 'project.assign':
        if (!id) throw new MutationError('معرّف المشروع مفقود');
        destination = await assignProject(fd, user, id);
        break;
      case 'project.deliver':
        if (!id) throw new MutationError('معرّف المشروع مفقود');
        destination = await deliverProject(fd, user, id);
        break;
      case 'step':
        destination = await saveStep(fd, user, id);
        break;
      case 'staffCost':
        destination = await saveStaffCost(fd, user);
        break;
      case 'project.approval':
        if (!id) throw new MutationError('معرّف المشروع مفقود');
        destination = await decideApproval(fd, user, id);
        break;
      case 'priceItem':
        destination = await savePriceItem(fd, user, id);
        break;
      case 'freelancer':
        destination = await saveFreelancer(fd, user, id);
        break;
      case 'freelancerRate':
        destination = await saveFreelancerRate(fd, user, id);
        break;
      case 'freelancerPayment':
        destination = await payFreelancer(fd, user, id);
        break;
      case 'freelancer.import':
        destination = await importFreelancers(fd, user);
        break;
      // ── البريد والمساعد ───────────────────────────────────
      case 'mailbox':
        destination = await saveMailbox(fd, user, id);
        break;
      case 'mailbox.check':
        destination = await checkMailbox(fd, user, id);
        break;
      case 'email.sync':
        destination = await syncEmail(fd, user, id);
        break;
      case 'email.analyze':
        destination = await analyzeEmail(fd, user, id);
        break;
      case 'email.suggest':
        destination = await suggestReply(fd, user, id);
        break;
      case 'email.reply':
        destination = await sendEmailReply(fd, user, id);
        break;
      case 'email.compose':
        destination = await composeEmail(fd, user);
        break;
      case 'email.link':
        destination = await linkEmail(fd, user, id);
        break;
      case 'assistant.start':
        destination = await startThread(fd, user);
        break;
      case 'assistant.ask':
        destination = await askAssistant(fd, user, id);
        break;
      case 'assistant.delete':
        destination = await deleteThread(fd, user, id);
        break;
      // ── محاسبة الفروع ────────────────────────────────────
      case 'branch':
        destination = await saveBranch(fd, user, id);
        break;
      case 'branch.seed':
        destination = await seedBranches(fd, user);
        break;
      case 'costCenter.kinds':
        destination = await saveCostCenterKinds(fd, user);
        break;
      case 'account.cash':
        destination = await saveAccountCashFlags(fd, user);
        break;
      case 'allocation.rate':
        destination = await saveAllocationRate(fd, user);
        break;
      case 'allocation.derive':
        destination = await deriveAllocationRate(fd, user);
        break;
      case 'branch.close':
        destination = await closeBranchPeriod(fd, user);
        break;

      // ── الموارد البشرية ──────────────────────────────────
      case 'department':
        destination = await saveDepartment(fd, user, id);
        break;
      case 'employee':
        destination = await saveEmployee(fd, user, id);
        break;
      case 'salaryComponent':
        destination = await saveSalaryComponent(fd, user, id);
        break;
      case 'salaryComponent.end':
        destination = await endSalaryComponent(fd, user, id);
        break;
      case 'payroll.run':
        destination = await runPayroll(fd, user);
        break;
      case 'payroll.decide':
        destination = await decidePayroll(fd, user, id);
        break;

      case 'import.accounting':
        destination = await importAccountingLedger(fd, user);
        break;

      case 'quote.readSite':
        destination = await readClientSite(fd, user, id);
        break;
      case 'quote.design':
        destination = await designQuoteDocument(fd, user, id);
        break;
      case 'quote.clearDesign':
        destination = await clearQuoteDesign(fd, user, id);
        break;

      case 'proposal':
        destination = await saveProposal(fd, user, id);
        break;
      case 'proposalTier':
        destination = await saveProposalTier(fd, user, id);
        break;
      case 'proposal.decide':
        destination = await decideProposal(fd, user, id);
        break;
      case 'proposal.revise':
        destination = await reviseProposal(fd, user, id);
        break;
      case 'notifications.read':
        destination = await markNotificationsRead(fd, user, id);
        break;
      case 'notifications.run':
        destination = await runNotifications(fd, user);
        break;
      case 'legacy.import':
        destination = await importLegacySheet(fd, user);
        break;
      case 'migrationReview':
        destination = await resolveMigrationRow(fd, user, id);
        break;
      case 'account':
        destination = await saveAccount(fd, user, id);
        break;
      case 'costCenter':
        destination = await saveCostCenter(fd, user, id);
        break;
      case 'journalEntry':
        destination = await saveJournalEntry(fd, user, id);
        break;
      case 'journalEntry.decide':
        destination = await decideJournalEntry(fd, user, id);
        break;
      case 'fiscalPeriod':
        destination = await closeFiscalPeriod(fd, user);
        break;
      case 'budget':
        destination = await saveBudget(fd, user, id);
        break;
      case 'budgetLines':
        destination = await saveBudgetLines(fd, user);
        break;
      case 'fixedAsset':
        destination = await saveFixedAsset(fd, user, id);
        break;
      case 'budget.fill':
        destination = await fillBudgetFromHistory(fd, user);
        break;
      case 'budget.behaviour':
        destination = await saveAccountBehaviour(fd, user);
        break;
      case 'budget.plan':
        destination = await saveBudgetPlanSettings(fd, user);
        break;
      case 'journal.generate':
        destination = await generateDraftEntries(fd, user);
        break;
      case 'commissionScheme':
        destination = await saveCommissionScheme(fd, user, id);
        break;
      case 'commissionTier':
        destination = await saveCommissionTier(fd, user, id);
        break;
      case 'commissionAssignment':
        destination = await saveCommissionAssignment(fd, user);
        break;
      case 'commissionPeriod.close':
        destination = await closeCommissionPeriod(fd, user);
        break;
      case 'task':
        destination = await saveTask(fd, user, id);
        break;
      case 'quote':
        destination = await saveQuote(fd, user, id);
        break;
      case 'user':
        destination = await saveUser(fd, user, id);
        break;
      case 'role':
        destination = await saveRole(fd, user, id);
        break;
      case 'listItem':
        destination = await saveListItem(fd, user, id);
        break;
      case 'settings':
        destination = await saveSettings(fd, user);
        break;
      case 'targets':
        destination = await saveTargets(fd, user);
        break;
      case 'password':
        destination = await changeOwnPassword(fd, user);
        break;
      default:
        throw new MutationError(`نوع سجل غير معروف: ${entity}`);
    }

    return wantsJson ? NextResponse.json({ ok: true, destination }) : redirectTo(destination);
  } catch (error) {
    const message =
      error instanceof MutationError ? error.message : 'تعذّر الحفظ. حاول مرة أخرى.';
    if (!(error instanceof MutationError)) console.error('فشل الحفظ:', error);

    if (wantsJson) return NextResponse.json({ ok: false, error: message }, { status: 400 });

    // نعود إلى النموذج ونعرض سبب المشكلة
    return redirectWithError(String(fd.get('back') ?? ''), message);
  }
}
