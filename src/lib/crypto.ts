import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * تعمية أسرار الخدمات (كلمات مرور صناديق البريد).
 *
 * كلمة مرور صندوق البريد ليست كلمة مرور مستخدم: المستخدم تُجزَّأ كلمته بلا
 * رجعة، أما هذه فيجب أن يستردّها الخادم ليتصل بالصندوق. فالتعمية هنا هي
 * الصواب لا التجزئة، والمفتاح خارج قاعدة البيانات عمدًا: تسريب نسخة من
 * القاعدة وحده لا يسلّم بريد المكتب.
 */

const ALGORITHM = 'aes-256-gcm';
const SALT = 'fasttrans-secret-v1';

function key(): Buffer {
  // نشتقّ من `AUTH_SECRET` نفسه إن لم يُفرد مفتاح، فلا يتعطّل النشر بمتغيّر
  // ناقص؛ ومن أراد فصل المفتاحين ضبط `SECRET_KEY`.
  const secret = process.env.SECRET_KEY || process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('يلزم SECRET_KEY (أو AUTH_SECRET) بطول ١٦ حرفًا فأكثر لتعمية أسرار البريد');
  }
  return scryptSync(secret, SALT, 32);
}

/** هل التعمية مهيّأة؟ الشاشات تسأل قبل أن تعرض نموذج الصندوق */
export function encryptionReady(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/** يعيد `iv:tag:ciphertext` بترميز base64 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, dataB64] = (stored ?? '').split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('السرّ المخزَّن تالف أو بصيغة قديمة');
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** نجوم بعدد ثابت — لا نكشف حتى طول كلمة المرور */
export const SECRET_MASK = '••••••••';
