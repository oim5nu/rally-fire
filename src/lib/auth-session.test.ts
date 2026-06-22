import { describe, expect, it } from 'vitest';
import { invitationCallbackError, waitForAuthSession } from './auth-session';

describe('Supabase invitation callbacks', () => {
  it('surfaces callback errors returned in either query or hash parameters', () => {
    expect(
      invitationCallbackError(
        '?setup=1&error=access_denied&error_description=Email%20link%20is%20invalid',
        '',
      ),
    ).toBe('Email link is invalid');
    expect(
      invitationCallbackError(
        '?setup=1',
        '#error=access_denied&error_description=Email%20link%20has%20expired',
      ),
    ).toBe('Email link has expired');
  });

  it('waits for Supabase to establish the invitation session', async () => {
    let callback: ((event: string, session: object | null) => void) | undefined;
    const auth = {
      async getSession() {
        return { data: { session: null }, error: null };
      },
      onAuthStateChange(listener: typeof callback) {
        callback = listener;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    };

    const sessionPromise = waitForAuthSession(auth, 100);
    callback?.('SIGNED_IN', { access_token: 'token' });

    await expect(sessionPromise).resolves.toBe(true);
  });

  it('returns false when no invitation session is established', async () => {
    const auth = {
      async getSession() {
        return { data: { session: null }, error: null };
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } };
      },
    };

    await expect(waitForAuthSession(auth, 1)).resolves.toBe(false);
  });
});
