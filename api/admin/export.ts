import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleApiError, methodNotAllowed, sendJson } from '../../server/api';
import { requireSuperadmin } from '../../server/auth/authorize';
import { requireRequestAdmin } from '../../server/auth/request';
import { getDatabase } from '../../server/db/client';
import {
  adminMemberships,
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
} from '../../server/db/schema';

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET') {
    methodNotAllowed(response, ['GET']);
    return;
  }
  try {
    const admin = await requireRequestAdmin(request);
    requireSuperadmin(admin.membership);
    const database = getDatabase();
    const [
      memberships,
      seasonRows,
      playerRows,
      rosterRows,
      sessionRows,
      participantRows,
      teamRows,
      teamMemberRows,
      matchRows,
      ledgerRows,
      auditRows,
    ] = await Promise.all([
      database.select().from(adminMemberships),
      database.select().from(seasons),
      database.select().from(players),
      database.select().from(seasonRoster),
      database.select().from(playSessions),
      database.select().from(sessionParticipants),
      database.select().from(teams),
      database.select().from(teamMembers),
      database.select().from(matches),
      database.select().from(pointLedger),
      database.select().from(auditLog),
    ]);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="rallyfire-export-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    sendJson(response, 200, {
      exportedAt: new Date().toISOString(),
      exportedBy: admin.membership.email,
      data: {
        adminMemberships: memberships,
        seasons: seasonRows,
        players: playerRows,
        seasonRoster: rosterRows,
        playSessions: sessionRows,
        sessionParticipants: participantRows,
        teams: teamRows,
        teamMembers: teamMemberRows,
        matches: matchRows,
        pointLedger: ledgerRows,
        auditLog: auditRows,
      },
    });
  } catch (error) {
    handleApiError(error, response);
  }
}
