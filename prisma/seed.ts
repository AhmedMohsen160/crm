/**
 * بيانات البداية — تنشئ حساب المدير وبعض البيانات التجريبية
 * تشغيل:  npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@fasttrans.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

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

  const admin = await db.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      name: 'أحمد محسن',
      email: ADMIN_EMAIL,
      passwordHash: adminHash,
      role: 'ADMIN',
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
      role: 'MANAGER',
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
      role: 'AGENT',
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

  // ── العملاء المحتملون ───────────────────────────────────────
  await db.lead.createMany({
    data: [
      {
        firstName: 'منى',
        lastName: 'الشريف',
        companyName: 'شركة الأمل للمقاولات',
        email: 'mona@alamal-const.com',
        phone: '+20 155 666 7777',
        source: 'الموقع الإلكتروني',
        status: 'NEW',
        serviceInterest: 'ترجمة قانونية',
        sourceLang: 'العربية',
        targetLang: 'الإنجليزية',
        estimatedValue: 8500,
        notes: 'تحتاج ترجمة عقود مقاولات — حوالي 40 صفحة.',
        ownerId: agent.id,
      },
      {
        firstName: 'عمر',
        lastName: 'فاروق',
        companyName: 'أكاديمية المستقبل',
        email: 'omar@future-academy.edu.eg',
        phone: '+20 111 222 3333',
        source: 'توصية عميل',
        status: 'CONTACTED',
        serviceInterest: 'توطين محتوى',
        sourceLang: 'الإنجليزية',
        targetLang: 'العربية',
        estimatedValue: 22000,
        notes: 'توطين منصة تعليمية كاملة. اجتماع مبدئي تم.',
        ownerId: manager.id,
      },
      {
        firstName: 'Sophie',
        lastName: 'Martin',
        companyName: 'TravelWise Tours',
        email: 'sophie@travelwise.fr',
        source: 'لينكدإن',
        status: 'QUALIFIED',
        serviceInterest: 'ترجمة تقنية',
        sourceLang: 'الفرنسية',
        targetLang: 'العربية',
        estimatedValue: 15000,
        notes: 'ترجمة دليل سياحي + موقع إلكتروني.',
        ownerId: admin.id,
      },
      {
        firstName: 'يوسف',
        lastName: 'الغامدي',
        companyName: 'مجموعة الرياض الطبية',
        phone: '+966 50 123 4567',
        source: 'معرض / فعالية',
        status: 'NEW',
        serviceInterest: 'ترجمة طبية',
        sourceLang: 'الإنجليزية',
        targetLang: 'العربية',
        estimatedValue: 30000,
        ownerId: agent.id,
      },
    ],
  });
  console.log('✓ 4 عملاء محتملين');

  // ── الصفقات ─────────────────────────────────────────────────
  const deal1 = await db.deal.create({
    data: {
      title: 'ترجمة معتمدة لعقود شراكة دولية',
      description: 'ترجمة 12 عقد شراكة من العربية إلى الإنجليزية مع اعتماد رسمي.',
      stage: 'NEGOTIATION',
      amount: 45000,
      currency: 'EGP',
      probability: 75,
      serviceType: 'ترجمة قانونية',
      sourceLang: 'العربية',
      targetLang: 'الإنجليزية',
      wordCount: 30000,
      pageCount: 120,
      deliveryDate: daysFromNow(21),
      expectedCloseDate: daysFromNow(7),
      companyId: lawFirm.id,
      contactId: contact1.id,
      ownerId: manager.id,
    },
  });

  const deal2 = await db.deal.create({
    data: {
      title: 'ترجمة تقارير طبية وتحاليل',
      description: 'ترجمة تقارير طبية للمرضى الدوليين — عمل شهري متكرر.',
      stage: 'QUOTED',
      amount: 18000,
      currency: 'EGP',
      probability: 50,
      serviceType: 'ترجمة طبية',
      sourceLang: 'العربية',
      targetLang: 'الإنجليزية',
      wordCount: 12000,
      expectedCloseDate: daysFromNow(14),
      companyId: hospital.id,
      contactId: contact2.id,
      ownerId: agent.id,
    },
  });

  const deal3 = await db.deal.create({
    data: {
      title: 'ترجمة معتمدة لوثائق التأشيرات',
      description: 'ترجمة شهادات ميلاد وعقود زواج ومؤهلات — ألماني/عربي.',
      stage: 'WON',
      amount: 62000,
      currency: 'EGP',
      probability: 100,
      serviceType: 'ترجمة معتمدة',
      sourceLang: 'الألمانية',
      targetLang: 'العربية',
      pageCount: 240,
      closedAt: new Date(),
      deliveryDate: daysFromNow(10),
      companyId: embassy.id,
      contactId: contact3.id,
      ownerId: admin.id,
    },
  });

  await db.deal.create({
    data: {
      title: 'ترجمة فورية لمؤتمر طبي',
      stage: 'NEW',
      amount: 25000,
      currency: 'EGP',
      probability: 20,
      serviceType: 'ترجمة فورية',
      sourceLang: 'الإنجليزية',
      targetLang: 'العربية',
      expectedCloseDate: daysFromNow(30),
      companyId: hospital.id,
      contactId: contact2.id,
      ownerId: agent.id,
    },
  });
  console.log('✓ 4 صفقات');

  // ── المهام ──────────────────────────────────────────────────
  await db.task.createMany({
    data: [
      {
        title: 'الاتصال بالأستاذ خالد لمتابعة التفاوض على السعر',
        type: 'CALL',
        priority: 'HIGH',
        status: 'OPEN',
        dueDate: daysFromNow(1),
        dealId: deal1.id,
        assigneeId: manager.id,
        creatorId: admin.id,
      },
      {
        title: 'إرسال عينة ترجمة طبية للعميل',
        type: 'EMAIL',
        priority: 'NORMAL',
        status: 'IN_PROGRESS',
        dueDate: daysFromNow(2),
        dealId: deal2.id,
        assigneeId: agent.id,
        creatorId: manager.id,
      },
      {
        title: 'تجهيز الفاتورة النهائية للسفارة',
        type: 'TODO',
        priority: 'URGENT',
        status: 'OPEN',
        dueDate: daysFromNow(-1), // مهمة متأخرة كمثال
        dealId: deal3.id,
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
        dealId: deal2.id,
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
        dealId: deal1.id,
        authorId: manager.id,
      },
      {
        body: 'تم إرسال عرض السعر بتاريخ اليوم. المتابعة بعد 3 أيام عمل.',
        dealId: deal2.id,
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
        dealId: deal1.id,
      },
      {
        type: 'STAGE_CHANGED',
        title: 'تغيّرت مرحلة الصفقة',
        detail: 'أُرسل عرض السعر ← تفاوض',
        userId: manager.id,
        dealId: deal1.id,
      },
      {
        type: 'STAGE_CHANGED',
        title: 'تغيّرت مرحلة الصفقة',
        detail: 'تفاوض ← تم الفوز',
        userId: admin.id,
        dealId: deal3.id,
      },
    ],
  });
  console.log('✓ ملاحظات وسجل نشاط\n');

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
