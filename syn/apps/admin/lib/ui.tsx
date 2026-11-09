export const NOT_OFFICIAL = 'غير متوفر رسمياً';

const EVIDENCE: Record<string, { label: string; icon: string; cls: string }> = {
  yes: { label: 'نعم', icon: '●', cls: 'ok' },
  partial: { label: 'جزئي (لا يُحتسب)', icon: '◐', cls: 'warn' },
  no: { label: 'لا', icon: '✕', cls: 'bad' },
  not_checked: { label: 'لم يُتحقق', icon: '○', cls: 'muted' },
};

export function EvidenceBadge({ status }: { status: string }) {
  const e = EVIDENCE[status] ?? { label: status, icon: '?', cls: 'muted' };
  return <span className={`badge ${e.cls}`}><span aria-hidden>{e.icon}</span> {e.label}</span>;
}

const VSTATUS: Record<string, { label: string; cls: string }> = {
  verified: { label: 'موثّق', cls: 'ok' },
  candidate_unverified: { label: 'مرشح غير موثّق', cls: 'muted' },
  retired: { label: 'متقاعد', cls: 'bad' },
};
export function StatusBadge({ status }: { status: string }) {
  const s = VSTATUS[status] ?? { label: status, cls: 'muted' };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

/** Shows the value, or the explicit "not officially available" text — never an empty cell that looks like data. */
export function Field({ label, value }: { label: string; value: unknown }) {
  const v = value === null || value === undefined || value === '' ? null : String(value);
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd className={v ? '' : 'na'}>{v ?? NOT_OFFICIAL}</dd>
    </div>
  );
}

export const fmtDate = (d: Date | string | null) =>
  d ? new Date(d).toISOString().slice(0, 10) : '—';
