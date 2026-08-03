/**
 * هوية فاست ترانس — من ملفات الشعار الرسمية.
 *
 * العلامة كتلة رأسية محفور فيها الحرفان بالفراغ الأبيض، ومعها مربع ليموني
 * في الأعلى. والألوان الخمسة من الملفات نفسها لا مختارة بالذوق:
 *
 *   الكحلي   `#242E5B`  — النص والنسخة الداكنة
 *   الأزرق   `#2B57A6`  — الكتلة في الشعار الأساسي
 *   السماوي  `#5BB5E8`  — النسخة الفاتحة
 *   الليموني `#C4D82E`  — المربع والتأكيد
 *
 * مرسومة SVG لا صورة: تبقى حادّة على كل شاشة، وتأخذ لونها من سياقها فتعمل
 * على الفاتح والداكن معًا.
 */

export const BRAND = {
  navy: '#242E5B',
  blue: '#2B57A6',
  sky: '#5BB5E8',
  lime: '#C4D82E',
} as const;

export type BrandTone = 'primary' | 'navy' | 'sky' | 'lime' | 'mono';

const TONES: Record<BrandTone, { block: string; carve: string; accent: string }> = {
  // الأساسي: كتلة زرقاء ومربع ليموني — كما في ملف الشعار الأول
  primary: { block: BRAND.blue, carve: '#FFFFFF', accent: BRAND.lime },
  navy: { block: BRAND.navy, carve: '#FFFFFF', accent: BRAND.navy },
  sky: { block: BRAND.sky, carve: '#FFFFFF', accent: BRAND.sky },
  lime: { block: BRAND.lime, carve: '#FFFFFF', accent: BRAND.lime },
  // على خلفية داكنة: الكتلة بيضاء والحفر شفّاف
  mono: { block: 'currentColor', carve: '#FFFFFF', accent: 'currentColor' },
};

/**
 * العلامة وحدها.
 *
 * النسبة ١٢٠×٢٠٦ مأخوذة من ملف الشعار (٤٢٥×٧٣٠ بكسل) فلا تُشوَّه الكتلة.
 */
export function FastTransMark({
  className = 'h-8 w-8',
  tone = 'primary',
}: {
  className?: string;
  tone?: BrandTone;
}) {
  const c = TONES[tone];
  return (
    <svg viewBox="0 0 120 206" className={className} aria-hidden>
      {/* الكتلة */}
      <rect width="120" height="206" fill={c.block} />

      {/* المربع الليموني — أعلى اليمين */}
      {tone === 'primary' && <rect x="86" y="46" width="34" height="34" fill={c.accent} />}

      {/* الحفر الأبيض: ذراع الحرف العلوية ثم بدنُه ثم الوعاء السفلي */}
      <g fill={c.carve}>
        {/* الذراع العلوية */}
        <rect x="32" y="32" width="54" height="12" />
        {/* الفاصل الرأسي الذي يفتح المربع الليموني */}
        <rect x="74" y="44" width="12" height="36" />
        {/* الذراع الوسطى */}
        <rect x="32" y="80" width="54" height="12" />
        {/* بدن الحرف نازلًا إلى الوعاء */}
        <rect x="32" y="92" width="12" height="80" />
        {/* قاع الوعاء */}
        <rect x="32" y="160" width="54" height="12" />
        {/* نقطة الوعاء — تفصل الحرف الثاني */}
        <rect x="74" y="112" width="12" height="12" />
      </g>
    </svg>
  );
}

/** الشعار كاملًا: العلامة والاسم — في الترويسة وشاشة الدخول */
export function FastTransLogo({
  compact = false,
  invert = false,
  tone,
}: {
  compact?: boolean;
  invert?: boolean;
  tone?: BrandTone;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <FastTransMark
        className={compact ? 'h-9 w-[22px]' : 'h-11 w-[26px]'}
        tone={tone ?? (invert ? 'sky' : 'primary')}
      />
      {!compact && (
        <span className="leading-tight">
          <span
            className={`block text-sm font-extrabold tracking-tight ${
              invert ? 'text-white' : 'text-brand-600'
            }`}
          >
            Fast Trans
          </span>
          <span
            className={`block text-[9px] font-medium tracking-[0.14em] ${
              invert ? 'text-brand-200' : 'text-slate-400'
            }`}
          >
            CERTIFIED TRANSLATION SERVICES
          </span>
        </span>
      )}
    </span>
  );
}
