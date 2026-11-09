import { sql } from '@/lib/db';
import { fmtDate } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export default async function Overview() {
  const [counts] = await sql`
    select count(*)::int total,
           count(*) filter (where verification_status = 'verified')::int verified,
           count(*) filter (where verification_status = 'candidate_unverified')::int candidates,
           (select count(*)::int from product_variants where gtin is not null) gtins,
           (select count(*)::int from alert_items) alerts,
           (select count(*)::int from sources) sources
    from products`;
  const batches = await sql`select kind, file_name, sha256, row_count, imported_at from import_batches order by imported_at`;
  const unmapped = await sql`
    select p.category_raw, count(*)::int n from products p
    left join category_map m on m.category_raw = p.category_raw
    where m.category_raw is null group by 1 order by 2 desc`;

  return (
    <>
      <section className="card">
        <h2>القاعدة المرجعية</h2>
        <div className="grid">
          <div className="stat"><b>{counts.total}</b><span>منتج</span></div>
          <div className="stat"><b>{counts.verified}</b><span>موثّق</span></div>
          <div className="stat"><b>{counts.candidates}</b><span>مرشح غير موثّق</span></div>
          <div className="stat"><b>{counts.gtins}</b><span>باركود رسمي (GTIN) بمصدر</span></div>
          <div className="stat"><b>{counts.alerts}</b><span>تشغيلة في إنذار رقابي</span></div>
          <div className="stat"><b>{counts.sources}</b><span>مصدر</span></div>
        </div>
      </section>
      <section className="card">
        <h2>دفعات الاستيراد</h2>
        <div className="scroll"><table>
          <thead><tr><th>النوع</th><th>الملف</th><th>صفوف خام</th><th>SHA-256</th><th>التاريخ</th></tr></thead>
          <tbody>{batches.map((b) => (
            <tr key={b.sha256}><td>{b.kind}</td><td className="ltr">{b.file_name}</td><td>{b.row_count}</td>
              <td className="ltr"><code>{String(b.sha256).slice(0, 12)}…</code></td><td>{fmtDate(b.imported_at)}</td></tr>
          ))}</tbody>
        </table></div>
      </section>
      <section className="card">
        <h2>فئات بانتظار التوحيد ({unmapped.length})</h2>
        <p className="note">تحويل الفئة الأولية إلى فئة موحدة وتصنيف تنظيمي قرار مراجع، ولا يتم آلياً.</p>
        <div className="scroll"><table>
          <thead><tr><th>الفئة كما في الملف</th><th>السجلات</th></tr></thead>
          <tbody>{unmapped.map((u) => <tr key={u.category_raw}><td>{u.category_raw}</td><td>{u.n}</td></tr>)}</tbody>
        </table></div>
      </section>
    </>
  );
}
