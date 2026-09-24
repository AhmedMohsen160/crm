import { FileText } from 'lucide-react';
import { acceptAttribute, extensionList, formatBytes, MAX_FILE_BYTES } from '@/lib/files';

/**
 * مستندٌ مرفوع على سجلّ — كتلة واحدة تُعاد أينما لزم.
 *
 * **والرفع اختياريّ دائمًا**: من لا يملك المستند اليوم يحفظ السجل بلا شيء،
 * ويرفعه غدًا. وحاجزُ إدخالٍ في خانة تُفتح مئة مرة في اليوم يُعطّل التشغيل
 * لأجل حالةٍ نادرة.
 *
 * والاستبدال يستبدل، والحذف بمربّع اختيار — لأن المستند نسخةٌ من ورقةٍ عند
 * صاحبها لا سجلٌّ تشغيلي يسري عليه «لا شيء يُمحى».
 */
export default function DocumentUpload({
  label,
  name,
  hint,
  file,
}: {
  label: string;
  /** اسم حقل الملف — وحقل الحذف يتبعه بلاحقة `Remove` */
  name: string;
  hint?: string;
  file?: { id: string; name: string; size: number } | null;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
      <p className="label">{label}</p>
      {hint && <p className="mb-2 text-xs text-slate-500">{hint}</p>}

      {file && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <FileText className="h-4 w-4 shrink-0 text-brand-600" />
          <a
            href={`/api/files/${file.id}`}
            className="link min-w-0 flex-1 truncate text-sm font-medium"
          >
            {file.name}
          </a>
          <span className="shrink-0 text-xs text-slate-400">{formatBytes(file.size)}</span>
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-rose-600">
            <input
              type="checkbox"
              name={`${name}Remove`}
              className="h-4 w-4 rounded border-slate-300"
            />
            احذفه
          </label>
        </div>
      )}

      <input
        type="file"
        name={name}
        accept={acceptAttribute()}
        className="block w-full text-sm text-slate-600 file:ml-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
      />
      <p className="mt-1 text-xs text-slate-400">
        {file ? 'اختيار ملف جديد يستبدل الحالي. ' : ''}
        المقبول {extensionList()} — وحتى {formatBytes(MAX_FILE_BYTES)}.
      </p>
    </div>
  );
}
