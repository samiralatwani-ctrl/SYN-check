import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { EvidenceBadge, Field, StatusBadge, fmtDate } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export default async function Product({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const [p] = await sql`
    select p.*, v.documentation_status, v.yes_count, m.category, m.regulatory_class, b.name brand_name
    from products p join v_documentation_status v on v.product_id = p.id
    left join category_map m on m.category_raw = p.category_raw left join brands b on b.id = p.brand_id
    where p.external_ref = ${ref}`;
  if (!p) notFound();

  const [variants, evidence, brand, agents, alerts, review, listings, raw] = await Promise.all([
    sql`select * from product_variants where product_id = ${p.id}`,
    sql`select e.*, c.name_ar country_name,
               coalesce(json_agg(json_build_object('url', s.url, 'title', s.title, 'type', s.source_type,
                 'verified', s.last_verified_at, 'code', (select string_agg(a.code, '،') from source_aliases a where a.source_id = s.id)))
                 filter (where s.id is not null), '[]') sources
        from evidence e left join countries c on c.iso2 = e.country
        left join evidence_sources es on es.evidence_id = e.id left join sources s on s.id = es.source_id
        where e.product_id = ${p.id} group by e.id, c.name_ar
        order by e.field, case e.country when 'IQ' then 1 when 'SA' then 2 when 'LB' then 3 when 'TR' then 4 else 9 end, e.authority_label`,
    p.brand_id ? sql`select * from brands where id = ${p.brand_id}` : Promise.resolve([]),
    p.brand_id ? sql`select a.*, c.name_ar country_name,
        (select json_agg(json_build_object('url', s.url, 'title', s.title)) from brand_agent_sources bs join sources s on s.id = bs.source_id where bs.agent_id = a.id) sources
        from brand_agents a left join countries c on c.iso2 = a.country where brand_id = ${p.brand_id} order by a.country nulls last` : Promise.resolve([]),
    sql`select a.authority, a.alert_date, a.channel_text, a.note, s.url, i.* from alert_items i
        join regulatory_alerts a on a.id = i.alert_id join sources s on s.id = a.source_id
        where i.product_id = ${p.id} order by a.alert_date desc`,
    sql`select * from product_review_status where product_id = ${p.id}`,
    sql`select l.*, b.file_name from listing_sources l join import_batches b on b.id = l.batch_id where product_id = ${p.id}`,
    sql`select r.sheet, r.row_number, r.cells, b.file_name from raw_import_rows r join import_batches b on b.id = r.batch_id
        where r.external_ref = ${ref} order by b.imported_at, r.sheet`,
  ]);
  const medical = p.regulatory_class === 'medical_device' || p.regulatory_class === 'medicine';
  const docMatches = !p.documentation_status_file || p.documentation_status_file === p.documentation_status;

  return (
    <>
      <section className="card">
        <h2>{p.official_name ?? 'بانتظار اسم رسمي بشاهد'} <span className="muted badge ltr">{p.external_ref}</span></h2>
        <p><StatusBadge status={p.verification_status} /> {' '}
          <span className="badge muted">{p.category_raw}{p.category ? ` ← ${p.category} / ${p.regulatory_class}` : ' (غير موحّدة)'}</span></p>
        {medical && <p className="note">جهاز طبي / دواء: يُستخدم فقط من طبيب مختص. لا تُعرض أي توصية استعمال.</p>}
        <dl className="fields">
          <Field label="العلامة (مرجعية)" value={p.brand_name} />
          <Field label="العلامة حسب المصدر" value={p.brand_raw} />
          <Field label="حالة التوثيق (محسوبة)" value={`${p.documentation_status} — أدلة مطابقة: ${p.yes_count}`} />
          <Field label="حالة التوثيق (كما في الملف)" value={p.documentation_status_file && `${p.documentation_status_file} — ${p.documentation_count_file}`} />
        </dl>
        {!docMatches && <p className="badge bad">الحالة المحسوبة تختلف عن الملف — تحتاج مراجعة</p>}
      </section>

      {variants.map((v) => (
        <section className="card" key={v.id}>
          <h2>بيانات العبوة الرسمية</h2>
          <dl className="fields">
            <Field label="الباركود الرسمي (GTIN)" value={v.gtin ?? v.gtin_status_text} />
            <Field label="نتيجة GS1" value={v.gs1_result_text} />
            <Field label="العبوة الرسمية" value={v.package_text} />
            <Field label="التركيز" value={v.concentration_text} />
            <Field label="بلد المنشأ / عنوان التصنيع" value={v.origin_text} />
            <Field label="علامات الأصالة والتتبّع" value={v.security_features_text} />
            <Field label="نشرة الاستعمال الرسمية" value={v.ifu_reference_text} />
            <Field label="نسخة السوق" value={v.market} />
            <Field label="نمط رقم التشغيلة" value={v.batch_regex} />
          </dl>
        </section>
      ))}

      <section className="card">
        <h2>الأدلة حسب البلد والمصدر</h2>
        <p className="note">التسجيل في بلد آخر يثبت أن المنتج معتمد هناك، ولا يثبت أصالة عبوة بعينها في العراق.</p>
        <div className="scroll"><table>
          <thead><tr><th>الدليل</th><th>البلد</th><th>الحالة</th><th>النص كما في الملف</th><th>المصادر</th><th>آخر تحقق</th></tr></thead>
          <tbody>{evidence.map((e) => (
            <tr key={e.id}>
              <td>{e.authority_label}</td><td>{e.country_name ?? '—'}</td><td><EvidenceBadge status={e.status} /></td>
              <td>{e.value_text ?? '—'}</td>
              <td>{(e.sources as { url: string; title: string | null; code: string | null }[]).map((s) => (
                <div key={s.url}>{s.code && <><b className="ltr">{s.code}</b>{' · '}</>}<a href={s.url} target="_blank" rel="noreferrer">{s.title ?? s.url}</a></div>
              ))}</td>
              <td>{fmtDate(e.last_verified_at)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>

      {brand.length > 0 && (
        <section className="card">
          <h2>بطاقة العلامة: {brand[0].name}</h2>
          <dl className="fields">
            <Field label="الشركة المالكة" value={brand[0].parent_company} />
            <Field label="الموقع الإقليمي" value={brand[0].regional_site} />
            <Field label="التواصل الرسمي" value={brand[0].contact_info} />
            <Field label="صفحة مكافحة التقليد" value={brand[0].anti_counterfeit_page} />
            <Field label="آلية التحقق الرسمية" value={brand[0].official_verification_method} />
            <Field label="العلامات الأمنية المعلنة" value={brand[0].declared_security_features} />
            <Field label="الحكم العملي" value={brand[0].practical_note} />
            <Field label="تاريخ آخر تحقق" value={fmtDate(brand[0].last_verified_at)} />
          </dl>
          <h2 style={{ marginTop: 16 }}>الوكلاء المعتمدون</h2>
          <table><tbody>{agents.map((a) => (
            <tr key={a.id}><td>{a.country_name ?? a.region_label}</td>
              <td><span className={`badge ${a.availability === 'listed' ? 'ok' : 'muted'}`}>{a.availability === 'listed' ? 'مدرج' : 'غير متوفر رسمياً'}</span></td>
              <td>{a.agent_text}</td>
              <td>{(a.sources ?? []).map((s: { url: string; title: string }) => <div key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></div>)}</td></tr>
          ))}</tbody></table>
        </section>
      )}

      {alerts.length > 0 && (
        <section className="card">
          <h2>إنذارات رقابية على هذا المنتج</h2>
          <table>
            <thead><tr><th>الجهة</th><th>التاريخ</th><th>التشغيلة كما نُشرت</th><th>الأصلي</th><th>المقلد</th><th>القناة</th><th>ملاحظة</th></tr></thead>
            <tbody>{alerts.map((a) => (
              <tr key={a.id}><td><a href={a.url} target="_blank" rel="noreferrer">{a.authority}</a></td><td>{fmtDate(a.alert_date)}</td>
                <td className="ltr"><code>{a.batch_as_published}</code></td><td className="ltr">{a.genuine_dates_raw}</td>
                <td className="ltr">{a.counterfeit_dates_raw}</td><td>{a.channel_text}</td><td>{a.note}</td></tr>
            ))}</tbody>
          </table>
        </section>
      )}

      {review.length > 0 && (
        <section className="card">
          <h2>حالة المراجعة (كما في الملفات)</h2>
          <dl className="fields">
            <Field label="مطابقة الاسم" value={review[0].name_match_status} />
            <Field label="التركيبة والنشرة" value={review[0].formula_status} />
            <Field label="التسجيل العراقي" value={review[0].iraq_registration_status} />
            <Field label="المراجعة العلمية / الطبية" value={review[0].scientific_review_status} />
            <Field label="الإجراء المطلوب" value={review[0].required_action} />
            <Field label="ملاحظات التحقق" value={review[0].verification_notes} />
          </dl>
        </section>
      )}

      <section className="card private">
        <h2>عروض البائعين — للمشرفين فقط</h2>
        <p className="badge bad">لا تظهر في التطبيق ولا في أي واجهة عامة</p>
        <div className="scroll"><table>
          <thead><tr><th>الملف</th><th>البائع</th><th>الاسم كما عُرض</th><th>المتغيرات</th><th>الباركود كما أورده البائع</th><th>مطابقة الحجم</th><th>الرابط</th></tr></thead>
          <tbody>{listings.map((l) => (
            <tr key={l.id}><td className="ltr">{l.file_name}</td><td>{l.seller_name ?? '—'}</td><td>{l.name_as_listed}</td>
              <td>{l.variants_as_listed ?? '—'}</td><td>{l.barcode_as_listed ?? '—'}</td><td>{l.size_match_text ?? '—'}</td>
              <td>{l.listing_url ? <a href={l.listing_url} target="_blank" rel="noreferrer">رابط</a> : '—'}</td></tr>
          ))}</tbody>
        </table></div>
      </section>

      <section className="card">
        <details>
          <summary>الصفوف الأصلية كما في ملفات Excel ({raw.length})</summary>
          {raw.map((r, i) => (
            <div key={i}><p className="ltr"><b>{r.file_name}</b> › {r.sheet} › row {r.row_number}</p>
              <pre>{JSON.stringify(r.cells, null, 2)}</pre></div>
          ))}
        </details>
      </section>
    </>
  );
}
