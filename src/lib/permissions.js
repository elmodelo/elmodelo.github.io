// The access-token hook adds this claim to the JWT, not to the Auth user
// object. Database role checks remain authoritative for every write.
/** @returns {'READER' | 'WRITER' | null} */
export function getSessionAppRole(session) {
  try {
    const payload = session?.access_token?.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    const role = claims?.app_metadata?.app_role;
    return role === 'WRITER' || role === 'READER' ? role : null;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} role
 * @returns {{role: 'READER' | 'WRITER' | null, isReader: boolean, isWriter: boolean, canRead: boolean, canWrite: boolean}}
 */
export function getRolePermissions(role) {
  const isReader = role === 'READER';
  const isWriter = role === 'WRITER';
  return {
    role: isReader || isWriter ? role : null,
    isReader,
    isWriter,
    canRead: isReader || isWriter,
    canWrite: isWriter,
  };
}
