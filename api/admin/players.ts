import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { handleApiError, methodNotAllowed, requestBody, sendJson } from '../../server/api.js';
import { requireRequestAdmin } from '../../server/auth/request.js';
import { getDatabase } from '../../server/db/client.js';
import {
  auditLog,
  players,
  playSessions,
  pointLedger,
  seasonRoster,
  seasons,
  sessionParticipants,
} from '../../server/db/schema.js';
import { pointValueSchema } from '../../server/domain/points.js';
import { planSeasonRosterRemoval } from '../../server/domain/roster.js';

const createPlayerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().nullable().optional(),
  displayRating: z.string().trim().min(1).max(20),
  clubSkill: z.number().int().min(1).max(10),
  openingPoints: pointValueSchema.default(0),
});
const updatePlayerSchema = z.object({
  playerId: z.uuid(),
  name: z.string().trim().min(1).max(100).optional(),
  email: z.email().nullable().optional(),
  displayRating: z.string().trim().min(1).max(20).optional(),
  clubSkill: z.number().int().min(1).max(10).optional(),
  active: z.boolean().optional(),
});
const deletePlayerSchema = z.object({
  playerId: z.uuid(),
});
const removableSessionStatuses = ['draft', 'draw_published', 'in_progress'] as const;

function activeRosterSessionStatus(status: string | undefined) {
  return removableSessionStatuses.find((candidate) => candidate === status) ?? null;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    const admin = await requireRequestAdmin(request);
    const database = getDatabase();
    const [season] = await database.select().from(seasons).where(eq(seasons.status, 'active')).limit(1);
    if (!season) {
      sendJson(response, 409, { error: 'active_season_required' });
      return;
    }

    if (request.method === 'GET') {
      const rows = await database
        .select({
          id: players.id,
          name: players.name,
          email: players.email,
          displayRating: players.displayRating,
          clubSkill: players.clubSkill,
          active: players.active,
          points: sql<number>`coalesce(sum(${pointLedger.points}), 0)`.mapWith(Number),
        })
        .from(seasonRoster)
        .innerJoin(players, eq(players.id, seasonRoster.playerId))
        .leftJoin(
          pointLedger,
          and(eq(pointLedger.playerId, players.id), eq(pointLedger.seasonId, season.id)),
        )
        .where(eq(seasonRoster.seasonId, season.id))
        .groupBy(players.id)
        .orderBy(players.name);
      sendJson(response, 200, { season, players: rows });
      return;
    }

    if (request.method === 'POST') {
      const input = createPlayerSchema.parse(requestBody(request));
      const created = await database.transaction(async (transaction) => {
        const [player] = await transaction
          .insert(players)
          .values({
            name: input.name,
            email: input.email?.toLowerCase() ?? null,
            displayRating: input.displayRating,
            clubSkill: input.clubSkill,
          })
          .returning();
        await transaction.insert(seasonRoster).values({ seasonId: season.id, playerId: player.id });
        if (input.openingPoints !== 0) {
          await transaction.insert(pointLedger).values({
            seasonId: season.id,
            playerId: player.id,
            points: input.openingPoints,
            reason: 'opening_balance',
            idempotencyKey: `opening:${season.id}:${player.id}`,
            createdBy: admin.membership.id,
          });
        }
        await transaction.insert(auditLog).values({
          actorMembershipId: admin.membership.id,
          action: 'player.created',
          entityType: 'player',
          entityId: player.id,
          details: { seasonId: season.id, openingPoints: input.openingPoints },
        });
        return player;
      });
      sendJson(response, 201, { player: created });
      return;
    }

    if (request.method === 'PATCH') {
      const input = updatePlayerSchema.parse(requestBody(request));
      const [player] = await database
        .update(players)
        .set({
          ...(input.name ? { name: input.name } : {}),
          ...(input.email !== undefined ? { email: input.email?.toLowerCase() ?? null } : {}),
          ...(input.displayRating ? { displayRating: input.displayRating } : {}),
          ...(input.clubSkill !== undefined ? { clubSkill: input.clubSkill } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          updatedAt: new Date(),
        })
        .where(eq(players.id, input.playerId))
        .returning();
      if (!player) {
        sendJson(response, 404, { error: 'player_not_found' });
        return;
      }
      await database.insert(auditLog).values({
        actorMembershipId: admin.membership.id,
        action: 'player.updated',
        entityType: 'player',
        entityId: player.id,
        details: input,
      });
      sendJson(response, 200, { player });
      return;
    }

    if (request.method === 'DELETE') {
      const input = deletePlayerSchema.parse(requestBody(request));
      const removed = await database.transaction(async (transaction) => {
        const [rosterEntry] = await transaction
          .select({
            playerId: seasonRoster.playerId,
            name: players.name,
          })
          .from(seasonRoster)
          .innerJoin(players, eq(players.id, seasonRoster.playerId))
          .where(and(
            eq(seasonRoster.seasonId, season.id),
            eq(seasonRoster.playerId, input.playerId),
          ))
          .limit(1);

        const [activeSession] = await transaction
          .select({ id: playSessions.id, status: playSessions.status })
          .from(playSessions)
          .where(and(
            eq(playSessions.seasonId, season.id),
            inArray(playSessions.status, removableSessionStatuses),
          ))
          .limit(1);

        const playerSessionParticipant = activeSession
          ? await transaction
            .select({ playerId: sessionParticipants.playerId })
            .from(sessionParticipants)
            .where(and(
              eq(sessionParticipants.sessionId, activeSession.id),
              eq(sessionParticipants.playerId, input.playerId),
            ))
            .limit(1)
          : [];

        let removalPlan;
        try {
          removalPlan = planSeasonRosterRemoval({
            inActiveSeasonRoster: Boolean(rosterEntry),
            activeSessionStatus: activeRosterSessionStatus(activeSession?.status),
            playerInActiveSession: playerSessionParticipant.length > 0,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'The player could not be removed.';
          return {
            error: rosterEntry ? 'player_in_active_draw' as const : 'player_not_in_active_roster' as const,
            message,
          };
        }

        if (removalPlan.removeDraftParticipant && activeSession) {
          await transaction
            .delete(sessionParticipants)
            .where(and(
              eq(sessionParticipants.sessionId, activeSession.id),
              eq(sessionParticipants.playerId, input.playerId),
            ));
        }
        await transaction
          .delete(seasonRoster)
          .where(and(
            eq(seasonRoster.seasonId, season.id),
            eq(seasonRoster.playerId, input.playerId),
          ));
        await transaction.insert(auditLog).values({
          actorMembershipId: admin.membership.id,
          action: 'player.removed_from_roster',
          entityType: 'player',
          entityId: input.playerId,
          details: {
            seasonId: season.id,
            activeSessionId: activeSession?.id ?? null,
            removedDraftParticipant: removalPlan.removeDraftParticipant,
          },
        });
        return { player: rosterEntry };
      });

      if ('error' in removed) {
        sendJson(response, removed.error === 'player_not_in_active_roster' ? 404 : 409, {
          error: removed.error,
          message: removed.message,
        });
        return;
      }
      sendJson(response, 200, { player: removed.player });
      return;
    }
    methodNotAllowed(response, ['GET', 'POST', 'PATCH', 'DELETE']);
  } catch (error) {
    handleApiError(error, response);
  }
}
