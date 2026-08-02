import { type NextRequest } from 'next/server';
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
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return redirectTo('/login');

  const fd = await request.formData();
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

    return redirectTo(destination);
  } catch (error) {
    const message =
      error instanceof MutationError ? error.message : 'تعذّر الحفظ. حاول مرة أخرى.';
    if (!(error instanceof MutationError)) console.error('فشل الحفظ:', error);

    // نعود إلى النموذج ونعرض سبب المشكلة
    return redirectWithError(String(fd.get('back') ?? ''), message);
  }
}
