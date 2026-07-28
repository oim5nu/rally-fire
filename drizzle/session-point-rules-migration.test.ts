import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationSql = readFileSync(
  new URL('./0005_early_vin_gonzales.sql', import.meta.url),
  'utf8',
);

function updateStatement(table: string, occurrence = 0): string {
  const statements = migrationSql.match(new RegExp(
    `UPDATE "${table}"[\\s\\S]*?;--> statement-breakpoint`,
    'g',
  )) ?? [];
  return statements[occurrence]?.replace(/\s+/g, ' ') ?? '';
}

describe('session point rules migration', () => {
  it('resets every season configuration to the coherent standard rules', () => {
    const statement = updateStatement('seasons');
    expect(statement).toContain('"win_points" = 1');
    expect(statement).toContain('"loss_points" = 0');
    expect(statement).toContain('"first_place_bonus" = 4');
    expect(statement).toContain('"second_place_bonus" = 2');
    expect(statement).toContain('"third_place_bonus" = 1');
    expect(statement).toContain('"max_session_points" = 8');
    expect(statement).not.toContain(' WHERE ');
  });

  it('preserves legacy finalized and voided scoring semantics while resetting only unfinalized rules', () => {
    const unfinalized = updateStatement('play_sessions', 0);
    expect(unfinalized).toContain('"win_points_snapshot" = 1');
    expect(unfinalized).toContain('"loss_points_snapshot" = 0');
    expect(unfinalized).toContain("WHERE \"status\" IN ('draft', 'draw_published', 'in_progress')");

    const historical = updateStatement('play_sessions', 1);
    expect(historical).not.toContain('"win_points_snapshot"');
    expect(historical).not.toContain('"loss_points_snapshot"');
    expect(historical).toContain('"first_place_bonus_snapshot" = 0');
    expect(historical).toContain('"second_place_bonus_snapshot" = 0');
    expect(historical).toContain('"third_place_bonus_snapshot" = 0');
    expect(historical).toContain('"max_session_points_snapshot" = 99999999999.9');
    expect(historical).toContain("WHERE \"status\" IN ('finalized', 'voided')");
  });
});
