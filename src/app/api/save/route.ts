import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  MutationError,
  saveLead,
  convertLead,
  saveCompany,
  saveContact,
  saveDeal,
  saveTask,
  saveQuote,
  saveUser,
  changeOwnPassword,
} from '@/lib/mutations';

/**
 * نقطة حفظ موحّدة لكل نماذج النظام.
 *
 * النموذج يرسل الحقول عاديًا مع:
 *   entity : نوع السجل (lead | company | contact | deal | task | quote | user | password)
 *   id     : فارغ عند الإنشاء، ويحمل المعرّف عند التعديل
 *   back   : الصفحة التي نعود إليها عند وجود خطأ
 *
 * وعند النجاح ننتقل إلى صفحة السجل المحفوظ.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url), 303);

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
      case 'company':
        destination = await saveCompany(fd, user, id);
        break;
      case 'contact':
        destination = await saveContact(fd, user, id);
        break;
      case 'deal':
        destination = await saveDeal(fd, user, id);
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
      case 'password':
        destination = await changeOwnPassword(fd, user);
        break;
      default:
        throw new MutationError(`نوع سجل غير معروف: ${entity}`);
    }

    return NextResponse.redirect(new URL(destination, request.url), 303);
  } catch (error) {
    const message =
      error instanceof MutationError ? error.message : 'تعذّر الحفظ. حاول مرة أخرى.';
    if (!(error instanceof MutationError)) console.error('فشل الحفظ:', error);

    // نعود إلى النموذج ونعرض سبب المشكلة
    const backRaw = String(fd.get('back') ?? '');
    const back = backRaw.startsWith('/') ? backRaw : '/';
    const url = new URL(back, request.url);
    url.searchParams.set('error', message);
    return NextResponse.redirect(url, 303);
  }
}
