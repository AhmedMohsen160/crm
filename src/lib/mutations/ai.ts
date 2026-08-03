import 'server-only';
import { MutationError } from './base';
import { db } from '@/lib/db';
import { can, type SessionUser } from '@/lib/auth';
import { str } from '@/lib/utils';
import { ask } from '@/lib/assistant';

/**
 * المساعد الذكي.
 *
 * المحادثة ملك سائلها وحده: أسئلة الموظف عن أرقامه ليست سجلًّا تشغيليًّا
 * يُشارَك، ولا يقرؤها غيره ولو ملك رؤية كل السجلات.
 */

export async function startThread(fd: FormData, user: SessionUser) {
  if (!can(user, 'canUseAi')) throw new MutationError('المساعد الذكي غير متاح لدورك');

  const thread = await db.aiThread.create({
    data: { userId: user.id, title: str(fd, 'title') ?? 'محادثة جديدة' },
  });

  // سؤال أُرسل مع الإنشاء يُجاب فورًا — خطوة أقل على الموظف
  const question = str(fd, 'question');
  if (question) {
    const result = await ask({ user, threadId: thread.id, question });
    if (!result.ok) return `/assistant/${thread.id}?error=${encodeURIComponent(result.error)}`;
  }
  return `/assistant/${thread.id}`;
}

export async function askAssistant(fd: FormData, user: SessionUser, id?: string) {
  if (!can(user, 'canUseAi')) throw new MutationError('المساعد الذكي غير متاح لدورك');
  if (!id) throw new MutationError('معرّف المحادثة مفقود');

  const question = str(fd, 'question');
  if (!question) throw new MutationError('اكتب سؤالك');

  const result = await ask({ user, threadId: id, question });
  // السؤال والجواب محفوظان في الخيط حتى عند الفشل، فنعود إليه لا لصفحة خطأ
  if (!result.ok) return `/assistant/${id}?error=${encodeURIComponent(result.error)}`;
  return `/assistant/${id}`;
}

/** حذف محادثة — نصٌّ حواريّ لا سجلّ تشغيلي، فلا يسري عليه §٣ بند ٥ */
export async function deleteThread(_fd: FormData, user: SessionUser, id?: string) {
  if (!id) throw new MutationError('معرّف المحادثة مفقود');
  const thread = await db.aiThread.findUnique({ where: { id } });
  if (!thread) return '/assistant';
  if (thread.userId !== user.id) throw new MutationError('هذه المحادثة ليست لك');

  await db.aiThread.delete({ where: { id } });
  return '/assistant';
}
