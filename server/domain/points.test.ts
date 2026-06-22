import { describe, expect, it } from 'vitest';
import { pointValueSchema } from './points.js';

describe('pointValueSchema', () => {
  it.each([150, 150.5, -10.5, 0])('accepts %s as a point value', (value) => {
    expect(pointValueSchema.parse(value)).toBe(value);
  });

  it.each([1.25, -2.22, Number.POSITIVE_INFINITY])('rejects %s as a point value', (value) => {
    expect(pointValueSchema.safeParse(value).success).toBe(false);
  });
});
