import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { handleApiError, methodNotAllowed, requestBody, sendJson } from '../../server/api.js';
import { requireSuperadmin } from '../../server/auth/authorize.js';
import { requireRequestAdmin } from '../../server/auth/request.js';
import { getDatabase } from '../../server/db/client.js';
import { auditLog, playSessions, seasons } from '../../server/db/schema.js';
import { pointValueSchema } from '../../server/domain/points.js';

const createSeasonSchema = z.object({
  name: z.string().trim().min(1).max(100),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable().optional(),
  winPoints: pointValueSchema.nonnegative().default(150),
  lossPoints: pointValueSchema.nonnegative().default(30),
});
const updateSeasonSchema = z.object({
  seasonId: z.uuid(),
  name: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['active', 'archived']).optional(),
  endsAt: z.iso.datetime().nullable().optional(),
  winPoints: pointValueSchema.nonnegative().optional(),
  lossPoints: pointValueSchema.nonnegative().optional(),
});

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    const admin = await requireRequestAdmin(request);
    const database = getDatabase();
    if (request.method === 'GET') {
      const rows = await database.select().from(seasons).orderBy(desc(seasons.startsAt));
      sendJson(response, 200, { seasons: rows });
      return;
    }
    requireSuperadmin(admin.membership);

    if (request.method === 'POST') {
      const input = createSeasonSchema.parse(requestBody(request));
      const [active] = await database.select({ id: seasons.id }).from(seasons).where(eq(seasons.status, 'active')).limit(1);
      if (active) {
        sendJson(response, 409, { error: 'active_season_exists' });
        return;
      }
      const [season] = await database
        .insert(seasons)
        .values({
          ...input,
          startsAt: new Date(input.startsAt),
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          createdBy: admin.membership.id,
        })
        .returning();
      await database.insert(auditLog).values({
        actorMembershipId: admin.membership.id,
        action: 'season.created',
        entityType: 'season',
        entityId: season.id,
        details: { name: season.name },
      });
      sendJson(response, 201, { season });
      return;
    }
    if (request.method === 'PATCH') {
      const input = updateSeasonSchema.parse(requestBody(request));
      if (input.status === 'archived') {
        const [activeSession] = await database
          .select({ id: playSessions.id })
          .from(playSessions)
          .where(
            and(
              eq(playSessions.seasonId, input.seasonId),
              inArray(playSessions.status, ['draft', 'draw_published', 'in_progress']),
            ),
          )
          .limit(1);
        if (activeSession) {
          sendJson(response, 409, { error: 'active_session_must_finish' });
          return;
        }
      }
      const [season] = await database
        .update(seasons)
        .set({
          ...(input.name ? { name: input.name } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? new Date(input.endsAt) : null } : {}),
          ...(input.winPoints !== undefined ? { winPoints: input.winPoints } : {}),
          ...(input.lossPoints !== undefined ? { lossPoints: input.lossPoints } : {}),
          updatedAt: new Date(),
        })
        .where(eq(seasons.id, input.seasonId))
        .returning();
      if (!season) {
        sendJson(response, 404, { error: 'season_not_found' });
        return;
      }
      await database.insert(auditLog).values({
        actorMembershipId: admin.membership.id,
        action: 'season.updated',
        entityType: 'season',
        entityId: season.id,
        details: input,
      });
      sendJson(response, 200, { season });
      return;
    }
    methodNotAllowed(response, ['GET', 'POST', 'PATCH']);
  } catch (error) {
    handleApiError(error, response);
  }
}
