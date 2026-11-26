// UI routing only. Supabase validates the signed claim for database access.
export function hasMfaSession(session) {
  try {
    const payload = session?.access_token?.split('.')[1];
    if (!payload) return false;
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return claims?.aal === 'aal2';
  } catch {
    return false;
  }
}

export async function loadMfaFactors(client) {
  const { data, error } = await client.auth.mfa.listFactors();
  if (error) throw error;
  return data.totp.filter((factor) => factor.status === 'verified');
}

export async function enrollAuthenticator(client) {
  // Abandoned enrollments cannot be resumed without their secret. Remove only
  // unverified TOTP factors, leaving all working authenticators intact.
  const { data: factors, error: listError } = await client.auth.mfa.listFactors();
  if (listError) throw listError;
  if (factors.totp.some((factor) => factor.status === 'verified')) {
    throw new Error('An authenticator already exists. Reload verification.');
  }
  for (const factor of factors.all) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') {
      const { error } = await client.auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw error;
    }
  }
  const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', issuer: 'elModelo' });
  if (error) throw error;
  return data;
}

export async function verifyAuthenticator(client, factorId, code) {
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw error;
  // Supabase emits MFA_CHALLENGE_VERIFIED with the new AAL2 session. useAuth
  // handles this exactly like restored/refreshed sessions, without a UI bypass.
}
