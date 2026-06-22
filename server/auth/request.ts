import type { VercelRequest } from '@vercel/node';
import { getServerEnvironment } from '../env.js';
import { verifyRequestIdentity } from '../supabase.js';
import { authorizeAdminSession } from './authorize.js';
import { DrizzleAdminAuthRepository } from './drizzle-repository.js';

export async function requireRequestAdmin(request: VercelRequest) {
  const environment = getServerEnvironment();
  const identity = await verifyRequestIdentity(request);
  return authorizeAdminSession({
    identity,
    initialSuperadminEmail: environment.INITIAL_SUPERADMIN_EMAIL,
    ttlHours: environment.ADMIN_SESSION_TTL_HOURS,
    now: new Date(),
    repository: new DrizzleAdminAuthRepository(),
  });
}
