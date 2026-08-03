import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-app)', 'system-ui', 'sans-serif'],
      },
      colors: {
        // ── هوية فاست ترانس ──────────────────────────────────
        // الألوان الأربعة مقروءة من ملفات الشعار الرسمية لا مقدَّرة بالعين:
        // الكحلي #242E5B · الأزرق #2B57A6 · السماوي #5BB5E8 · الليموني #C4D82E
        brand: {
          50: '#f2f4f9',
          100: '#e2e6ee',
          200: '#c7cee4',
          300: '#98a2c0',
          400: '#767e92',
          500: '#3b4256',
          600: '#242e5b',
          700: '#1e2749',
          800: '#182038',
          900: '#121828',
          950: '#0b0f1a',
        },
        // اللون الثاني في الهوية — يُستعمل للتأكيد لا للخلفيات الواسعة
        lime: {
          50: '#f6f9e2',
          100: '#ecf4bd',
          200: '#dfec87',
          300: '#d1e352',
          400: '#c4d82e',
          500: '#adc023',
          600: '#93a31c',
          700: '#748016',
          800: '#565f10',
          900: '#39400b',
        },
        // الأزرق والسماوي — كتلة الشعار ونسخته الفاتحة
        marine: {
          400: '#5bb5e8',
          500: '#3d7fc4',
          600: '#2b57a6',
          700: '#22457f',
        },
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
