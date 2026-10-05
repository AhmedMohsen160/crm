"""
يحقن اتجاه القسم في ملف الوورد بعد توليده.

`docx-js` لا يصدّر <w:bidi/> داخل <w:sectPr>، وبدونه يبقى اتجاه الصفحة
الأساسيّ من اليسار — فتقع الجداول في الجهة الخاطئة. والترتيب مُلزَم بالمخطط:
bidi يأتي بعد pgMar وقبل docGrid.

ويُعاد الحزم بـ[Content_Types].xml أولًا كما تنصّ مواصفة OPC.
"""
import sys, zipfile

src, dst = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(src)
doc = z.read('word/document.xml').decode('utf8')

before = doc.count('<w:bidi/>')
doc = doc.replace('<w:pgNumType/><w:docGrid', '<w:pgNumType/><w:bidi/><w:docGrid')
added = doc.count('<w:bidi/>') - before
if added != 1:
    sys.exit(f'✗ لم يُحقن اتجاه القسم (أُضيف {added})')

names = [n for n in z.namelist() if not n.endswith('/')]
order = ['[Content_Types].xml'] + [n for n in names if n != '[Content_Types].xml']
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as out:
    for n in order:
        data = doc.encode('utf8') if n == 'word/document.xml' else z.read(n)
        if n == '[Content_Types].xml':
            zi = zipfile.ZipInfo(n); zi.compress_type = zipfile.ZIP_STORED
            out.writestr(zi, data)
        else:
            out.writestr(n, data)
print(f'✓ اتجاه القسم محقون · {len(order)} ملفًا · [Content_Types].xml أولًا')
