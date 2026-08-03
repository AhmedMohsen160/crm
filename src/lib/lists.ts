/**
 * القوائم المرجعية والمعاملات — §٩ من المواصفة.
 *
 * ⚠️ ما في هذا الملف **بيانات ابتدائية فقط**، تُزرع مرة واحدة في جدول
 * `ListItem` ثم تُدار من شاشة «القوائم». الكود **لا يقرأ منه** بعد الزرع —
 * يقرأ من قاعدة البيانات، لأن المواصفة تنصّ: «كلها قابلة للتعديل من الواجهة،
 * لا تُشفّرها في الكود».
 *
 * `extra` يحمل المعامل رقمًا نصيًا كما تنصّ §٩ («المعامل يُخزَّن في lists.extra»).
 */

export type ListDefinition = {
  /** المفتاح البرمجي — إنجليزي ثابت */
  name: string;
  /** الاسم المعروض في شاشة القوائم */
  label: string;
  /** شرح يظهر أعلى الشاشة */
  hint?: string;
  /** هل لعناصر هذه القائمة معامل رقمي؟ */
  hasExtra?: boolean;
  /** عنوان عمود المعامل */
  extraLabel?: string;
  items: { value: string; label: string; extra?: string }[];
};

export const LIST_DEFINITIONS: ListDefinition[] = [
  // ── أنماط التشغيل ومعامل الجهد ───────────────────────────────
  {
    name: 'work_mode',
    label: 'أنماط التشغيل',
    hint: 'المعامل يضرب عدد الصفحات في معادلة الصفحات الموزونة (§٨).',
    hasExtra: true,
    extraLabel: 'معامل الجهد',
    items: [
      { value: 'human_full', label: 'ترجمة بشرية كاملة', extra: '1.00' },
      { value: 'mtpe_full', label: 'ذكاء اصطناعي + مراجعة بشرية مكثفة', extra: '0.60' },
      { value: 'mtpe_light', label: 'ذكاء اصطناعي + مراجعة بشرية خفيفة', extra: '0.35' },
      { value: 'review_human', label: 'مراجعة ترجمة بشرية', extra: '0.33' },
      { value: 'proofread', label: 'تدقيق لغوي', extra: '0.20' },
      { value: 'dtp', label: 'تنسيق ونشر مكتبي', extra: '0.15' },
      { value: 'glossary', label: 'استخراج مصطلحات ومسرد', extra: '0.50' },
      { value: 'transcription', label: 'تفريغ صوتي', extra: '0.45' },
      { value: 'subtitling', label: 'سبتايتل وتوقيت', extra: '0.55' },
    ],
  },

  // ── أنواع الخطوات ومعاملها ───────────────────────────────────
  {
    name: 'step_type',
    label: 'أنواع خطوات التنفيذ',
    hint: 'معامل كل خطوة يُستخدم في توزيع تكلفة المشروع على خطواته.',
    hasExtra: true,
    extraLabel: 'المعامل',
    items: [
      { value: 'mt', label: 'ترجمة بالذكاء الاصطناعي', extra: '0.30' },
      { value: 'human_translation', label: 'ترجمة بشرية', extra: '1.00' },
      { value: 'light_review', label: 'مراجعة خفيفة', extra: '0.15' },
      { value: 'heavy_review', label: 'مراجعة مكثفة', extra: '0.33' },
      { value: 'proofread', label: 'تدقيق لغوي', extra: '0.20' },
      { value: 'formatting', label: 'تنسيق', extra: '0.15' },
      { value: 'glossary', label: 'مسرد', extra: '0.50' },
      { value: 'transcription', label: 'تفريغ', extra: '0.45' },
      { value: 'subtitling', label: 'سبتايتل', extra: '0.55' },
    ],
  },

  // ── خطوط الخدمة ومعامل التخصص ────────────────────────────────
  {
    name: 'service_line',
    label: 'خطوط الخدمة',
    hint: 'معامل التخصص يعكس صعوبة المجال، ويدخل في الصفحات الموزونة.',
    hasExtra: true,
    extraLabel: 'معامل التخصص',
    items: [
      { value: 'certified', label: 'معتمدة / شخصية', extra: '0.85' },
      { value: 'general', label: 'عامة', extra: '1.00' },
      { value: 'legal', label: 'قانونية', extra: '1.25' },
      { value: 'financial', label: 'مالية', extra: '1.25' },
      { value: 'medical', label: 'طبية', extra: '1.35' },
      { value: 'technical', label: 'تقنية وهندسية', extra: '1.30' },
      { value: 'marketing', label: 'توطين وتسويقي', extra: '1.40' },
      { value: 'academic', label: 'أكاديمية وشرعية', extra: '1.30' },
      { value: 'ai_review', label: 'مراجعة مخرجات ذكاء اصطناعي', extra: '1.20' },
    ],
  },

  // ── اللغات ───────────────────────────────────────────────────
  // قائمة واحدة تخدم «من» و«إلى» معًا — إضافة لغة تُنشئ كل أزواجها تلقائيًا
  {
    name: 'language',
    label: 'اللغات',
    hint: 'قائمة واحدة تُستخدم في «من» و«إلى». إضافة لغة تفتح كل أزواجها تلقائيًا.',
    items: [
      { value: 'ar', label: 'العربية' },
      { value: 'en', label: 'الإنجليزية' },
      { value: 'fr', label: 'الفرنسية' },
      { value: 'de', label: 'الألمانية' },
      { value: 'it', label: 'الإيطالية' },
      { value: 'es', label: 'الإسبانية' },
      { value: 'el', label: 'اليونانية' },
      { value: 'nl', label: 'الهولندية' },
      { value: 'tr', label: 'التركية' },
      { value: 'ru', label: 'الروسية' },
      { value: 'zh', label: 'الصينية' },
      { value: 'uk', label: 'الأوكرانية' },
      { value: 'ja', label: 'اليابانية' },
      { value: 'ko', label: 'الكورية' },
      { value: 'ur', label: 'الأوردو' },
      { value: 'fa', label: 'الفارسية' },
      { value: 'sv', label: 'السويدية' },
      { value: 'pt', label: 'البرتغالية' },
      { value: 'id', label: 'الإندونيسية' },
      { value: 'sw', label: 'السواحيلية' },
    ],
  },

  // ── الفروع ───────────────────────────────────────────────────
  {
    name: 'branch',
    label: 'الفروع',
    hint: 'الفرع يُقيّد رؤية الموظف لسجلات فرعه (يُضبط بمفتاح restrict_by_branch).',
    items: [
      { value: 'mokattam', label: 'المقطم — الهضبة الوسطى' },
      { value: 'mohandessin', label: 'جامعة الدول — المهندسين' },
      { value: 'alexandria', label: 'الإسكندرية' },
      { value: 'nasr_city', label: 'مدينة نصر' },
      { value: 'riyadh', label: 'الرياض' },
      { value: 'buraidah', label: 'القصيم — بريدة' },
      { value: 'remote', label: 'عن بُعد' },
    ],
  },

  // ── قنوات الليد ──────────────────────────────────────────────
  {
    name: 'channel',
    label: 'قنوات الليد',
    items: [
      { value: 'google_ads', label: 'Google Ads' },
      { value: 'meta_ads', label: 'Meta Ads' },
      { value: 'organic', label: 'Organic' },
      { value: 'website', label: 'الموقع الإلكتروني' },
      { value: 'referral', label: 'توصية' },
      { value: 'returning', label: 'عميل قديم' },
      { value: 'walk_in', label: 'زيارة فرع' },
      { value: 'other', label: 'أخرى' },
    ],
  },

  // ── وسيلة التواصل ────────────────────────────────────────────
  {
    name: 'contact_method',
    label: 'وسيلة التواصل',
    items: [
      { value: 'whatsapp', label: 'واتساب' },
      { value: 'call', label: 'اتصال' },
      { value: 'email', label: 'إيميل' },
      { value: 'office', label: 'مقر' },
    ],
  },

  // ── أسباب الخسارة ────────────────────────────────────────────
  {
    name: 'loss_reason',
    label: 'أسباب الخسارة',
    hint: 'إلزامي عند تسجيل ليد خاسر — بلا سبب لا نتعلّم شيئًا.',
    items: [
      { value: 'price', label: 'السعر مرتفع' },
      { value: 'no_reply', label: 'لم يرد' },
      { value: 'timeline', label: 'المدة لا تناسبه' },
      { value: 'competitor', label: 'نفّذ عند غيرنا' },
      { value: 'distance', label: 'بعد المسافة' },
      { value: 'language', label: 'لغة لا نغطيها' },
      { value: 'inquiry_only', label: 'استفسار فقط' },
      { value: 'other', label: 'أخرى' },
    ],
  },

  // ── شرائح الخصم الكمّي (§١٠ بند ٣) ───────────────────────────
  // المفتاح هو عتبة الصفحات، و«extra» هو الخصم العشري
  {
    name: 'volume_discount',
    label: 'شرائح الخصم الكمّي',
    hint: 'المفتاح = عتبة الصفحات، والمعامل = الخصم العشري (٠٫٠٥ تعني ٥٪). تُطبَّق أعلى شريحة يبلغها المشروع.',
    hasExtra: true,
    extraLabel: 'الخصم',
    items: [
      { value: '20', label: 'فوق ٢٠ صفحة', extra: '0.05' },
      { value: '50', label: 'فوق ٥٠ صفحة', extra: '0.08' },
      { value: '100', label: 'فوق ١٠٠ صفحة', extra: '0.12' },
    ],
  },

  // ── طرق الدفع للفريلانسرز والموظفين ──────────────────────────
  // قائمة لا نصّ حر: النص الحر لا يُرشَّح ولا يُجمَّع، و«انستا» و«إنستاباي»
  // و«Instapay» تصير ثلاث طرق مختلفة في التقارير وهي واحدة.
  {
    name: 'payment_method',
    label: 'طرق الدفع',
    hint: 'ما يُصرف به للفريلانسر أو الموظف. المعامل هو نصّ الإرشاد الذي يظهر تحت خانة البيانات.',
    hasExtra: true,
    extraLabel: 'إرشاد خانة البيانات',
    items: [
      { value: 'bank_transfer', label: 'تحويل بنكي', extra: 'اسم البنك ورقم الحساب أو الآيبان' },
      { value: 'instapay', label: 'إنستاباي', extra: 'عنوان إنستاباي أو رقم الهاتف' },
      { value: 'vodafone_cash', label: 'فودافون كاش', extra: 'رقم المحفظة' },
      { value: 'etisalat_cash', label: 'اتصالات كاش', extra: 'رقم المحفظة' },
      { value: 'orange_cash', label: 'أورنج كاش', extra: 'رقم المحفظة' },
      { value: 'we_pay', label: 'وي باي', extra: 'رقم المحفظة' },
      { value: 'fawry', label: 'فوري', extra: 'رقم الهاتف أو كود الحساب' },
      { value: 'meeza', label: 'بطاقة ميزة', extra: 'رقم البطاقة' },
      { value: 'paypal', label: 'باي بال', extra: 'البريد المرتبط بالحساب' },
      { value: 'wise', label: 'Wise', extra: 'البريد أو رقم الحساب الدولي' },
      { value: 'payoneer', label: 'Payoneer', extra: 'البريد المرتبط بالحساب' },
      { value: 'western_union', label: 'ويسترن يونيون', extra: 'الاسم الرباعي والدولة' },
      { value: 'stc_pay', label: 'STC Pay', extra: 'رقم الهاتف' },
      { value: 'bank_sa', label: 'تحويل بنكي — السعودية', extra: 'الآيبان (SA…)' },
      { value: 'cash', label: 'نقدًا في المكتب', extra: 'الفرع الذي يُصرف منه' },
      { value: 'cheque', label: 'شيك', extra: 'اسم المستفيد كما يُكتب على الشيك' },
      { value: 'other', label: 'أخرى', extra: 'اكتب التفاصيل كاملة' },
    ],
  },

  // ── العملات ──────────────────────────────────────────────────
  {
    name: 'currency',
    label: 'العملات',
    items: [
      { value: 'EGP', label: 'جنيه مصري' },
      { value: 'SAR', label: 'ريال سعودي' },
      { value: 'USD', label: 'دولار أمريكي' },
      { value: 'EUR', label: 'يورو' },
    ],
  },
];

export const LIST_NAMES = LIST_DEFINITIONS.map((l) => l.name);

export function listDefinition(name: string): ListDefinition | undefined {
  return LIST_DEFINITIONS.find((l) => l.name === name);
}
