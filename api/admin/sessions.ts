import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
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
  buildConfiguredDraw,
  buildQualifyingKnockoutMatches,
  buildKnockoutTournament,
  buildDrawPersistenceRows,
  planAttendanceRollback,
  planQuarterFinalConfigReturn,
  rankQualifyingTeams,
  resolveQualifyingKnockoutTeams,
  validateCompletedScore,
  validateDraftFormatChange,
  validateQualifyingKnockoutFinalization,
  validateWinnerAdvancement,
  type KnockoutConfig,
  type QualifyingKnockoutConfig,
} from '../../server/domain/competition.js';
import {
  planSessionPoints as planSessionPointAwards,
  type SessionPointPlan,
} from '../../server/domain/session-points.js';
import {
  StageDrawStaleError,
  StageDrawUnavailableError,
  StageDrawValidationError,
  planStageDrawAdjustment,
  type StageDrawAdjustmentPlan,
  type StageKey,
} from '../../server/domain/stage-draw.js';

const sessionFormats = ['round_robin', 'knockout', 'qualifying_knockout'] as const;
const knockoutConfigSchema = z.object({
  preliminaryPairs: z.array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])),
  mainSources: z.array(z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('team'), teamIndex: z.number().int().nonnegative() }),
    z.object({ kind: z.literal('preliminary'), matchIndex: z.number().int().nonnegative() }),
  ])),
});
const qualifyingKnockoutConfigSchema = z.object({
  qualifyingPairs: z.array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])),
});

const stageDrawSnapshotSchema = z.object({
  matchId: z.uuid(),
  teamAId: z.uuid(),
  teamBId: z.uuid(),
  sequence: z.number().int().positive(),
});

export const adjustStageDrawActionSchema = z.object({
  action: z.literal('adjust_stage_draw'),
  sessionId: z.uuid(),
  stage: z.object({
    matchKind: z.enum(['round_robin', 'qualifier', 'championship', 'placement']),
    bracketRound: z.number().int().nonnegative().nullable(),
    placementGroup: z.number().int().positive().nullable(),
  }),
  expectedMatches: z.array(stageDrawSnapshotSchema).min(1),
  matches: z.array(stageDrawSnapshotSchema).min(1),
});

export const scoreActionSchema = z.object({
  action: z.literal('score'),
  matchId: z.uuid(),
  expectedTeamAId: z.uuid(),
  expectedTeamBId: z.uuid(),
  scoreA: z.number(),
  scoreB: z.number(),
  court: z.string().trim().max(30).nullable().optional(),
});

type SessionPointSnapshots = {
  winPointsSnapshot: number;
  lossPointsSnapshot: number;
  firstPlaceBonusSnapshot: number;
  secondPlaceBonusSnapshot: number;
  thirdPlaceBonusSnapshot: number;
  maxSessionPointsSnapshot: number;
};

export const voidableSessionAwardReasons = [
  'match_win',
  'match_loss',
  'placement_bonus',
  'session_cap_adjustment',
] as const;

export function copySessionPointSnapshots(session: SessionPointSnapshots): SessionPointSnapshots {
  return {
    winPointsSnapshot: session.winPointsSnapshot,
    lossPointsSnapshot: session.lossPointsSnapshot,
    firstPlaceBonusSnapshot: session.firstPlaceBonusSnapshot,
    secondPlaceBonusSnapshot: session.secondPlaceBonusSnapshot,
    thirdPlaceBonusSnapshot: session.thirdPlaceBonusSnapshot,
    maxSessionPointsSnapshot: session.maxSessionPointsSnapshot,
  };
}

export function buildSessionPointPersistence({
  session,
  matchCount,
  createdBy,
  plan,
}: {
  session: SessionPointSnapshots & { id: string; seasonId: string };
  matchCount: number;
  createdBy: string;
  plan: SessionPointPlan;
}) {
  const capChunkCountByPlayer = new Map<string, number>();
  const ledgerRows = plan.playerAwards.map((award) => {
    let awardSource: string;
    if (award.matchId) {
      awardSource = award.matchId;
    } else if (award.type === 'placement_bonus') {
      awardSource = 'placement';
    } else {
      const capChunk = (capChunkCountByPlayer.get(award.playerId) ?? 0) + 1;
      capChunkCountByPlayer.set(award.playerId, capChunk);
      awardSource = capChunk === 1 ? 'cap' : `cap:${capChunk}`;
    }
    return {
      seasonId: session.seasonId,
      playerId: award.playerId,
      sessionId: session.id,
      matchId: award.matchId,
      points: award.points,
      reason: award.type,
      idempotencyKey: `award:${session.id}:${awardSource}:${award.playerId}`,
      createdBy,
    };
  });
  return {
    ledgerRows,
    auditDetails: {
      matchCount,
      rules: {
        winPoints: session.winPointsSnapshot,
        lossPoints: session.lossPointsSnapshot,
        firstPlaceBonus: session.firstPlaceBonusSnapshot,
        secondPlaceBonus: session.secondPlaceBonusSnapshot,
        thirdPlaceBonus: session.thirdPlaceBonusSnapshot,
        maxSessionPoints: session.maxSessionPointsSnapshot,
      },
      teams: plan.teamSummaries,
    },
  };
}

