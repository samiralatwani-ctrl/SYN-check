import Link from 'next/link';
import { sql } from '@/lib/db';
import { fmtDate } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export default async function Alerts() {
  const rows = await sql`
    select a.authority, a.alert_date, a.channel_text, a.note, s.url, i.product_name_raw, i.batch_as_published,
           i.product_code, i.genuine_dates_raw, i.counterfeit_dates_raw, i.alert_kind, p.external_ref
    from alert_items i join regulatory_alerts a on a.id = i.alert_id join sources s on s.id = a.source_id
    left join products p on p.id = i.product_id order by a.alert_date desc`;
  return (
    <section className="card">
      <h2>الإنذارات الرقابية ({rows.length})</h2>
      <div className="scroll"><table>
        <thead><tr><th>الجهة</th><th>التاريخ</th><th>المنتج</th><th>التشغيلة كما نُشرت</th><th>رمز المنتج</th>
          <th>الأصلي: تصنيع / انتهاء</th><th>المقلد: تصنيع / انتهاء</th><th>القناة</th><th>ملاحظة</th><th>المصدر</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}>
            <td>{r.authority}</td><td>{fmtDate(r.alert_date)}</td>
            <td>{r.external_ref ? <Link href={`/products/${r.external_ref}`}>{r.product_name_raw}</Link> : r.product_name_raw}</td>
            <td className="ltr"><code>{r.batch_as_published}</code></td><td className="ltr">{r.product_code}</td>
            <td className="ltr">{r.genuine_dates_raw}</td><td className="ltr">{r.counterfeit_dates_raw}</td>
            <td>{r.channel_text}</td><td>{r.note}</td><td><a href={r.url} target="_blank" rel="noreferrer">رابط</a></td>
          </tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}
