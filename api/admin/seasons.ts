import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { handleApiError, methodNotAllowed, requestBody, sendJson } from '../../server/api.js';
import { requireSuperadmin } from '../../server/auth/authorize.js';
import { requireRequestAdmin } from '../../server/auth/request.js';
import { getDatabase } from '../../server/db/client.js';
import { auditLog, playSessions, seasons } from '../../server/db/schema.js';
import { pointValueSchema } from '../../server/domain/points.js';

export const createSeasonSchema = z.object({
  name: z.string().trim().min(1).max(100),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable().optional(),
  winPoints: pointValueSchema.nonnegative().default(1),
  lossPoints: pointValueSchema.nonnegative().default(0),
  firstPlaceBonus: pointValueSchema.nonnegative().default(4),
  secondPlaceBonus: pointValueSchema.nonnegative().default(2),
  thirdPlaceBonus: pointValueSchema.nonnegative().default(1),
  maxSessionPoints: pointValueSchema.positive().default(8),
});
export const updateSeasonSchema = z.object({
  seasonId: z.uuid(),
  name: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['active', 'archived']).optional(),
  endsAt: z.iso.datetime().nullable().optional(),
  winPoints: pointValueSchema.nonnegative().optional(),
  lossPoints: pointValueSchema.nonnegative().optional(),
  firstPlaceBonus: pointValueSchema.nonnegative().optional(),
  secondPlaceBonus: pointValueSchema.nonnegative().optional(),
  thirdPlaceBonus: pointValueSchema.nonnegative().optional(),
  maxSessionPoints: pointValueSchema.positive().optional(),
});

type TransactionBoundary<TTransaction> = {
  transaction<TResult>(body: (transaction: TTransaction) => Promise<TResult>): Promise<TResult>;
};

export async function createSeasonWithAudit<TTransaction, TSeason>(
  database: TransactionBoundary<TTransaction>,
  operations: {
    findActiveSeason(transaction: TTransaction): Promise<unknown | null | undefined>;
    insertSeason(transaction: TTransaction): Promise<TSeason>;
    insertAudit(transaction: TTransaction, season: TSeason): Promise<unknown>;
  },
) {
  return database.transaction(async (transaction) => {
    if (await operations.findActiveSeason(transaction)) {
      return { error: 'active_season_exists' as const };
    }
    const season = await operations.insertSeason(transaction);
    await operations.insertAudit(transaction, season);
    return { season };
  });
}

export async function updateSeasonWithAudit<TTransaction, TSeason>(
  database: TransactionBoundary<TTransaction>,
  operations: {
    updateSeason(transaction: TTransaction): Promise<TSeason | null | undefined>;
    insertAudit(transaction: TTransaction, season: TSeason): Promise<unknown>;
  },
) {
  return database.transaction(async (transaction) => {
    const season = await operations.updateSeason(transaction);
    if (!season) return { error: 'season_not_found' as const };
    await operations.insertAudit(transaction, season);
    return { season };
  });
}

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
      const result = await createSeasonWithAudit(database, {
        findActiveSeason: async (transaction) => {
          const [lockedActive] = await transaction
            .select({ id: seasons.id })
            .from(seasons)
            .where(eq(seasons.status, 'active'))
            .for('update')
            .limit(1);
          return lockedActive;
        },
        insertSeason: async (transaction) => {
          const [created] = await transaction
            .insert(seasons)
            .values({
              ...input,
              startsAt: new Date(input.startsAt),
              endsAt: input.endsAt ? new Date(input.endsAt) : null,
              createdBy: admin.membership.id,
            })
            .returning();
          return created;
        },
        insertAudit: (transaction, created) => transaction.insert(auditLog).values({
          actorMembershipId: admin.membership.id,
          action: 'season.created',
          entityType: 'season',
          entityId: created.id,
          details: { name: created.name },
        }),
      });
      if ('error' in result) {
        sendJson(response, 409, result);
        return;
      }
      sendJson(response, 201, { season: result.season });
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
      const result = await updateSeasonWithAudit(database, {
        updateSeason: async (transaction) => {
          const [updated] = await transaction
            .update(seasons)
            .set({
              ...(input.name ? { name: input.name } : {}),
              ...(input.status ? { status: input.status } : {}),
              ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? new Date(input.endsAt) : null } : {}),
              ...(input.winPoints !== undefined ? { winPoints: input.winPoints } : {}),
              ...(input.lossPoints !== undefined ? { lossPoints: input.lossPoints } : {}),
              ...(input.firstPlaceBonus !== undefined ? { firstPlaceBonus: input.firstPlaceBonus } : {}),
              ...(input.secondPlaceBonus !== undefined ? { secondPlaceBonus: input.secondPlaceBonus } : {}),
              ...(input.thirdPlaceBonus !== undefined ? { thirdPlaceBonus: input.thirdPlaceBonus } : {}),
              ...(input.maxSessionPoints !== undefined ? { maxSessionPoints: input.maxSessionPoints } : {}),
              updatedAt: new Date(),
            })
            .where(eq(seasons.id, input.seasonId))
            .returning();
          return updated;
        },
        insertAudit: (transaction, updated) => transaction.insert(auditLog).values({
          actorMembershipId: admin.membership.id,
          action: 'season.updated',
          entityType: 'season',
          entityId: updated.id,
          details: input,
        }),
      });
      if ('error' in result) {
        sendJson(response, 404, { error: 'season_not_found' });
        return;
      }
      sendJson(response, 200, { season: result.season });
      return;
    }
    methodNotAllowed(response, ['GET', 'POST', 'PATCH']);
  } catch (error) {
    handleApiError(error, response);
  }
}
