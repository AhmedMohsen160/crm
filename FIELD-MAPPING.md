# جدول مطابقة الأسماء — مواصفة فاست ترانس ↔ الكود القائم

> مطلوب بـ§٠: «أسماء الحقول في المستند مفاتيح عمل قانونية. إن كانت لديك تسمية
> مختلفة، أبقِ تسميتك واكتب جدول مطابقة.»
>
> **القاعدة المتبعة:** الاسم القانوني في المواصفة يُكتب في الكود بصيغة
> `camelCase` (عرف Prisma/TypeScript) دون تغيير معناه. حيث اختلف الاسم فعلًا،
> أوضّح السبب.

## الجداول

| المواصفة | الكود | الحالة |
|---|---|---|
| `clients` | `Client` | يُنشأ — يدمج `Contact` الحالي ويُبقي `Company` مرتبطًا |
| `leads` | `Lead` | موجود، يُوسَّع |
| `projects` | `Project` | يُحوَّل من `Deal` القائم |
| `project_steps` | `ProjectStep` | يُنشأ |
| `users` | `User` | موجود، يُوسَّع |
| `roles` | `Role` | يُنشأ (أدوار كبيانات) |
| `staff_cost` | `StaffCost` | يُنشأ |
| `freelancers` | `Freelancer` | يُنشأ |
| `freelancer_rates` | `FreelancerRate` | يُنشأ |
| `freelancer_payments` | `FreelancerPayment` | يُنشأ |
| `price_list` | `PriceListItem` | يُحوَّل من `PriceRate` القائم |
| `settings` | `Setting` | موجود |
| `lists` | `ListItem` | يُنشأ (`List` محجوزة لغويًا وملتبسة) |
| `audit_log` | `AuditLog` | يُنشأ — `Activity` الحالي يبقى للخط الزمني الوصفي |

## الحقول التي يختلف اسمها

| المواصفة | الكود | السبب |
|---|---|---|
| `sales_admin` | `salesAdminId` | لاحقة `Id` عرف Prisma للمفاتيح الأجنبية |
| `project_manager` | `projectManagerId` | نفسه |
| `primary_producer` | `primaryProducerId` | نفسه |
| `reviewer` | `reviewerId` | نفسه |
| `client_id` / `lead_id` | `clientId` / `leadId` | نفسه |
| `performer_id` | `performerId` | نفسه |
| `created_by` / `approved_by` | `createdById` / `approvedById` | نفسه |
| `phone` (المطبَّع) | `phone` + `phoneNormalized` | المواصفة تخزّنه مطبَّعًا؛ نحتفظ بالأصل كما أدخله المستخدم **و**بالمطبَّع للبحث ومنع الازدواج |
| `langs` (متعدد) | `langs` نص مفصول بفواصل | SQLite لا يدعم المصفوفات؛ يعمل على PostgreSQL أيضًا بلا فرق سلوكي |
| `specialisations` | `specialisations` | نفس السبب |
| `extra` في `lists` | `extra` | يحمل المعامل رقمًا نصيًا |

## الحقول المحسوبة — أين تُحسب

| الحقل | الموضع | ملاحظة |
|---|---|---|
| `weighted_pages` | مخزَّن على `Project` و`ProjectStep` | يُعاد حسابه عند تغيّر `pages` أو النمط أو خط الخدمة |
| `cost_internal` / `cost_external` / `cost_total` | مخزَّنة على `Project` | تُجمَّد قيمتها وقت التسليم حتى لا يغيّر تعديلُ راتبٍ لاحق تاريخَ الهوامش |
| `margin` / `margin_pct` | مخزَّنة | نفس السبب |
| `balance` | محسوب لحظيًا | مشتق بسيط من ثلاثة حقول |
| `alert` | محسوب لحظيًا | يجب أن يعكس الحالة الآن لا وقت الحفظ |
| `revenue_month` | مخزَّن `YYYY-MM` | مفتاح تجميع للتقارير |

> **مبدأ:** ما يدخل تقريرًا ماليًا تاريخيًا **يُخزَّن مجمَّدًا**؛ وما هو مؤشر
> تشغيلي لحظي **يُحسب عند القراءة**. (§٤ بند ٤ من المواصفة: الاعتراف بالإيراد
> بالحالة، ولا يجوز أن يتغيّر ماضٍ.)

## أسماء الحالات

المفاتيح إنجليزية والعرض عربي، كما هو قائم اليوم في `src/lib/constants.ts`.

| حالة المشروع (عربي) | المفتاح |
|---|---|
| قيد الإسناد | `PENDING_ASSIGNMENT` |
| قيد التنفيذ | `IN_PROGRESS` |
| قيد المراجعة | `IN_REVIEW` |
| جاهز للتسليم | `READY` |
| سُلّم | `DELIVERED` |
| محصَّل | `COLLECTED` |
| مُعاد للتعديل | `REWORK` |
| ملغى | `CANCELLED` |

| مرحلة الليد | المفتاح |
|---|---|
| جديد | `NEW` |
| تم التواصل | `CONTACTED` |
| عرض سعر | `QUOTED` |
| تفاوض | `NEGOTIATION` |
| فائز | `WON` |
| خاسر | `LOST` |

> **تنبيه ترحيل:** المفاتيح `NEW/QUOTED/NEGOTIATION/WON/LOST` مستخدمة اليوم على
> `Deal` كمراحل بيعية (`constants.ts:19-25`). عند التحويل تنتقل هذه المفاتيح إلى
> `Lead`، ويأخذ `Project` مفاتيح الحالات التشغيلية أعلاه. أي بيانات قائمة تُرحَّل
> وفق هذا التعيين.
