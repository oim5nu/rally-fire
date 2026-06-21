export type AdminRole = 'superadmin' | 'admin';
export type MembershipStatus = 'active' | 'disabled';

interface InitialSuperadminInput {
  configuredEmail: string | undefined;
  userEmail: string | undefined;
  emailVerified: boolean;
  membershipCount: number;
}

interface AdminAccessInput {
  membershipStatus: MembershipStatus | null;
  existingGrantExpiresAt: Date | null;
  now: Date;
  ttlHours: number;
}

export type AdminAccessDecision =
  | { kind: 'allow'; expiresAt: Date }
  | { kind: 'create_grant'; expiresAt: Date }
  | { kind: 'reauth_required' }
  | { kind: 'forbidden' };

export function initialSuperadminRole({
  configuredEmail,
  userEmail,
  emailVerified,
  membershipCount,
}: InitialSuperadminInput): AdminRole | null {
  if (!configuredEmail || !userEmail || !emailVerified || membershipCount !== 0) {
    return null;
  }

  return configuredEmail.trim().toLowerCase() === userEmail.trim().toLowerCase()
    ? 'superadmin'
    : null;
}

export function decideAdminAccess({
  membershipStatus,
  existingGrantExpiresAt,
  now,
  ttlHours,
}: AdminAccessInput): AdminAccessDecision {
  if (membershipStatus !== 'active') {
    return { kind: 'forbidden' };
  }

  if (existingGrantExpiresAt) {
    return existingGrantExpiresAt.getTime() > now.getTime()
      ? { kind: 'allow', expiresAt: existingGrantExpiresAt }
      : { kind: 'reauth_required' };
  }

  return {
    kind: 'create_grant',
    expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000),
  };
}

export function mayDisableMembership({
  targetRole,
  activeSuperadminCount,
}: {
  targetRole: AdminRole;
  activeSuperadminCount: number;
}): boolean {
  return targetRole !== 'superadmin' || activeSuperadminCount > 1;
}
