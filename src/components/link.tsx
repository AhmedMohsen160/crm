import type { AnchorHTMLAttributes } from 'react';

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
};

/**
 * رابط تنقّل عادي.
 *
 * نستخدم وسم <a> المعتاد بدل مكوّن Link الخاص بـ Next، لأن التنقّل من جهة
 * المتصفح (الذي يقوم به Link) كان يتوقّف أحيانًا فلا تُفتح الصفحة عند الضغط
 * على الرابط — نحو مرة من كل ثلاث محاولات في قياسنا. التنقّل العادي يفتح
 * الصفحة في كل مرة.
 *
 * الكلفة مقبولة: صفحات النظام تُبنى على الخادم في أجزاء من الثانية، والفائدة
 * أن كل رابط يعمل بشكل مؤكد — بل ويعمل حتى لو تعطّل الجافاسكربت.
 */
export default function Link({ href, children, ...rest }: LinkProps) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
