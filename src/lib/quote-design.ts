/**
 * تصميم عرض السعر بالذكاء الاصطناعي — القواعد الخالصة.
 *
 * هنا بناء الأمر، وقراءة موقع العميل، و**تعقيم المستند المولَّد**. والتعقيم
 * هو أخطر ما في الملف: نحن نعرض HTML كتبه نموذج داخل شاشة موظف مسجَّل
 * الدخول. سطرُ سكربت واحد يمرّ يعني تنفيذ كود في جلسة الموظف بصلاحياته.
 * فالقاعدة هنا **قائمة سماح لا قائمة منع**: ما ليس مسموحًا صراحةً يُحذف.
 */

import { PRODUCTION_STAGES, LIFECYCLE_STEPS, SCOPE_INCLUDED, SCOPE_EXCLUDED } from './proposals';

// ═══════════════════════════════════════════════════════════════
//  قراءة موقع العميل
// ═══════════════════════════════════════════════════════════════

export type SiteBrief = {
  url: string;
  title: string | null;
  description: string | null;
  /** ألوان الهوية كما ظهرت في أنماط الصفحة — مرتّبة بتكرارها */
  colors: string[];
  /** نصّ الصفحة مقلَّمًا — ما يُرسل للنموذج */
  text: string;
};

/** يقبل نطاقًا بلا بروتوكول ويعيد رابطًا صالحًا، أو `null` */
export function normalizeUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    // http وhttps وحدهما: `file:` و`javascript:` لا يُجلبان من الخادم
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** ألوان `#rrggbb` من نصّ الصفحة، مرتّبة بالأكثر تكرارًا */
export function extractColors(html: string, max = 6): string[] {
  const counts = new Map<string, number>();
  for (const match of (html ?? '').matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    let hex = match[1].toLowerCase();
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    // الأبيض والأسود الصرفان ليسا هويةً — يظهران في كل موقع
    if (hex === 'ffffff' || hex === '000000') continue;
    counts.set(`#${hex}`, (counts.get(`#${hex}`) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([hex]) => hex);
}

export function extractTitle(html: string): string | null {
  const t = (html ?? '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return t ? decodeEntities(t[1]).trim().slice(0, 200) || null : null;
}

export function extractDescription(html: string): string | null {
  const m =
    (html ?? '').match(
      /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i
    ) ??
    (html ?? '').match(
      /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["']/i
    );
  return m ? decodeEntities(m[1]).trim().slice(0, 500) || null : null;
}

/** نصّ الصفحة بلا وسوم ولا سكربتات — للقراءة لا للعرض */
export function pageText(html: string, max = 4_000): string {
  const text = (html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(text).replace(/\s+/g, ' ').trim().slice(0, max);
}

function decodeEntities(value: string): string {
  return (value ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

/** يحوّل صفحة كاملة إلى موجز يُقرأ في الشاشة ويُرسل للنموذج */
export function briefFromHtml(url: string, html: string): SiteBrief {
  return {
    url,
    title: extractTitle(html),
    description: extractDescription(html),
    colors: extractColors(html),
    text: pageText(html),
  };
}

/** الموجز نصًّا مقروءًا — يُخزَّن ويُعرض للموظف قبل التوليد */
export function briefToText(brief: SiteBrief): string {
  return [
    `الموقع: ${brief.url}`,
    brief.title && `عنوان الصفحة: ${brief.title}`,
    brief.description && `الوصف: ${brief.description}`,
    brief.colors.length && `ألوان الهوية: ${brief.colors.join(' · ')}`,
    brief.text && `\nمن نصّ الموقع:\n${brief.text.slice(0, 1_200)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ═══════════════════════════════════════════════════════════════
//  بناء الأمر
// ═══════════════════════════════════════════════════════════════

/** هوية فاست ترانس — مستخرجة من عروض الشركة لا مقدَّرة بالعين */
export const FAST_TRANS_BRAND = {
  navy: '#242E5B',
  lime: '#B9D716',
  name: 'فاست ترانس',
  nameEn: 'FAST TRANS',
} as const;

export type QuoteLineForDesign = {
  description: string;
  serviceType: string | null;
  sourceLang: string | null;
  targetLang: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type DesignInput = {
  number: string;
  title: string;
  currency: string;
  clientName: string | null;
  contactName: string | null;
  validUntil: string | null;
  items: QuoteLineForDesign[];
  subtotal: number;
  discount: number;
  discountLabel: string | null;
  taxRate: number;
  taxAmount: number;
  total: number;
  terms: string | null;
  notes: string | null;
  ownerName: string;
  ownerEmail: string | null;
  brief: string | null;
  instruction: string | null;
};

/**
 * أمثلة توجيه جاهزة.
 *
 * الموظف لا يعرف ما يكتبه للنموذج، وصفحةٌ فارغة تُنتج عرضًا عامًّا. هذه
 * نقاط بدء يُعدّل عليها لا قوالب تُرسل كما هي.
 */
export const PROMPT_PRESETS: { label: string; hint: string; prompt: string }[] = [
  {
    label: 'عميل مؤسسي أول مرة',
    hint: 'يركّز على من نحن وكيف نعمل',
    prompt:
      'العميل يتعامل معنا لأول مرة. ابدأ بفقرة تعريفية قصيرة بفاست ترانس، ' +
      'ثم اشرح آلية التشغيل بوضوح، وأبرز الاعتماد والسرّية. نبرة رسمية موثوقة.',
  },
  {
    label: 'مناقصة أو عطاء',
    hint: 'يركّز على الالتزام والمواعيد والجودة',
    prompt:
      'العرض مقدَّم ضمن مناقصة. أبرز الالتزام بالمواعيد، وضبط الجودة على مرحلتين، ' +
      'وسياسة تصحيح الأخطاء، والقدرة على الحجم الكبير. نبرة مهنية مباشرة بلا تسويق زائد.',
  },
  {
    label: 'عميل متكرر',
    hint: 'مختصر ومباشر بلا تعريف',
    prompt:
      'العميل يتعامل معنا منذ فترة. اختصر التعريف، وادخل مباشرةً على النطاق والسعر ' +
      'والمواعيد. أشر إلى استمرار نفس فريق العمل ونفس المسرد المعتمد.',
  },
  {
    label: 'مشروع تخصصي',
    hint: 'يركّز على الكفاءة في المجال',
    prompt:
      'المشروع في مجال تخصصي دقيق. أبرز خبرة المترجمين في هذا المجال تحديدًا، ' +
      'وبناء المسرد، والمراجعة على يد متخصص، ومصادر المصطلحات المعتمدة.',
  },
];

/** آلية التشغيل في فاست ترانس — تُحقن في كل عرض مصمَّم */
export function methodologyBlock(): string {
  return [
    'آلية التشغيل في فاست ترانس (اذكرها في العرض بأسلوبك):',
    ...PRODUCTION_STAGES.map((s, i) => `  ${i + 1}) ${s.title} — ${s.body}`),
    '',
    'دورة حياة الطلب:',
    ...LIFECYCLE_STEPS.map((s, i) => `  ${i + 1}) ${s}`),
    '',
    `ما يشمله السعر: ${SCOPE_INCLUDED.join(' · ')}`,
    `ما لا يشمله: ${SCOPE_EXCLUDED.join(' · ')}`,
  ].join('\n');
}

const HTML_RULES = [
  'أعِد **مستند HTML واحدًا كاملًا** بلا أي شرح قبله أو بعده وبلا سياج ```.',
  'ابدأ بـ<!DOCTYPE html> وضع lang="ar" و dir="rtl" على وسم html.',
  'ضع كل التنسيق في وسم <style> واحد داخل <head>. **لا ملفات خارجية ولا خطوط من الإنترنت**.',
  'لا تستعمل <script> ولا أي معالج أحداث (onclick وأمثاله) — سيُحذف كلّه.',
  'لا تستعمل صورًا خارجية. الشعار يُكتب نصًّا بحروف كبيرة.',
  'صمّم للطباعة على A4: أضف @page { size: A4; margin: 14mm } وتجنّب قطع الجداول بين الصفحات.',
  'اجعل الأرقام والمبالغ بخط واضح ومحاذاة يمين، وبالعملة المذكورة حرفيًا.',
  '**لا تغيّر رقمًا واحدًا** من الأرقام المعطاة، ولا تضف بندًا ولا سعرًا من عندك.',
  'استعمل ألوان هوية فاست ترانس أساسًا، ويجوز أن تستوحي لمسة من ألوان موقع العميل.',
];

export function designSystemPrompt(): string {
  return [
    'أنت مصمّم عروض أسعار في مكتب «فاست ترانس» للترجمة المعتمدة.',
    'تكتب مستندًا يُرسَل لعميل مؤسسي: محتواه عربي فصيح مختصر، وتصميمه نظيف احترافي.',
    '',
    `هوية فاست ترانس: الكحلي ${FAST_TRANS_BRAND.navy} أساسًا، والليموني ${FAST_TRANS_BRAND.lime} للتأكيد.`,
    '',
    ...HTML_RULES.map((r) => `- ${r}`),
    '',
    'ممنوع منعًا باتًّا: اختراع سعر أو مدة تسليم أو خصم أو التزام لم يُعطَ لك.',
    'إن نقصتك معلومة، اكتب مكانها [يُملأ من النظام] ولا تخمّن.',
  ].join('\n');
}

export function designUserPrompt(input: DesignInput): string {
  const money = (n: number) => `${n.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${input.currency}`;

  const lines = input.items
    .map(
      (it, i) =>
        `  ${i + 1}) ${it.description}` +
        (it.sourceLang || it.targetLang ? ` — ${it.sourceLang ?? '؟'} ← ${it.targetLang ?? '؟'}` : '') +
        ` | ${it.quantity} ${it.unit} × ${money(it.unitPrice)} = ${money(it.lineTotal)}`
    )
    .join('\n');

  return [
    `صمّم عرض السعر رقم ${input.number} بعنوان «${input.title}».`,
    '',
    '— بيانات العرض (انقلها كما هي) —',
    `الجهة المستقبِلة: ${input.clientName ?? '[يُملأ من النظام]'}`,
    input.contactName && `عناية: ${input.contactName}`,
    input.validUntil && `صالح حتى: ${input.validUntil}`,
    `مسؤول العرض: ${input.ownerName}${input.ownerEmail ? ` — ${input.ownerEmail}` : ''}`,
    '',
    'البنود:',
    lines,
    '',
    `المجموع الفرعي: ${money(input.subtotal)}`,
    input.discount > 0 && `الخصم${input.discountLabel ? ` (${input.discountLabel})` : ''}: ${money(input.discount)}`,
    input.taxRate > 0 && `الضريبة (${input.taxRate}%): ${money(input.taxAmount)}`,
    `الإجمالي: ${money(input.total)}`,
    '',
    input.terms && `الشروط والأحكام (أعِد صياغتها بأسلوب أفضل بلا تغيير معناها):\n${input.terms}`,
    input.notes && `ملاحظات للعميل:\n${input.notes}`,
    '',
    methodologyBlock(),
    '',
    input.brief && `— ما نعرفه عن العميل من موقعه —\n${input.brief}`,
    '',
    input.instruction && `— توجيه معدّ العرض —\n${input.instruction}`,
    '',
    'اكتب محتوى العرض بما يناسب طبيعة عمل هذا العميل تحديدًا، لا كلامًا عامًّا يصلح لأي أحد.',
  ]
    .filter(Boolean)
    .join('\n');
}

// ═══════════════════════════════════════════════════════════════
//  التعقيم — قائمة سماح لا قائمة منع
// ═══════════════════════════════════════════════════════════════

/** وسوم يُحذف محتواها كاملًا لا الوسم وحده */
const DROP_WITH_CONTENT = ['script', 'iframe', 'object', 'embed', 'noscript', 'template', 'form'];

/** وسوم تُحذف هي، ويبقى ما بينها */
const UNWRAP = ['link', 'base', 'meta'];

/**
 * ينزع من مستند مولَّد كل ما ينفّذ أو يجلب من الخارج.
 *
 * لا نبني شجرة DOM هنا لأن الملف خالص يعمل في الخادم والاختبارات معًا،
 * والتعقيم بالأنماط كافٍ **لأن قائمة السماح ضيّقة**: أي سمة تبدأ بـ`on`
 * تُحذف، وأي رابط ليس `#` أو `https:` أو `mailto:` يُحذف، وأي `<style>`
 * يُنقَّى من `@import` و`url()` الخارجية.
 */
export function sanitizeHtml(raw: string): string {
  let html = (raw ?? '').trim();
  if (!html) return '';

  // سياج ```html إن أفلت من التعليمات
  const fenced = html.match(/^```(?:html)?\s*([\s\S]*?)```$/i);
  if (fenced) html = fenced[1].trim();

  for (const tag of DROP_WITH_CONTENT) {
    html = html.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, 'gi'), '');
    html = html.replace(new RegExp(`<${tag}\\b[^>]*/?>`, 'gi'), '');
  }
  for (const tag of UNWRAP) {
    html = html.replace(new RegExp(`<${tag}\\b[^>]*/?>`, 'gi'), '');
  }

  // معالجات الأحداث بكل صيغ الاقتباس
  html = html.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '');
  html = html.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
  html = html.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');

  // روابط غير آمنة
  html = html.replace(/\s(href|src|action|formaction)\s*=\s*"([^"]*)"/gi, (m, attr, value) =>
    safeUrl(value) ? m : ''
  );
  html = html.replace(/\s(href|src|action|formaction)\s*=\s*'([^']*)'/gi, (m, attr, value) =>
    safeUrl(value) ? m : ''
  );

  // أنماط تجلب من الخارج
  html = html.replace(/@import[^;]*;/gi, '');
  html = html.replace(/url\(\s*(['"]?)(?!data:image\/)((?:https?:)?\/\/[^)'"]*)\1\s*\)/gi, 'none');
  html = html.replace(/expression\s*\(/gi, '(');

  return html.trim();
}

function safeUrl(value: string): boolean {
  const url = (value ?? '').trim().toLowerCase();
  if (!url) return false;
  if (url.startsWith('#')) return true;
  if (url.startsWith('mailto:') || url.startsWith('tel:')) return true;
  if (url.startsWith('https://')) return true;
  if (url.startsWith('data:image/')) return true;
  // `javascript:` و`data:text/html` و`//host` كلّها تُرفض
  return false;
}

/** هل بقي في المستند ما يُعرض أصلًا؟ */
export function looksLikeDocument(html: string): boolean {
  const value = (html ?? '').trim();
  if (value.length < 200) return false;
  return /<(html|body|div|section|table|h1)\b/i.test(value);
}

/** أطول مستند نقبل تخزينه — ما زاد فهو حشو لا تصميم */
export const MAX_DESIGN_CHARS = 120_000;
