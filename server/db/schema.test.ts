import { describe, expect, it } from 'vitest';
import { playerSex, players } from './schema.js';

describe('player sex schema', () => {
  it('defines the supported player sex values', () => {
    expect(playerSex.enumValues).toEqual(['M', 'F', 'Unknown']);
  });

  it('stores a non-null sex with a database default', () => {
    expect(players.sex.notNull).toBe(true);
    expect(players.sex.hasDefault).toBe(true);
  });
});
