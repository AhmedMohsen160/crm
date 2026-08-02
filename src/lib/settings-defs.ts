/**
 * مفاتيح الإعدادات — §٩ من المواصفة + المفاتيح التي أضافتها قرارات الإدارة.
 *
 * كل قيمة هنا **افتراض ابتدائي يُزرع مرة واحدة** ثم يُدار من شاشة «إعدادات
 * النظام». المواصفة تنبّه صراحةً أن المعاملات «تقديرات مبدئية لا قياسات لهذا
 * الفريق، تُعايَر بعد ٦٠ يومًا من التشغيل الفعلي» — والتقارير كلها تقرأ من
 * قاعدة البيانات فتتحدّث تلقائيًا عند تعديلها.
 */

export type SettingKind = 'number' | 'percent' | 'money' | 'boolean' | 'text';

export type SettingDefinition = {
  key: string;
  label: string;
  value: string;
  kind: SettingKind;
  group: string;
  hint?: string;
};

export const SETTING_GROUPS = [
  'التشغيل والطاقة',
  'التسعير والخصومات',
  'أسعار الصرف',
  'الرقابة والمواعيد',
  'نسب المبيعات',
] as const;

export const SETTING_DEFINITIONS: SettingDefinition[] = [
  // ── التشغيل والطاقة ──────────────────────────────────────────
  {
    key: 'working_days',
    label: 'أيام العمل في الشهر',
    value: '26',
    kind: 'number',
    group: 'التشغيل والطاقة',
    hint: 'مقام معادلة تكلفة اليوم للموظف الداخلي',
  },
  {
    key: 'words_per_page',
    label: 'عدد الكلمات في الصفحة',
    value: '250',
    kind: 'number',
    group: 'التشغيل والطاقة',
  },
  {
    key: 'min_weighted_unit',
    label: 'الحد الأدنى للوحدة الموزونة',
    value: '1.0',
    kind: 'number',
    group: 'التشغيل والطاقة',
    hint: 'لا مشروع يُحتسب بأقل من هذه الوحدة مهما صغُر',
  },
  {
    key: 'producer_share',
    label: 'حصة المنتِج من الجهد',
    value: '0.70',
    kind: 'percent',
    group: 'التشغيل والطاقة',
  },
  {
    key: 'reviewer_share',
    label: 'حصة المراجع من الجهد',
    value: '0.30',
    kind: 'percent',
    group: 'التشغيل والطاقة',
    hint: 'حصة المنتِج + حصة المراجع = ١ — وإلا وقع احتساب مزدوج',
  },
  {
    key: 'monthly_overhead',
    label: 'المصروفات الشهرية الثابتة',
    value: '0',
    kind: 'money',
    group: 'التشغيل والطاقة',
    hint: 'يُدخَل من الإدارة — يدخل في التكلفة المستوعبة',
  },
  {
    key: 'reference_monthly_revenue',
    label: 'الإيراد الشهري المرجعي',
    value: '196000',
    kind: 'money',
    group: 'التشغيل والطاقة',
    hint: 'متوسط ٢٠٢٦ المحسوب من البيانات — أساس نسبة الاستيعاب',
  },

  // ── التسعير والخصومات ────────────────────────────────────────
  {
    key: 'rush_surcharge',
    label: 'رسم الاستعجال',
    value: '0.25',
    kind: 'percent',
    group: 'التسعير والخصومات',
  },
  {
    key: 'min_order_value',
    label: 'الحد الأدنى لقيمة الطلب',
    value: '150',
    kind: 'money',
    group: 'التسعير والخصومات',
  },
  {
    key: 'default_deposit_pct',
    label: 'نسبة المقدم الافتراضية',
    value: '0.50',
    kind: 'percent',
    group: 'التسعير والخصومات',
  },
  {
    key: 'quote_validity_days',
    label: 'صلاحية عرض السعر (أيام)',
    value: '7',
    kind: 'number',
    group: 'التسعير والخصومات',
  },
  {
    key: 'discount_limit_sales_admin',
    label: 'حد خصم أدمن المبيعات',
    value: '0.10',
    kind: 'percent',
    group: 'التسعير والخصومات',
    hint: 'تجاوزه يوقف المشروع بانتظار اعتماد',
  },
  {
    key: 'discount_limit_sales_manager',
    label: 'حد خصم مدير المبيعات',
    value: '0.20',
    kind: 'percent',
    group: 'التسعير والخصومات',
  },
  {
    key: 'repeat_client_discount',
    label: 'خصم العميل المتكرر',
    value: '0.05',
    kind: 'percent',
    group: 'التسعير والخصومات',
    hint: 'يُطبَّق تلقائيًا من تاريخ العميل',
  },

  // ── أسعار الصرف ──────────────────────────────────────────────
  {
    key: 'fx_sar_to_egp',
    label: 'الريال السعودي بالجنيه',
    value: '13',
    kind: 'number',
    group: 'أسعار الصرف',
  },
  {
    key: 'fx_usd_to_egp',
    label: 'الدولار بالجنيه',
    value: '48.5',
    kind: 'number',
    group: 'أسعار الصرف',
  },
  {
    key: 'fx_eur_to_egp',
    label: 'اليورو بالجنيه',
    value: '53',
    kind: 'number',
    group: 'أسعار الصرف',
  },

  // ── الرقابة والمواعيد ────────────────────────────────────────
  {
    key: 'sla_first_reply_hours',
    label: 'مهلة أول رد على الليد (ساعات)',
    value: '3',
    kind: 'number',
    group: 'الرقابة والمواعيد',
  },
  {
    key: 'restrict_by_branch',
    label: 'تقييد الموظف برؤية فرعه',
    value: 'true',
    kind: 'boolean',
    group: 'الرقابة والمواعيد',
    hint: 'قرار الإدارة: مفعَّل. من يملك «رؤية كل الليدز» لا يتقيّد.',
  },

  // ── نسب المبيعات ─────────────────────────────────────────────
  {
    key: 'commission_basis',
    label: 'أساس احتساب النسبة',
    value: 'collected',
    kind: 'text',
    group: 'نسب المبيعات',
    hint: 'collected = المحصَّل فعلًا (القرار المعتمد) · net = إجمالي المبيعات',
  },
  {
    key: 'commission_tier_mode',
    label: 'طريقة احتساب الشرائح',
    value: 'progressive',
    kind: 'text',
    group: 'نسب المبيعات',
    hint: 'progressive = كل شريحة على الجزء الواقع فيها · whole = الشريحة المحققة على المبلغ كله',
  },
  {
    key: 'commission_clawback',
    label: 'خصم النسبة عند الاسترداد',
    value: 'true',
    kind: 'boolean',
    group: 'نسب المبيعات',
    hint: 'قرار الإدارة: نعم. يُنشأ قيد عكسي ولا يُحذف الأصلي.',
  },
];

export const SETTING_KEYS = SETTING_DEFINITIONS.map((s) => s.key);

export function settingDefinition(key: string): SettingDefinition | undefined {
  return SETTING_DEFINITIONS.find((s) => s.key === key);
}
