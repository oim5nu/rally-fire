import { z } from 'zod';

export const pointValueSchema = z
  .number()
  .refine((value) => Number.isInteger(value * 10), 'Points can have at most one decimal place.');
