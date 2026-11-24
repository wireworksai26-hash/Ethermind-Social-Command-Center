import { and, eq, gt, isNull } from 'drizzle-orm';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { db, schema } from '@/db';

function seedEmail(): string | undefined {
  return process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase() || undefined;
}

export async function findPendingInvitation(email: string) {
  const [row] = await db
    .select()
    .from(schema.invitations)
    .where(
      and(
        eq(schema.invitations.email, email.toLowerCase()),
        isNull(schema.invitations.acceptedAt),
        gt(schema.invitations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row;
}

/** Turns a pending invitation into workspace memberships for a (new or existing) user. */
export async function applyInvitation(userId: string, email: string): Promise<boolean> {
  const invitation = await findPendingInvitation(email);
  if (!invitation) return false;
  await db.transaction(async (tx) => {
    if (invitation.workspaceIds.length > 0) {
      await tx
        .insert(schema.workspaceMembers)
        .values(invitation.workspaceIds.map((workspaceId) => ({ workspaceId, userId, role: invitation.role })))
        .onConflictDoUpdate({
          target: [schema.workspaceMembers.workspaceId, schema.workspaceMembers.userId],
          set: { role: invitation.role },
        });
    }
    await tx.update(schema.invitations).set({ acceptedAt: new Date() }).where(eq(schema.invitations.id, invitation.id));
  });
  return true;
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : [],
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  user: {
    additionalFields: {
      isSuperAdmin: { type: 'boolean', required: false, defaultValue: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          const email = newUser.email.toLowerCase();
          if (email === seedEmail()) {
            return { data: { ...newUser, email, isSuperAdmin: true } };
          }
          const invitation = await findPendingInvitation(email);
          if (!invitation) {
            throw new APIError('FORBIDDEN', {
              message: 'Email ini belum diundang. Minta Super Admin untuk mengundang email kamu.',
            });
          }
          return { data: { ...newUser, email } };
        },
        after: async (createdUser) => {
          await applyInvitation(createdUser.id, createdUser.email);
        },
      },
    },
  },
  plugins: [nextCookies()],
});
