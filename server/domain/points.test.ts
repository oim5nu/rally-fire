import { describe, expect, it } from 'vitest';
import { buildBulkPointAdjustments, pointValueSchema } from './points.js';

describe('pointValueSchema', () => {
  it.each([150, 150.5, -10.5, 0, -99_999_999_999.9])('accepts %s as a point value', (value) => {
    expect(pointValueSchema.parse(value)).toBe(value);
  });

  it.each([1.25, -2.22, Number.POSITIVE_INFINITY, -100_000_000_000])('rejects %s as a point value', (value) => {
    expect(pointValueSchema.safeParse(value).success).toBe(false);
  });
});

describe('buildBulkPointAdjustments', () => {
  it('keeps non-zero point adjustments and ignores zeros', () => {
    expect(buildBulkPointAdjustments([
      { playerId: 'player-1', points: 2.5 },
      { playerId: 'player-2', points: 0 },
      { playerId: 'player-3', points: -1 },
    ])).toEqual([
      { playerId: 'player-1', points: 2.5 },
      { playerId: 'player-3', points: -1 },
    ]);
  });

  it('rejects empty or all-zero bulk adjustments', () => {
    expect(() => buildBulkPointAdjustments([])).toThrow('At least one non-zero point adjustment is required.');
    expect(() => buildBulkPointAdjustments([{ playerId: 'player-1', points: 0 }])).toThrow('At least one non-zero point adjustment is required.');
  });

  it('rejects duplicate players in one bulk adjustment', () => {
    expect(() => buildBulkPointAdjustments([
      { playerId: 'player-1', points: 1 },
      { playerId: 'player-1', points: -2 },
    ])).toThrow('Each player can be adjusted once per bulk update.');
  });
});
