import { getSupabaseBrowserClient } from './supabase';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function publicFetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new ApiError(response.status, 'public_request_failed', 'Public data is unavailable.');
  }
  return response.json() as Promise<T>;
}

export async function adminRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) {
    throw new ApiError(401, 'unauthorized', 'Sign in to continue.');
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session.access_token}`,
      ...init.headers,
    },
  });
  const payload = (await response.json()) as { error?: string; message?: string } & T;
  if (!response.ok) {
    if (response.status === 401 && payload.error === 'reauth_required') {
      await supabase.auth.signOut({ scope: 'local' });
      window.dispatchEvent(new Event('rallyfire:reauth'));
    }
    throw new ApiError(
      response.status,
      payload.error ?? 'request_failed',
      payload.message ?? 'The request could not be completed.',
    );
  }
  return payload;
}
