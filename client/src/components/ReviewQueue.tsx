import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, STAGE_LABELS, type ProjectContent, type ReviewQueue as Queue, type SecurityAudit } from '../api';
import { Alert } from './Alert';
import { TextAreaField } from './FormControls';
import { SkeletonList } from './ui/Skeleton';

const FIELD_LABELS: Record<keyof ProjectContent, string> = {
  title: 'Title',
  summary: 'Summary',
  problem: 'Problem',
  overview: 'Solution / overview',
  tags: 'Tags',
  demoUrl: 'Demo link',
};

function show(value: ProjectContent[keyof ProjectContent]): string {
  if (Array.isArray(value)) return value.join(' ');
  return value ?? '—';
}

const VERDICT_TEXT: Record<SecurityAudit['verdict'], { label: string; note: string; badge: string }> = {
  WELL: { label: 'Well', note: 'The automatic check found nothing unusual.', badge: 'badge-success' },
  SUSPICIOUS: { label: 'Suspicious', note: 'Look at the findings below before approving.', badge: 'badge-amber' },
  DANGEROUS: { label: 'Dangerous', note: 'Approval is held back. Send it back, or override with a reason if you have checked it by hand.', badge: 'badge-danger' },
};

/** The automatic security audit, shown above everything else so it is read first. */
function SecurityReport({ audit }: { audit: SecurityAudit }) {
  const text = VERDICT_TEXT[audit.verdict];
  return (
    <section className={`security-report security-${audit.verdict.toLowerCase()}`} aria-label="Security audit">
      <div className="row">
        <span className="annotation">Security audit</span>
        <span className={`badge ${text.badge}`}>{text.label}</span>
      </div>
      <p className="small">{text.note}</p>
      {audit.findings.length > 0 && (
        <ul className="security-findings">
          {audit.findings.map((f, i) => (
            <li key={i}>
              <span className={`badge ${f.severity === 'DANGEROUS' ? 'badge-danger' : 'badge-amber'}`}>{f.severity === 'DANGEROUS' ? 'Dangerous' : 'Suspicious'}</span>{' '}
              <strong>{FIELD_LABELS[f.field as keyof ProjectContent] ?? 'Image'}:</strong> {f.message}
              {f.excerpt && <code className="security-excerpt">{f.excerpt}</code>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Approve, or send back with a note. Used for both submissions and revisions. */
function Decision({
  onApprove,
  onReturn,
  returnLabel,
  busy,
  dangerous,
}: {
  onApprove: (override?: string) => void;
  onReturn: (note: string) => Promise<boolean>;
  returnLabel: string;
  busy: boolean;
  dangerous: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [overriding, setOverriding] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        {dangerous ? (
          <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => setOverriding((o) => !o)} aria-expanded={overriding}>
            Override and approve…
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onApprove()}>
            Approve
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {returnLabel}
        </button>
      </div>
      {overriding && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            onApprove(reason);
          }}
        >
          <TextAreaField
            label="Why is it safe to publish?"
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            hint="Recorded in the audit log with your name. At least 10 characters."
          />
          <button type="submit" className="btn btn-danger btn-sm" style={{ alignSelf: 'flex-start' }} disabled={busy || reason.trim().length < 10}>
            Approve despite the audit
          </button>
        </form>
      )}
      {open && (
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onReturn(note)) setOpen(false);
          }}
        >
          <TextAreaField label="Note to the owner" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} hint="Explain what needs to change." />
          <button type="submit" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} disabled={busy || note.trim().length < 3}>
            Send back
          </button>
        </form>
      )}
    </div>
  );
}

