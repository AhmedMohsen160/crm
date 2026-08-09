/**
 * التعديلات — **مقسَّمة بالمجال**.
 *
 * كانت وحدة واحدة بـ٢٧٠٠ سطر، فصار كل مجال ملفًّا مستقلًّا. والغرض عملي
 * لا تجميلي: **الميزة الجديدة تُضاف في ملف مجالها، ولا تُلامس بقية النظام**.
 * من يعدّل على الفريلانسرز لا يفتح ملفًا فيه المحاسبة والليدز والقيود.
 *
 * وهذا الملف واجهة واحدة تُصدِّر الجميع، فلا يحتاج أي مستدعٍ أن يعرف أين
 * يقع ما يستدعيه — ونقل دالة من ملف إلى آخر غدًا لا يكسر شيئًا.
 */

export { MutationError } from './base';

// المبيعات: الليدز · العملاء · الشركات · جهات الاتصال · عروض الأسعار
export {
  saveLead,
  convertLead,
  saveClient,
  saveCompany,
  saveContact,
  saveQuote,
} from './sales';

// المشاريع: الحفظ · الحالات · الإسناد · الخطوات · التسليم · اعتماد الخصم
export {
  saveProject,
  moveProject,
  assignProject,
  saveStep,
  deliverProject,
  decideApproval,
} from './projects';

export { savePriceItem } from './pricing';
export {
  saveProposal,
  saveProposalTier,
  decideProposal,
  reviseProposal,
} from './proposals';
export { saveTask } from './tasks';

// الإدارة: المستخدمون · الأدوار · القوائم · الأهداف · الإعدادات · الرواتب
export {
  saveUser,
  saveRole,
  saveListItem,
  saveSettings,
  markErrorsSeen,
  saveTargets,
  saveYearTargets,
  spreadYearTargets,
  saveStaffCost,
  changeOwnPassword,
} from './admin';

export {
  saveCommissionScheme,
  saveCommissionTier,
  saveCommissionAssignment,
  closeCommissionPeriod,
} from './commissions';

export {
  saveFreelancer,
  saveFreelancerRate,
  payFreelancer,
  importFreelancers,
} from './freelancers';

export {
  saveAccount,
  saveCostCenter,
  saveJournalEntry,
  decideJournalEntry,
  closeFiscalPeriod,
  saveBudget,
  saveBudgetLines,
  saveBudgetGrid,
  saveFixedAsset,
  generateDraftEntries,
  fillBudgetFromHistory,
  saveAccountBehaviour,
  saveBudgetPlanSettings,
} from './accounting';

// البريد: الصناديق · المزامنة · التحليل · الرد
export {
  saveMailbox,
  checkMailbox,
  syncEmail,
  analyzeEmail,
  suggestReply,
  sendEmailReply,
  composeEmail,
  linkEmail,
} from './email';

export { startThread, askAssistant, deleteThread } from './ai';

// عرض السعر المصمَّم بالذكاء — طريق ثانٍ إلى جانب القالب القياسي
export { readClientSite, designQuoteDocument, clearQuoteDesign } from './quotes';

// محاسبة الفروع: الفروع · تصنيف المراكز · المعدل المعياري · الإقفال
export {
  saveBranch,
  seedBranches,
  saveSpendKinds,
  suggestSpendKinds,
  saveAccountCashFlags,
  saveAllocationRate,
  deriveAllocationRate,
  closeBranchPeriod,
} from './branches';

// الموارد البشرية: الأقسام · هيكل الأجر · كشف الرواتب
export {
  saveDepartment,
  saveEmployee,
  saveSalaryComponent,
  endSalaryComponent,
  runPayroll,
  decidePayroll,
} from './hr';

export { importLegacySheet, importAccountingLedger, resolveMigrationRow } from './migration';

// ترحيل تاريخ المكتب: دفاتر المحاسب · شيت المبيعات · التسوية بينهما
export {
  importHistoryLedger,
  importHistorySales,
  runHistorySettlement,
  rollbackImportTag,
  wipeDemoRecords,
  RESET_PHRASE,
} from './history';
export { markNotificationsRead, runNotifications } from './alerts';
