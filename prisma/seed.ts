/**
 * بيانات تجريبية للتطوير المحلي فقط.
 *
 * ⚠️ الأساس (الأدوار والقوائم والإعدادات وحساب المدير) يزرعه
 * `npm run bootstrap` — شغّله أولًا. هذا الملف يضيف فوقه شركات وصفقات
 * وهمية لتجربة الشاشات، ولا يُشغَّل على السيرفر.
 *
 * تشغيل:  npm run bootstrap && npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { normalizePhone } from '../src/lib/phone';
import { yearMonth } from '../src/lib/sequence-keys';

const db = new PrismaClient();
const period = yearMonth();
const now = new Date();
const revenueMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@fasttrans.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

/** يجلب معرّف دور بمفتاحه — يفشل بوضوح إن لم يُزرع الأساس */
async function roleId(name: string): Promise<string> {
  const role = await db.role.findUnique({ where: { name }, select: { id: true } });
  if (!role) {
    throw new Error(
      `الدور «${name}» غير موجود. شغّل «npm run bootstrap» أولًا لزرع الأساس.`
    );
  }
  return role.id;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d;
}

async function main() {
  console.log('🌱 جارٍ تجهيز البيانات...\n');

  // ── المستخدمون ──────────────────────────────────────────────
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const [systemAdminRole, salesManagerRole, salesAdminRole] = await Promise.all([
    roleId('system_admin'),
    roleId('sales_manager'),
    roleId('sales_admin'),
  ]);

  const admin = await db.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      name: 'أحمد محسن',
      email: ADMIN_EMAIL,
      passwordHash: adminHash,
      roleId: systemAdminRole,
      jobTitle: 'مدير المكتب',
    },
  });
  console.log(`✓ حساب المدير: ${ADMIN_EMAIL}`);

  const manager = await db.user.upsert({
    where: { email: 'manager@fasttrans.local' },
    update: {},
    create: {
      name: 'سارة عبد الله',
      email: 'manager@fasttrans.local',
      passwordHash: await bcrypt.hash('ChangeMe123!', 10),
      roleId: salesManagerRole,
      branch: 'mokattam',
      jobTitle: 'مدير المبيعات',
    },
  });

  const agent = await db.user.upsert({
    where: { email: 'agent@fasttrans.local' },
    update: {},
    create: {
      name: 'محمد إبراهيم',
      email: 'agent@fasttrans.local',
      passwordHash: await bcrypt.hash('ChangeMe123!', 10),
      roleId: salesAdminRole,
      branch: 'mokattam',
      reportsToId: manager.id,
      jobTitle: 'أخصائي مبيعات',
    },
  });
  console.log('✓ مستخدمو الفريق التجريبيون\n');

  // لا نضيف بيانات تجريبية إن كانت قاعدة البيانات مستخدمة بالفعل
  const existingCompanies = await db.company.count();
  if (existingCompanies > 0) {
    console.log('ℹ توجد بيانات بالفعل — تم تخطي البيانات التجريبية.');
    return;
  }

  // ── الشركات ─────────────────────────────────────────────────
  const lawFirm = await db.company.create({
    data: {
      name: 'Al-Nour Legal Consultants',
      nameAr: 'مكتب النور للاستشارات القانونية',
      industry: 'مكاتب محاماة',
      email: 'info@alnour-legal.com',
      phone: '+20 2 2345 6789',
      country: 'مصر',
      city: 'القاهرة',
      address: '15 شارع طلعت حرب، وسط البلد',
      taxNumber: '123-456-789',
      paymentTerms: '50% مقدم — الباقي عند التسليم',
      ownerId: manager.id,
    },
  });

  const hospital = await db.company.create({
    data: {
      name: 'Dar Al-Shifa Medical Center',
      nameAr: 'مركز دار الشفاء الطبي',
      industry: 'قطاع طبي',
      email: 'admin@darshifa.com',
      phone: '+20 2 3456 7890',
      country: 'مصر',
      city: 'الجيزة',
      paymentTerms: 'الدفع خلال 30 يومًا',
      ownerId: agent.id,
    },
  });

  const embassy = await db.company.create({
    data: {
      name: 'Embassy of Germany — Cairo',
      nameAr: 'السفارة الألمانية بالقاهرة',
      industry: 'سفارات وقنصليات',
      email: 'info@kairo.diplo.de',
      country: 'مصر',
      city: 'القاهرة',
      paymentTerms: 'دفع فوري عند التسليم',
      ownerId: admin.id,
    },
  });
  console.log('✓ 3 شركات');

  // ── جهات الاتصال ────────────────────────────────────────────
  const contact1 = await db.contact.create({
    data: {
      firstName: 'خالد',
      lastName: 'المنصوري',
      jobTitle: 'مدير الشؤون القانونية',
      email: 'k.mansouri@alnour-legal.com',
      mobile: '+20 100 111 2222',
      language: 'العربية',
      companyId: lawFirm.id,
      ownerId: manager.id,
    },
  });

  const contact2 = await db.contact.create({
    data: {
      firstName: 'ليلى',
      lastName: 'حسن',
      jobTitle: 'مسؤولة العلاقات الدولية',
      email: 'l.hassan@darshifa.com',
      mobile: '+20 122 333 4444',
      language: 'الإنجليزية',
      companyId: hospital.id,
      ownerId: agent.id,
    },
  });

  const contact3 = await db.contact.create({
    data: {
      firstName: 'Thomas',
      lastName: 'Weber',
      jobTitle: 'Consular Officer',
      email: 't.weber@kairo.diplo.de',
      phone: '+20 2 7288 2000',
      language: 'الألمانية',
      companyId: embassy.id,
      ownerId: admin.id,
    },
  });
  console.log('✓ 3 جهات اتصال');

  // ── العملاء والليدز ─────────────────────────────────────────
  // كل ليد يمرّ بالمسار الحقيقي: عميل بهاتف مطبَّع أولًا، ثم ليد مربوط به.
  const demoLeads = [
    {
      firstName: 'منى',
      lastName: 'الشريف',
      companyName: 'شركة الأمل للمقاولات',
      email: 'mona@alamal-const.com',
      phone: '01556667777',
      channel: 'website',
      contactMethod: 'whatsapp',
      status: 'NEW',
      serviceInterest: 'legal',
      sourceLang: 'ar',
      targetLang: 'en',
      estPages: 40,
      estimatedValue: 8500,
      notes: 'تحتاج ترجمة عقود مقاولات — حوالي 40 صفحة.',
      branch: 'mokattam',
      ownerId: agent.id,
    },
    {
      firstName: 'عمر',
      lastName: 'فاروق',
      companyName: 'أكاديمية المستقبل',
      email: 'omar@future-academy.edu.eg',
      phone: '01112223333',
      channel: 'referral',
      contactMethod: 'call',
      status: 'CONTACTED',
      serviceInterest: 'marketing',
      sourceLang: 'en',
      targetLang: 'ar',
      estimatedValue: 22000,
      notes: 'توطين منصة تعليمية كاملة. اجتماع مبدئي تم.',
      branch: 'mokattam',
      ownerId: manager.id,
    },
    {
      firstName: 'Sophie Martin',
      lastName: null,
      companyName: 'TravelWise Tours',
      email: 'sophie@travelwise.fr',
      phone: '01098765432',
      channel: 'organic',
      contactMethod: 'email',
      status: 'NEGOTIATION',
      serviceInterest: 'technical',
      sourceLang: 'fr',
      targetLang: 'ar',
      estimatedValue: 15000,
      notes: 'ترجمة دليل سياحي + موقع إلكتروني.',
      branch: 'mohandessin',
      ownerId: admin.id,
    },
    {
      firstName: 'يوسف الغامدي',
      lastName: null,
      companyName: 'مجموعة الرياض الطبية',
      email: null,
      phone: '966501234567',
      channel: 'walk_in',
      contactMethod: 'office',
      status: 'NEW',
      serviceInterest: 'medical',
      sourceLang: 'en',
      targetLang: 'ar',
      estimatedValue: 30000,
      notes: null,
      branch: 'riyadh',
      ownerId: agent.id,
    },
  ];

  for (const [index, item] of demoLeads.entries()) {
    const normalized = normalizePhone(item.phone);
    const client = await db.client.upsert({
      where: { phoneNormalized: normalized.value },
      update: {},
      create: {
        code: `CL-${String(index + 1).padStart(5, '0')}`,
        name: item.firstName,
        phone: item.phone,
        phoneNormalized: normalized.value,
        email: item.email,
        type: item.companyName ? 'company' : 'individual',
        companyName: item.companyName,
        firstBranch: item.branch,
        createdById: item.ownerId,
        ownerId: item.ownerId,
      },
    });

    await db.lead.create({
      data: {
        ...item,
        code: `LD-${period}-${String(index + 1).padStart(4, '0')}`,
        clientId: client.id,
        firstReplyAt: item.status === 'NEW' ? null : new Date(),
      },
    });
  }
  // العدّادات تلحق بما زرعناه، وإلا اصطدم أول سجل يُنشأ من الشاشة بمعرّف موجود
  await db.counter.upsert({
    where: { key: 'client' },
    update: { value: demoLeads.length },
    create: { key: 'client', value: demoLeads.length },
  });
  await db.counter.upsert({
    where: { key: `lead-${period}` },
    update: { value: demoLeads.length },
    create: { key: `lead-${period}`, value: demoLeads.length },
  });
  console.log('✓ 4 عملاء و4 ليدز');

  // ── المشاريع ────────────────────────────────────────────────
  // واحد في كل حالة رئيسية، ليختبر لوحة التشغيل والاعتراف بالإيراد
  const deal1 = await db.project.create({
    data: {
      code: `PR-${period}-0001`,
      title: 'ترجمة معتمدة لعقود شراكة دولية',
      description: 'ترجمة 12 عقد شراكة من العربية إلى الإنجليزية مع اعتماد رسمي.',
      status: 'in_progress',
      netTotal: 45000,
      currency: 'EGP',
      serviceLine: 'legal',
      sourceLang: 'ar',
      targetLang: 'en',
      wordCount: 30000,
      pages: 120,
      deposit: 22500,
      workMode: 'human_full',
      deadline: daysFromNow(21),
      branch: 'mokattam',
      convertedAt: new Date(),
      assignedAt: new Date(),
      companyId: lawFirm.id,
      contactId: contact1.id,
      projectManagerId: admin.id,
      primaryProducerId: admin.id,
      ownerId: manager.id,
    },
  });

  const deal2 = await db.project.create({
    data: {
      code: `PR-${period}-0002`,
      title: 'ترجمة تقارير طبية وتحاليل',
      description: 'ترجمة تقارير طبية للمرضى الدوليين — عمل شهري متكرر.',
      status: 'pending_assignment',
      netTotal: 18000,
      currency: 'EGP',
      serviceLine: 'medical',
      sourceLang: 'ar',
      targetLang: 'en',
      wordCount: 12000,
      pages: 48,
      deposit: 9000,
      deadline: daysFromNow(14),
      branch: 'mokattam',
      convertedAt: new Date(),
      companyId: hospital.id,
      contactId: contact2.id,
      ownerId: agent.id,
    },
  });

  // سُلّم ولم يُحصَّل بالكامل — يظهر في «مستحق على العملاء»
  const deal3 = await db.project.create({
    data: {
      code: `PR-${period}-0003`,
      title: 'ترجمة معتمدة لوثائق التأشيرات',
      description: 'ترجمة شهادات ميلاد وعقود زواج ومؤهلات — ألماني/عربي.',
      status: 'delivered',
      netTotal: 62000,
      currency: 'EGP',
      serviceLine: 'certified',
      sourceLang: 'de',
      targetLang: 'ar',
      pages: 240,
      deposit: 31000,
      workMode: 'human_full',
      deadline: daysFromNow(10),
      branch: 'mohandessin',
      convertedAt: new Date(),
      assignedAt: new Date(),
      deliveredAt: new Date(),
      revenueMonth: revenueMonth,
      companyId: embassy.id,
      contactId: contact3.id,
      projectManagerId: admin.id,
      primaryProducerId: admin.id,
      ownerId: admin.id,
    },
  });

  // ملغى — يبقى في اللوحة التشغيلية وخارج كل تقرير مالي (اختبار ١٣)
  await db.project.create({
    data: {
      code: `PR-${period}-0004`,
      title: 'ترجمة فورية لمؤتمر طبي',
      status: 'cancelled',
      netTotal: 25000,
      currency: 'EGP',
      serviceLine: 'general',
      sourceLang: 'en',
      targetLang: 'ar',
      pages: 1,
      cancelReason: 'العميل أجّل المؤتمر',
      closedAt: new Date(),
      branch: 'mokattam',
      convertedAt: new Date(),
      companyId: hospital.id,
      contactId: contact2.id,
      ownerId: agent.id,
    },
  });

  await db.counter.upsert({
    where: { key: `project-${period}` },
    update: { value: 4 },
    create: { key: `project-${period}`, value: 4 },
  });
  console.log('✓ 4 مشاريع');

  // ── تكلفة الموظفين ──────────────────────────────────────────
  // بلا هذه القيم تكون كل التكاليف صفرًا وتظهر تنبيهات مفتوحة
  await db.user.updateMany({
    where: { email: { in: [ADMIN_EMAIL, 'agent@fasttrans.local'] } },
    data: { isProducer: true },
  });
  for (const [email, salary] of [
    [ADMIN_EMAIL, 18000],
    ['agent@fasttrans.local', 12000],
  ] as [string, number][]) {
    const person = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (!person) continue;
    await db.staffCost.upsert({
      where: { userId: person.id },
      update: {},
      create: {
        userId: person.id,
        monthlySalary: salary,
        productiveRatio: 0.7,
        dailyCapacity: 4,
      },
    });
  }
  console.log('✓ تكلفة منتِجَين');

  // ── قائمة أسعار ابتدائية ────────────────────────────────────
  // بلا بنود لا يعمل التسعير التلقائي وتُدخَل الأسعار يدويًا في كل مشروع
  const lastYear = new Date(now.getFullYear() - 1, 0, 1);
  const prices: [string, string, string, number][] = [
    ['certified', 'ar', 'en', 120],
    ['certified', 'en', 'ar', 120],
    ['legal', 'ar', 'en', 180],
    ['legal', 'en', 'ar', 180],
    ['medical', 'en', 'ar', 200],
    ['technical', 'fr', 'ar', 190],
    ['general', 'ar', 'en', 90],
    ['general', 'en', 'ar', 90],
  ];
  for (const [serviceLine, langFrom, langTo, unitPrice] of prices) {
    const exists = await db.priceListItem.findFirst({
      where: { serviceLine, langFrom, langTo },
    });
    if (exists) continue;
    await db.priceListItem.create({
      data: { serviceLine, langFrom, langTo, unitPrice, effectiveFrom: lastYear },
    });
  }
  console.log(`✓ ${prices.length} بند سعر`);

  // ── المهام ──────────────────────────────────────────────────
  await db.task.createMany({
    data: [
      {
        title: 'الاتصال بالأستاذ خالد لمتابعة التفاوض على السعر',
        type: 'CALL',
        priority: 'HIGH',
        status: 'OPEN',
        dueDate: daysFromNow(1),
        projectId: deal1.id,
        assigneeId: manager.id,
        creatorId: admin.id,
      },
      {
        title: 'إرسال عينة ترجمة طبية للعميل',
        type: 'EMAIL',
        priority: 'NORMAL',
        status: 'IN_PROGRESS',
        dueDate: daysFromNow(2),
        projectId: deal2.id,
        assigneeId: agent.id,
        creatorId: manager.id,
      },
      {
        title: 'تجهيز الفاتورة النهائية للسفارة',
        type: 'TODO',
        priority: 'URGENT',
        status: 'OPEN',
        dueDate: daysFromNow(-1), // مهمة متأخرة كمثال
        projectId: deal3.id,
        assigneeId: admin.id,
        creatorId: admin.id,
      },
      {
        title: 'اجتماع مراجعة المشروع مع فريق الترجمة',
        type: 'MEETING',
        priority: 'NORMAL',
        status: 'OPEN',
        dueDate: daysFromNow(4),
        companyId: lawFirm.id,
        assigneeId: manager.id,
        creatorId: admin.id,
      },
      {
        title: 'متابعة عرض السعر المرسل للمركز الطبي',
        type: 'FOLLOW_UP',
        priority: 'HIGH',
        status: 'OPEN',
        dueDate: daysFromNow(3),
        projectId: deal2.id,
        assigneeId: agent.id,
        creatorId: manager.id,
      },
    ],
  });
  console.log('✓ 5 مهام');

  // ── ملاحظات ─────────────────────────────────────────────────
  await db.note.createMany({
    data: [
      {
        body: 'العميل يطلب خصم 10% مقابل التعاقد السنوي. أرى أن نوافق مع تثبيت الكمية الشهرية.',
        projectId: deal1.id,
        authorId: manager.id,
      },
      {
        body: 'تم إرسال عرض السعر بتاريخ اليوم. المتابعة بعد 3 أيام عمل.',
        projectId: deal2.id,
        authorId: agent.id,
      },
    ],
  });

  // ── سجل النشاط ──────────────────────────────────────────────
  await db.activity.createMany({
    data: [
      {
        type: 'CREATED',
        title: 'تم إنشاء صفقة',
        detail: deal1.title,
        userId: manager.id,
        projectId: deal1.id,
      },
      {
        type: 'STAGE_CHANGED',
        title: 'تغيّرت مرحلة الصفقة',
        detail: 'أُرسل عرض السعر ← تفاوض',
        userId: manager.id,
        projectId: deal1.id,
      },
      {
        type: 'STAGE_CHANGED',
        title: 'تغيّرت مرحلة الصفقة',
        detail: 'تفاوض ← تم الفوز',
        userId: admin.id,
        projectId: deal3.id,
      },
    ],
  });
  console.log('✓ ملاحظات وسجل نشاط\n');

  // ── ألف فريلانسر لاختبار الحجم الحقيقي (§١١ واختبار ٢١) ──────
  // المواصفة تنص: «الحجم المتوقع حتى 1000 مترجم» — ومحرّك الاختيار
  // يجب أن يبقى فوريًا عندها. نزرعهم مرة واحدة إن كان السجل فارغًا.
  if ((await db.freelancer.count()) === 0) {
    const FIRST = ['أحمد','محمد','سارة','نورا','خالد','مريم','يوسف','هدى','عمر','ليلى',
      'حسن','منى','طارق','دينا','كريم','رانيا','سامي','ياسمين','أنس','فاطمة'];
    const LAST = ['حمدان','السيد','عبد الله','مصطفى','فؤاد','شاكر','الجندي','نصر',
      'الشريف','زكي','بدوي','قاسم','عثمان','الحلبي','مرسي','سليم'];
    const LANGS = ['en','fr','de','it','es','tr','ru','zh'];
    const LINES = ['legal','medical','technical','financial','general','marketing'];

    const bulk = Array.from({ length: 1000 }, (_, i) => {
      const first = FIRST[i % FIRST.length];
      const last = LAST[(i * 7) % LAST.length];
      const langCount = 1 + (i % 3);
      const langs = ['ar', ...Array.from({ length: langCount }, (_, k) => LANGS[(i + k) % LANGS.length])];
      return {
        code: `FL-${String(i + 1).padStart(4, '0')}`,
        name: `${first} ${last} ${i + 1}`,
        phone: `2010${String(10000000 + i).slice(-8)}`,
        langs: [...new Set(langs)].sort().join(','),
        specialisations: LINES[i % LINES.length],
        // ٪١٠ بلا سعر — «لم يُتفق» لا «مجانًا»، ليُختبر التنبيه
        defaultRate: i % 10 === 0 ? null : 60 + (i % 40) * 5,
        rateUnit: i % 50 === 0 ? 'hour' : 'page',
        currency: 'EGP',
        // ٢١ معتمدًا كما في تبويب «الأهم المستمرين» بالمصدر
        tier: i < 21 ? 'approved' : i % 17 === 0 ? 'trial' : 'bench',
        rating: i % 11 === 0 ? null : 4 + (i % 7),
        projectsCount: (i * 3) % 25,
      };
    });

    await db.freelancer.createMany({ data: bulk });
    await db.counter.upsert({
      where: { key: 'freelancer' },
      update: { value: 1000 },
      create: { key: 'freelancer', value: 1000 },
    });
    console.log('✓ ١٠٠٠ فريلانسر للاختبار الحجمي\n');
  }

  console.log('═══════════════════════════════════════');
  console.log('  ✅ تم التجهيز بنجاح');
  console.log('═══════════════════════════════════════');
  console.log(`  البريد   : ${ADMIN_EMAIL}`);
  console.log(`  كلمة السر: ${ADMIN_PASSWORD}`);
  console.log('═══════════════════════════════════════');
  console.log('  ⚠  غيّر كلمة المرور فور أول دخول');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ فشل التجهيز:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
