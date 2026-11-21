import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, ApiError } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Alert } from '../components/Alert';
import { AuthLayout } from '../components/AuthLayout';

/**
 * Opened from the sign-up email. The link only carries the token; this page sends it, so a mail
 * scanner that merely fetches the link cannot use it up.
 */
export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(token ? '' : 'This link is missing its token.');
  // The link works once, so React's development double-run must not send it twice.
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    api('/auth/verify-email', { body: { token } })
      .then(async () => {
        await refresh();
        navigate('/account', { replace: true });
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try the link again.'));
  }, [token, refresh, navigate]);

  // Reopening a used link after confirming is not a problem worth an error.
  if (error && user) {
    return (
      <AuthLayout title="Email confirmed">
        <Alert tone="success">Your email is already confirmed and you are signed in.</Alert>
        <Link to="/account" className="btn btn-primary btn-block btn-lg">
          Go to my account
        </Link>
      </AuthLayout>
    );
  }

  if (error) {
    return (
      <AuthLayout
        title="Link not valid"
        footer={
          <span>
            Already confirmed? <Link to="/login">Sign in</Link>
          </span>
        }
      >
        <Alert tone="error">{error}</Alert>
        <p className="muted">Sign in with the email and password you chose to get a new link, or sign up again.</p>
        <Link to="/register" className="btn btn-primary btn-block btn-lg">
          Sign up again
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Confirming your email">
      <Alert tone="info">One moment while we finish creating your account.</Alert>
    </AuthLayout>
  );
}
