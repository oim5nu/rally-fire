import { count, eq } from 'drizzle-orm';
import { getDatabase } from '../db/client.js';
import { adminMemberships, adminSessionGrants } from '../db/schema.js';
import type {
  AdminAuthRepository,
  AdminMembership,
  AdminSessionGrant,
} from './authorize.js';

function mapMembership(row: typeof adminMemberships.$inferSelect): AdminMembership {
  return {
    id: row.id,
    authUserId: row.authUserId,
    email: row.email,
    role: row.role,
    status: row.status,
  };
}

function mapGrant(row: typeof adminSessionGrants.$inferSelect): AdminSessionGrant {
  return {
    id: row.id,
    membershipId: row.membershipId,
    authSessionId: row.authSessionId,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}

export class DrizzleAdminAuthRepository implements AdminAuthRepository {
  private readonly database = getDatabase();

  async countMemberships(): Promise<number> {
    const [row] = await this.database.select({ value: count() }).from(adminMemberships);
    return row.value;
  }

  async findMembershipByAuthUserId(authUserId: string): Promise<AdminMembership | null> {
    const [row] = await this.database
      .select()
      .from(adminMemberships)
      .where(eq(adminMemberships.authUserId, authUserId))
      .limit(1);
    return row ? mapMembership(row) : null;
  }

  async createInitialMembership(input: {
    authUserId: string;
    email: string;
    role: 'superadmin';
  }): Promise<AdminMembership> {
    const [created] = await this.database
      .insert(adminMemberships)
      .values(input)
      .onConflictDoNothing({ target: adminMemberships.authUserId })
      .returning();
    if (created) {
      return mapMembership(created);
    }

    const existing = await this.findMembershipByAuthUserId(input.authUserId);
    if (!existing) {
      throw new Error('The initial superadministrator could not be created.');
    }
    return existing;
  }

  async findSessionGrant(authSessionId: string): Promise<AdminSessionGrant | null> {
    const [row] = await this.database
      .select()
      .from(adminSessionGrants)
      .where(eq(adminSessionGrants.authSessionId, authSessionId))
      .limit(1);
    return row ? mapGrant(row) : null;
  }

  async createSessionGrant(input: {
    membershipId: string;
    authSessionId: string;
    expiresAt: Date;
  }): Promise<AdminSessionGrant> {
    const [created] = await this.database
      .insert(adminSessionGrants)
      .values(input)
      .onConflictDoNothing({ target: adminSessionGrants.authSessionId })
      .returning();
    if (created) {
      return mapGrant(created);
    }

    const existing = await this.findSessionGrant(input.authSessionId);
    if (!existing) {
      throw new Error('The administrator session grant could not be created.');
    }
    return existing;
  }
}
