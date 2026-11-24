'use client';

import { createContext, useContext } from 'react';
import type { Platform } from '@/lib/types';

export interface ShellWorkspace {
  id: string;
  name: string;
  slug: string;
  role: 'super_admin' | 'brand_manager' | 'analyst' | 'viewer';
  primary: string;
  secondary: string;
}

export interface ShellContextValue {
  workspaces: ShellWorkspace[];
  user: { name: string; email: string; isSuperAdmin: boolean };
  canExport: boolean;
  openPostId: string | null;
  openPost: (id: string) => void;
  closePost: () => void;
}

export const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used inside AppShell');
  return ctx;
}

export type { Platform };
