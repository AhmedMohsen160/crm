/**
 * شجرة الحسابات الافتتاحية — منقولة من دفاتر فاست ترانس الفعلية
 * (`docs/FINANCE-SPEC.md` §١ و§٢).
 *
 * **تُزرع مرة واحدة ثم تصير بيانات.** بعدها يُضيف المحاسب حسابًا أو يعطّله
 * من الشاشة، ولا يعود هذا الملف يلمس ما عُدِّل — كما فعلنا مع الأدوار
 * والقوائم وخطط النسب.
 *
 * حسابات العملاء والموردين **ليست هنا**: العميل يُنشئ حسابه لحظة تسجيله في
 * الـCRM، فلا نزرع ٨٢ اسمًا يتقادم أولها قبل أن يُفتح النظام.
 */

export type SeedAccount = {
  /** المفتاح الإنجليزي كما في الدفاتر — للمطابقة عند الترحيل */
  en: string;
  /** الاسم بالعربية — هو ما يظهر في كل شاشة */
  ar: string;
  /** يربطه النظام بحدث تشغيلي (تسليم · تحصيل · صرف فريلانسر…) */
  systemKey?: string;
  children?: SeedAccount[];
};

export type SeedRoot = SeedAccount & {
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  /** بند قائمة الدخل — يورث لكل ما تحته */
  group?: string;
};

const leaf = (en: string, ar: string, systemKey?: string): SeedAccount => ({ en, ar, systemKey });

/** الرواتب الثمانية تتكرر بنصّها في البنود الثلاثة */
const salaryLeaves = (tag: string, suffix: string): SeedAccount[] => [
  leaf(`Salaries (${tag}) - Basic salary`, `رواتب ${suffix} — أساسي`),
  leaf(`Salaries (${tag}) - Overtime hours`, `رواتب ${suffix} — ساعات إضافية`),
  leaf(`Salaries (${tag}) - Bonuses`, `رواتب ${suffix} — مكافآت`),
  leaf(`Salaries (${tag}) - Social insurance`, `رواتب ${suffix} — تأمينات اجتماعية`),
  leaf(`Salaries (${tag}) - Allowances`, `رواتب ${suffix} — بدلات`),
  leaf(`Salaries (${tag}) - Incentives`, `رواتب ${suffix} — حوافز`),
  leaf(
    `Salaries (${tag}) - Commissions`,
    `رواتب ${suffix} — عمولات`,
    tag === 'S&M' ? 'exp_sales_commission' : undefined
  ),
  leaf(`Salaries (${tag}) - Training and courses`, `رواتب ${suffix} — تدريب ودورات`),
];

