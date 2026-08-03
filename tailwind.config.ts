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
        // الكحلي والليموني مستخرجان من عروض الشركة الرسمية بعينها،
        // لا مختاران بالذوق: #242E5B و#B9D716.
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
          50: '#f4f8dc',
          100: '#e9f2b4',
          200: '#dbeb7c',
          300: '#cde244',
          400: '#b9d716',
          500: '#a3bf13',
          600: '#8fa80f',
          700: '#71850c',
          800: '#556309',
          900: '#3a4406',
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
