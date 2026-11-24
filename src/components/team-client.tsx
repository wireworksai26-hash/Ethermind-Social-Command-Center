'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { apiGet, apiSend } from '@/lib/client/api';
import { formatDate } from '@/lib/format';
import type { TeamResponse } from '@/lib/types';
import { KineticButton } from './kinetic-button';

const ROLES = [
  { value: 'brand_manager', label: 'Brand Manager', hint: 'Analytics, export, sync status' },
  { value: 'analyst', label: 'Content & Social Analyst', hint: 'Charts and post metrics, no export' },
  { value: 'viewer', label: 'Client Viewer', hint: 'Read-only' },
] as const;

const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));

export function TeamClient() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]['value']>('analyst');
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const team = useQuery({ queryKey: ['team'], queryFn: () => apiGet<TeamResponse>('/api/v1/team') });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['team'] });

  const invite = useMutation({
    mutationFn: () => apiSend<{ result: string; email: string }>('/api/v1/team', 'POST', { email, role, workspaceIds: selected }),
    onSuccess: (res) => {
      setNotice(
        res.result === 'invited'
          ? `${res.email} can now create an account at /accept-invite using this email.`
          : `${res.email} already has an account. Access was updated.`,
      );
      setEmail('');
      void refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiSend(`/api/v1/team/invitations/${id}`, 'DELETE'),
    onSuccess: () => void refresh(),
  });
  const removeAccess = useMutation({
    mutationFn: (vars: { userId: string; workspaceId?: string }) =>
      apiSend(`/api/v1/team/members/${vars.userId}${vars.workspaceId ? `?workspaceId=${vars.workspaceId}` : ''}`, 'DELETE'),
    onSuccess: () => void refresh(),
  });
  const changeRole = useMutation({
    mutationFn: (vars: { userId: string; workspaceId: string; role: string }) =>
      apiSend(`/api/v1/team/members/${vars.userId}`, 'PATCH', { workspaceId: vars.workspaceId, role: vars.role }),
    onSuccess: () => void refresh(),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    invite.mutate();
  };

  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const workspaceName = (id: string) => team.data?.workspaces.find((w) => w.id === id)?.name ?? 'Unknown';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-[28px]">Team access</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Only invited emails can sign up. The role and workspaces you choose here apply as soon as that person creates an account.
        </p>
      </div>

      <form onSubmit={submit} className="glass space-y-5 rounded-2xl p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="invite-email" className="text-xs font-semibold uppercase tracking-wider text-faint">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="mt-2 w-full rounded-lg border border-line bg-white/[0.04] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="invite-role" className="text-xs font-semibold uppercase tracking-wider text-faint">
              Role
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="mt-2 w-full rounded-lg border border-line bg-[#101117] px-3 py-2 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} ({r.hint})
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wider text-faint">Workspaces</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {team.data?.workspaces.map((w) => (
              <label
                key={w.id}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm has-[:checked]:border-white/30 has-[:checked]:bg-white/10"
              >
                <input type="checkbox" checked={selected.includes(w.id)} onChange={() => toggle(w.id)} className="accent-[var(--accent-a)]" />
                {w.name}
              </label>
            ))}
          </div>
        </fieldset>

        {invite.isError && (
          <p role="alert" className="text-sm text-rose-300">
            {invite.error instanceof Error ? invite.error.message : 'Invitation failed'}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm text-emerald-300">
            {notice}
          </p>
        )}

        <KineticButton
          type="submit"
          variant="primary"
          label={invite.isPending ? 'Saving...' : 'Invite or update access'}
          icon={<UserPlus className="size-4" aria-hidden="true" />}
          disabled={invite.isPending || selected.length === 0 || email.length === 0}
        />
      </form>

      {team.isPending && <div className="skeleton h-40" aria-busy="true" />}
      {team.isError && (
        <p role="alert" className="glass rounded-2xl p-6 text-sm">
          {team.error instanceof Error ? team.error.message : 'Team data could not be loaded.'}
        </p>
      )}

      {team.data && team.data.invitations.length > 0 && (
        <section className="glass overflow-hidden rounded-2xl" aria-label="Pending invitations">
          <h2 className="border-b border-line px-5 py-3 font-display text-sm font-bold">Pending invitations</h2>
          <ul>
            {team.data.invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 first:border-t-0">
                <div>
                  <p className="text-sm font-medium">{i.email}</p>
                  <p className="font-mono text-xs text-faint">
                    {ROLE_LABEL[i.role] ?? i.role} · {i.workspaceIds.map(workspaceName).join(', ')} ·{' '}
                    {i.expired ? 'expired' : `expires ${formatDate(i.expiresAt)}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revoke.mutate(i.id)}
                  aria-label={`Revoke invitation for ${i.email}`}
                  className="inline-flex size-8 items-center justify-center rounded-lg border border-line text-muted hover:text-rose-300"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {team.data && (
        <section className="glass overflow-hidden rounded-2xl" aria-label="Members">
          <h2 className="border-b border-line px-5 py-3 font-display text-sm font-bold">Members</h2>
          <ul>
            {team.data.members.map((m) => (
              <li key={m.userId} className="space-y-2 border-t border-line px-5 py-4 first:border-t-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="font-mono text-xs text-faint">{m.email}</p>
                  </div>
                  {m.isSuperAdmin ? (
                    <span className="rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide">
                      SUPER ADMIN
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Remove ${m.email} from all workspaces?`)) removeAccess.mutate({ userId: m.userId });
                      }}
                      className="text-xs font-semibold text-muted underline hover:text-rose-300"
                    >
                      Remove all access
                    </button>
                  )}
                </div>
                {!m.isSuperAdmin && (
                  <ul className="flex flex-wrap gap-2">
                    {m.memberships.length === 0 && <li className="text-xs text-faint">No workspace access</li>}
                    {m.memberships.map((ms) => (
                      <li key={ms.workspaceId} className="inline-flex items-center gap-2 rounded-lg border border-line px-2.5 py-1 text-xs">
                        <span className="font-medium">{workspaceName(ms.workspaceId)}</span>
                        <label className="sr-only" htmlFor={`role-${m.userId}-${ms.workspaceId}`}>
                          Role in {workspaceName(ms.workspaceId)}
                        </label>
                        <select
                          id={`role-${m.userId}-${ms.workspaceId}`}
                          value={ms.role}
                          onChange={(e) => changeRole.mutate({ userId: m.userId, workspaceId: ms.workspaceId, role: e.target.value })}
                          className="rounded-md border border-line bg-[#101117] px-1.5 py-0.5"
                        >
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => removeAccess.mutate({ userId: m.userId, workspaceId: ms.workspaceId })}
                          aria-label={`Remove ${m.email} from ${workspaceName(ms.workspaceId)}`}
                          className="text-muted hover:text-rose-300"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
