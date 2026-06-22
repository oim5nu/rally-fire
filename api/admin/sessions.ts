import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { handleApiError, methodNotAllowed, requestBody, sendJson } from '../../server/api.js';
import { requireSuperadmin } from '../../server/auth/authorize.js';
import { requireRequestAdmin } from '../../server/auth/request.js';
import { getDatabase } from '../../server/db/client.js';
import {
  auditLog,
  matches,
  players,
  playSessions,
  pointLedger,
  seasonRoster,
  seasons,
  sessionParticipants,
  teamMembers,
  teams,
} from '../../server/db/schema.js';
import {
  assignRankedGroups,
  buildDrawPersistenceRows,
  buildRoundRobinDraw,
  calculateMatchAwards,
  validateCompletedScore,
} from '../../server/domain/competition.js';

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    name: z.string().trim().min(1).max(100),
    scheduledAt: z.iso.datetime(),
    replacementForSessionId: z.uuid().optional(),
  }),
  z.object({
    action: z.literal('participants'),
    sessionId: z.uuid(),
    attendeeIds: z.array(z.uuid()),
    reserveIds: z.array(z.uuid()).default([]),
    groupOverrides: z.record(z.uuid(), z.enum(['A', 'B'])).default({}),
  }),
  z.object({
    action: z.literal('draw'),
    sessionId: z.uuid(),
    method: z.enum(['points', 'skill']).default('points'),
  }),
  z.object({
    action: z.literal('score'),
    matchId: z.uuid(),
    scoreA: z.number(),
    scoreB: z.number(),
    court: z.string().trim().max(30).nullable().optional(),
  }),
  z.object({ action: z.literal('finalize'), sessionId: z.uuid() }),
  z.object({
    action: z.literal('void'),
    sessionId: z.uuid(),
    reason: z.string().trim().min(3).max(500),
    createReplacement: z.boolean().default(true),
  }),
]);

