import {
  decideAdminAccess,
  initialSuperadminRole,
  type AdminRole,
  type MembershipStatus,
} from '../domain/admin-access';

export interface VerifiedIdentity {
  userId: string;
  email: string;
  emailVerified: boolean;
  sessionId: string;
}

export interface AdminMembership {
  id: string;
  authUserId: string;
  email: string;
  role: AdminRole;
  status: MembershipStatus;
}

export interface AdminSessionGrant {
  id: string;
  membershipId: string;
  authSessionId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface AdminAuthRepository {
  countMemberships(): Promise<number>;
  findMembershipByAuthUserId(authUserId: string): Promise<AdminMembership | null>;
  createInitialMembership(input: {
    authUserId: string;
    email: string;
    role: 'superadmin';
  }): Promise<AdminMembership>;
  findSessionGrant(authSessionId: string): Promise<AdminSessionGrant | null>;
  createSessionGrant(input: {
    membershipId: string;
    authSessionId: string;
    expiresAt: Date;
  }): Promise<AdminSessionGrant>;
}

export type AdminAuthorizationCode = 'unauthorized' | 'forbidden' | 'reauth_required';

export class AdminAuthorizationError extends Error {
  constructor(
    public readonly code: AdminAuthorizationCode,
    message: string,
  ) {
    super(message);
    this.name = 'AdminAuthorizationError';
  }
}

interface AuthorizeAdminSessionInput {
  identity: VerifiedIdentity;
  initialSuperadminEmail: string | undefined;
  ttlHours: number;
  now: Date;
  repository: AdminAuthRepository;
}

export async function authorizeAdminSession({
  identity,
  initialSuperadminEmail,
  ttlHours,
  now,
  repository,
}: AuthorizeAdminSessionInput): Promise<{
  membership: AdminMembership;
  grantExpiresAt: Date;
}> {
  let membership = await repository.findMembershipByAuthUserId(identity.userId);

  if (!membership) {
    const role = initialSuperadminRole({
      configuredEmail: initialSuperadminEmail,
      userEmail: identity.email,
      emailVerified: identity.emailVerified,
      membershipCount: await repository.countMemberships(),
    });
    if (role === 'superadmin') {
      membership = await repository.createInitialMembership({
        authUserId: identity.userId,
        email: identity.email.trim().toLowerCase(),
        role,
      });
    }
  }

  if (!membership) {
    throw new AdminAuthorizationError('forbidden', 'This account is not an administrator.');
  }

  const grant = await repository.findSessionGrant(identity.sessionId);
  if (grant && (grant.membershipId !== membership.id || grant.revokedAt)) {
    throw new AdminAuthorizationError(
      'reauth_required',
      'This administrator session must authenticate again.',
    );
  }

  const decision = decideAdminAccess({
    membershipStatus: membership.status,
    existingGrantExpiresAt: grant?.expiresAt ?? null,
    now,
    ttlHours,
  });

  if (decision.kind === 'forbidden') {
    throw new AdminAuthorizationError('forbidden', 'This administrator account is disabled.');
  }
  if (decision.kind === 'reauth_required') {
    throw new AdminAuthorizationError(
      'reauth_required',
      'The eight-hour administrator session has expired. Sign in again.',
    );
  }
  if (decision.kind === 'create_grant') {
    const created = await repository.createSessionGrant({
      membershipId: membership.id,
      authSessionId: identity.sessionId,
      expiresAt: decision.expiresAt,
    });
    return { membership, grantExpiresAt: created.expiresAt };
  }

  return { membership, grantExpiresAt: decision.expiresAt };
}

export function requireSuperadmin(membership: AdminMembership): void {
  if (membership.role !== 'superadmin') {
    throw new AdminAuthorizationError(
      'forbidden',
      'This action requires a superadministrator.',
    );
  }
}
