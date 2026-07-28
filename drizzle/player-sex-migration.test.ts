import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationSql = readFileSync(
  new URL('./0006_add_player_sex.sql', import.meta.url),
  'utf8',
).replace(/\s+/g, ' ');

describe('player sex migration', () => {
  it('creates the fixed player sex enum', () => {
    expect(migrationSql).toContain(
      `CREATE TYPE "public"."player_sex" AS ENUM('M', 'F', 'Unknown')`,
    );
  });

  it('backfills existing players and defaults future players to Unknown', () => {
    expect(migrationSql).toContain(
      `ALTER TABLE "players" ADD COLUMN "sex" "player_sex" DEFAULT 'Unknown' NOT NULL`,
    );
  });
});
