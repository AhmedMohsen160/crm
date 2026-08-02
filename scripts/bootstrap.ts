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
          ...permissions,
        },
      });
      created++;
      continue;
    }

    // دور نظامي لم تُعدّله الإدارة: نُبقيه مطابقًا للمصفوفة حتى تصل أي
    // صلاحية جديدة لأصحابها. الأدوار المخصّصة لا تُلمس أبدًا.
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

async function main() {
  console.log('🌱 تجهيز الأساس...');
  await seedRoles();
  await seedLists();
  await seedSettings();
  await seedAdmin();
  await seedFoundingTeam();
  console.log('✅ اكتمل التجهيز');
}

main()
  .catch((error) => {
    console.error('❌ فشل التجهيز:', error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
