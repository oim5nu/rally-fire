import { describe, expect, it } from 'vitest';
import {
  decideAdminAccess,
  initialSuperadminRole,
  mayDisableMembership,
} from './admin-access';

const now = new Date('2026-06-22T00:00:00.000Z');

describe('initial superadmin bootstrap', () => {
  it('bootstraps only the configured verified email when no membership exists', () => {
    expect(
      initialSuperadminRole({
        configuredEmail: 'Owner@Example.com',
        userEmail: 'owner@example.com',
        emailVerified: true,
        membershipCount: 0,
      }),
    ).toBe('superadmin');

    expect(
      initialSuperadminRole({
        configuredEmail: 'owner@example.com',
        userEmail: 'other@example.com',
        emailVerified: true,
        membershipCount: 0,
      }),
    ).toBeNull();
  });

  it('does not bootstrap an unverified user or replace an existing membership', () => {
    expect(
      initialSuperadminRole({
        configuredEmail: 'owner@example.com',
        userEmail: 'owner@example.com',
        emailVerified: false,
        membershipCount: 0,
      }),
    ).toBeNull();
    expect(
      initialSuperadminRole({
        configuredEmail: 'owner@example.com',
        userEmail: 'owner@example.com',
        emailVerified: true,
        membershipCount: 1,
      }),
    ).toBeNull();
  });
});

describe('admin session grants', () => {
  it('creates an eight-hour grant for a new authenticated session', () => {
    expect(
      decideAdminAccess({
        membershipStatus: 'active',
        existingGrantExpiresAt: null,
        now,
        ttlHours: 8,
      }),
    ).toEqual({
      kind: 'create_grant',
      expiresAt: new Date('2026-06-22T08:00:00.000Z'),
    });
  });

  it('accepts an unexpired grant without extending it', () => {
    const expiresAt = new Date('2026-06-22T02:00:00.000Z');
    expect(
      decideAdminAccess({
        membershipStatus: 'active',
        existingGrantExpiresAt: expiresAt,
        now,
        ttlHours: 8,
      }),
    ).toEqual({ kind: 'allow', expiresAt });
  });

  it('requires fresh authentication after expiry and never recreates the same grant', () => {
    expect(
      decideAdminAccess({
        membershipStatus: 'active',
        existingGrantExpiresAt: new Date('2026-06-21T23:59:59.000Z'),
        now,
        ttlHours: 8,
      }),
    ).toEqual({ kind: 'reauth_required' });
  });

  it('rejects disabled administrators', () => {
    expect(
      decideAdminAccess({
        membershipStatus: 'disabled',
        existingGrantExpiresAt: null,
        now,
        ttlHours: 8,
      }),
    ).toEqual({ kind: 'forbidden' });
  });
});

describe('superadmin safety', () => {
  it('protects the last active superadmin', () => {
    expect(
      mayDisableMembership({ targetRole: 'superadmin', activeSuperadminCount: 1 }),
    ).toBe(false);
    expect(
      mayDisableMembership({ targetRole: 'superadmin', activeSuperadminCount: 2 }),
    ).toBe(true);
    expect(
      mayDisableMembership({ targetRole: 'admin', activeSuperadminCount: 1 }),
    ).toBe(true);
  });
});
