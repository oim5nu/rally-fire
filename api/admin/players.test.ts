import { describe, expect, it } from 'vitest';
import { createPlayerSchema, updatePlayerSchema } from './players.js';

const playerId = '00000000-0000-4000-8000-000000000001';
const validCreate = {
  name: 'Player',
  displayRating: 'NTRP 4.0',
  clubSkill: 5,
  openingPoints: 0,
};

describe('player sex API contracts', () => {
  it.each(['M', 'F', 'Unknown'] as const)('accepts %s when creating a player', (sex) => {
    expect(createPlayerSchema.parse({ ...validCreate, sex }).sex).toBe(sex);
  });

  it('requires a supported sex when creating a player', () => {
    expect(createPlayerSchema.safeParse(validCreate).success).toBe(false);
    expect(createPlayerSchema.safeParse({ ...validCreate, sex: 'Other' }).success).toBe(false);
  });

  it('accepts supported optional sex updates and rejects invalid values', () => {
    expect(updatePlayerSchema.parse({ playerId, sex: 'F' }).sex).toBe('F');
    expect(updatePlayerSchema.safeParse({ playerId }).success).toBe(true);
    expect(updatePlayerSchema.safeParse({ playerId, sex: 'Other' }).success).toBe(false);
  });
});
