import { PlugZap } from 'lucide-react';
import { FormField, SelectField, TextAreaField } from '@/components/ui';
import { SaveButton } from '@/components/forms';

type Mailbox = {
  id: string;
  label: string;
  address: string;
  ownerId: string | null;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  folder: string;
  fromName: string | null;
  signature: string | null;
  active: boolean;
  lastError: string | null;
};

/**
 * نموذج الصندوق — واحد للإنشاء والتعديل.
 *
 * كلمة المرور **لا تُملأ عند التعديل**: قيمتها المخزَّنة معمّاة، وإعادة عرضها
 * — ولو بالنجوم — تغري بحفظ النجوم مكانها فينقطع الصندوق.
 */
export function MailboxForm({
  mailbox,
  users,
}: {
  mailbox?: Mailbox;
  users: { id: string; name: string }[];
}) {
  const editing = Boolean(mailbox);

  return (
    <form method="post" action="/api/save" className="space-y-5">
      <input type="hidden" name="entity" value="mailbox" />
      <input type="hidden" name="id" value={mailbox?.id ?? ''} />
      <input
        type="hidden"
        name="back"
        value={editing ? `/settings/mailboxes/${mailbox!.id}` : '/settings/mailboxes/new'}
      />

      <section className="card card-pad grid gap-4 sm:grid-cols-2">
        <FormField
          label="اسم الصندوق"
          name="label"
          required
          defaultValue={mailbox?.label}
          placeholder="بريد المبيعات"
        />
        <FormField
          label="العنوان"
          name="address"
          required
          dir="ltr"
          defaultValue={mailbox?.address}
          placeholder="info@fasttrans.net"
        />
        <SelectField
          label="صاحب الصندوق"
          name="ownerId"
          defaultValue={mailbox?.ownerId}
          placeholder="— مشترك: يراه كل من يملك صلاحية البريد —"
          options={users.map((u) => ({ value: u.id, label: u.name }))}
          hint="اتركه فارغًا لصندوق الفريق المشترك، أو اختر شخصًا فلا يقرؤه غيره"
          className="sm:col-span-2"
        />
        <FormField
          label="اسم المرسِل الظاهر"
          name="fromName"
          defaultValue={mailbox?.fromName}
          placeholder="فاست ترانس"
        />
        <FormField
          label="اسم الدخول"
          name="username"
          dir="ltr"
          defaultValue={mailbox?.username}
          hint="يُترك فارغًا ليساوي العنوان"
        />
      </section>

      <section className="card card-pad grid gap-4 sm:grid-cols-3">
        <h2 className="text-sm font-bold text-slate-800 sm:col-span-3">خادم الوارد (IMAP)</h2>
        <FormField
          label="الخادم"
          name="imapHost"
          required
          dir="ltr"
          defaultValue={mailbox?.imapHost}
          placeholder="imap.gmail.com"
          className="sm:col-span-2"
        />
        <FormField
          label="المنفذ"
          name="imapPort"
          type="number"
          dir="ltr"
          defaultValue={mailbox?.imapPort ?? 993}
        />
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-3">
          <input
            type="checkbox"
            name="imapSecure"
            defaultChecked={mailbox?.imapSecure ?? true}
            className="h-4 w-4 rounded border-slate-300"
          />
          اتصال مشفَّر (SSL/TLS)
        </label>
        <FormField
          label="المجلد"
          name="folder"
          dir="ltr"
          defaultValue={mailbox?.folder ?? 'INBOX'}
          className="sm:col-span-3"
        />
      </section>

      <section className="card card-pad grid gap-4 sm:grid-cols-3">
        <h2 className="text-sm font-bold text-slate-800 sm:col-span-3">خادم الصادر (SMTP)</h2>
        <FormField
          label="الخادم"
          name="smtpHost"
          required
          dir="ltr"
          defaultValue={mailbox?.smtpHost}
          placeholder="smtp.gmail.com"
          className="sm:col-span-2"
        />
        <FormField
          label="المنفذ"
          name="smtpPort"
          type="number"
          dir="ltr"
          defaultValue={mailbox?.smtpPort ?? 465}
        />
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-3">
          <input
            type="checkbox"
            name="smtpSecure"
            defaultChecked={mailbox?.smtpSecure ?? true}
            className="h-4 w-4 rounded border-slate-300"
          />
          اتصال مشفَّر (SSL/TLS)
        </label>
      </section>

      <section className="card card-pad space-y-4">
        <FormField
          label="كلمة مرور التطبيق"
          name="secret"
          type="password"
          required={!editing}
          dir="ltr"
          hint={
            editing
              ? 'اتركها فارغة لتبقى كما هي — لا تُعرض المحفوظة'
              : 'استخدم «كلمة مرور تطبيق» من مزوّد البريد، لا كلمة مرور الحساب'
          }
        />
        <TextAreaField
          label="التوقيع"
          name="signature"
          rows={3}
          defaultValue={mailbox?.signature}
          placeholder={'فاست ترانس للترجمة المعتمدة\nwww.fasttrans.net'}
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="active"
            defaultChecked={mailbox?.active ?? true}
            className="h-4 w-4 rounded border-slate-300"
          />
          نشط — يُسحب منه الجديد
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <SaveButton>{editing ? 'حفظ التعديلات' : 'ربط الصندوق'}</SaveButton>
      </div>

      {editing && mailbox?.lastError && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          آخر عُطل: {mailbox.lastError}
        </p>
      )}

      {editing && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <PlugZap className="h-4 w-4" />
          افحص الاتصال بعد الحفظ من زر «فحص الاتصال» أعلى الصفحة.
        </div>
      )}
    </form>
  );
}
