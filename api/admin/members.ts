import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, count, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { ApiConflictError, handleApiError, methodNotAllowed, requestBody, sendJson } from '../../server/api';
import { requireSuperadmin } from '../../server/auth/authorize';
import { requireRequestAdmin } from '../../server/auth/request';
import { getDatabase } from '../../server/db/client';
import { mayDisableMembership } from '../../server/domain/admin-access';
import { adminMemberships, adminSessionGrants, auditLog } from '../../server/db/schema';

const updateMembershipSchema = z
  .object({
    membershipId: z.uuid(),
    role: z.enum(['admin', 'superadmin']).optional(),
    status: z.enum(['active', 'disabled']).optional(),
    revokeSessions: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.role !== undefined || input.status !== undefined || input.revokeSessions === true,
    {
    message: 'A role or status change is required.',
    },
  );

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    const admin = await requireRequestAdmin(request);
    requireSuperadmin(admin.membership);
    const database = getDatabase();

    if (request.method === 'GET') {
      const memberships = await database
        .select()
        .from(adminMemberships)
        .orderBy(adminMemberships.createdAt);
      sendJson(response, 200, { memberships });
      return;
    }
    if (request.method !== 'PATCH') {
      methodNotAllowed(response, ['GET', 'PATCH']);
      return;
    }

    const input = updateMembershipSchema.parse(requestBody(request));
    const updated = await database.transaction(async (transaction) => {
      const [target] = await transaction
        .select()
        .from(adminMemberships)
        .where(eq(adminMemberships.id, input.membershipId))
        .for('update')
        .limit(1);
      if (!target) {
        return null;
      }

      const removesSuperadmin =
        target.status === 'active' &&
        target.role === 'superadmin' &&
        (input.status === 'disabled' || input.role === 'admin');
      if (removesSuperadmin) {
        const [row] = await transaction
          .select({ value: count() })
          .from(adminMemberships)
          .where(
            and(
              eq(adminMemberships.role, 'superadmin'),
              eq(adminMemberships.status, 'active'),
            ),
          );
        if (!mayDisableMembership({ targetRole: 'superadmin', activeSuperadminCount: row.value })) {
          throw new ApiConflictError(
            'last_superadmin_protected',
            'The last active superadministrator cannot be disabled or demoted.',
          );
        }
      }

      const [membership] = await transaction
        .update(adminMemberships)
        .set({
          ...(input.role ? { role: input.role } : {}),
          ...(input.status ? { status: input.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(adminMemberships.id, target.id))
        .returning();
      if (input.status === 'disabled' || input.revokeSessions) {
        await transaction
          .update(adminSessionGrants)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(adminSessionGrants.membershipId, target.id),
              isNull(adminSessionGrants.revokedAt),
            ),
          );
      }
      await transaction.insert(auditLog).values({
        actorMembershipId: admin.membership.id,
        action: 'admin.updated',
        entityType: 'admin_membership',
        entityId: target.id,
        details: input,
      });
      return membership;
    }, { isolationLevel: 'serializable' });

    if (!updated) {
      sendJson(response, 404, { error: 'membership_not_found' });
      return;
    }
    sendJson(response, 200, { membership: updated });
  } catch (error) {
    handleApiError(error, response);
  }
}