/** FR02/FR03 review queue: new submissions and changes to live projects. */
export function ReviewQueue() {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setQueue(await api<Queue>('/admin/reviews'));
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof ApiError ? err.message : 'Could not load the review queue.' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(path: string, success: string, body?: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      await api(path, { method: 'POST', body });
      setMessage({ tone: 'success', text: success });
      await load();
      return true;
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof ApiError ? (Object.values(err.fields)[0] ?? err.message) : 'Action failed.' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!queue) return message ? <Alert tone={message.tone}>{message.text}</Alert> : <SkeletonList rows={2} label="Loading review queue…" />;

  const empty = queue.submissions.length === 0 && queue.revisions.length === 0;

  return (
    <section className="stack" aria-labelledby="queue-title">
      <h2 id="queue-title">
        Review queue <span className="badge badge-navy">{queue.submissions.length + queue.revisions.length}</span>
      </h2>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {empty && (
        <div className="card empty">
          <p className="muted">Nothing waiting for review.</p>
        </div>
      )}

      {queue.submissions.map((s) => (
        <article key={s.id} className="card card-pad stack review-item">
          <div className="row space-between">
            <div className="row">
              <span className="badge badge-accent">New submission</span>
              <span className="badge badge-amber">{STAGE_LABELS[s.stage]}</span>
            </div>
            <span className="muted small">
              {s.owner.name} ({s.owner.email}) · {s.submittedAt && new Date(s.submittedAt).toLocaleString()}
            </span>
          </div>
          <h3>{s.title}</h3>
          <SecurityReport audit={s.security} />
          <dl className="details">
            {(Object.keys(FIELD_LABELS) as Array<keyof ProjectContent>)
              .filter((f) => f !== 'title')
              .map((f) => (
                <div key={f} style={{ display: 'contents' }}>
                  <dt>{FIELD_LABELS[f]}</dt>
                  <dd className="pre-wrap">
                    {/* A flagged link is shown as text, so it cannot be opened by a stray click. */}
                    {f === 'demoUrl' && s.demoUrl && s.security.verdict === 'WELL' ? (
                      <a href={s.demoUrl} target="_blank" rel="noopener noreferrer">
                        {s.demoUrl}
                      </a>
                    ) : (
                      show(s[f])
                    )}
                  </dd>
                </div>
              ))}
            <dt>Ownership</dt>
            <dd>{s.ownershipDeclaredAt ? `Declared ${new Date(s.ownershipDeclaredAt).toLocaleString()}` : 'Not declared'}</dd>
          </dl>
          {s.screenshots.length > 0 && (
            <div className="screenshot-grid">
              {s.screenshots.map((m, i) => (
                <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer">
                  <img src={m.url} alt={`Screenshot ${i + 1}`} />
                </a>
              ))}
            </div>
          )}
          <Decision
            busy={busy}
            dangerous={s.security.verdict === 'DANGEROUS'}
            returnLabel="Request changes"
            onApprove={(reason) => decide(`/admin/reviews/projects/${s.id}/approve`, `“${s.title}” is now published.`, reason ? { overrideSecurity: true, reason } : undefined)}
            onReturn={(note) => decide(`/admin/reviews/projects/${s.id}/request-changes`, `Changes requested for “${s.title}”.`, { note })}
          />
        </article>
      ))}

      {queue.revisions.map((r) => {
        const changed = (Object.keys(FIELD_LABELS) as Array<keyof ProjectContent>).filter((f) => show(r.current[f]) !== show(r.proposed[f]));
        return (
          <article key={r.id} className="card card-pad stack review-item">
            <div className="row space-between">
              <span className="badge badge-navy">Change to a live project</span>
              <span className="muted small">
                {r.owner.name} · {new Date(r.submittedAt).toLocaleString()}
              </span>
            </div>
            <h3>{r.current.title}</h3>
            <SecurityReport audit={r.security} />
            <p className="muted small">The current version stays live until you approve. Changed: {changed.map((f) => FIELD_LABELS[f]).join(', ') || 'nothing'}.</p>
            {changed.map((f) => (
              <div key={f} className="diff">
                <strong>{FIELD_LABELS[f]}</strong>
                <div className="diff-cols">
                  <div className="diff-old">
                    <span className="small muted">Current</span>
                    <p className="pre-wrap">{show(r.current[f])}</p>
                  </div>
                  <div className="diff-new">
                    <span className="small muted">Proposed</span>
                    <p className="pre-wrap">{show(r.proposed[f])}</p>
                  </div>
                </div>
              </div>
            ))}
            <Decision
              busy={busy}
              dangerous={r.security.verdict === 'DANGEROUS'}
              returnLabel="Reject change"
              onApprove={(reason) => decide(`/admin/reviews/revisions/${r.id}/approve`, 'Change approved and now live.', reason ? { overrideSecurity: true, reason } : undefined)}
              onReturn={(note) => decide(`/admin/reviews/revisions/${r.id}/reject`, 'Change rejected. The current version stays live.', { note })}
            />
          </article>
        );
      })}
    </section>
  );
}
