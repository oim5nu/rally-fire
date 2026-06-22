import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { handleApiError, methodNotAllowed, sendJson } from '../../server/api.js';
import { getDatabase } from '../../server/db/client.js';
import {
  matches,
  players,
  playSessions,
  pointLedger,
  seasonRoster,
  seasons,
  teamMembers,
  teams,
} from '../../server/db/schema.js';

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET') {
    methodNotAllowed(response, ['GET']);
    return;
  }

  try {
    const database = getDatabase();
    const [season] = await database.select().from(seasons).where(eq(seasons.status, 'active')).limit(1);
    if (!season) {
      response.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
      sendJson(response, 200, {
        season: null,
        leaderboard: [],
        activeSession: null,
        recentMatches: [],
      });
      return;
    }

    const leaderboard = await database
      .select({
        id: players.id,
        name: players.name,
        displayRating: players.displayRating,
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
      .orderBy(desc(sql`coalesce(sum(${pointLedger.points}), 0)`), players.name);

    const [activeSession] = await database
      .select()
      .from(playSessions)
      .where(
        and(
          eq(playSessions.seasonId, season.id),
          inArray(playSessions.status, ['draw_published', 'in_progress']),
        ),
      )
      .orderBy(desc(playSessions.scheduledAt))
      .limit(1);

    let publicSession: null | Record<string, unknown> = null;
    if (activeSession) {
      const sessionTeams = await database
        .select({ id: teams.id, seed: teams.seed })
        .from(teams)
        .where(eq(teams.sessionId, activeSession.id))
        .orderBy(teams.seed);
      const memberRows = await database
        .select({
          teamId: teamMembers.teamId,
          playerId: players.id,
          name: players.name,
          group: teamMembers.group,
        })
        .from(teamMembers)
        .innerJoin(players, eq(players.id, teamMembers.playerId))
        .where(eq(teamMembers.sessionId, activeSession.id));
      const sessionMatches = await database
        .select()
        .from(matches)
        .where(eq(matches.sessionId, activeSession.id))
        .orderBy(matches.sequence);

      publicSession = {
        id: activeSession.id,
        name: activeSession.name,
        scheduledAt: activeSession.scheduledAt,
        status: activeSession.status,
        teams: sessionTeams.map((team) => ({
          ...team,
          members: memberRows.filter((member) => member.teamId === team.id),
        })),
        matches: sessionMatches,
      };
    }

    const recentMatches = await database
      .select({
        id: matches.id,
        sessionId: matches.sessionId,
        sessionName: playSessions.name,
        sequence: matches.sequence,
        teamAId: matches.teamAId,
        teamBId: matches.teamBId,
        scoreA: matches.scoreA,
        scoreB: matches.scoreB,
        completedAt: matches.updatedAt,
      })
      .from(matches)
      .innerJoin(playSessions, eq(playSessions.id, matches.sessionId))
      .where(and(eq(playSessions.seasonId, season.id), eq(matches.status, 'completed')))
      .orderBy(desc(matches.updatedAt))
      .limit(10);

    response.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
    sendJson(response, 200, {
      season: {
        id: season.id,
        name: season.name,
        startsAt: season.startsAt,
        endsAt: season.endsAt,
      },
      leaderboard,
      activeSession: publicSession,
      recentMatches,
    });
  } catch (error) {
    handleApiError(error, response);
  }
}
