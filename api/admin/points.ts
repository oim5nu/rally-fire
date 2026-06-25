import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { handleApiError, methodNotAllowed, requestBody, sendJson } from '../../server/api.js';
import { requireRequestAdmin } from '../../server/auth/request.js';
import { getDatabase } from '../../server/db/client.js';
import { auditLog, pointLedger, seasonRoster, seasons } from '../../server/db/schema.js';
import { buildBulkPointAdjustments, pointValueSchema } from '../../server/domain/points.js';

const notesSchema = z.string().trim().min(1).max(500);
const idempotencyKeySchema = z.string().trim().min(8).max(200);

const singleAdjustmentSchema = z.object({
  playerId: z.uuid(),
  points: pointValueSchema.refine((value) => value !== 0, 'Points cannot be zero.'),
  notes: notesSchema,
  idempotencyKey: idempotencyKeySchema,
});

const bulkAdjustmentSchema = z.object({
  adjustments: z.array(z.object({
    playerId: z.uuid(),
    points: pointValueSchema,
  })).min(1),
  notes: notesSchema,
  idempotencyKey: idempotencyKeySchema,
});

const adjustmentSchema = z.union([bulkAdjustmentSchema, singleAdjustmentSchema]);

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

    if ('adjustments' in input) {
      let adjustments;
      try {
        adjustments = buildBulkPointAdjustments(input.adjustments);
      } catch (error) {
        sendJson(response, 400, {
          error: 'invalid_request',
          message: error instanceof Error ? error.message : 'The request data is invalid.',
        });
        return;
      }

      const rosterEntries = await database
        .select({ playerId: seasonRoster.playerId })
        .from(seasonRoster)
        .where(and(
          eq(seasonRoster.seasonId, season.id),
          inArray(seasonRoster.playerId, adjustments.map((adjustment) => adjustment.playerId)),
        ));
      const rosterPlayerIds = new Set(rosterEntries.map((entry) => entry.playerId));
      if (adjustments.some((adjustment) => !rosterPlayerIds.has(adjustment.playerId))) {
        sendJson(response, 404, { error: 'player_not_in_active_season' });
        return;
      }

      const entries = await database.transaction(async (transaction) => {
        const insertedEntries = await transaction
          .insert(pointLedger)
          .values(adjustments.map((adjustment) => ({
            seasonId: season.id,
            playerId: adjustment.playerId,
            points: adjustment.points,
            reason: 'manual_adjustment' as const,
            idempotencyKey: `${input.idempotencyKey}:${adjustment.playerId}`,
            notes: input.notes,
            createdBy: admin.membership.id,
          })))
          .onConflictDoNothing({ target: pointLedger.idempotencyKey })
          .returning();

        if (insertedEntries.length > 0) {
          await transaction.insert(auditLog).values({
            actorMembershipId: admin.membership.id,
            action: 'points.bulk_adjusted',
            entityType: 'point_ledger',
            entityId: input.idempotencyKey,
            details: {
              count: adjustments.length,
              playerIds: adjustments.map((adjustment) => adjustment.playerId),
              notes: input.notes,
            },
          });
        }

        return insertedEntries;
      });

      if (entries.length === 0) {
        sendJson(response, 200, { duplicate: true, entries: [] });
        return;
      }
      sendJson(response, 201, { entries, duplicate: false });
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
