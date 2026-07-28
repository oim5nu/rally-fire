import { describe, expect, it } from 'vitest';
import * as seasonApi from './seasons.js';

const { createSeasonSchema, updateSeasonSchema } = seasonApi;

const startsAt = '2026-07-18T08:00:00.000Z';
const seasonId = '00000000-0000-4000-8000-000000000001';

describe('season point rule schemas', () => {
  it('applies the standard six-rule defaults when creating a season', () => {
    expect(createSeasonSchema.parse({ name: 'Winter', startsAt })).toMatchObject({
      winPoints: 1,
      lossPoints: 0,
      firstPlaceBonus: 4,
      secondPlaceBonus: 2,
      thirdPlaceBonus: 1,
      maxSessionPoints: 8,
    });
  });

  it('accepts tenths and rejects negative bonuses or a nonpositive cap', () => {
    expect(createSeasonSchema.safeParse({
      name: 'Winter',
      startsAt,
      winPoints: 1.5,
      lossPoints: 0.5,
      firstPlaceBonus: 4.5,
      secondPlaceBonus: 2.5,
      thirdPlaceBonus: 1.5,
      maxSessionPoints: 8.5,
    }).success).toBe(true);
    expect(createSeasonSchema.safeParse({ name: 'Winter', startsAt, firstPlaceBonus: -0.1 }).success).toBe(false);
    expect(createSeasonSchema.safeParse({ name: 'Winter', startsAt, maxSessionPoints: 0 }).success).toBe(false);
    expect(createSeasonSchema.safeParse({ name: 'Winter', startsAt, maxSessionPoints: 8.25 }).success).toBe(false);
  });

  it('validates optional point-rule updates with the same constraints', () => {
    expect(updateSeasonSchema.safeParse({ seasonId, thirdPlaceBonus: 1.5, maxSessionPoints: 9.5 }).success).toBe(true);
    expect(updateSeasonSchema.safeParse({ seasonId, secondPlaceBonus: -1 }).success).toBe(false);
    expect(updateSeasonSchema.safeParse({ seasonId, maxSessionPoints: 0 }).success).toBe(false);
  });

  it('rejects every point rule above the numeric(12,1) database maximum', () => {
    const databaseMaximum = 99_999_999_999.9;
    const oversized = 100_000_000_000;
    expect(createSeasonSchema.safeParse({
      name: 'Winter',
      startsAt,
      winPoints: databaseMaximum,
      lossPoints: databaseMaximum,
      firstPlaceBonus: databaseMaximum,
      secondPlaceBonus: databaseMaximum,
      thirdPlaceBonus: databaseMaximum,
      maxSessionPoints: databaseMaximum,
    }).success).toBe(true);
    for (const field of [
      'winPoints',
      'lossPoints',
      'firstPlaceBonus',
      'secondPlaceBonus',
      'thirdPlaceBonus',
      'maxSessionPoints',
    ] as const) {
      expect(createSeasonSchema.safeParse({ name: 'Winter', startsAt, [field]: oversized }).success).toBe(false);
      expect(updateSeasonSchema.safeParse({ seasonId, [field]: oversized }).success).toBe(false);
    }
  });
});

describe('season audited mutations', () => {
  it('checks, creates, and audits a season inside one injected transaction', async () => {
    const createSeasonWithAudit = Reflect.get(seasonApi, 'createSeasonWithAudit') as
      | ((database: unknown, operations: unknown) => Promise<unknown>)
      | undefined;
    expect(createSeasonWithAudit).toBeTypeOf('function');
    if (!createSeasonWithAudit) return;

    const transaction = { marker: 'season-create-transaction' };
    const calls: string[] = [];
    const season = { id: seasonId, name: 'Winter' };
    const result = await createSeasonWithAudit({
      transaction: async (body: (tx: typeof transaction) => Promise<unknown>) => body(transaction),
    }, {
      findActiveSeason: async (tx: unknown) => {
        expect(tx).toBe(transaction);
        calls.push('check');
        return null;
      },
      insertSeason: async (tx: unknown) => {
        expect(tx).toBe(transaction);
        calls.push('create');
        return season;
      },
      insertAudit: async (tx: unknown, created: unknown) => {
        expect(tx).toBe(transaction);
        expect(created).toBe(season);
        calls.push('audit');
      },
    });

    expect(result).toEqual({ season });
    expect(calls).toEqual(['check', 'create', 'audit']);
  });

  it('updates and audits a season inside one injected transaction', async () => {
    const updateSeasonWithAudit = Reflect.get(seasonApi, 'updateSeasonWithAudit') as
      | ((database: unknown, operations: unknown) => Promise<unknown>)
      | undefined;
    expect(updateSeasonWithAudit).toBeTypeOf('function');
    if (!updateSeasonWithAudit) return;

    const transaction = { marker: 'season-update-transaction' };
    const calls: string[] = [];
    const season = { id: seasonId, name: 'Updated winter' };
    await expect(updateSeasonWithAudit({
      transaction: async (body: (tx: typeof transaction) => Promise<unknown>) => body(transaction),
    }, {
      updateSeason: async (tx: unknown) => {
        expect(tx).toBe(transaction);
        calls.push('update');
        return season;
      },
      insertAudit: async (tx: unknown, updated: unknown) => {
        expect(tx).toBe(transaction);
        expect(updated).toBe(season);
        calls.push('audit');
      },
    })).resolves.toEqual({ season });
    expect(calls).toEqual(['update', 'audit']);
  });
});
