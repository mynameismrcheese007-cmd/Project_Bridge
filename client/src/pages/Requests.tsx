import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, ApiError, type ContactRequest } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Alert } from '../components/Alert';
import { Avatar } from '../components/Avatar';
import { useToast } from '../components/ui/Toast';
import { TabPanel, Tabs } from '../components/ui/Tabs';
import { SkeletonList } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';

type Box = 'incoming' | 'outgoing';

const STATUS_BADGE: Record<ContactRequest['status'], { label: string; badge: string }> = {
  PENDING: { label: 'Waiting for reply', badge: 'badge-amber' },
  ACCEPTED: { label: 'Accepted', badge: 'badge-success' },
  DECLINED: { label: 'Declined', badge: '' },
  WITHDRAWN: { label: 'Withdrawn', badge: '' },
};

/** FR10: contact requests you received and sent. Only the recipient accepts or declines; only the sender withdraws. */
export function Requests() {
  const { user } = useAuth();
  const [box, setBox] = useState<Box>('incoming');
  const [items, setItems] = useState<ContactRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const toast = useToast();

  const load = useCallback(async (which: Box) => {
    setLoading(true);
    setError('');
    try {
      const res = await api<{ items: ContactRequest[] }>(`/messaging/requests?box=${which}`);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(box);
  }, [box, load]);

  async function act(id: string, action: 'accept' | 'decline' | 'withdraw') {
    setBusyId(id);
    setError('');
    try {
      await api(`/messaging/requests/${id}/${action}`, { method: 'POST' });
      toast(action === 'accept' ? 'Accepted. A private conversation has been opened between you.' : action === 'decline' ? 'Request declined.' : 'Request withdrawn.');
      await load(box);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusyId(null);
    }
  }

  const canAccept = user?.status === 'ACTIVE';

  return (
    <main className="page page-narrow stack">
      <header className="page-header">
        <h1>Contact requests</h1>
        <p className="muted">People who want to talk about a project. Emails are never shown; accepting opens a private conversation.</p>
      </header>

      <Tabs
        name="requests"
        label="Request lists"
        value={box}
        onChange={setBox}
        items={[
          { id: 'incoming', label: 'Received' },
          { id: 'outgoing', label: 'Sent' },
        ]}
      />
      <TabPanel name="requests" value={box} className="stack">

      {error && <Alert tone="error">{error}</Alert>}
      {loading && <SkeletonList rows={3} avatar label="Loading requests…" />}
      {!loading && items.length === 0 && !error && (
        <EmptyState title={box === 'incoming' ? 'No one has contacted you yet' : 'You have not sent any requests yet'} action={<Link to="/" className="btn btn-secondary btn-sm">Explore projects</Link>}>
          {box === 'incoming' ? 'When someone wants to talk about one of your projects, their request appears here.' : 'Open a project and choose “Contact the team” to start a conversation.'}
        </EmptyState>
      )}

      {!loading &&
        items.map((r) => {
          const other = box === 'incoming' ? r.from : r.to;
          const status = STATUS_BADGE[r.status];
          return (
            <article key={r.id} className="card card-pad stack">
              <div className="row space-between">
                <div className="row">
                  <Avatar name={other?.name ?? '?'} size={32} />
                  <strong>{box === 'incoming' ? `From ${other?.name}` : `To ${other?.name}`}</strong>
                </div>
                <span className={`badge ${status.badge}`}>{status.label}</span>
              </div>
              {r.project && (
                <p className="small muted">
                  About <Link to={`/projects/${r.project.id}`}>{r.project.title}</Link>
                </p>
              )}
              <p className="comment-body">{r.introduction ?? <span className="muted">This message cannot be shown.</span>}</p>
              <time className="muted small" dateTime={r.createdAt}>
                Sent {new Date(r.createdAt).toLocaleString()}
              </time>
              {r.status === 'ACCEPTED' && r.conversationId && (
                <Link to={`/messages/${r.conversationId}`} className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }}>
                  Open conversation
                </Link>
              )}
              {r.status === 'PENDING' && (
                <div className="row">
                  {box === 'incoming' ? (
                    <>
                      <button type="button" className="btn btn-primary btn-sm" disabled={busyId === r.id || !canAccept} onClick={() => act(r.id, 'accept')}>
                        Accept
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={busyId === r.id} onClick={() => act(r.id, 'decline')}>
                        Decline
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-secondary btn-sm" disabled={busyId === r.id} onClick={() => act(r.id, 'withdraw')}>
                      Withdraw
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </TabPanel>
    </main>
  );
}
