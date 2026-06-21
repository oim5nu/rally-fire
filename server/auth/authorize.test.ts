import { describe, expect, it } from 'vitest';
import {
  authorizeAdminSession,
  type AdminAuthRepository,
  type AdminMembership,
  type AdminSessionGrant,
} from './authorize';

const now = new Date('2026-06-22T00:00:00.000Z');

function createRepository({
  memberships = [],
  grants = [],
}: {
  memberships?: AdminMembership[];
  grants?: AdminSessionGrant[];
} = {}) {
  const createdGrants: AdminSessionGrant[] = [];
  const createdMemberships: AdminMembership[] = [];
  const repository: AdminAuthRepository = {
    async countMemberships() {
      return memberships.length + createdMemberships.length;
    },
    async findMembershipByAuthUserId(authUserId) {
      return [...memberships, ...createdMemberships].find(
        (membership) => membership.authUserId === authUserId,
      ) ?? null;
    },
    async createInitialMembership(input) {
      const membership: AdminMembership = {
        id: 'membership-new',
        status: 'active',
        ...input,
      };
      createdMemberships.push(membership);
      return membership;
    },
    async findSessionGrant(authSessionId) {
      return [...grants, ...createdGrants].find(
        (grant) => grant.authSessionId === authSessionId,
      ) ?? null;
    },
    async createSessionGrant(input) {
      const grant = { id: 'grant-new', revokedAt: null, ...input };
      createdGrants.push(grant);
      return grant;
    },
  };
  return { repository, createdGrants, createdMemberships };
}

describe('admin authorization', () => {
  it('bootstraps the configured verified user and grants the current session', async () => {
    const { repository, createdGrants, createdMemberships } = createRepository();
    const result = await authorizeAdminSession({
      identity: {
        userId: 'user-1',
        email: 'owner@example.com',
        emailVerified: true,
        sessionId: 'session-1',
      },
      initialSuperadminEmail: 'OWNER@example.com',
      ttlHours: 8,
      now,
      repository,
    });

    expect(result.membership.role).toBe('superadmin');
    expect(result.grantExpiresAt).toEqual(new Date('2026-06-22T08:00:00.000Z'));
    expect(createdMemberships).toHaveLength(1);
    expect(createdGrants).toHaveLength(1);
  });

  it('rejects an authenticated user without an admin membership', async () => {
    const { repository } = createRepository();
    await expect(
      authorizeAdminSession({
        identity: {
          userId: 'user-2',
          email: 'other@example.com',
          emailVerified: true,
          sessionId: 'session-2',
        },
        initialSuperadminEmail: 'owner@example.com',
        ttlHours: 8,
        now,
        repository,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('does not renew an expired grant tied to the same Supabase session', async () => {
    const membership: AdminMembership = {
      id: 'membership-1',
      authUserId: 'user-1',
      email: 'owner@example.com',
      role: 'superadmin',
      status: 'active',
    };
    const { repository, createdGrants } = createRepository({
      memberships: [membership],
      grants: [
        {
          id: 'grant-1',
          membershipId: membership.id,
          authSessionId: 'session-1',
          expiresAt: new Date('2026-06-21T23:00:00.000Z'),
          revokedAt: null,
        },
      ],
    });

    await expect(
      authorizeAdminSession({
        identity: {
          userId: 'user-1',
          email: 'owner@example.com',
          emailVerified: true,
          sessionId: 'session-1',
        },
        initialSuperadminEmail: 'owner@example.com',
        ttlHours: 8,
        now,
        repository,
      }),
    ).rejects.toMatchObject({ code: 'reauth_required' });
    expect(createdGrants).toHaveLength(0);
  });

  it('treats a revoked grant as requiring fresh authentication', async () => {
    const membership: AdminMembership = {
      id: 'membership-1',
      authUserId: 'user-1',
      email: 'owner@example.com',
      role: 'admin',
      status: 'active',
    };
    const { repository } = createRepository({
      memberships: [membership],
      grants: [
        {
          id: 'grant-1',
          membershipId: membership.id,
          authSessionId: 'session-1',
          expiresAt: new Date('2026-06-22T08:00:00.000Z'),
          revokedAt: now,
        },
      ],
    });

    await expect(
      authorizeAdminSession({
        identity: {
          userId: 'user-1',
          email: 'owner@example.com',
          emailVerified: true,
          sessionId: 'session-1',
        },
        initialSuperadminEmail: 'owner@example.com',
        ttlHours: 8,
        now,
        repository,
      }),
    ).rejects.toMatchObject({ code: 'reauth_required' });
  });
});
