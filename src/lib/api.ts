import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { auth } from '@/lib/auth';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

export async function getUserFromHeaders(headers: Headers): Promise<AuthedUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const u = session.user as typeof session.user & { isSuperAdmin?: boolean };
  return { id: u.id, email: u.email, name: u.name, isSuperAdmin: Boolean(u.isSuperAdmin) };
}

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

type Handler<Ctx> = (req: NextRequest, user: AuthedUser, ctx: Ctx) => Promise<Response>;

/** Wraps a route handler with session auth plus uniform JSON error responses. */
export function route<Ctx = unknown>(handler: Handler<Ctx>) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    try {
      const user = await getUserFromHeaders(req.headers);
      if (!user) throw new ApiError(401, 'Unauthorized');
      return await handler(req, user, ctx);
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.message }, { status: error.status });
      if (error instanceof ZodError) {
        return json(
          { error: 'Invalid request', details: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
          { status: 400 },
        );
      }
      console.error('[api] unhandled error', error);
      return json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}
