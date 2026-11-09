import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { sql } from '@/lib/db';
import { fmtDate } from '@/lib/ui';

export const dynamic = 'force-dynamic';

async function review(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const decision = String(formData.get('decision'));
  const note = String(formData.get('note') ?? '').slice(0, 500);
  if (!['approved', 'rejected'].includes(decision)) return;
  // Phase-1 admin gate is HTTP Basic (D-017): record that, not a person id.
  await sql`update formula_versions set review_status = ${decision}, reviewed_at = now(),
            review_note = ${`${decision} via admin panel${note ? ': ' + note : ''}`} where id = ${id} and review_status = 'pending'`;
  revalidatePath('/formulas');
}

export default async function Formulas({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const status = (await searchParams).status ?? 'pending';
  const rows = await sql`
    select fv.id, fv.review_status, fv.raw_text, fv.fetched_at, fv.page_sha256, fv.extracted_by, fv.review_note,
           s.url, s.title, p.external_ref, p.official_name,
           (select array_agg(i.inci_name order by vi.position) from variant_ingredients vi join ingredients i on i.id = vi.ingredient_id
            where vi.formula_version_id = fv.id) items
    from formula_versions fv join sources s on s.id = fv.source_id
    join product_variants v on v.id = fv.variant_id join products p on p.id = v.product_id
    where fv.review_status = ${status} order by p.external_ref`;
  return (
    <>
      <section className="card">
        <h2>قوائم المكونات الرسمية — {status === 'pending' ? 'بانتظار المراجعة' : status}</h2>
        <p>
          <Link href="/formulas?status=pending">بانتظار المراجعة</Link> · <Link href="/formulas?status=approved">معتمدة</Link> ·{' '}
          <Link href="/formulas?status=rejected">مرفوضة</Link>
        </p>
        <p className="note">قارن القائمة المفككة بالنص كما نُشر في صفحة الشركة. تُستخدم القائمة في الحكم فقط بعد اعتمادها.</p>
      </section>
      {rows.map((r) => (
        <section className="card" key={r.id}>
          <h2><Link href={`/products/${r.external_ref}`}>{r.external_ref}</Link> — {r.official_name}</h2>
          <p><a href={r.url} target="_blank" rel="noreferrer">{r.title ?? r.url}</a> · جُلبت {fmtDate(r.fetched_at)} ·{' '}
            <code className="ltr">{String(r.page_sha256).slice(0, 12)}</code> · {r.extracted_by}</p>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            <div><b>النص كما نُشر</b><pre className="ltr">{r.raw_text}</pre></div>
            <div><b>المكونات المفككة ({r.items?.length ?? 0})</b>
              <ol className="ltr" style={{ fontSize: 13 }}>{(r.items ?? []).map((i: string, n: number) => <li key={n}>{i}</li>)}</ol></div>
          </div>
          {r.review_status === 'pending' ? (
            <form action={review} className="filters">
              <input type="hidden" name="id" value={r.id} />
              <input name="note" placeholder="ملاحظة (اختياري)" aria-label="ملاحظة" />
              <button name="decision" value="approved">اعتماد</button>
              <button name="decision" value="rejected">رفض</button>
            </form>
          ) : <p className="badge muted">{r.review_note}</p>}
        </section>
      ))}
    </>
  );
}
