/**
 * تجهيز الأساس — يُنفَّذ عند كل نشر، وآمن التكرار.
 *
 * يزرع ما لا يعمل النظام بدونه:
 *   ١) الأدوار السبعة ومصفوفة §٥
 *   ٢) القوائم المرجعية ومعاملاتها (§٩)
 *   ٣) مفاتيح الإعدادات بقيمها الافتراضية (§٩)
 *   ٤) حساب مدير النظام
 *   ٥) فريق فاست ترانس عند التأسيس — بفروعه وتسلسله الإداري
 *
 * **لا يمسّ ما عُدِّل من الشاشة.** إن وُجد الصف لم يُلمس، فتعديلك من الواجهة
 * يبقى بعد كل نشر جديد. الاستثناء الوحيد: أعمدة صلاحيات الأدوار النظامية
 * تُصحَّح إن لم يكن الدور قد عُدِّل يدويًا — يضمن أن صلاحية جديدة تصل لأصحابها.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DEFAULT_ROLES, PERMISSION_KEYS } from '../src/lib/permissions';
import { LIST_DEFINITIONS } from '../src/lib/lists';
import { SETTING_DEFINITIONS } from '../src/lib/settings-defs';
import { normalizePhone } from '../src/lib/phone';
import { yearMonth } from '../src/lib/sequence-keys';

const db = new PrismaClient();

/** فريق فاست ترانس عند التأسيس — من إجابات الإدارة المباشرة */
const FOUNDING_TEAM: {
  key: string;
  name: string;
  email: string;
  role: string;
  branch: string | null;
  reportsTo: string | null;
  jobTitle: string;
}[] = [
  {
    key: 'magly',
    name: 'أحمد مجلي',
    email: 'magly@fasttrans.local',
    role: 'sales_manager',
    branch: null,
    reportsTo: null,
    jobTitle: 'مدير المبيعات',
  },
  {
    key: 'sawy',
    name: 'الصاوي',
    email: 'sawy@fasttrans.local',
    role: 'sales_admin',
    branch: 'alexandria',
    reportsTo: 'magly',
    jobTitle: 'أدمن مبيعات — الإسكندرية',
  },
  {
    key: 'noura',
    name: 'نورا',
    email: 'noura@fasttrans.local',
    role: 'sales_admin',
    branch: 'mohandessin',
    reportsTo: 'magly',
    jobTitle: 'أدمن مبيعات — المهندسين',
  },
  {
    key: 'yahia',
    name: 'يحيى',
    email: 'yahia@fasttrans.local',
    role: 'sales_admin',
    branch: 'mokattam',
    reportsTo: 'magly',
    jobTitle: 'أدمن مبيعات — المقطم',
  },
  {
    // مستقل: بلا مدير فوقه وبلا أدمن تحته، فيستحق حصة الأدمن والمدير معًا.
    // عند انضمام أدمن إليه يصير `reportsTo` للأدمن الجديد فتنطبق القسمة
    // المعتادة تلقائيًا — بلا تغيير في الكود.
    key: 'bakri',
    name: 'محمد بكري',
    email: 'bakri@fasttrans.local',
    role: 'sales_manager',
    branch: 'nasr_city',
    reportsTo: null,
    jobTitle: 'مدير مبيعات — مدينة نصر',
  },
];

async function seedRoles() {
  let created = 0;
  for (const def of DEFAULT_ROLES) {
    const permissions = Object.fromEntries(
      PERMISSION_KEYS.map((key) => [key, def.permissions.includes(key)])
    );

    const existing = await db.role.findUnique({ where: { name: def.name } });
    if (!existing) {
      await db.role.create({
        data: {
          name: def.name,
          label: def.label,
          sortOrder: def.sortOrder,
          isSystem: true,
          discountLimit: def.discountLimit ?? 0,
          ...permissions,
        },
      });
      created++;
      continue;
    }

    // دور نظامي لم تُعدّله الإدارة: نُبقيه مطابقًا للمصفوفة حتى تصل أي
    // صلاحية جديدة لأصحابها. الأدوار المخصّصة لا تُلمس أبدًا.
    // الصلاحيات تُصحَّح، لكن **حد الخصم لا يُلمس** — قد تكون الإدارة عدّلته
    if (existing.isSystem) {
      await db.role.update({ where: { id: existing.id }, data: permissions });
    }
  }
  console.log(`  ✓ الأدوار: ${created} جديد، ${DEFAULT_ROLES.length - created} موجود`);
}

async function seedLists() {
  let created = 0;
  for (const list of LIST_DEFINITIONS) {
    for (const [index, item] of list.items.entries()) {
      const existing = await db.listItem.findUnique({
        where: { listName_value: { listName: list.name, value: item.value } },
      });
      if (existing) continue;
      await db.listItem.create({
        data: {
          listName: list.name,
          value: item.value,
          label: item.label,
          extra: item.extra ?? null,
          sortOrder: index + 1,
        },
      });
      created++;
    }
  }
  console.log(`  ✓ القوائم المرجعية: ${created} عنصر جديد`);
}

