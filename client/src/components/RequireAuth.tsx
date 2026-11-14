import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { SkeletonList } from './ui/Skeleton';

/** Convenience redirect only; the server enforces every permission itself. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <main className="page page-narrow">
        <SkeletonList rows={3} label="Checking your sign-in…" />
      </main>
    );
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
