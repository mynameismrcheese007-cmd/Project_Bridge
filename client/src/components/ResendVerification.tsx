import { useState } from 'react';
import { api, ApiError } from '../api';
import { Button } from './ui/Button';

/** Asks for a fresh sign-up link. The server answers the same whether or not a sign-up is waiting. */
export function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  async function resend() {
    setState('sending');
    setError('');
    try {
      await api('/auth/resend-verification', { body: { email } });
      setState('sent');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send a new link.');
      setState('idle');
    }
  }

  return (
    <div>
      <Button type="button" variant="secondary" block onClick={resend} loading={state === 'sending'} disabled={state === 'sent'}>
        {state === 'sent' ? 'New link sent' : 'Send a new link'}
      </Button>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