async function getSessionDetail(sessionId: string) {
  const database = getDatabase();
  const [session] = await database
    .select()
    .from(playSessions)
    .where(eq(playSessions.id, sessionId))
    .limit(1);
  if (!session) {
    return null;
  }
  const [participantRows, teamRows, memberRows, matchRows] = await Promise.all([
    database
      .select({
        playerId: players.id,
        name: players.name,
        displayRating: players.displayRating,
        clubSkill: players.clubSkill,
        status: sessionParticipants.status,
        group: sessionParticipants.group,
      })
      .from(sessionParticipants)
      .innerJoin(players, eq(players.id, sessionParticipants.playerId))
      .where(eq(sessionParticipants.sessionId, sessionId))
      .orderBy(players.name),
    database.select().from(teams).where(eq(teams.sessionId, sessionId)).orderBy(teams.seed),
    database
      .select({
        teamId: teamMembers.teamId,
        playerId: players.id,
        name: players.name,
        group: teamMembers.group,
      })
      .from(teamMembers)
      .innerJoin(players, eq(players.id, teamMembers.playerId))
      .where(eq(teamMembers.sessionId, sessionId)),
    database.select().from(matches).where(eq(matches.sessionId, sessionId)).orderBy(matches.sequence),
  ]);

  return {
    ...session,
    participants: participantRows,
    teams: teamRows.map((team) => ({
      ...team,
      members: memberRows.filter((member) => member.teamId === team.id),
    })),
    matches: matchRows,
  };
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    const admin = await requireRequestAdmin(request);
    const database = getDatabase();

    if (request.method === 'GET') {
      const queryId = request.query.sessionId;
      let sessionId = Array.isArray(queryId) ? queryId[0] : queryId;
      if (!sessionId) {
        const [active] = await database
          .select({ id: playSessions.id })
          .from(playSessions)
          .where(inArray(playSessions.status, ['draft', 'draw_published', 'in_progress']))
          .orderBy(asc(playSessions.scheduledAt))
          .limit(1);
        sessionId = active?.id;
        if (!sessionId) {
          const [latest] = await database
            .select({ id: playSessions.id })
            .from(playSessions)
            .orderBy(desc(playSessions.scheduledAt))
            .limit(1);
          sessionId = latest?.id;
        }
      }
      if (!sessionId) {
        sendJson(response, 200, { session: null });
        return;
      }
      const session = await getSessionDetail(sessionId);
      if (!session) {
        sendJson(response, 404, { error: 'session_not_found' });
        return;
      }
      sendJson(response, 200, { session });
      return;
    }

    if (request.method !== 'POST') {
      methodNotAllowed(response, ['GET', 'POST']);
      return;
    }

    const input = actionSchema.parse(requestBody(request));
    if (input.action === 'create') {
      const [season] = await database.select().from(seasons).where(eq(seasons.status, 'active')).limit(1);
      if (!season) {
        sendJson(response, 409, { error: 'active_season_required' });
        return;
      }
      const [session] = await database
        .insert(playSessions)
        .values({
          seasonId: season.id,
          name: input.name,
          scheduledAt: new Date(input.scheduledAt),
          winPointsSnapshot: season.winPoints,
          lossPointsSnapshot: season.lossPoints,
          replacementForSessionId: input.replacementForSessionId,
          createdBy: admin.membership.id,
        })
        .returning();
      await database.insert(auditLog).values({
        actorMembershipId: admin.membership.id,
        action: 'session.created',
        entityType: 'play_session',
        entityId: session.id,
        details: { seasonId: season.id },
      });
      sendJson(response, 201, { session });
      return;
    }

    if (input.action === 'participants') {
      const uniqueIds = new Set([...input.attendeeIds, ...input.reserveIds]);
      if (uniqueIds.size !== input.attendeeIds.length + input.reserveIds.length) {
        sendJson(response, 400, { error: 'duplicate_participant' });
        return;
      }
      const [session] = await database
        .select()
        .from(playSessions)
        .where(eq(playSessions.id, input.sessionId))
        .limit(1);
      if (!session || session.status !== 'draft') {
        sendJson(response, 409, { error: 'draft_session_required' });
        return;
      }
      const rosterPlayers = uniqueIds.size
        ? await database
            .select({ id: players.id, name: players.name })
            .from(seasonRoster)
            .innerJoin(players, eq(players.id, seasonRoster.playerId))
            .where(
              and(
                eq(seasonRoster.seasonId, session.seasonId),
                inArray(players.id, [...uniqueIds]),
              ),
            )
        : [];
      if (rosterPlayers.length !== uniqueIds.size) {
        sendJson(response, 400, { error: 'participant_not_in_season' });
        return;
      }
      const attendeeSet = new Set(input.attendeeIds);
      await database.transaction(async (transaction) => {
        await transaction
          .delete(sessionParticipants)
          .where(eq(sessionParticipants.sessionId, session.id));
        if (rosterPlayers.length) {
          await transaction.insert(sessionParticipants).values(
            rosterPlayers.map((player) => ({
              sessionId: session.id,
              playerId: player.id,
              status: attendeeSet.has(player.id) ? ('attendee' as const) : ('reserve' as const),
              group: input.groupOverrides[player.id] ?? null,
            })),
          );
        }
        await transaction.insert(auditLog).values({
          actorMembershipId: admin.membership.id,
          action: 'session.participants_updated',
          entityType: 'play_session',
          entityId: session.id,
          details: { attendeeIds: input.attendeeIds, reserveIds: input.reserveIds },
        });
      });
      sendJson(response, 200, { session: await getSessionDetail(session.id) });
      return;
    }

    if (input.action === 'draw') {
      const [session] = await database
        .select()
        .from(playSessions)
        .where(eq(playSessions.id, input.sessionId))
        .limit(1);
      if (!session || session.status !== 'draft') {
        sendJson(response, 409, { error: 'draft_session_required' });
        return;
      }
      const attendees = await database
        .select({
          id: players.id,
          name: players.name,
          skill: players.clubSkill,
          group: sessionParticipants.group,
          points: sql<number>`coalesce(sum(${pointLedger.points}), 0)`.mapWith(Number),
        })
        .from(sessionParticipants)
        .innerJoin(players, eq(players.id, sessionParticipants.playerId))
        .leftJoin(
          pointLedger,
          and(
            eq(pointLedger.playerId, players.id),
            eq(pointLedger.seasonId, session.seasonId),
          ),
        )
        .where(
          and(
            eq(sessionParticipants.sessionId, session.id),
            eq(sessionParticipants.status, 'attendee'),
          ),
        )
        .groupBy(players.id, sessionParticipants.group);
      const groupOverrides = new Map(
        attendees
          .filter((player) => player.group)
          .map((player) => [player.id, player.group as 'A' | 'B']),
      );
      const grouped = assignRankedGroups(
        attendees.map((player) => ({
          ...player,
          rankingValue: input.method === 'points' ? player.points : player.skill,
        })),
      ).map((player) => ({
        ...player,
        group: groupOverrides.get(player.id) ?? player.group,
      }));
      let draw;
      try {
        draw = buildRoundRobinDraw(grouped);
      } catch (error) {
        sendJson(response, 409, {
          error: 'invalid_draw',
          message: error instanceof Error ? error.message : 'The draw is invalid.',
        });
        return;
      }
      const drawRows = buildDrawPersistenceRows(session.id, grouped, draw);
      await database.transaction(async (transaction) => {
        await transaction
          .insert(sessionParticipants)
          .values(drawRows.participants)
          .onConflictDoUpdate({
            target: [sessionParticipants.sessionId, sessionParticipants.playerId],
            set: { group: sql`excluded.skill_group` },
          });
        await transaction.delete(matches).where(eq(matches.sessionId, session.id));
        await transaction.delete(teamMembers).where(eq(teamMembers.sessionId, session.id));
        await transaction.delete(teams).where(eq(teams.sessionId, session.id));
        const insertedTeams = await transaction.insert(teams).values(drawRows.teams).returning();
        const teamsByIndex = new Map(insertedTeams.map((team) => [team.seed - 1, team]));
        await transaction.insert(teamMembers).values(drawRows.members.map((member) => ({
          teamId: teamsByIndex.get(member.teamIndex)!.id,
          sessionId: member.sessionId,
          playerId: member.playerId,
          group: member.group,
        })));
        await transaction.insert(matches).values(
          drawRows.matches.map((match) => ({
            sessionId: session.id,
            sequence: match.sequence,
            teamAId: teamsByIndex.get(match.teamAIndex)!.id,
            teamBId: teamsByIndex.get(match.teamBIndex)!.id,
          })),
        );
        await transaction
          .update(playSessions)
          .set({ status: 'draw_published', updatedAt: new Date() })
          .where(eq(playSessions.id, session.id));
        await transaction.insert(auditLog).values({
          actorMembershipId: admin.membership.id,
          action: 'session.draw_published',
          entityType: 'play_session',
          entityId: session.id,
          details: { method: input.method, teamCount: draw.teams.length, matchCount: draw.matches.length },
        });
      });
      sendJson(response, 200, { session: await getSessionDetail(session.id) });
      return;
    }

    if (input.action === 'score') {
      let score;
      try {
        score = validateCompletedScore(input.scoreA, input.scoreB);
      } catch (error) {
        sendJson(response, 400, {
          error: 'invalid_score',
          message: error instanceof Error ? error.message : 'The score is invalid.',
        });
        return;
      }
      const [match] = await database
        .select({ match: matches, session: playSessions })
        .from(matches)
        .innerJoin(playSessions, eq(playSessions.id, matches.sessionId))
        .where(eq(matches.id, input.matchId))
        .limit(1);
      if (!match || !['draw_published', 'in_progress'].includes(match.session.status)) {
        sendJson(response, 409, { error: 'scoreable_match_required' });
        return;
      }
      await database.transaction(async (transaction) => {
        await transaction
          .update(matches)
          .set({ ...score, court: input.court, status: 'completed', updatedAt: new Date() })
          .where(eq(matches.id, match.match.id));
        await transaction
          .update(playSessions)
          .set({ status: 'in_progress', updatedAt: new Date() })
          .where(eq(playSessions.id, match.session.id));
        await transaction.insert(auditLog).values({
          actorMembershipId: admin.membership.id,
          action: 'match.scored',
          entityType: 'match',
          entityId: match.match.id,
          details: score,
        });
      });
      sendJson(response, 200, { session: await getSessionDetail(match.session.id) });
      return;
    }

    if (input.action === 'finalize') {
      const result = await database.transaction(
        async (transaction) => {
          const [session] = await transaction
            .select()
            .from(playSessions)
            .where(eq(playSessions.id, input.sessionId))
            .for('update')
            .limit(1);
          if (!session || !['draw_published', 'in_progress'].includes(session.status)) {
            return { error: 'finalizable_session_required' as const };
          }
          const matchRows = await transaction
            .select()
            .from(matches)
            .where(eq(matches.sessionId, session.id))
            .orderBy(matches.sequence);
          if (!matchRows.length || matchRows.some((match) => match.status !== 'completed')) {
            return { error: 'all_matches_must_be_completed' as const };
          }
          const members = await transaction
            .select()
            .from(teamMembers)
            .where(eq(teamMembers.sessionId, session.id));

          for (const match of matchRows) {
            const awards = calculateMatchAwards({
              matchId: match.id,
              teamAPlayerIds: members.filter((member) => member.teamId === match.teamAId).map((member) => member.playerId),
              teamBPlayerIds: members.filter((member) => member.teamId === match.teamBId).map((member) => member.playerId),
              scoreA: match.scoreA!,
              scoreB: match.scoreB!,
              winPoints: session.winPointsSnapshot,
              lossPoints: session.lossPointsSnapshot,
            });
            await transaction.insert(pointLedger).values(
              awards.map((award) => ({
                seasonId: session.seasonId,
                playerId: award.playerId,
                sessionId: session.id,
                matchId: award.matchId,
                points: award.points,
                reason: award.reason,
                idempotencyKey: `award:${session.id}:${award.matchId}:${award.playerId}`,
                createdBy: admin.membership.id,
              })),
            );
          }
          await transaction
            .update(playSessions)
            .set({ status: 'finalized', finalizedAt: new Date(), updatedAt: new Date() })
            .where(eq(playSessions.id, session.id));
          await transaction.insert(auditLog).values({
            actorMembershipId: admin.membership.id,
            action: 'session.finalized',
            entityType: 'play_session',
            entityId: session.id,
            details: { matchCount: matchRows.length },
          });
          return { sessionId: session.id };
        },
        { isolationLevel: 'serializable' },
      );
      if ('error' in result) {
        sendJson(response, 409, result);
        return;
      }
      sendJson(response, 200, { session: await getSessionDetail(result.sessionId) });
      return;
    }

    requireSuperadmin(admin.membership);
    const result = await database.transaction(
      async (transaction) => {
        const [session] = await transaction
          .select()
          .from(playSessions)
          .where(eq(playSessions.id, input.sessionId))
          .for('update')
          .limit(1);
        if (!session || session.status !== 'finalized') {
          return { error: 'finalized_session_required' as const };
        }
        const entries = await transaction
          .select()
          .from(pointLedger)
          .where(
            and(
              eq(pointLedger.sessionId, session.id),
              inArray(pointLedger.reason, ['match_win', 'match_loss']),
            ),
          );
        if (entries.length) {
          await transaction.insert(pointLedger).values(
            entries.map((entry) => ({
              seasonId: entry.seasonId,
              playerId: entry.playerId,
              sessionId: session.id,
              matchId: entry.matchId,
              points: -entry.points,
              reason: 'session_void' as const,
              reversesEntryId: entry.id,
              idempotencyKey: `void:${session.id}:${entry.id}`,
              notes: input.reason,
              createdBy: admin.membership.id,
            })),
          );
        }
        await transaction
          .update(playSessions)
          .set({
            status: 'voided',
            voidedAt: new Date(),
            voidReason: input.reason,
            updatedAt: new Date(),
          })
          .where(eq(playSessions.id, session.id));
        let replacementId: string | null = null;
        if (input.createReplacement) {
          const [replacement] = await transaction
            .insert(playSessions)
            .values({
              seasonId: session.seasonId,
              name: `${session.name} replacement`,
              scheduledAt: new Date(),
              winPointsSnapshot: session.winPointsSnapshot,
              lossPointsSnapshot: session.lossPointsSnapshot,
              replacementForSessionId: session.id,
              createdBy: admin.membership.id,
            })
            .returning();
          replacementId = replacement.id;
        }
        await transaction.insert(auditLog).values({
          actorMembershipId: admin.membership.id,
          action: 'session.voided',
          entityType: 'play_session',
          entityId: session.id,
          details: { reason: input.reason, replacementId },
        });
        return { sessionId: session.id, replacementId };
      },
      { isolationLevel: 'serializable' },
    );
    if ('error' in result) {
      sendJson(response, 409, result);
      return;
    }
    sendJson(response, 200, {
      session: await getSessionDetail(result.sessionId),
      replacementId: result.replacementId,
    });
  } catch (error) {
    handleApiError(error, response);
  }
}
