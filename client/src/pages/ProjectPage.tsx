import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, ApiError, type ProjectDetail, type ViewerTier } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Alert } from '../components/Alert';
import { GuestCapPrompt } from '../components/GuestCapPrompt';
import { ProjectView } from '../components/ProjectView';
import { Skeleton } from '../components/ui/Skeleton';
import { Icon } from '../components/Icon';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; tier: ViewerTier; project: ProjectDetail }
  | { kind: 'not-found' }
  | { kind: 'guest-cap' }
  | { kind: 'error'; message: string };

/** FR07: the role-specific project view. Direct links get exactly the same rules as cards. */
export function ProjectPage() {
  const { id = '' } = useParams();
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<State>({ kind: 'loading' });
  // The owner and accepted editors may edit the bulletin. The workspace answers only them; anyone else gets 404.
  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => {
    setCanEdit(false);
    if (authLoading || !user || user.role === 'ADMIN') return;
    let cancelled = false;
    api(`/projects/${encodeURIComponent(id)}/workspace`)
      .then(() => !cancelled && setCanEdit(true))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id, authLoading, user?.id, user?.role]);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setState({ kind: 'loading' });
    api<{ tier: ViewerTier; project: ProjectDetail }>(`/projects/${encodeURIComponent(id)}`)
      .then((res) => !cancelled && setState({ kind: 'ready', ...res }))
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setState({ kind: 'not-found' });
        else if (err instanceof ApiError && err.code === 'GUEST_LIMIT') setState({ kind: 'guest-cap' });
        else setState({ kind: 'error', message: err instanceof ApiError ? err.message : 'Could not load this project.' });
      });
    return () => {
      cancelled = true;
    };
  }, [id, authLoading, user?.id]);

  return (
    <main className="page page-narrow">
      <Link to="/" className="back-link">
        <Icon name="arrow-left" /> Back to Explore
      </Link>
      {state.kind === 'loading' && (
        <div className="skeleton-stack" role="status" aria-busy="true">
          <span className="visually-hidden">Loading project…</span>
          <div className="card card-pad skeleton-stack" aria-hidden="true">
            <Skeleton width={96} height={20} />
            <Skeleton width="62%" height={40} />
            <Skeleton width="90%" height={16} />
            <Skeleton width="74%" height={16} />
            <Skeleton width={220} height={40} />
          </div>
          <div className="card card-pad skeleton-stack" aria-hidden="true">
            <Skeleton width={160} height={22} />
            <Skeleton height={150} />
          </div>
        </div>
      )}
      {state.kind === 'error' && <Alert tone="error">{state.message}</Alert>}
      {state.kind === 'guest-cap' && <GuestCapPrompt limit={20} />}
      {state.kind === 'not-found' && (
        <section className="card empty">
          <h1>Project not available</h1>
          <p className="muted">It may be unpublished, hidden by its owner, or removed.</p>
          {user && (
            <p className="muted">
              If it is yours, open it from <Link to="/my-projects">My projects</Link>.
            </p>
          )}
        </section>
      )}
      {state.kind === 'ready' && <ProjectView project={state.project} tier={state.tier} canEdit={canEdit} />}
    </main>
  );
}
