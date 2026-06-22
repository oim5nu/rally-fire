import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { handleApiError, methodNotAllowed, requestBody, sendJson } from '../../server/api.js';
import { requireRequestAdmin } from '../../server/auth/request.js';
import { getDatabase } from '../../server/db/client.js';
import { auditLog, pointLedger, seasonRoster, seasons } from '../../server/db/schema.js';
import { pointValueSchema } from '../../server/domain/points.js';

const adjustmentSchema = z.object({
  playerId: z.uuid(),
  points: pointValueSchema.refine((value) => value !== 0, 'Points cannot be zero.'),
  notes: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    methodNotAllowed(response, ['POST']);
    return;
  }
  try {
    const admin = await requireRequestAdmin(request);
    const input = adjustmentSchema.parse(requestBody(request));
    const database = getDatabase();
    const [season] = await database.select().from(seasons).where(eq(seasons.status, 'active')).limit(1);
    if (!season) {
      sendJson(response, 409, { error: 'active_season_required' });
      return;
    }
    const [rosterEntry] = await database
      .select()
      .from(seasonRoster)
      .where(
        and(
          eq(seasonRoster.playerId, input.playerId),
          eq(seasonRoster.seasonId, season.id),
        ),
      )
      .limit(1);
    if (!rosterEntry || rosterEntry.seasonId !== season.id) {
      sendJson(response, 404, { error: 'player_not_in_active_season' });
      return;
    }

    const [entry] = await database
      .insert(pointLedger)
      .values({
        seasonId: season.id,
        playerId: input.playerId,
        points: input.points,
        reason: 'manual_adjustment',
        idempotencyKey: input.idempotencyKey,
        notes: input.notes,
        createdBy: admin.membership.id,
      })
      .onConflictDoNothing({ target: pointLedger.idempotencyKey })
      .returning();
    if (!entry) {
      sendJson(response, 200, { duplicate: true });
      return;
    }
    await database.insert(auditLog).values({
      actorMembershipId: admin.membership.id,
      action: 'points.adjusted',
      entityType: 'point_ledger',
      entityId: entry.id,
      details: { playerId: input.playerId, points: input.points, notes: input.notes },
    });
    sendJson(response, 201, { entry, duplicate: false });
  } catch (error) {
    handleApiError(error, response);
  }
}
