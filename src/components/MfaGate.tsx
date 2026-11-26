import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import { enrollAuthenticator, loadMfaFactors, verifyAuthenticator } from '../lib/mfa';
import type { LocaleMessages } from '../locales/types';
import LoadingDialog from './LoadingDialog';

type Factor = { id: string; friendly_name?: string };
type Enrollment = { id: string; totp: { qr_code: string; secret: string } };

export default function MfaGate({ messages, onSignOut, signOutFailed }: {
  messages: LocaleMessages;
  onSignOut: () => void;
  signOutFailed: boolean;
}) {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factorId, setFactorId] = useState('');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<'load' | 'code' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const busy = useRef(false);

  useEffect(() => {
    let active = true;
    loadMfaFactors(supabase).then((result: Factor[]) => {
      if (!active) return;
      setFactors(result);
      setFactorId(result[0]?.id ?? '');
      setLoaded(true);
      setError(null);
    }).catch(() => {
      if (active) setError('load');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [attempt]);

  async function enroll() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await enrollAuthenticator(supabase);
      setEnrollment(result);
      setFactorId(result.id);
    } catch {
      setLoaded(false);
      setError('load');
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !factorId || !/^\d{6}$/.test(code)) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      await verifyAuthenticator(supabase, factorId, code);
    } catch {
      setCode('');
      setError('code');
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  const settingUp = factors.length === 0;
  return (
    <section className="auth-card" aria-labelledby="mfa-title">
      <div className="auth-form">
        <h1 id="mfa-title">{messages.mfaTitle}</h1>
        <p>{settingUp ? messages.mfaSetupHelp : messages.mfaVerifyHelp}</p>
        {enrollment && <>
          <p>{messages.mfaScan}</p>
          <img className="mfa-qr" src={enrollment.totp.qr_code} alt={messages.mfaQrAlt} />
          <div className="form-field">
            <label htmlFor="mfa-secret">{messages.mfaSecret}</label>
            <input id="mfa-secret" readOnly value={enrollment.totp.secret} onFocus={(event) => event.target.select()} />
          </div>
        </>}
        {loaded && factorId && <form className="auth-form" onSubmit={verify}>
          {factors.length > 1 && <div className="form-field">
            <label htmlFor="mfa-factor">{messages.mfaFactor}</label>
            <select id="mfa-factor" value={factorId} disabled={loading} onChange={(event) => { setFactorId(event.target.value); setCode(''); }}>
              {factors.map((factor, index) => <option key={factor.id} value={factor.id}>{factor.friendly_name || `${messages.mfaFactor} ${index + 1}`}</option>)}
            </select>
          </div>}
          <div className="form-field">
            <label htmlFor="mfa-code">{messages.mfaCode}</label>
            <input id="mfa-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code"
              pattern="[0-9]{6}" maxLength={6} required value={code} disabled={loading}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
          </div>
          <button className="button button-primary" type="submit" disabled={loading || code.length !== 6}>{messages.mfaVerify}</button>
        </form>}
        {loaded && settingUp && !enrollment && <button className="button button-primary" type="button" disabled={loading} onClick={enroll}>{messages.mfaEnroll}</button>}
        {error && <p className="form-message form-message-error" role="alert">{error === 'code' ? messages.mfaCodeError : messages.mfaError}</p>}
        {!loaded && !loading && <button className="button button-secondary" type="button" onClick={() => { setLoading(true); setAttempt((value) => value + 1); }}>{messages.retry}</button>}
        <p>{messages.mfaRecovery}</p>
        {signOutFailed && <p className="form-message form-message-error" role="alert">{messages.signOutError}</p>}
        <button className="button button-secondary" type="button" disabled={loading} onClick={onSignOut}>{messages.signOut}</button>
      </div>
      {loading && <LoadingDialog label={messages.mfaWorking} />}
    </section>
  );
}
