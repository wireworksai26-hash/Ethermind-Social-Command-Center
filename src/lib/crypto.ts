import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from './env';

export interface TokenPayload {
  accessToken: string;
  refreshToken?: string | null;
}

export interface EncryptedTokens {
  encryptedPayload: string;
  iv: string;
  authTag: string;
}

function masterKey(): Buffer {
  return Buffer.from(env().TOKEN_VAULT_MASTER_KEY, 'hex');
}

export function encryptTokens(payload: TokenPayload): EncryptedTokens {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return {
    encryptedPayload: encrypted.toString('base64'),
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
}

export function decryptTokens(row: EncryptedTokens): TokenPayload {
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(row.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(row.authTag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(row.encryptedPayload, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8')) as TokenPayload;
}

/** Signs a short-lived OAuth `state` value bound to a user. */
export function signState(data: { workspace: string; userId: string }): string {
  const body = Buffer.from(
    JSON.stringify({ ...data, exp: Date.now() + 10 * 60_000, nonce: randomBytes(8).toString('hex') }),
  ).toString('base64url');
  const sig = createHmac('sha256', env().BETTER_AUTH_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyState(state: string): { workspace: string; userId: string } | null {
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', env().BETTER_AUTH_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      workspace: string;
      userId: string;
      exp: number;
    };
    if (parsed.exp < Date.now()) return null;
    return { workspace: parsed.workspace, userId: parsed.userId };
  } catch {
    return null;
  }
}