type SessionsDatabase = ReturnType<typeof getDatabase>;

type TransactionBoundary<TTransaction> = {
  transaction<TResult>(body: (transaction: TTransaction) => Promise<TResult>): Promise<TResult>;
};

export async function createPlaySessionWithAudit<TTransaction, TSeason, TSession>(
  database: TransactionBoundary<TTransaction>,
  operations: {
    findActiveSeason(transaction: TTransaction): Promise<TSeason | null | undefined>;
    insertSession(transaction: TTransaction, season: TSeason): Promise<TSession>;
    insertAudit(transaction: TTransaction, session: TSession, season: TSeason): Promise<unknown>;
  },
) {
  return database.transaction(async (transaction) => {
    const season = await operations.findActiveSeason(transaction);
    if (!season) return { error: 'active_season_required' as const };
    const session = await operations.insertSession(transaction, season);
    await operations.insertAudit(transaction, session, season);
    return { session };
  });
}

export async function finalizeSessionPoints(
  database: SessionsDatabase,
  sessionId: string,
  actorMembershipId: string,
) {
  return retrySerializableTransaction(() => database.transaction(
    async (transaction) => {
      const [session] = await transaction
        .select()
        .from(playSessions)
        .where(eq(playSessions.id, sessionId))
        .for('update')
        .limit(1);
      if (!session || !['draw_published', 'in_progress'].includes(session.status)) {
        return { error: 'finalizable_session_required' as const };
      }
      const matchRows = await transaction
        .select()
        .from(matches)
        .where(eq(matches.sessionId, session.id))
        .orderBy(matches.sequence)
        .for('update');
      if (!matchRows.length || matchRows.some((match) => match.status !== 'completed')) {
        return { error: 'all_matches_must_be_completed' as const };
      }
      try {
        validateQualifyingKnockoutFinalization(session.format, matchRows);
      } catch {
        return { error: 'knockout_bracket_required' as const };
      }
      const teamRows = await transaction
        .select()
        .from(teams)
        .where(eq(teams.sessionId, session.id))
        .orderBy(teams.id)
        .for('update');
      const members = await transaction
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.sessionId, session.id))
        .orderBy(teamMembers.teamId, teamMembers.playerId)
        .for('update');
      const pointPlan = planSessionPointAwards({
        format: session.format,
        matches: matchRows,
        teams: teamRows.map((team) => ({
          id: team.id,
          seed: team.seed,
          playerIds: members
            .filter((member) => member.teamId === team.id)
            .map((member) => member.playerId),
        })),
        rules: {
          winPoints: session.winPointsSnapshot,
          lossPoints: session.lossPointsSnapshot,
          firstPlaceBonus: session.firstPlaceBonusSnapshot,
          secondPlaceBonus: session.secondPlaceBonusSnapshot,
          thirdPlaceBonus: session.thirdPlaceBonusSnapshot,
          maxSessionPoints: session.maxSessionPointsSnapshot,
        },
      });
      const persistence = buildSessionPointPersistence({
        session,
        matchCount: matchRows.length,
        createdBy: actorMembershipId,
        plan: pointPlan,
      });
      await transaction.insert(pointLedger).values(persistence.ledgerRows);
      await transaction
        .update(playSessions)
        .set({ status: 'finalized', finalizedAt: new Date(), updatedAt: new Date() })
        .where(eq(playSessions.id, session.id));
      await transaction.insert(auditLog).values({
        actorMembershipId,
        action: 'session.finalized',
        entityType: 'play_session',
        entityId: session.id,
        details: persistence.auditDetails,
      });
      return { sessionId: session.id };
    },
    { isolationLevel: 'serializable' },
  ));
}

export type VoidFinalizedSessionInput = {
  sessionId: string;
  reason: string;
  createReplacement: boolean;
};

export async function voidFinalizedSession(
  database: SessionsDatabase,
  input: VoidFinalizedSessionInput,
  actorMembershipId: string,
) {
  return retrySerializableTransaction(() => database.transaction(
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
            inArray(pointLedger.reason, [...voidableSessionAwardReasons]),
          ),
        )
        .orderBy(pointLedger.id)
        .for('update');
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
            createdBy: actorMembershipId,
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
            format: session.format,
            scheduledAt: new Date(),
            ...copySessionPointSnapshots(session),
            replacementForSessionId: session.id,
            createdBy: actorMembershipId,
          })
          .returning();
        replacementId = replacement.id;
      }
      await transaction.insert(auditLog).values({
        actorMembershipId,
        action: 'session.voided',
        entityType: 'play_session',
        entityId: session.id,
        details: { reason: input.reason, replacementId },
      });
      return { sessionId: session.id, replacementId };
    },
    { isolationLevel: 'serializable' },
  ));
}

