import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { handleApiError, methodNotAllowed, requestBody, sendJson } from '../../server/api.js';
import { requireSuperadmin } from '../../server/auth/authorize.js';
import { invitationErrorResponse } from '../../server/auth/invitation-error.js';
import { requireRequestAdmin } from '../../server/auth/request.js';
import { getDatabase } from '../../server/db/client.js';
import { adminMemberships, auditLog } from '../../server/db/schema.js';
import { getSupabaseAdminClient } from '../../server/supabase.js';

const invitationSchema = z.object({
  email: z.email(),
  role: z.enum(['admin', 'superadmin']).default('admin'),
});

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    methodNotAllowed(response, ['POST']);
    return;
  }

  try {
    const admin = await requireRequestAdmin(request);
    requireSuperadmin(admin.membership);
    const input = invitationSchema.parse(requestBody(request));
    const email = input.email.trim().toLowerCase();
    const database = getDatabase();
    const [existing] = await database
      .select({ id: adminMemberships.id })
      .from(adminMemberships)
      .where(sql`lower(${adminMemberships.email}) = ${email}`)
      .limit(1);
    if (existing) {
      sendJson(response, 409, { error: 'membership_exists' });
      return;
    }

    const forwardedProtocol = request.headers['x-forwarded-proto'];
    const protocol = Array.isArray(forwardedProtocol) ? forwardedProtocol[0] : forwardedProtocol ?? 'https';
    const hostHeader = request.headers['x-forwarded-host'] ?? request.headers.host;
    const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
    const redirectTo = host ? `${protocol}://${host}/?setup=1` : undefined;
    const { data, error } = await getSupabaseAdminClient().auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });
    if (error || !data.user) {
      throw error ?? new Error('Supabase did not return the invited user.');
    }

    const [membership] = await database
      .insert(adminMemberships)
      .values({
        authUserId: data.user.id,
        email,
        role: input.role,
        invitedBy: admin.membership.id,
      })
      .returning();
    await database.insert(auditLog).values({
      actorMembershipId: admin.membership.id,
      action: 'admin.invited',
      entityType: 'admin_membership',
      entityId: membership.id,
      details: { email, role: input.role },
    });

    sendJson(response, 201, { membership });
  } catch (error) {
    const invitationError = invitationErrorResponse(error);
    if (invitationError) {
      console.error(error);
      sendJson(response, invitationError.status, invitationError.body);
      return;
    }
    handleApiError(error, response);
  }
}
