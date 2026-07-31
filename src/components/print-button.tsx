'use client';

import { Printer } from 'lucide-react';

/** طباعة الصفحة — يمكن للمستخدم اختيار "حفظ كـ PDF" من نافذة الطباعة */
export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-primary">
      <Printer className="h-4 w-4" />
      طباعة / حفظ PDF
    </button>
  );
}