export function mapLockedScoreMatchError(
  match: { teamAId: string | null; teamBId: string | null },
  expectedTeamAId: string,
  expectedTeamBId: string,
) {
  if (!match.teamAId || !match.teamBId) {
    return {
      error: 'knockout_match_unresolved' as const,
      message: 'Both feeder winners are required before scoring this match.',
    };
  }
  if (match.teamAId !== expectedTeamAId || match.teamBId !== expectedTeamBId) {
    return {
      error: 'stale_match' as const,
      message: 'The teams in this match changed. Refresh before saving the score.',
    };
  }
  return null;
}

export class SerializableTransactionRetryExhaustedError extends Error {
  constructor(public readonly cause?: unknown) {
    super('The serializable transaction could not complete after three attempts.');
    this.name = 'SerializableTransactionRetryExhaustedError';
  }
}

function isRetryableTransactionError(error: unknown): boolean {
  const seen = new Set<object>();
  let current = error;
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || typeof current !== 'object' || seen.has(current)) return false;
    seen.add(current);
    try {
      const code = Reflect.get(current, 'code') as unknown;
      if (code === '40001' || code === '40P01') return true;
      current = Reflect.get(current, 'cause') as unknown;
    } catch {
      return false;
    }
  }
  return false;
}

export async function retrySerializableTransaction<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableTransactionError(error)) throw error;
      if (attempt === 3) throw new SerializableTransactionRetryExhaustedError(error);
    }
  }
  throw new Error('Unreachable serializable transaction retry state.');
}

export function mapStageDrawActionError(error: unknown) {
  if (error instanceof SerializableTransactionRetryExhaustedError) {
    return {
      error: 'stage_draw_unavailable' as const,
      message: 'The stage draw could not be saved because the session changed concurrently. Refresh and try again.',
    };
  }
  if (error instanceof StageDrawUnavailableError) {
    return { error: 'stage_draw_unavailable' as const, message: error.message };
  }
  if (error instanceof StageDrawStaleError || error instanceof StageDrawValidationError) {
    return { error: 'invalid_stage_draw' as const, message: error.message };
  }
  return null;
}

export function mapSessionPersistenceError(error: unknown) {
  if (error instanceof SerializableTransactionRetryExhaustedError) {
    return {
      error: 'session_conflict' as const,
      message: 'The session changed concurrently. Refresh and try again.',
    };
  }
  return null;
}

type StagePersistenceMatch = {
  id: string;
  teamAId: string | null;
  teamBId: string | null;
  sequence: number;
};

export function buildStageDrawPersistenceMetadata({
  stage,
  matchRows,
  adjustmentPlan,
}: {
  stage: StageKey;
  matchRows: readonly StagePersistenceMatch[];
  adjustmentPlan: StageDrawAdjustmentPlan;
}) {
  const currentById = new Map(matchRows.map((match) => [match.id, match]));
  const selectedMatches = adjustmentPlan.slotUpdates.map((update) => {
    const current = currentById.get(update.matchId);
    if (!current || !current.teamAId || !current.teamBId) {
      throw new Error(`The planned stage match ${update.matchId} is missing or unresolved.`);
    }
    return current;
  });
  const selectedMatchIds = selectedMatches.map((match) => match.id).sort();
  const sequenceChanged = adjustmentPlan.slotUpdates.some((update) =>
    currentById.get(update.matchId)?.sequence !== update.sequence,
  );
  const temporarySequenceOffset = sequenceChanged
    ? Math.max(...matchRows.map((match) => match.sequence))
      - Math.min(...selectedMatches.map((match) => match.sequence))
      + 1
    : null;
  const bySequenceThenId = <T extends { matchId: string; sequence: number }>(left: T, right: T) =>
    left.sequence - right.sequence || left.matchId.localeCompare(right.matchId);

  return {
    selectedMatchIds,
    temporarySequenceOffset,
    auditDetails: {
      stage: { ...stage },
      before: selectedMatches
        .map((match) => ({
          matchId: match.id,
          teamAId: match.teamAId!,
          teamBId: match.teamBId!,
          sequence: match.sequence,
        }))
        .sort(bySequenceThenId),
      after: adjustmentPlan.slotUpdates
        .map((update) => ({ ...update }))
        .sort(bySequenceThenId),
      routeUpdates: adjustmentPlan.routeUpdates
        .map((update) => ({ ...update }))
        .sort((left, right) =>
          left.matchId.localeCompare(right.matchId)
          || left.outcome.localeCompare(right.outcome)
          || left.nextMatchId.localeCompare(right.nextMatchId)
          || left.toSlot.localeCompare(right.toSlot),
        ),
    },
  };
}

type ScoreRouteSource = {
  teamAId: string;
  teamBId: string;
  nextMatchId: string | null;
  winnerToSlot: 'A' | 'B' | null;
  loserNextMatchId: string | null;
  loserToSlot: 'A' | 'B' | null;
};

