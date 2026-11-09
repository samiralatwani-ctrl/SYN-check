import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db';
import { fmtDate } from '@/lib/ui';

export const dynamic = 'force-dynamic';
const STATUSES = ['new', 'reviewing', 'forwarded', 'closed'] as const;

async function setStatus(formData: FormData) {
  'use server';
  const status = String(formData.get('status'));
  if (!(STATUSES as readonly string[]).includes(status)) return;
  await sql`update reports set review_status = ${status} where id = ${String(formData.get('id'))}`;
  revalidatePath('/reports');
}

export default async function Reports({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const status = (await searchParams).status ?? 'new';
  const rows = await sql`
    select r.id, r.created_at, r.review_status, r.recipients, r.channel, r.message_text, r.attachments_count, r.seller_info_private,
           r.purchase_channel, s.verdict, s.method_version, left(s.method_sha256, 8) sha, p.external_ref, p.official_name
    from reports r join scans s on s.id = r.scan_id left join products p on p.id = s.product_id
    where r.review_status = ${status} order by r.created_at desc limit 200`;
  return (
    <>
      <section className="card">
        <h2>البلاغات — {status}</h2>
        <p>{STATUSES.map((s) => <a key={s} href={`/reports?status=${s}`} style={{ marginInlineEnd: 12 }}>{s}</a>)}</p>
        <p className="note">معلومات البائع للمراجعة الداخلية فقط: لا تُنشر ولا تُضاف إلى أي رسالة.</p>
      </section>
      {rows.map((r) => (
        <section className="card" key={r.id}>
          <h2 className="ltr">{String(r.id).slice(0, 8)} · {fmtDate(r.created_at)} · {r.verdict} ({r.method_version}/{r.sha})</h2>
          <p>{r.external_ref ? `${r.external_ref} — ${r.official_name}` : 'منتج غير موجود في القاعدة'} · القناة: {r.channel} · قناة الشراء: {r.purchase_channel ?? '—'}</p>
          <p className="ltr">إلى: {(r.recipients ?? []).join(', ') || '—'} · مرفقات: {r.attachments_count}</p>
          <pre>{r.message_text}</pre>
          {r.seller_info_private && <p className="private"><b>البائع (خاص):</b> {r.seller_info_private}</p>}
          <form action={setStatus} className="filters">
            <input type="hidden" name="id" value={r.id} />
            {STATUSES.map((s) => <button key={s} name="status" value={s} disabled={s === r.review_status}>{s}</button>)}
          </form>
        </section>
      ))}
    </>
  );
}
