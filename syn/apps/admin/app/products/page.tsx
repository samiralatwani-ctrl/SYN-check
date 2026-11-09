import Link from 'next/link';
import { sql } from '@/lib/db';
import { StatusBadge } from '@/lib/ui';

export const dynamic = 'force-dynamic';
const PAGE = 50;

export default async function Products({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const status = sp.status ?? '';
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const like = `%${q}%`;
  const where = sql`
    where (${q} = '' or p.external_ref ilike ${like} or p.official_name ilike ${like} or p.brand_raw ilike ${like}
           or exists (select 1 from listing_sources l where l.product_id = p.id and l.name_as_listed ilike ${like}))
      and (${status} = '' or p.verification_status::text = ${status})`;
  const [{ n }] = await sql`select count(*)::int n from products p ${where}`;
  const rows = await sql`
    select p.external_ref, p.official_name, p.brand_raw, p.category_raw, p.verification_status, v.documentation_status
    from products p join v_documentation_status v on v.product_id = p.id ${where}
    order by p.external_ref limit ${PAGE} offset ${(page - 1) * PAGE}`;
  const qs = (p: number) => `?${new URLSearchParams({ q, status, page: String(p) })}`;

  return (
    <section className="card">
      <h2>المنتجات ({n})</h2>
      <form className="filters">
        <input name="q" defaultValue={q} placeholder="المعرّف أو الاسم أو العلامة" aria-label="بحث" />
        <select name="status" defaultValue={status} aria-label="الحالة">
          <option value="">كل الحالات</option>
          <option value="verified">موثّق</option>
          <option value="candidate_unverified">مرشح غير موثّق</option>
        </select>
        <button>بحث</button>
      </form>
      <div className="scroll"><table>
        <thead><tr><th>المعرّف</th><th>الاسم الرسمي</th><th>العلامة حسب المصدر</th><th>الفئة الأولية</th><th>الحالة</th><th>حالة التوثيق</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.external_ref}>
            <td><Link href={`/products/${r.external_ref}`}>{r.external_ref}</Link></td>
            <td>{r.official_name ?? <span className="muted badge">بانتظار شاهد رسمي</span>}</td>
            <td>{r.brand_raw}</td><td>{r.category_raw}</td>
            <td><StatusBadge status={r.verification_status} /></td><td>{r.documentation_status}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <p>
        {page > 1 && <Link href={qs(page - 1)}>السابق</Link>} {' '}
        صفحة {page} من {Math.max(1, Math.ceil(n / PAGE))} {' '}
        {page * PAGE < n && <Link href={qs(page + 1)}>التالي</Link>}
      </p>
    </section>
  );
}
