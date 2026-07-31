import type { Metadata, Viewport } from 'next';
import './globals.css';

const COMPANY_AR = process.env.NEXT_PUBLIC_COMPANY_NAME_AR || 'نظام إدارة العملاء';

export const metadata: Metadata = {
  title: {
    default: `${COMPANY_AR} — CRM`,
    template: `%s · ${COMPANY_AR}`,
  },
  description: 'نظام إدارة علاقات العملاء لفريق المبيعات في مكتب الترجمة',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1f44f5',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