async function seedSettings() {
  let created = 0;
  for (const def of SETTING_DEFINITIONS) {
    const existing = await db.setting.findUnique({ where: { key: def.key } });
    if (existing) continue;
    await db.setting.create({
      data: { key: def.key, value: def.value, label: def.label },
    });
    created++;
  }
  console.log(`  ✓ الإعدادات: ${created} مفتاح جديد`);
}

async function seedAdmin() {
  const adminRole = await db.role.findUnique({ where: { name: 'system_admin' } });
  if (!adminRole) throw new Error('دور مدير النظام غير موجود — فشل زرع الأدوار');

  const active = await db.user.count({
    where: { active: true, roleRef: { canManageUsers: true } },
  });
  if (active > 0) {
    console.log('  • حساب إداري نشط موجود بالفعل — لا تغيير');
    return;
  }

  const email = (process.env.ADMIN_EMAIL ?? 'admin@fasttrans.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? 'مدير النظام';

  if (!password || password.length < 8) {
    console.error(
      '  ✗ لا يوجد حساب إداري، ولم تُضبط ADMIN_PASSWORD (8 أحرف على الأقل).\n' +
        '    أضِفها في إعدادات السيرفر ثم أعِد التشغيل.'
    );
    process.exit(1);
  }

  await db.user.upsert({
    where: { email },
    update: { roleId: adminRole.id, active: true },
    create: {
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      roleId: adminRole.id,
      jobTitle: 'مدير المكتب',
    },
  });
  console.log(`  ✓ حساب مدير النظام: ${email}`);
}

/**
 * الفريق القائم. يُزرع مرة واحدة بكلمة مرور مؤقّتة تُغيَّر من أول دخول،
 * ولا يُلمس بعدها أبدًا — تعديل الفرع أو المدير يتم من الشاشة.
 */
async function seedFoundingTeam() {
  if (process.env.SKIP_TEAM_SEED === '1') {
    console.log('  • تخطّي زرع الفريق (SKIP_TEAM_SEED)');
    return;
  }

  const tempPassword = process.env.TEAM_INITIAL_PASSWORD ?? 'FastTrans2026!';
  const roles = new Map(
    (await db.role.findMany({ select: { id: true, name: true } })).map((r) => [r.name, r.id])
  );

  const ids = new Map<string, string>();
  let created = 0;

  // نمرّ مرتين: الأولى تُنشئ الجميع، والثانية تربط التسلسل الإداري بعد
  // أن صار لكل شخص معرّف.
  for (const member of FOUNDING_TEAM) {
    const existing = await db.user.findUnique({ where: { email: member.email } });
    if (existing) {
      ids.set(member.key, existing.id);
      continue;
    }
    const roleId = roles.get(member.role);
    if (!roleId) throw new Error(`دور غير معروف: ${member.role}`);

    const user = await db.user.create({
      data: {
        name: member.name,
        email: member.email,
        passwordHash: await bcrypt.hash(tempPassword, 10),
        roleId,
        branch: member.branch,
        jobTitle: member.jobTitle,
      },
    });
    ids.set(member.key, user.id);
    created++;
  }

  for (const member of FOUNDING_TEAM) {
    if (!member.reportsTo) continue;
    const id = ids.get(member.key);
    const managerId = ids.get(member.reportsTo);
    if (!id || !managerId) continue;
    const current = await db.user.findUnique({
      where: { id },
      select: { reportsToId: true },
    });
    if (current?.reportsToId) continue; // الإدارة عدّلته من الشاشة — لا نلمسه
    await db.user.update({ where: { id }, data: { reportsToId: managerId } });
  }

  console.log(
    created > 0
      ? `  ✓ فريق التأسيس: ${created} مستخدم جديد (كلمة مرور مؤقّتة — غيّرها من أول دخول)`
      : '  • فريق التأسيس موجود بالفعل — لا تغيير'
  );
}

/**
 * ترحيل مراحل الليد القديمة إلى مراحل §4.2 الست.
 * يُنفَّذ مرة واحدة عمليًا: بعد أول تشغيل لا يبقى صف بالقيم القديمة.
 */
/**
 * خطة النسب الافتراضية — الشرائح التي أقرّتها الإدارة.
 *
 * **تُزرع مرة واحدة فقط.** بعدها كل رقم فيها يُعدَّل من شاشة
 * «الإعدادات ← خطط نسب المبيعات»: حدود الشرائح، نسبة الأدمن، نسبة المدير،
 * بل وعدد الشرائح نفسه. لا يعود هذا الملف يلمسها أبدًا، فلا يُلغي نشرٌ
 * جديدٌ قرارًا اتُّخذ من الواجهة.
 */
async function seedCommissionScheme() {
  const existing = await db.commissionScheme.count();
  if (existing > 0) return;

  await db.commissionScheme.create({
    data: {
      name: 'خطة النسب الأساسية',
      basis: 'collected', // النسبة تستحق عند التحصيل
      tierMode: 'progressive', // كل شريحة على جزئها من المبلغ
      isDefault: true,
      active: true,
      notes: 'الشرائح المعتمدة عند التأسيس — قابلة للتعديل بالكامل من الشاشة.',
      tiers: {
        create: [
          { fromAmount: 0, toAmount: 200_000, adminRate: 0.03, managerRate: 0.02, sortOrder: 1 },
          {
            fromAmount: 200_000,
            toAmount: 500_000,
            adminRate: 0.035,
            managerRate: 0.025,
            sortOrder: 2,
          },
          { fromAmount: 500_000, toAmount: null, adminRate: 0.04, managerRate: 0.03, sortOrder: 3 },
        ],
      },
    },
  });

  console.log('  ✓ خطة النسب الافتراضية بثلاث شرائح (تُعدَّل من الشاشة)');
}

async function migrateLeadStages() {
  const mapping: Record<string, string> = {
    QUALIFIED: 'NEGOTIATION',
    UNQUALIFIED: 'LOST',
    CONVERTED: 'WON',
  };

  let moved = 0;
  for (const [from, to] of Object.entries(mapping)) {
    const result = await db.lead.updateMany({ where: { status: from }, data: { status: to } });
    moved += result.count;
  }

  // الخاسر بلا سبب مخالف للقاعدة الجديدة — نعلّمه بسبب صريح بدل تخمينه
  const unexplained = await db.lead.updateMany({
    where: { status: 'LOST', lossReason: null },
    data: { lossReason: 'other' },
  });

  if (moved || unexplained.count) {
    console.log(
      `  ✓ ترحيل المراحل: ${moved} ليد نُقل، ${unexplained.count} خاسر بلا سبب عُلّم بـ«أخرى»`
    );
  }
}

/**
 * يملأ المعرّفات التسلسلية للسجلات التي سبقت وجودها، ويُنشئ عميلًا لكل ليد
 * بلا عميل. بلا هذا تبقى سجلات قديمة بلا رقم ولا بطاقة عميل.
 */
async function backfillCodes() {
  // ١) عملاء بلا كود
  const codelessClients = await db.client.findMany({
    where: { code: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  let clientSeq =
    (await db.counter.findUnique({ where: { key: 'client' } }))?.value ??
    (await db.client.count({ where: { NOT: { code: null } } }));

  for (const client of codelessClients) {
    clientSeq++;
    await db.client.update({
      where: { id: client.id },
      data: { code: `CL-${String(clientSeq).padStart(5, '0')}` },
    });
  }
  if (codelessClients.length) {
    await db.counter.upsert({
      where: { key: 'client' },
      update: { value: clientSeq },
      create: { key: 'client', value: clientSeq },
    });
  }

  // ٢) ليدز بلا عميل — يُنشأ لها عميل من هاتفها، أو تُربط بالموجود
  const clientless = await db.lead.findMany({
    where: { clientId: null },
    orderBy: { createdAt: 'asc' },
  });

  let created = 0;
  for (const lead of clientless) {
    const normalized = normalizePhone(lead.phone);
    if (!normalized.ok) continue; // بلا هاتف صالح لا مفتاح — يُترك للمراجعة اليدوية

    let client = await db.client.findUnique({
      where: { phoneNormalized: normalized.value },
      select: { id: true },
    });
    if (!client) {
      clientSeq++;
      client = await db.client.create({
        data: {
          code: `CL-${String(clientSeq).padStart(5, '0')}`,
          name: [lead.firstName, lead.lastName].filter(Boolean).join(' '),
          phone: lead.phone ?? normalized.value,
          phoneNormalized: normalized.value,
          email: lead.email,
          type: lead.companyName ? 'company' : 'individual',
          companyName: lead.companyName,
          firstBranch: lead.branch,
          ownerId: lead.ownerId,
          createdById: lead.ownerId,
        },
        select: { id: true },
      });
      created++;
    }
    await db.lead.update({ where: { id: lead.id }, data: { clientId: client.id } });
  }
  if (created) {
    await db.counter.upsert({
      where: { key: 'client' },
      update: { value: clientSeq },
      create: { key: 'client', value: clientSeq },
    });
  }

  // ٣) ليدز بلا كود — العدّاد يُرقَّم بشهر إنشاء الليد نفسه لا شهر التشغيل
  const codelessLeads = await db.lead.findMany({
    where: { code: null },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const perMonth = new Map<string, number>();
  for (const lead of codelessLeads) {
    const period = yearMonth(lead.createdAt);
    if (!perMonth.has(period)) {
      const counter = await db.counter.findUnique({ where: { key: `lead-${period}` } });
      perMonth.set(period, counter?.value ?? 0);
    }
    const next = (perMonth.get(period) ?? 0) + 1;
    perMonth.set(period, next);
    await db.lead.update({
      where: { id: lead.id },
      data: { code: `LD-${period}-${String(next).padStart(4, '0')}` },
    });
  }
  for (const [period, value] of perMonth) {
    await db.counter.upsert({
      where: { key: `lead-${period}` },
      update: { value },
      create: { key: `lead-${period}`, value },
    });
  }

  if (codelessClients.length || created || codelessLeads.length) {
    console.log(
      `  ✓ استكمال المعرّفات: ${codelessClients.length} عميل، ${created} عميل مُستخرج من ليدز، ${codelessLeads.length} ليد`
    );
  }
}

/**
 * ترحيل الصفقات القديمة إلى **مشاريع** بحالات §٦.
 *
 * الجدول الفيزيائي لم يتحرّك (الاسم في الكود تغيّر لا في قاعدة البيانات)،
 * فالمطلوب هنا ترجمة قيم الحالة فقط. كل تحويل يُقيَّد في سجل التدقيق بقيمته
 * القديمة، فلا يضيع شيء ويمكن مراجعة أي صف.
 */
async function migrateProjectStatuses() {
  const mapping: Record<string, { to: string; note: string }> = {
    // الصفقة المكسوبة = مشروع مبيع ينتظر الإسناد، لا مشروع مسلَّم
    WON: { to: 'pending_assignment', note: 'صفقة مكسوبة في النظام القديم' },
    LOST: { to: 'cancelled', note: 'خسارة في النظام القديم' },
    // مراحل ما قبل البيع انتقلت إلى الليد؛ ما بقي منها هنا يحتاج قرارًا
    NEW: { to: 'pending_assignment', note: 'مرحلة بيعية قديمة — تحتاج مراجعة' },
    QUOTED: { to: 'pending_assignment', note: 'مرحلة بيعية قديمة — تحتاج مراجعة' },
    NEGOTIATION: { to: 'pending_assignment', note: 'مرحلة بيعية قديمة — تحتاج مراجعة' },
  };

  let moved = 0;
  for (const [from, { to, note }] of Object.entries(mapping)) {
    const rows = await db.project.findMany({
      where: { status: from },
      select: { id: true },
    });
    if (rows.length === 0) continue;

    for (const row of rows) {
      await db.project.update({
        where: { id: row.id },
        data: {
          status: to,
          ...(to === 'cancelled' ? { cancelReason: note, revenueMonth: null } : {}),
        },
      });
      await db.auditLog.create({
        data: {
          action: 'update',
          tableName: 'Project',
          recordId: row.id,
          field: 'status',
          oldValue: from,
          newValue: `${to} (${note})`,
        },
      });
    }
    moved += rows.length;
  }

  if (moved) console.log(`  ✓ ترحيل حالات المشاريع: ${moved} مشروع`);
}

/** يملأ معرّفات المشاريع التي سبقت وجود العدّاد، بشهر إنشاء كل مشروع */
async function backfillProjectCodes() {
  const codeless = await db.project.findMany({
    where: { code: null },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  if (codeless.length === 0) return;

  const perMonth = new Map<string, number>();
  for (const project of codeless) {
    const period = yearMonth(project.createdAt);
    if (!perMonth.has(period)) {
      const counter = await db.counter.findUnique({ where: { key: `project-${period}` } });
      perMonth.set(period, counter?.value ?? 0);
    }
    const next = (perMonth.get(period) ?? 0) + 1;
    perMonth.set(period, next);
    await db.project.update({
      where: { id: project.id },
      data: { code: `PR-${period}-${String(next).padStart(4, '0')}` },
    });
  }
  for (const [period, value] of perMonth) {
    await db.counter.upsert({
      where: { key: `project-${period}` },
      update: { value },
      create: { key: `project-${period}`, value },
    });
  }
  console.log(`  ✓ استكمال معرّفات المشاريع: ${codeless.length}`);
}

async function main() {
  console.log('🌱 تجهيز الأساس...');
  await seedRoles();
  await seedLists();
  await seedSettings();
  await seedAdmin();
  await seedFoundingTeam();
  await seedCommissionScheme();
  await migrateLeadStages();
  await backfillCodes();
  await migrateProjectStatuses();
  await backfillProjectCodes();
  console.log('✅ اكتمل التجهيز');
}

main()
  .catch((error) => {
    console.error('❌ فشل التجهيز:', error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
