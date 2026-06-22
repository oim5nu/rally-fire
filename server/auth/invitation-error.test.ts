import { describe, expect, it } from 'vitest';
import { invitationErrorResponse } from './invitation-error.js';

describe('invitationErrorResponse', () => {
  it('maps Supabase email rate limits to a retryable API response', () => {
    expect(invitationErrorResponse({ status: 429, message: 'email rate limit exceeded' })).toEqual({
      status: 429,
      body: {
        error: 'invitation_rate_limited',
        message: 'Too many invitation emails were requested. Wait a while and try again.',
      },
    });
  });

  it('does not expose unrelated upstream errors', () => {
    expect(invitationErrorResponse({ status: 500, message: 'database details' })).toBeUndefined();
  });
});
