import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from 'drizzle-orm';
import { handleApiError, methodNotAllowed, sendJson } from '../../server/api.js';
import { requireSuperadmin } from '../../server/auth/authorize.js';
import { requireRequestAdmin } from '../../server/auth/request.js';
import { getDatabase } from '../../server/db/client.js';

type ExportDatabase = Pick<ReturnType<typeof getDatabase>, 'execute'>;

const exportTables = [
  ['adminMemberships', 'admin_memberships'],
  ['seasons', 'seasons'],
  ['players', 'players'],
  ['seasonRoster', 'season_roster'],
  ['playSessions', 'play_sessions'],
  ['sessionParticipants', 'session_participants'],
  ['teams', 'teams'],
  ['teamMembers', 'team_members'],
  ['matches', 'matches'],
  ['pointLedger', 'point_ledger'],
  ['auditLog', 'audit_log'],
] as const;

function camelCaseColumn(column: string): string {
  return column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export async function loadExportData(database: ExportDatabase): Promise<Record<string, unknown>> {
  const result = await database.execute(sql`
    SELECT jsonb_build_object(
      'adminMemberships', COALESCE((SELECT jsonb_agg(to_jsonb(row)) FROM admin_memberships row), '[]'::jsonb),
      'seasons', COALESCE((SELECT jsonb_agg(to_jsonb(row)) FROM seasons row), '[]'::jsonb),
      'players', COALESCE((SELECT jsonb_agg(to_jsonb(row)) FROM players row), '[]'::jsonb),
      'seasonRoster', COALESCE((SELECT jsonb_agg(to_jsonb(row)) FROM season_roster row), '[]'::jsonb),
      'playSessions', COALESCE((SELECT jsonb_agg(to_jsonb(row)) FROM play_sessions row), '[]'::jsonb),
      'sessionParticipants', COALESCE((SELECT jsonb_agg(to_jsonb(row)) FROM session_participants row), '[]'::jsonb),
      'teams', COALESCE((SELECT jsonb_agg(to_jsonb(row)) FROM teams row), '[]'::jsonb),
      'teamMembers', COALESCE((SELECT jsonb_agg(to_jsonb(row)) FROM team_members row), '[]'::jsonb),
      'matches', COALESCE((SELECT jsonb_agg(to_jsonb(row)) FROM matches row), '[]'::jsonb),
      'pointLedger', COALESCE((SELECT jsonb_agg(to_jsonb(row)) FROM point_ledger row), '[]'::jsonb),
      'auditLog', COALESCE((SELECT jsonb_agg(to_jsonb(row)) FROM audit_log row), '[]'::jsonb)
    ) AS data
  `) as Array<{ data: Record<string, Array<Record<string, unknown>>> }>;

  return Object.fromEntries(exportTables.map(([key]) => [
    key,
    (result[0]?.data[key] ?? []).map((row) => Object.fromEntries(
      Object.entries(row).map(([column, value]) => [camelCaseColumn(column), value]),
    )),
  ]));
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET') {
    methodNotAllowed(response, ['GET']);
    return;
  }
  try {
    const admin = await requireRequestAdmin(request);
    requireSuperadmin(admin.membership);
    const database = getDatabase();
    const data = await loadExportData(database);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="rallyfire-export-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    sendJson(response, 200, {
      exportedAt: new Date().toISOString(),
      exportedBy: admin.membership.email,
      data,
    });
  } catch (error) {
    handleApiError(error, response);
  }
}
