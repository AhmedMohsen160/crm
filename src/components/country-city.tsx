'use client';

import { useState } from 'react';
import { COUNTRIES, citiesOf } from '@/lib/geo';
import { FormField, SelectField } from '@/components/ui';

/**
 * الدولة والمدينة — تُختاران ولا تُكتبان.
 *
 * **الكتابة الحرّة تُنتج «مصر» و«مصر ‏» و«Egypt» ثلاثةَ صفوف لشيء واحد**،
 * فلا يُجمَّع تقرير ولا يُرشَّح جرد.
 *
 * والمدينة **تتبع الدولة**: اختيار «مصر» يُظهر محافظاتها وحدها. وهي مع ذلك
 * حقلُ كتابةٍ باقتراحات (`datalist`) لا قائمةً مغلقة — فعميلٌ في مدينة ليست
 * عندنا يُسجَّل ولا يُردّ.
 *
 * **وبلا جافاسكربت يعمل الاثنان**: الدولة قائمةُ اختيار عادية، والمدينة حقل
 * نصّ باقتراحاتٍ يقدّمها المتصفح نفسه. ما يضيفه هذا المكوّن هو **تضييق**
 * الاقتراحات على الدولة المختارة وحدها.
 */
export default function CountryCity({
  defaultCountry,
  defaultCity,
}: {
  defaultCountry?: string | null;
  defaultCity?: string | null;
}) {
  const [country, setCountry] = useState(defaultCountry ?? '');
  const cities = citiesOf(country);

  return (
    <>
      <SelectField
        label="الدولة"
        name="country"
        defaultValue={defaultCountry ?? ''}
        placeholder="— اختياري —"
        options={COUNTRIES.map((c) => ({ value: c.name, label: c.name }))}
        onChange={(e) => setCountry(e.target.value)}
      />
      <FormField
        label="المدينة"
        name="city"
        defaultValue={defaultCity}
        list="city-options"
        hint={
          country && cities.length === 0
            ? 'اكتب اسم المدينة — لا قائمة محفوظة لهذه الدولة'
            : 'اختر من القائمة أو اكتب اسمًا آخر'
        }
      />
      <datalist id="city-options">
        {(cities.length > 0 ? cities : COUNTRIES.flatMap((c) => c.cities)).map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>
    </>
  );
}