export const CHART_OF_ACCOUNTS: SeedRoot[] = [
  // ── الأصول الثابتة ───────────────────────────────────────────
  {
    en: 'Fixed Assets',
    ar: 'أصول ثابتة',
    type: 'asset',
    children: [
      {
        en: 'Property, Plant and Equipment',
        ar: 'ممتلكات وآلات ومعدات',
        children: [
          {
            en: 'Electrical and Electronic Equipment',
            ar: 'أجهزة كهربائية وإلكترونية',
            children: [
              leaf('Computer Hardware and Software', 'أجهزة حاسب وبرمجيات', 'fa_computers'),
              leaf('Air Conditioning Units', 'وحدات تكييف'),
              leaf('Electrical Appliances', 'أجهزة كهربائية'),
              leaf('Telephone Systems and Surveillance', 'أنظمة هاتف ومراقبة'),
              leaf('Photocopiers and Printers', 'ماكينات تصوير وطباعة'),
              leaf('Electric Generator', 'مولد كهربائي'),
            ],
          },
          {
            en: 'Office Furniture, Fixtures and Interior Fit-Out',
            ar: 'أثاث وتجهيزات وديكورات',
            children: [leaf('Office Furniture and Fit-Out', 'أثاث مكتبي وتجهيزات')],
          },
        ],
      },
    ],
  },
  {
    en: 'Accumulated Depreciation of Fixed Assets',
    ar: 'مجمّع إهلاك الأصول الثابتة',
    type: 'asset',
    children: [
      {
        en: 'Accumulated Depreciation of PP&E',
        ar: 'مجمّع إهلاك الممتلكات والمعدات',
        children: [
          {
            en: 'Accumulated Depreciation',
            ar: 'مجمّع الإهلاك',
            children: [
              leaf('Accumulated Depreciation - All', 'مجمّع إهلاك الأصول', 'acc_depreciation'),
            ],
          },
        ],
      },
    ],
  },

  // ── الأصول المتداولة ─────────────────────────────────────────
  {
    en: 'Current Assets',
    ar: 'أصول متداولة',
    type: 'asset',
    children: [
      {
        en: 'Cash and Cash Equivalents',
        ar: 'النقدية وما في حكمها',
        children: [
          {
            en: 'Treasury',
            ar: 'الخزائن',
            children: [
              leaf('Treasury - EGP', 'خزينة — جنيه مصري', 'cash_egp'),
              leaf('Treasury - USD', 'خزينة — دولار أمريكي', 'cash_usd'),
              leaf('Treasury - SAR', 'خزينة — ريال سعودي'),
              leaf('Treasury - Paypal', 'خزينة — باي بال'),
              leaf('Treasury - Dopay', 'خزينة — دوباي'),
            ],
          },
          {
            en: 'Bank Accounts',
            ar: 'الحسابات البنكية',
            children: [
              leaf('Bank - NBE - EGP', 'البنك الأهلي — جنيه', 'bank_egp'),
              leaf('Bank - NBE - USD', 'البنك الأهلي — دولار'),
              leaf('Bank - ADIB - EGP', 'مصرف أبو ظبي — جنيه'),
              leaf('Bank - ADIB - USD', 'مصرف أبو ظبي — دولار'),
            ],
          },
        ],
      },
      {
        en: 'Clients',
        ar: 'العملاء',
        children: [
          {
            en: 'Clients - Receivable',
            ar: 'ذمم العملاء',
            children: [
              leaf('Clients - General', 'العملاء — حساب عام', 'ar_clients'),
              leaf('Clients - International', 'العملاء — خارج مصر'),
            ],
          },
        ],
      },
      {
        en: 'Withholding Tax by Others',
        ar: 'ضريبة مستقطعة لدى الغير',
        children: [
          {
            en: 'Withholding Tax by Others',
            ar: 'ضريبة مستقطعة لدى الغير',
            children: [leaf('Withholding Tax by Others', 'ضريبة مستقطعة لدى الغير', 'wht_by_others')],
          },
        ],
      },
      {
        en: 'Notes Receivable',
        ar: 'أوراق القبض',
        children: [
          {
            en: 'Notes Receivable Under Collection',
            ar: 'أوراق قبض تحت التحصيل',
            children: [leaf('Notes Receivable', 'أوراق قبض تحت التحصيل')],
          },
        ],
      },
      {
        en: 'Other Accounts Receivable',
        ar: 'أرصدة مدينة أخرى',
        children: [
          {
            en: 'Prepaid Expenses',
            ar: 'مصروفات مدفوعة مقدمًا',
            children: [leaf('Prepaid Expenses', 'مصروفات مدفوعة مقدمًا')],
          },
          {
            en: 'Accrued Revenues',
            ar: 'إيرادات مستحقة',
            children: [leaf('Accrued Revenues', 'إيرادات مستحقة')],
          },
          {
            en: 'Employee Advances',
            ar: 'سلف الموظفين',
            children: [leaf('Employee Advances', 'سلف الموظفين')],
          },
          {
            en: 'Employee Custody',
            ar: 'عهد الموظفين',
            children: [leaf('Employee Custody', 'عهد الموظفين')],
          },
          {
            en: 'Retained Amounts with Others',
            ar: 'مبالغ محتجزة لدى الغير',
            children: [leaf('Retained Amounts with Others', 'مبالغ محتجزة لدى الغير')],
          },
          {
            en: 'Other Receivables',
            ar: 'مدينون آخرون',
            children: [leaf('Other Receivables', 'مدينون آخرون')],
          },
        ],
      },
      {
        en: 'Advance payments to suppliers',
        ar: 'دفعات مقدمة للموردين',
        children: [
          {
            en: 'Advance payments to suppliers',
            ar: 'دفعات مقدمة للموردين',
            children: [leaf('Advance payments to suppliers', 'دفعات مقدمة للموردين')],
          },
        ],
      },
    ],
  },

  // ── حقوق الملكية ─────────────────────────────────────────────
  {
    en: "Owner's Equity",
    ar: 'حقوق الملكية',
    type: 'equity',
    children: [
      {
        en: 'Capital',
        ar: 'رأس المال',
        children: [
          { en: 'Capital', ar: 'رأس المال', children: [leaf('Paid-in Capital', 'رأس المال المدفوع')] },
        ],
      },
      {
        en: 'Profit / Loss',
        ar: 'الأرباح والخسائر',
        children: [
          {
            en: 'Profit or Loss for the Period',
            ar: 'أرباح أو خسائر الفترة',
            children: [leaf('Profit or Loss for the Period', 'أرباح أو خسائر الفترة')],
          },
          {
            en: 'Profits and losses from previous periods',
            ar: 'أرباح وخسائر فترات سابقة',
            children: [leaf('Retained Earnings', 'أرباح محتجزة من فترات سابقة')],
          },
        ],
      },
      {
        en: 'Reserves',
        ar: 'الاحتياطيات',
        children: [{ en: 'Reserves', ar: 'الاحتياطيات', children: [leaf('Legal Reserve', 'احتياطي قانوني')] }],
      },
      {
        en: 'Provisions',
        ar: 'المخصصات',
        children: [{ en: 'Provisions', ar: 'المخصصات', children: [leaf('General Provisions', 'مخصصات عامة')] }],
      },
      {
        en: "Partner's Current Account",
        ar: 'جاري الشركاء',
        children: [
          { en: "Partner's Current Account", ar: 'جاري الشركاء', children: [leaf('Partner Current', 'جاري الشركاء')] },
        ],
      },
      {
        en: "Partner's drawings",
        ar: 'مسحوبات الشركاء',
        children: [
          { en: "Partner's drawings", ar: 'مسحوبات الشركاء', children: [leaf('Partner Drawings', 'مسحوبات الشركاء')] },
        ],
      },
    ],
  },

  // ── الالتزامات المتداولة ─────────────────────────────────────
  {
    en: 'Current Liabilities',
    ar: 'التزامات متداولة',
    type: 'liability',
    children: [
      {
        en: 'Suppliers',
        ar: 'الموردون',
        children: [
          {
            en: 'Suppliers - Payable',
            ar: 'ذمم الموردين',
            children: [
              leaf('Suppliers - Business', 'موردون — شركات', 'ap_suppliers'),
              leaf('Suppliers - Freelancers', 'موردون — فريلانسرز', 'ap_freelancers'),
            ],
          },
        ],
      },
      {
        en: 'Withholding Tax For Others',
        ar: 'ضريبة مستقطعة للغير',
        children: [
          {
            en: 'Withholding Tax For Others',
            ar: 'ضريبة مستقطعة للغير',
            children: [leaf('Withholding Tax For Others', 'ضريبة مستقطعة للغير')],
          },
        ],
      },
      {
        en: 'Advance payments from Clients',
        ar: 'دفعات مقدمة من العملاء',
        children: [
          {
            en: 'Advance payments from Clients',
            ar: 'دفعات مقدمة من العملاء',
            children: [leaf('Client Advances', 'دفعات مقدمة من العملاء', 'client_advances')],
          },
        ],
      },
      {
        en: 'Other Accounts Payable',
        ar: 'أرصدة دائنة أخرى',
        children: [
          {
            en: 'Accrued expenses',
            ar: 'مصروفات مستحقة',
            children: [leaf('Accrued expenses', 'مصروفات مستحقة', 'ap_accrued')],
          },
          {
            en: 'Revenue received in advance',
            ar: 'إيرادات مقبوضة مقدمًا',
            children: [leaf('Deferred Revenue', 'إيرادات مقبوضة مقدمًا')],
          },
          {
            en: 'Deposits held for others',
            ar: 'أمانات للغير',
            children: [leaf('Deposits held for others', 'أمانات للغير')],
          },
        ],
      },
      {
        en: 'Notes Payable',
        ar: 'أوراق الدفع',
        children: [
          {
            en: 'Notes Payable under Collection',
            ar: 'أوراق دفع تحت التحصيل',
            children: [leaf('Notes Payable', 'أوراق دفع تحت التحصيل')],
          },
        ],
      },
      {
        en: 'Current Accounts',
        ar: 'حسابات جارية حكومية',
        children: [
          {
            en: 'Egyptian Tax Authority',
            ar: 'مصلحة الضرائب المصرية',
            children: [
              leaf('VAT Payable', 'ضريبة القيمة المضافة المستحقة', 'tax_vat'),
              leaf('Income Tax Payable', 'ضريبة الدخل المستحقة'),
              leaf('Payroll Tax Payable', 'ضريبة كسب العمل المستحقة'),
            ],
          },
          {
            en: 'Egyptian Social Insurance Authority',
            ar: 'الهيئة القومية للتأمين الاجتماعي',
            children: [leaf('Social Insurance Payable', 'تأمينات اجتماعية مستحقة')],
          },
        ],
      },
    ],
  },

  // ── الإيرادات ────────────────────────────────────────────────
  {
    en: 'Revenues',
    ar: 'الإيرادات',
    type: 'revenue',
    group: 'service_revenue',
    children: [
      {
        en: 'Translation services Revenue',
        ar: 'إيراد خدمات الترجمة',
        children: [
          {
            en: 'Simultaneous interpretation revenue',
            ar: 'إيراد الترجمة الفورية',
            children: [leaf('Simultaneous interpretation revenue', 'إيراد الترجمة الفورية')],
          },
          {
            en: 'Consecutive interpretation revenue',
            ar: 'إيراد الترجمة التتابعية',
            children: [leaf('Consecutive interpretation revenue', 'إيراد الترجمة التتابعية')],
          },
          {
            en: 'Oral interpretation revenue',
            ar: 'إيراد الترجمة الشفهية',
            children: [leaf('Oral interpretation revenue', 'إيراد الترجمة الشفهية')],
          },
          {
            en: 'Written translation revenue',
            ar: 'إيراد الترجمة التحريرية',
            children: [
              leaf('Written translation revenue', 'إيراد الترجمة التحريرية', 'rev_written_translation'),
            ],
          },
        ],
      },
      {
        en: 'DTP services Revenue',
        ar: 'إيراد خدمات النشر المكتبي',
        children: [
          {
            en: 'DTP services Revenue',
            ar: 'إيراد خدمات النشر المكتبي',
            children: [leaf('DTP services Revenue', 'إيراد خدمات النشر المكتبي', 'rev_dtp')],
          },
        ],
      },
      {
        en: 'Training services revenue',
        ar: 'إيراد خدمات التدريب',
        children: [
          {
            en: 'Training services revenue',
            ar: 'إيراد خدمات التدريب',
            children: [leaf('Training services revenue', 'إيراد خدمات التدريب', 'rev_training')],
          },
        ],
      },
    ],
  },
  {
    en: 'Other revenue',
    ar: 'إيرادات أخرى',
    type: 'revenue',
    group: 'other_income',
    children: [
      {
        en: 'Other revenue',
        ar: 'إيرادات أخرى',
        children: [
          {
            en: 'Other revenue',
            ar: 'إيرادات أخرى',
            children: [
              leaf('Foreign currency exchange gains and losses', 'أرباح وخسائر فروق العملة', 'rev_fx'),
              leaf('Fees collected from centers', 'رسوم محصَّلة من المراكز'),
            ],
          },
        ],
      },
    ],
  },

  // ── المصروفات: البنود الثلاثة ────────────────────────────────
  {
    en: 'General and administrative expenses',
    ar: 'مصاريف عمومية وإدارية',
    type: 'expense',
    group: 'general_admin',
    children: [
      {
        en: 'Salaries, wages, and related expenses (G&A)',
        ar: 'رواتب وأجور — إدارية',
        children: [
          { en: 'Salaries (G&A)', ar: 'رواتب وأجور — إدارية', children: salaryLeaves('G&A', 'إدارية') },
        ],
      },
      {
        en: 'Rent expense',
        ar: 'الإيجارات',
        children: [
          {
            en: 'Rent expense',
            ar: 'الإيجارات',
            children: [
              leaf('Mokattam branch rent', 'إيجار فرع المقطم'),
              leaf('Mohandessin branch rent', 'إيجار فرع المهندسين'),
              leaf('Alexandria branch rent', 'إيجار فرع الإسكندرية'),
              leaf('Nasr City branch rent', 'إيجار فرع مدينة نصر'),
              leaf("Employees' Apartment Rent", 'إيجار شقة العاملين'),
            ],
          },
        ],
      },
      {
        en: 'Utilities expense',
        ar: 'المرافق',
        children: [
          {
            en: 'Utilities expense',
            ar: 'المرافق',
            children: [
              leaf('Mobile phone expense', 'الهاتف المحمول'),
              leaf('Landline phone expense', 'الهاتف الأرضي'),
              leaf('Internet subscription expense', 'اشتراك الإنترنت'),
              leaf('Natural gas expense', 'الغاز الطبيعي'),
              leaf('Electricity expense', 'الكهرباء'),
              leaf('Water expense', 'المياه'),
              leaf('Cleaning expense', 'النظافة'),
            ],
          },
        ],
      },
      {
        en: 'Other general expenses',
        ar: 'مصاريف عمومية أخرى',
        children: [
          {
            en: 'Other general expenses',
            ar: 'مصاريف عمومية أخرى',
            children: [
              leaf('External auditor fees', 'أتعاب المراجع الخارجي'),
              leaf('Legal consultancy fees', 'أتعاب استشارات قانونية'),
              leaf('Meeting expenses', 'مصاريف اجتماعات'),
              leaf('Shipping and delivery expenses', 'شحن وتوصيل'),
              leaf('Transportation expenses', 'انتقالات'),
              leaf('Catering and hospitality expenses', 'ضيافة'),
              leaf('Stationery and ink expenses', 'قرطاسية وأحبار'),
              leaf('Administrative printing expenses', 'مطبوعات إدارية'),
              leaf('Fees, registrations, and licenses', 'رسوم وتسجيلات وتراخيص'),
              leaf('Bank charges and commissions', 'مصاريف وعمولات بنكية', 'exp_bank_charges'),
              leaf('Maintenance expenses', 'صيانة'),
              leaf('Management consultancy fees', 'أتعاب استشارات إدارية'),
              leaf('Gifts, gratuities, and donations', 'هدايا وإكراميات وتبرعات'),
              leaf("Owners' association expenses", 'مصاريف اتحاد الملاك'),
              leaf('Computer supplies expenses', 'مستلزمات حاسب'),
              leaf('Brokerage expenses', 'سمسرة'),
              leaf('Recruitment advertising expenses', 'إعلانات توظيف'),
              leaf('Penalties and fines expenses', 'غرامات وجزاءات'),
              leaf('Petty cash expenses', 'نثريات'),
              leaf('Money transfer and withdrawal fees', 'رسوم تحويل وسحب'),
              leaf('Office supplies expenses', 'مستلزمات مكتبية'),
            ],
          },
        ],
      },
      {
        en: 'Fixed Assets Depreciation Expense',
        ar: 'مصروف إهلاك الأصول الثابتة',
        children: [
          {
            en: 'Fixed Assets Depreciation Expense',
            ar: 'مصروف إهلاك الأصول الثابتة',
            children: [leaf('Depreciation Expense', 'مصروف إهلاك الأصول الثابتة', 'exp_depreciation')],
          },
        ],
      },
    ],
  },
  {
    en: 'Selling and Marketing Expenses',
    ar: 'مصاريف بيعية وتسويقية',
    type: 'expense',
    group: 'selling_marketing',
    children: [
      {
        en: 'Salaries, wages, and related expenses (S&M)',
        ar: 'رواتب وأجور — بيعية',
        children: [
          { en: 'Salaries (S&M)', ar: 'رواتب وأجور — بيعية', children: salaryLeaves('S&M', 'بيعية') },
        ],
      },
      {
        en: 'Paid Advertising via Platforms Expenses',
        ar: 'إعلانات مدفوعة عبر المنصات',
        children: [
          {
            en: 'Paid Advertising via Platforms',
            ar: 'إعلانات مدفوعة عبر المنصات',
            children: [
              leaf('Paid Advertising - Facebook', 'إعلانات — فيسبوك', 'exp_ads_facebook'),
              leaf('Paid Advertising - Tiktok', 'إعلانات — تيك توك'),
              leaf('Paid Advertising - Instagram', 'إعلانات — إنستجرام'),
              leaf('Paid Advertising - Google Ads', 'إعلانات — جوجل', 'exp_ads_google'),
            ],
          },
        ],
      },
      {
        en: 'Outsourced Marketing Services Expenses',
        ar: 'خدمات تسويق خارجية',
        children: [
          {
            en: 'Outsourced Marketing Services',
            ar: 'خدمات تسويق خارجية',
            children: [
              leaf('Outsourced Marketing - Design', 'تسويق خارجي — تصميم'),
              leaf('Outsourced Marketing - Voice-over', 'تسويق خارجي — تعليق صوتي'),
              leaf('Outsourced Marketing - Content Writing', 'تسويق خارجي — كتابة محتوى', 'exp_content'),
              leaf('Outsourced Marketing - Backlinking', 'تسويق خارجي — باك لينك'),
              leaf('Outsourced Marketing - Programming', 'تسويق خارجي — برمجة'),
            ],
          },
        ],
      },
      {
        en: 'Other Selling and Marketing Expenses',
        ar: 'مصاريف بيعية أخرى',
        children: [
          {
            en: 'Other Selling and Marketing',
            ar: 'مصاريف بيعية أخرى',
            children: [
              leaf('Transportation - Salesmen', 'انتقالات المندوبين'),
              leaf('Conference Subscription Expenses', 'اشتراكات مؤتمرات'),
              leaf('Marketing Print Materials', 'مطبوعات دعائية'),
              leaf('Marketing Consultancy Expenses', 'استشارات تسويقية'),
              leaf('Customer Gifts Expenses', 'هدايا العملاء'),
              leaf('Sales Commission for Non-Employees', 'عمولة مبيعات لغير الموظفين'),
            ],
          },
        ],
      },
    ],
  },
  {
    en: 'Production and Operating Expenses',
    ar: 'مصاريف تشغيلية وإنتاجية',
    type: 'expense',
    group: 'production_operating',
    children: [
      {
        en: 'Salaries, wages, and related expenses (P&O)',
        ar: 'رواتب وأجور — تشغيلية',
        children: [
          { en: 'Salaries (P&O)', ar: 'رواتب وأجور — تشغيلية', children: salaryLeaves('P&O', 'تشغيلية') },
        ],
      },
      {
        en: 'Outsourced Operational Services Expenses',
        ar: 'خدمات تشغيلية خارجية',
        children: [
          {
            en: 'Outsourced Operational Services',
            ar: 'خدمات تشغيلية خارجية',
            children: [
              leaf(
                'Outsourced Operational - Translation',
                'تشغيل خارجي — ترجمة',
                'exp_outsourced_translation'
              ),
              leaf('Outsourced Operational - Revision', 'تشغيل خارجي — مراجعة'),
              leaf('Outsourced Operational - Proofreading', 'تشغيل خارجي — تدقيق'),
              leaf('Outsourced Operational - Arbitration', 'تشغيل خارجي — تحكيم'),
              leaf('Outsourced Operational - Desktop Publishing', 'تشغيل خارجي — نشر مكتبي'),
              leaf('Outsourced Operational - Design', 'تشغيل خارجي — تصميم'),
              leaf('Outsourced Operational - Audio transcription', 'تشغيل خارجي — تفريغ صوتي'),
            ],
          },
        ],
      },
      {
        en: 'Other Production and Operating Expenses',
        ar: 'مصاريف تشغيلية أخرى',
        children: [
          {
            en: 'Other Production and Operating',
            ar: 'مصاريف تشغيلية أخرى',
            children: [
              leaf('Software and Auxiliary Tools Fees', 'رسوم البرامج والأدوات المساعدة'),
              leaf('Operational Consultancy Expenses', 'استشارات تشغيلية'),
              leaf('Purchase Registration and Fees', 'رسوم تسجيل وشراء الأدوات'),
            ],
          },
        ],
      },
    ],
  },
];

