import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { getRolePermissions } from '../lib/permissions';

export type AppRole = ReturnType<typeof getRolePermissions>['role'];

// Components outside the provider get no permissions by default.
const PermissionsContext = createContext(getRolePermissions(null));

export function PermissionsProvider({ role, children }: { role: AppRole; children: ReactNode }) {
  const permissions = useMemo(() => getRolePermissions(role), [role]);
  return <PermissionsContext.Provider value={permissions}>{children}</PermissionsContext.Provider>;
}

/** Shared UI permissions from the current session; database checks enforce access. */
export function usePermissions() {
  return useContext(PermissionsContext);
}