export function deriveScoreDownstreamRoutes(
  match: ScoreRouteSource,
  score: { scoreA: number; scoreB: number },
) {
  const teamAWon = score.scoreA > score.scoreB;
  const winnerTeamId = teamAWon ? match.teamAId : match.teamBId;
  const loserTeamId = teamAWon ? match.teamBId : match.teamAId;
  return [
    {
      outcome: 'winner' as const,
      nextMatchId: match.nextMatchId,
      slot: match.winnerToSlot,
      teamId: winnerTeamId,
    },
    {
      outcome: 'loser' as const,
      nextMatchId: match.loserNextMatchId,
      slot: match.loserToSlot,
      teamId: loserTeamId,
    },
  ]
    .filter((route): route is {
      outcome: 'winner' | 'loser';
      nextMatchId: string;
      slot: 'A' | 'B';
      teamId: string;
    } => Boolean(route.nextMatchId && route.slot))
    .sort((left, right) =>
      left.nextMatchId.localeCompare(right.nextMatchId)
      || left.slot.localeCompare(right.slot)
      || left.outcome.localeCompare(right.outcome),
    );
}

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    name: z.string().trim().min(1).max(100),
    scheduledAt: z.iso.datetime(),
    format: z.enum(sessionFormats).default('round_robin'),
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
    pairs: z.array(z.object({
      number: z.number().int().positive(),
      groupAPlayerId: z.uuid(),
      groupBPlayerId: z.uuid(),
    })).min(2),
    knockoutConfig: knockoutConfigSchema.optional(),
    qualifyingConfig: qualifyingKnockoutConfigSchema.optional(),
  }),
  z.object({
    action: z.literal('start_knockout'),
    sessionId: z.uuid(),
    knockoutConfig: knockoutConfigSchema,
    quarterFinalTeamIds: z.array(z.uuid()).length(8).optional(),
  }),
  scoreActionSchema,
  z.object({ action: z.literal('finalize'), sessionId: z.uuid() }),
  z.object({ action: z.literal('return_to_attendance'), sessionId: z.uuid() }),
  z.object({ action: z.literal('return_to_quarter_final_config'), sessionId: z.uuid() }),
  adjustStageDrawActionSchema,
  z.object({
    action: z.literal('set_format'),
    sessionId: z.uuid(),
    format: z.enum(sessionFormats),
  }),
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
      const result = await createPlaySessionWithAudit(database, {
        findActiveSeason: async (transaction) => {
          const [activeSeason] = await transaction
            .select()
            .from(seasons)
            .where(eq(seasons.status, 'active'))
            .for('update')
            .limit(1);
          return activeSeason;
        },
        insertSession: async (transaction, activeSeason) => {
          const [created] = await transaction
            .insert(playSessions)
            .values({
              seasonId: activeSeason.id,
              name: input.name,
              format: input.format,
              scheduledAt: new Date(input.scheduledAt),
              winPointsSnapshot: activeSeason.winPoints,
              lossPointsSnapshot: activeSeason.lossPoints,
              firstPlaceBonusSnapshot: activeSeason.firstPlaceBonus,
              secondPlaceBonusSnapshot: activeSeason.secondPlaceBonus,
              thirdPlaceBonusSnapshot: activeSeason.thirdPlaceBonus,
              maxSessionPointsSnapshot: activeSeason.maxSessionPoints,
              replacementForSessionId: input.replacementForSessionId,
              createdBy: admin.membership.id,
            })
            .returning();
          return created;
        },
        insertAudit: (transaction, created, activeSeason) => transaction.insert(auditLog).values({
          actorMembershipId: admin.membership.id,
          action: 'session.created',
          entityType: 'play_session',
          entityId: created.id,
          details: { seasonId: activeSeason.id },
        }),
      });
      if ('error' in result) {
        sendJson(response, 409, { error: 'active_season_required' });
        return;
      }
      sendJson(response, 201, { session: result.session });
      return;
    }

    if (input.action === 'set_format') {
      const result = await database.transaction(async (transaction) => {
        const [session] = await transaction
          .select()
          .from(playSessions)
          .where(eq(playSessions.id, input.sessionId))
          .for('update')
          .limit(1);
        if (!session) return { error: 'draft_session_required' as const };
        try {
          validateDraftFormatChange(session.status);
        } catch {
          return { error: 'draft_session_required' as const };
        }
        await transaction
          .update(playSessions)
          .set({ format: input.format, updatedAt: new Date() })
          .where(eq(playSessions.id, session.id));
        await transaction.insert(auditLog).values({
          actorMembershipId: admin.membership.id,
          action: 'session.format_changed',
          entityType: 'play_session',
          entityId: session.id,
          details: { from: session.format, to: input.format },
        });
        return { sessionId: session.id };
      });
      if ('error' in result) {
        sendJson(response, 409, result);
        return;
      }
      sendJson(response, 200, { session: await getSessionDetail(result.sessionId) });
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
        })
        .from(sessionParticipants)
        .innerJoin(players, eq(players.id, sessionParticipants.playerId))
        .where(
          and(
            eq(sessionParticipants.sessionId, session.id),
            eq(sessionParticipants.status, 'attendee'),
          ),
        );
      let draw;
      let knockout: ReturnType<typeof buildKnockoutTournament> | null = null;
      try {
        if (attendees.some((player) => !player.group)) {
          throw new Error('Every attendee must have an explicit A or B group before pairing.');
        }
        draw = buildConfiguredDraw(
          attendees.map((player) => ({ ...player, group: player.group as 'A' | 'B' })),
          input.pairs,
        );
        if (session.format === 'knockout' && !input.knockoutConfig) {
          throw new Error('Knockout bracket configuration is required.');
        }
        knockout = session.format === 'knockout'
          ? buildKnockoutTournament(draw.teams.length, input.knockoutConfig as KnockoutConfig)
          : null;
        if (session.format === 'qualifying_knockout') {
          draw = {
            teams: draw.teams,
            matches: buildQualifyingKnockoutMatches(
              draw.teams.length,
              input.qualifyingConfig as QualifyingKnockoutConfig | undefined,
            ),
          };
        }
      } catch (error) {
        sendJson(response, 409, {
          error: 'invalid_draw',
          message: error instanceof Error ? error.message : 'The draw is invalid.',
        });
        return;
      }
      const grouped = draw.teams.flatMap((team) => team.members);
      const drawRows = buildDrawPersistenceRows(
        session.id,
        grouped,
        { teams: draw.teams, matches: knockout ? [] : draw.matches },
      );
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
        const teamsByIndex = new Map(insertedTeams.map((team) => [
          drawRows.teams.findIndex((row) => row.seed === team.seed),
          team,
        ]));
        await transaction.insert(teamMembers).values(drawRows.members.map((member) => ({
          teamId: teamsByIndex.get(member.teamIndex)!.id,
          sessionId: member.sessionId,
          playerId: member.playerId,
          group: member.group,
        })));
        if (knockout) {
          const matchIds = new Map(knockout.matches.map((match) => [match.key, randomUUID()]));
          await transaction.insert(matches).values(knockout.matches.map((match, index) => ({
            id: matchIds.get(match.key)!,
            sessionId: session.id,
            sequence: index + 1,
            matchKind: match.matchKind,
            teamAId: match.sourceA.kind === 'team' ? teamsByIndex.get(match.sourceA.teamIndex)!.id : null,
            teamBId: match.sourceB.kind === 'team' ? teamsByIndex.get(match.sourceB.teamIndex)!.id : null,
            bracketRound: match.round,
            bracketPosition: match.position,
            placementGroup: match.placementGroup,
            placementBestRank: match.placementBestRank,
            placementWorstRank: match.placementWorstRank,
            nextMatchId: match.winnerNextKey ? matchIds.get(match.winnerNextKey)! : null,
            winnerToSlot: match.winnerToSlot,
            loserNextMatchId: match.loserNextKey ? matchIds.get(match.loserNextKey)! : null,
            loserToSlot: match.loserToSlot,
          })));
        } else {
          await transaction.insert(matches).values(
            drawRows.matches.map((match) => ({
              sessionId: session.id,
              sequence: match.sequence,
              matchKind: session.format === 'qualifying_knockout' ? 'qualifier' as const : 'round_robin' as const,
              teamAId: teamsByIndex.get(match.teamAIndex)!.id,
              teamBId: teamsByIndex.get(match.teamBIndex)!.id,
            })),
          );
        }
        await transaction
          .update(playSessions)
          .set({ status: 'draw_published', updatedAt: new Date() })
          .where(eq(playSessions.id, session.id));
        await transaction.insert(auditLog).values({
          actorMembershipId: admin.membership.id,
          action: 'session.draw_published',
          entityType: 'play_session',
          entityId: session.id,
          details: {
            pairing: 'manual',
            format: session.format,
            teamCount: draw.teams.length,
            matchCount: knockout?.matches.length ?? draw.matches.length,
          },
        });
      });
      sendJson(response, 200, { session: await getSessionDetail(session.id) });
      return;
    }

    if (input.action === 'start_knockout') {
      const [session] = await database
        .select()
        .from(playSessions)
        .where(eq(playSessions.id, input.sessionId))
        .limit(1);
      if (!session || session.format !== 'qualifying_knockout' || !['draw_published', 'in_progress'].includes(session.status)) {
        sendJson(response, 409, { error: 'qualifying_knockout_session_required' });
        return;
      }
      const [teamRows, matchRows] = await Promise.all([
        database.select().from(teams).where(eq(teams.sessionId, session.id)).orderBy(teams.seed),
        database.select().from(matches).where(eq(matches.sessionId, session.id)).orderBy(matches.sequence),
      ]);
      const qualifierMatches = matchRows.filter((match) => match.matchKind === 'qualifier');
      const bracketMatches = matchRows.filter((match) => match.matchKind === 'championship');
      if (bracketMatches.length) {
        sendJson(response, 409, { error: 'knockout_already_started' });
        return;
      }
      if (
        teamRows.length !== 10
        || qualifierMatches.length !== 5
        || qualifierMatches.some((match) =>
          match.status !== 'completed'
          || !match.teamAId
          || !match.teamBId
          || match.scoreA === null
          || match.scoreB === null)
      ) {
        sendJson(response, 409, { error: 'qualifiers_incomplete', message: 'Complete all five qualifying matches before starting the knockout bracket.' });
        return;
      }
      const seedByTeamId = new Map(teamRows.map((team) => [team.id, team.seed]));
      let knockout;
      let quarterFinalTeamIds: string[];
      let consolationMatch: { teamAId: string; teamBId: string; sequence: number };
      try {
        const standings = rankQualifyingTeams(qualifierMatches.flatMap((match) => [
          {
            teamId: match.teamAId!,
            seed: seedByTeamId.get(match.teamAId!)!,
            scoreFor: match.scoreA!,
            scoreAgainst: match.scoreB!,
          },
          {
            teamId: match.teamBId!,
            seed: seedByTeamId.get(match.teamBId!)!,
            scoreFor: match.scoreB!,
            scoreAgainst: match.scoreA!,
          },
        ]));
        const teamSelection = resolveQualifyingKnockoutTeams(standings, input.quarterFinalTeamIds);
        quarterFinalTeamIds = teamSelection.quarterFinalTeamIds;
        knockout = buildKnockoutTournament(8, input.knockoutConfig as KnockoutConfig);
        consolationMatch = {
          teamAId: teamSelection.consolationTeamIds[0],
          teamBId: teamSelection.consolationTeamIds[1],
          sequence: matchRows.length + knockout.matches.length + 1,
        };
      } catch (error) {
        sendJson(response, 409, {
          error: 'invalid_knockout_start',
          message: error instanceof Error ? error.message : 'The knockout bracket is invalid.',
        });
        return;
      }
      await database.transaction(async (transaction) => {
        const matchIds = new Map(knockout.matches.map((match) => [match.key, randomUUID()]));
        const sequenceOffset = matchRows.reduce((max, match) => Math.max(max, match.sequence), 0);
        await transaction.insert(matches).values(knockout.matches.map((match, index) => ({
          id: matchIds.get(match.key)!,
          sessionId: session.id,
          sequence: sequenceOffset + index + 1,
          matchKind: match.matchKind,
          teamAId: match.sourceA.kind === 'team' ? quarterFinalTeamIds[match.sourceA.teamIndex] : null,
          teamBId: match.sourceB.kind === 'team' ? quarterFinalTeamIds[match.sourceB.teamIndex] : null,
          bracketRound: match.round,
          bracketPosition: match.position,
          placementGroup: match.placementGroup,
          placementBestRank: match.placementBestRank,
          placementWorstRank: match.placementWorstRank,
          nextMatchId: match.winnerNextKey ? matchIds.get(match.winnerNextKey)! : null,
          winnerToSlot: match.winnerToSlot,
          loserNextMatchId: match.loserNextKey ? matchIds.get(match.loserNextKey)! : null,
          loserToSlot: match.loserToSlot,
        })));
        await transaction.insert(matches).values({
          sessionId: session.id,
          sequence: consolationMatch.sequence,
          matchKind: 'placement',
          placementGroup: knockout.placementGroups.length + 1,
          placementBestRank: 9,
          placementWorstRank: 10,
          bracketRound: 0,
          bracketPosition: 0,
          teamAId: consolationMatch.teamAId,
          teamBId: consolationMatch.teamBId,
        });
        await transaction
          .update(playSessions)
          .set({ status: 'in_progress', updatedAt: new Date() })
          .where(eq(playSessions.id, session.id));
        await transaction.insert(auditLog).values({
          actorMembershipId: admin.membership.id,
          action: 'session.knockout_started',
          entityType: 'play_session',
          entityId: session.id,
          details: {
            advancingTeamIds: quarterFinalTeamIds,
            consolationTeamIds: [consolationMatch.teamAId, consolationMatch.teamBId],
            matchCount: knockout.matches.length + 1,
          },
        });
      });
      sendJson(response, 200, { session: await getSessionDetail(session.id) });
      return;
    }

    if (input.action === 'adjust_stage_draw') {
      const stage = {
        matchKind: input.stage.matchKind,
        bracketRound: input.stage.bracketRound ?? null,
        placementGroup: input.stage.placementGroup ?? null,
      };
      const result = await retrySerializableTransaction(() => database.transaction(async (transaction) => {
        const [session] = await transaction
          .select()
          .from(playSessions)
          .where(eq(playSessions.id, input.sessionId))
          .for('update')
          .limit(1);
        if (!session) {
          return {
            error: 'stage_draw_unavailable' as const,
            message: 'The requested session does not exist.',
          };
        }
        const matchRows = await transaction
          .select()
          .from(matches)
          .where(eq(matches.sessionId, session.id))
          .orderBy(matches.sequence)
          .for('update');

        let adjustmentPlan: StageDrawAdjustmentPlan;
        try {
          adjustmentPlan = planStageDrawAdjustment({
            sessionStatus: session.status,
            stage,
            matches: matchRows,
            expected: input.expectedMatches,
            desired: input.matches,
          });
        } catch (error) {
          const mappedError = mapStageDrawActionError(error);
          if (mappedError) return mappedError;
          throw error;
        }

        const now = new Date();
        const persistence = buildStageDrawPersistenceMetadata({
          stage,
          matchRows,
          adjustmentPlan,
        });

        if (persistence.temporarySequenceOffset !== null) {
          await transaction
            .update(matches)
            .set({
              sequence: sql`${matches.sequence} + ${persistence.temporarySequenceOffset}`,
              updatedAt: now,
            })
            .where(inArray(matches.id, persistence.selectedMatchIds));
        }

        for (const routeUpdate of adjustmentPlan.routeUpdates) {
          await transaction
            .update(matches)
            .set(routeUpdate.outcome === 'winner'
              ? {
                  nextMatchId: routeUpdate.nextMatchId,
                  winnerToSlot: routeUpdate.toSlot,
                  updatedAt: now,
                }
              : {
                  loserNextMatchId: routeUpdate.nextMatchId,
                  loserToSlot: routeUpdate.toSlot,
                  updatedAt: now,
                })
            .where(eq(matches.id, routeUpdate.matchId));
        }

        for (const slotUpdate of adjustmentPlan.slotUpdates) {
          await transaction
            .update(matches)
            .set({
              teamAId: slotUpdate.teamAId,
              teamBId: slotUpdate.teamBId,
              sequence: slotUpdate.sequence,
              updatedAt: now,
            })
            .where(eq(matches.id, slotUpdate.matchId));
        }

        await transaction
          .update(playSessions)
          .set({ updatedAt: now })
          .where(eq(playSessions.id, session.id));
        await transaction.insert(auditLog).values({
          actorMembershipId: admin.membership.id,
          action: 'session.stage_draw_adjusted',
          entityType: 'play_session',
          entityId: session.id,
          details: persistence.auditDetails,
        });
        return { sessionId: session.id };
      }, { isolationLevel: 'serializable' })).catch((error: unknown) => {
        const mappedError = mapStageDrawActionError(error);
        if (mappedError) return mappedError;
        throw error;
      });
      if ('error' in result) {
        sendJson(response, 409, result);
        return;
      }
      sendJson(response, 200, { session: await getSessionDetail(result.sessionId) });
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
      const [matchReference] = await database
        .select({ sessionId: matches.sessionId })
        .from(matches)
        .where(eq(matches.id, input.matchId))
        .limit(1);
      if (!matchReference) {
        sendJson(response, 409, { error: 'scoreable_match_required' });
        return;
      }
      const scoreResult = await database.transaction(async (transaction) => {
        const [session] = await transaction
          .select()
          .from(playSessions)
          .where(eq(playSessions.id, matchReference.sessionId))
          .for('update')
          .limit(1);
        if (!session || !['draw_published', 'in_progress'].includes(session.status)) {
          return { error: 'scoreable_match_required' as const };
        }

        const [lockedMatch] = await transaction
          .select()
          .from(matches)
          .where(and(
            eq(matches.id, input.matchId),
            eq(matches.sessionId, session.id),
          ))
          .for('update')
          .limit(1);
        if (!lockedMatch) {
          return { error: 'scoreable_match_required' as const };
        }
        const matchStateError = mapLockedScoreMatchError(
          lockedMatch,
          input.expectedTeamAId,
          input.expectedTeamBId,
        );
        if (matchStateError) return matchStateError;

        const routes = deriveScoreDownstreamRoutes({
          teamAId: lockedMatch.teamAId!,
          teamBId: lockedMatch.teamBId!,
          nextMatchId: lockedMatch.nextMatchId,
          winnerToSlot: lockedMatch.winnerToSlot,
          loserNextMatchId: lockedMatch.loserNextMatchId,
          loserToSlot: lockedMatch.loserToSlot,
        }, score);
        const downstreamMatchIds = [...new Set(routes.map((route) => route.nextMatchId))].sort();
        const downstreamMatchRows = downstreamMatchIds.length
          ? await transaction
              .select()
              .from(matches)
              .where(and(
                eq(matches.sessionId, session.id),
                inArray(matches.id, downstreamMatchIds),
              ))
              .orderBy(matches.id)
              .for('update')
          : [];
        if (downstreamMatchRows.length !== downstreamMatchIds.length) {
          return { error: 'knockout_path_invalid' as const };
        }
        const downstreamById = new Map(downstreamMatchRows.map((match) => [match.id, match]));

        for (const route of routes) {
          const nextMatch = downstreamById.get(route.nextMatchId)!;
          const currentTeam = route.slot === 'A' ? nextMatch.teamAId : nextMatch.teamBId;
          const downstreamScored = nextMatch.scoreA !== null || nextMatch.scoreB !== null;
          try {
            validateWinnerAdvancement(currentTeam, route.teamId, downstreamScored);
          } catch {
            return { error: 'downstream_match_already_scored' as const };
          }
        }

        const now = new Date();
        for (const route of routes) {
          await transaction
            .update(matches)
            .set(route.slot === 'A'
              ? { teamAId: route.teamId, updatedAt: now }
              : { teamBId: route.teamId, updatedAt: now })
            .where(eq(matches.id, route.nextMatchId));
        }
        await transaction
          .update(matches)
          .set({ ...score, court: input.court, status: 'completed', updatedAt: now })
          .where(eq(matches.id, lockedMatch.id));
        await transaction
          .update(playSessions)
          .set({ status: 'in_progress', updatedAt: now })
          .where(eq(playSessions.id, session.id));
        await transaction.insert(auditLog).values({
          actorMembershipId: admin.membership.id,
          action: 'match.scored',
          entityType: 'match',
          entityId: lockedMatch.id,
          details: score,
        });
        return { sessionId: session.id };
      });
      if ('error' in scoreResult) {
        sendJson(response, 409, scoreResult);
        return;
      }
      sendJson(response, 200, { session: await getSessionDetail(scoreResult.sessionId) });
      return;
    }

    if (input.action === 'return_to_attendance') {
      const result = await database.transaction(
        async (transaction) => {
          const [session] = await transaction
            .select()
            .from(playSessions)
            .where(eq(playSessions.id, input.sessionId))
            .for('update')
            .limit(1);
          if (!session) return { error: 'rollbackable_session_required' as const };
          try {
            planAttendanceRollback(session.status, []);
          } catch {
            return { error: 'rollbackable_session_required' as const };
          }
          const deletedMatches = await transaction
            .delete(matches)
            .where(eq(matches.sessionId, session.id))
            .returning({ status: matches.status });
          const rollback = planAttendanceRollback(
            session.status,
            deletedMatches.map((match) => match.status),
          );
          await transaction.delete(teamMembers).where(eq(teamMembers.sessionId, session.id));
          await transaction.delete(teams).where(eq(teams.sessionId, session.id));
          await transaction
            .update(playSessions)
            .set({ status: 'draft', updatedAt: new Date() })
            .where(eq(playSessions.id, session.id));
          await transaction.insert(auditLog).values({
            actorMembershipId: admin.membership.id,
            action: 'session.returned_to_attendance',
            entityType: 'play_session',
            entityId: session.id,
            details: rollback,
          });
          return { sessionId: session.id };
        },
        { isolationLevel: 'serializable' },
      );
      if ('error' in result) {
        sendJson(response, 409, result);
        return;
      }
      sendJson(response, 200, { sessionId: result.sessionId });
      return;
    }

    if (input.action === 'return_to_quarter_final_config') {
      const result = await database.transaction(
        async (transaction) => {
          const [session] = await transaction
            .select()
            .from(playSessions)
            .where(eq(playSessions.id, input.sessionId))
            .for('update')
            .limit(1);
          if (!session) return { error: 'quarter_final_config_unavailable' as const };
          const matchRows = await transaction
            .select({
              id: matches.id,
              bracketRound: matches.bracketRound,
            })
            .from(matches)
            .where(eq(matches.sessionId, session.id))
            .orderBy(matches.sequence);
          let plan;
          try {
            plan = planQuarterFinalConfigReturn(session.format, session.status, matchRows);
          } catch (error) {
            return {
              error: 'quarter_final_config_unavailable' as const,
              message: error instanceof Error ? error.message : 'Return to quarter-final configuration is unavailable.',
            };
          }
          await transaction.delete(matches).where(inArray(matches.id, plan.deletedMatchIds));
          await transaction
            .update(playSessions)
            .set({ status: 'in_progress', updatedAt: new Date() })
            .where(eq(playSessions.id, session.id));
          await transaction.insert(auditLog).values({
            actorMembershipId: admin.membership.id,
            action: 'session.returned_to_quarter_final_config',
            entityType: 'play_session',
            entityId: session.id,
            details: {
              deletedMatchIds: plan.deletedMatchIds,
              keptQualifierMatchIds: plan.keptQualifierMatchIds,
            },
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

    if (input.action === 'finalize') {
      const result = await finalizeSessionPoints(database, input.sessionId, admin.membership.id)
        .catch((error: unknown) => {
          const mappedError = mapSessionPersistenceError(error);
          if (mappedError) return mappedError;
          throw error;
        });
      if ('error' in result) {
        sendJson(response, 409, result);
        return;
      }
      sendJson(response, 200, { session: await getSessionDetail(result.sessionId) });
      return;
    }

    requireSuperadmin(admin.membership);
    const result = await voidFinalizedSession(database, input, admin.membership.id)
      .catch((error: unknown) => {
        const mappedError = mapSessionPersistenceError(error);
        if (mappedError) return mappedError;
        throw error;
      });
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