/** مراكز التكلفة كما في الدفاتر — تُعدَّل من الشاشة بعد الزرع */
export const SEED_COST_CENTERS = [
  { name: 'غير محدد', project: 'غير محدد' },
  { name: 'عملاء عامون', project: 'مشروع عام' },
  { name: 'Islam House', project: 'Islam House' },
  { name: 'مركز سلام', project: 'حقيبة سلام' },
  { name: 'جمعية التبيان', project: 'مشروع المسجد الحرام' },
  { name: 'عميل استراتيجي', project: 'مشروع استراتيجي' },
  { name: 'مؤسسة الزلفي', project: 'أبو الهيثم ١' },
];

/** نسب إهلاك أنواع الأصول — من جدول الإهلاك الفعلي */
export const DEPRECIATION_RATES: { category: string; label: string; rate: number }[] = [
  { category: 'computers', label: 'أجهزة حاسب وبرمجيات', rate: 0.25 },
  { category: 'air_conditioning', label: 'وحدات تكييف', rate: 0.5 },
  { category: 'appliances', label: 'أجهزة كهربائية', rate: 0.25 },
  { category: 'telephony', label: 'أنظمة هاتف ومراقبة', rate: 0.25 },
  { category: 'printers', label: 'ماكينات تصوير وطباعة', rate: 0.25 },
  { category: 'generator', label: 'مولد كهربائي', rate: 0.25 },
  { category: 'furniture', label: 'أثاث وتجهيزات', rate: 0.25 },
];
