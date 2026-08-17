/**
 * اختبار الحذف النهائيّ لسجل عميل.
 *
 * **وهو استثناءٌ من «لا شيء يُمحى» (§٣ بند ٣)** — فاختبارُه يحرس حدودَه لا
 * وجودَه: أنّ الفترة المقفلة تمنع، وأنّ الوسم يُحذّر ولا يمنع، وأنّ الجملة
 * تُكتب بالحرف.
 *
 * التشغيل:  npm run test:client-purge
 */
import { PURGE_PHRASE, purgeVerdict, purgeTotal } from '../src/lib/client-purge.ts';

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
}
function eq(actual, expected, label) {
  check(
    JSON.stringify(actual) === JSON.stringify(expected),
    label,
    `نتج ${JSON.stringify(actual)} والمتوقع ${JSON.stringify(expected)}`
  );
}

const base = {
  clientName: 'عميل تجريبيّ',
  counts: {},
  revenue: 0,
  closedEntries: [],
  postedEntries: 0,
  importTag: null,
};

console.log('\n── ١ · ما يمضي بلا اعتراض ──────────────────────────\n');

const clean = purgeVerdict({ ...base, counts: { مشاريع: 2, ليدز: 1 } });
check(clean.ok, 'عميلٌ تجريبيّ بلا قيدٍ مرحَّل يُحذف');
eq(clean.warnings, [], 'وبلا تحذير — لا إيراد ولا وسم ولا قيد');

eq(purgeTotal({ مشاريع: 2, ليدز: 1, 'قيود يومية': 4 }), 7, 'ومجموع الجرد يُقرأ رقمًا واحدًا');
eq(purgeTotal({}), 0, 'وبطاقةٌ بلا تابعٍ مجموعُها صفر');

console.log('\n── ٢ · الفترة المقفلة تمنع ولا تحذّر ───────────────\n');

/**
 * **الحدُّ الذي لا يُنقَض.** المحاسب أقفل الشهر وبنى عليه ميزانَ مراجعة
 * وقائمةَ دخل؛ وحذفُ قيدٍ منه يغيّر ربحَ شهرٍ مضى بلا أن يعلم أحد. والقيد
 * الخاطئ يُعكَس بقيد مضادّ لا يُحذف.
 */
const closed = purgeVerdict({
  ...base,
  postedEntries: 3,
  closedEntries: [
    { period: '2024-03', entries: 2 },
    { period: '2024-04', entries: 1 },
  ],
});
check(
  !closed.ok,
  '★ **قيدٌ مرحَّل في فترةٍ مقفلة يمنع الحذف** — ولا يُنقَض هذا الحدّ'
);
check(closed.reason.includes('2024-03') && closed.reason.includes('2024-04'), 'والسببُ يسمّي الفترتين');
check(closed.reason.includes('يُعكَس بقيد مضادّ'), 'ويقول البديل — لا يقول «ممنوع» وحدها');

console.log('\n── ٣ · التحذير ليس منعًا ───────────────────────────\n');

const tagged = purgeVerdict({ ...base, importTag: 'sales-2024', counts: { مشاريع: 5 } });
check(tagged.ok, 'وسجلٌّ موسومٌ بوسم ترحيل يُحذف — القرار لمن يملكه');
check(
  tagged.warnings.some((w) => w.includes('sales-2024') && w.includes('سحبُ الوسم')),
  '★ **ويُقال إنه جاء من ملفات المكتب لا من تجربة** — وأنّ سحب الوسم أسلم'
);

const withRevenue = purgeVerdict({ ...base, revenue: 12500.5, postedEntries: 4 });
check(withRevenue.ok, 'وعميلٌ له إيرادٌ معترَفٌ به يُحذف بعد التحذير');
check(
  withRevenue.warnings.some((w) => w.includes('4') && w.includes('ميزان المراجعة')),
  'ويُقال إنّ ميزان المراجعة سيتغيّر لهذه الفترات'
);
check(
  withRevenue.warnings.some((w) => w.includes('12,500.50')),
  '★ **والإيراد يُقرأ بالقرش قبل الضغط** — لا بعده'
);

console.log('\n── ٤ · الجملة تُكتب بالحرف ─────────────────────────\n');
eq(PURGE_PHRASE, 'احذف هذا العميل نهائيًا', 'والجملة ثابتة — تُكتب ولا تُنقر');
check(PURGE_PHRASE.length > 12, 'وطويلةٌ بما يمنع كتابتها سهوًا');

const failed = results.filter((r) => !r.ok);
console.log(`\n═══ النتيجة: ${results.length - failed.length}/${results.length} نجحت ═══`);
process.exit(failed.length ? 1 : 0);
