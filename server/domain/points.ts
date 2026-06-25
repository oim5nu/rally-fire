import { z } from 'zod';

export const pointValueSchema = z
  .number()
  .refine((value) => Number.isInteger(value * 10), 'Points can have at most one decimal place.');

export interface BulkPointAdjustmentInput {
  playerId: string;
  points: number;
}

export function buildBulkPointAdjustments(adjustments: BulkPointAdjustmentInput[]) {
  const nonZeroAdjustments = adjustments.filter((adjustment) => adjustment.points !== 0);
  if (nonZeroAdjustments.length === 0) {
    throw new Error('At least one non-zero point adjustment is required.');
  }

  const playerIds = new Set(nonZeroAdjustments.map((adjustment) => adjustment.playerId));
  if (playerIds.size !== nonZeroAdjustments.length) {
    throw new Error('Each player can be adjusted once per bulk update.');
  }

  return nonZeroAdjustments;
}
