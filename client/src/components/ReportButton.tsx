import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, ApiError, REPORT_CATEGORY_LABELS, type ReportCategory } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useDialogMotion } from '../motion';
import { Alert } from './Alert';
import { FormField } from './FormField';
import { CheckboxField, SelectField, TextAreaField } from './FormControls';

type Target = 'PROJECT' | 'COMMENT' | 'USER' | 'OFFER' | 'CONVERSATION';

/** Only content someone can own can infringe copyright; the server applies the same rule. */
const COPYRIGHT_TARGETS: Target[] = ['PROJECT', 'COMMENT', 'OFFER'];

/** FR13: any signed-in Uploader or Professional, Restricted ones included, can report. Admins act on reports instead. */
export function ReportButton({ targetType, targetId, label = 'Report', className = 'btn btn-ghost btn-sm' }: { targetType: Target; targetId: string; label?: string; className?: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user || user.role === 'ADMIN') return null;

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && <ReportDialog targetType={targetType} targetId={targetId} onClose={() => setOpen(false)} />}
    </>
  );
}

/** NFR-L1: the report form, with a category and, for copyright, the owner's statement. */
function ReportDialog({ targetType, targetId, onClose }: { targetType: Target; targetId: string; onClose: () => void }) {
  const { ref, requestClose, onCancel } = useDialogMotion(onClose);
  const categories = (Object.keys(REPORT_CATEGORY_LABELS) as ReportCategory[]).filter((c) => c !== 'COPYRIGHT' || COPYRIGHT_TARGETS.includes(targetType));
  const [category, setCategory] = useState<ReportCategory | ''>('');
  const [reason, setReason] = useState('');
  const [originalWorkUrl, setOriginalWorkUrl] = useState('');
  const [ownsWork, setOwnsWork] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const copyright = category === 'COPYRIGHT';

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found: Record<string, string | undefined> = {
      category: category ? undefined : 'Choose what kind of problem this is.',
      reason: reason.trim().length >= 10 ? undefined : 'Explain what is wrong in at least 10 characters.',
      ownsWork: copyright && !ownsWork ? 'Confirm that you own the work or are authorised to act for its owner.' : undefined,
    };
    const problems = Object.fromEntries(Object.entries(found).filter(([, v]) => v)) as Record<string, string>;
    setErrors(problems);
    setError('');
    if (Object.keys(problems).length) return;
    setBusy(true);
    try {
      await api('/reports', {
        body: { targetType, targetId, category, reason: reason.trim(), ...(copyright ? { ownsWork, originalWorkUrl: originalWorkUrl.trim() } : {}) },
      });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setError(err.message);
      } else setError('Could not send the report.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="dialog card" onCancel={onCancel} aria-labelledby="report-dialog-title">
      <div className="form">
        <h2 id="report-dialog-title">Report this {targetType.toLowerCase()}</h2>
        {done ? (
          <>
            <Alert tone="success">Thank you. The Admins will review your report, and you will get a notification when it is closed.</Alert>
            <button type="button" className="btn btn-primary" onClick={requestClose} style={{ alignSelf: 'flex-start' }}>
              Close
            </button>
          </>
        ) : (
          <form className="form" onSubmit={submit} noValidate>
            <p className="muted">
              A report changes nothing until an Admin reviews it. See the{' '}
              <Link to="/policy" target="_blank" rel="noreferrer">
                Content policy
              </Link>{' '}
              for what each category means.
            </p>
            {error && <Alert tone="error">{error}</Alert>}
            <SelectField label="What kind of problem is it?" value={category} onChange={(e) => setCategory(e.target.value as ReportCategory)} error={errors.category} disabled={busy} autoFocus>
              <option value="" disabled>
                Choose a category
              </option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {REPORT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </SelectField>
            <TextAreaField
              label={copyright ? 'What was copied, and from where?' : 'What is wrong?'}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              rows={4}
              disabled={busy}
              error={errors.reason}
              hint="At least 10 characters. Only the Admins can read this."
            />
            {copyright && (
              <>
                <FormField
                  label="Link to the original work (optional)"
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  value={originalWorkUrl}
                  onChange={(e) => setOriginalWorkUrl(e.target.value)}
                  error={errors.originalWorkUrl}
                  maxLength={500}
                  disabled={busy}
                />
                <CheckboxField
                  label="I own this work, or I am authorised to act for its owner, and this report is accurate to the best of my knowledge."
                  checked={ownsWork}
                  onChange={setOwnsWork}
                  error={errors.ownsWork}
                  disabled={busy}
                />
              </>
            )}
            <div className="row">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Sending…' : 'Send report'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={requestClose} disabled={busy}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
