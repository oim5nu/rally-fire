import { describe, expect, it } from 'vitest';
import { extractBearerToken, readSessionId } from './token';

function tokenWithPayload(payload: object) {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

describe('authorization token parsing', () => {
  it('extracts a bearer token case-insensitively', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(extractBearerToken('bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('rejects missing and non-bearer authorization headers', () => {
    expect(() => extractBearerToken(undefined)).toThrow(/bearer/i);
    expect(() => extractBearerToken('Basic abc')).toThrow(/bearer/i);
  });

  it('reads the Supabase session_id claim after token verification', () => {
    expect(readSessionId(tokenWithPayload({ session_id: 'session-123' }))).toBe('session-123');
  });

  it('rejects malformed payloads and tokens without a session_id', () => {
    expect(() => readSessionId('not-a-jwt')).toThrow(/session/i);
    expect(() => readSessionId(tokenWithPayload({ sub: 'user-123' }))).toThrow(/session/i);
  });
});
