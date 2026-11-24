export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = (await res.json().catch(() => null)) as (T & { error?: string; details?: string[] }) | null;
  if (!res.ok) {
    const detail = body?.details?.length ? ` (${body.details.join('; ')})` : '';
    throw new ApiRequestError(`${body?.error ?? `Request failed (${res.status})`}${detail}`, res.status);
  }
  return body as T;
}

export function apiGet<T>(url: string): Promise<T> {
  return request<T>(url);
}

export function apiSend<T>(url: string, method: 'POST' | 'PATCH' | 'DELETE', payload?: unknown): Promise<T> {
  return request<T>(url, { method, body: payload === undefined ? undefined : JSON.stringify(payload) });
}
