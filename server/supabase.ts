import { createClient } from '@supabase/supabase-js';
import type { VercelRequest } from '@vercel/node';
import { AdminAuthorizationError, type VerifiedIdentity } from './auth/authorize.js';
import { extractBearerToken, readSessionId } from './auth/token.js';
import { getServerEnvironment } from './env.js';

interface SupabaseAdminClient {
  auth: {
    getUser: (jwt: string) => Promise<{
      data: { user: { id: string; email?: string; email_confirmed_at?: string } | null };
      error: Error | null;
    }>;
    admin: {
      inviteUserByEmail: (email: string, options: { redirectTo?: string }) => Promise<{
        data: { user: { id: string } | null };
        error: Error | null;
      }>;
    };
  };
}

let adminClient: SupabaseAdminClient | undefined;

export function getSupabaseAdminClient() {
  if (!adminClient) {
    const environment = getServerEnvironment();
    adminClient = createClient(environment.SUPABASE_URL, environment.SUPABASE_SECRET_KEY, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    }) as unknown as SupabaseAdminClient;
  }
  return adminClient;
}

export async function verifyRequestIdentity(request: VercelRequest): Promise<VerifiedIdentity> {
  const header = request.headers.authorization;
  const authorization = Array.isArray(header) ? header[0] : header;
  let token: string;
  try {
    token = extractBearerToken(authorization);
  } catch {
    throw new AdminAuthorizationError('unauthorized', 'A valid login is required.');
  }

  const { data, error } = await getSupabaseAdminClient().auth.getUser(token);
  if (error || !data.user?.email) {
    throw new AdminAuthorizationError('unauthorized', 'The login token is invalid or expired.');
  }

  return {
    userId: data.user.id,
    email: data.user.email,
    emailVerified: Boolean(data.user.email_confirmed_at),
    sessionId: readSessionId(token),
  };
}
