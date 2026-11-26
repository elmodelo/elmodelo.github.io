import { useEffect, useRef, useState } from 'react';
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
  const digitInputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (!loaded || !factorId || loading || code) return;
    let frame: number;
    const focusFirstDigit = () => {
      const input = digitInputs.current[0];
      if (!input) return;
      // LoadingDialog releases ancestor inertness in a separate render. Focus
      // only after that completes, including after enrollment or a failed code.
      if (input.closest('[inert]')) {
        frame = requestAnimationFrame(focusFirstDigit);
      } else {
        input.focus({ preventScroll: true });
      }
    };
    frame = requestAnimationFrame(focusFirstDigit);
    return () => cancelAnimationFrame(frame);
  }, [loaded, factorId, loading, code]);

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

  async function verify(codeToVerify: string) {
    if (busy.current || !factorId || !/^\d{6}$/.test(codeToVerify)) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      await verifyAuthenticator(supabase, factorId, codeToVerify);
    } catch {
      setCode('');
      setError('code');
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  function changeCode(index: number, value: string) {
    if (busy.current) return;
    const digits = value.replace(/\D/g, '').slice(0, 6);
    if (value && !digits) return;
    // A full pasted/autofilled code always replaces all six digits, even when
    // a later box has focus. Shorter sequences fill from the focused box.
    const start = digits.length === 6 ? 0 : index;
    const nextDigits = code.padEnd(6, ' ').split('');
    if (!digits) nextDigits[index] = ' ';
    for (let offset = 0; offset < digits.length && start + offset < 6; offset++) {
      nextDigits[start + offset] = digits[offset];
    }
    const nextCode = nextDigits.join('').trimEnd();
    setCode(nextCode);
    if (digits) digitInputs.current[Math.min(start + digits.length, 5)]?.focus();
    if (/^\d{6}$/.test(nextCode) && nextCode !== code) void verify(nextCode);
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
        {loaded && factorId && <form className="auth-form" onSubmit={(event) => { event.preventDefault(); void verify(code); }}>
          {factors.length > 1 && <div className="form-field">
            <label htmlFor="mfa-factor">{messages.mfaFactor}</label>
            <select id="mfa-factor" value={factorId} disabled={loading} onChange={(event) => { setFactorId(event.target.value); setCode(''); }}>
              {factors.map((factor, index) => <option key={factor.id} value={factor.id}>{factor.friendly_name || `${messages.mfaFactor} ${index + 1}`}</option>)}
            </select>
          </div>}
          <div className="form-field">
            <div className="mfa-code-digits" role="group" aria-label={messages.mfaCode}>
              {Array.from({ length: 6 }, (_, index) => (
                <div className="mfa-code-slot" key={index}>
                  {index === 3 && <span className="mfa-code-dash" aria-hidden="true">–</span>}
                  <input
                    ref={(input) => { digitInputs.current[index] = input; }}
                    id={index === 0 ? 'mfa-code' : `mfa-code-${index + 1}`}
                    name={`code-${index + 1}`} type="text" inputMode="numeric"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    aria-label={`${messages.mfaCode} (${index + 1}/6)`}
                    pattern="[0-9]" maxLength={6} required
                    value={code[index]?.trim() ?? ''} disabled={loading}
                    onFocus={(event) => event.target.select()}
                    onChange={(event) => changeCode(index, event.target.value)}
                    onPaste={(event) => {
                      event.preventDefault();
                      changeCode(index, event.clipboardData.getData('text'));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                        event.preventDefault();
                        digitInputs.current[Math.max(0, Math.min(5, index + (event.key === 'ArrowLeft' ? -1 : 1)))]?.focus();
                      } else if (event.key === 'Backspace' && !code[index]?.trim() && index > 0) {
                        event.preventDefault();
                        changeCode(index - 1, '');
                        digitInputs.current[index - 1]?.focus();
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </form>}
        {loaded && settingUp && !enrollment && <button className="button button-primary" type="button" disabled={loading} onClick={enroll}>{messages.mfaEnroll}</button>}
        {error && <p className="form-message form-message-error" role="alert">{error === 'code' ? messages.mfaCodeError : messages.mfaError}</p>}
        {!loaded && !loading && <button className="button button-secondary" type="button" onClick={() => { setLoading(true); setAttempt((value) => value + 1); }}>{messages.retry}</button>}
        {signOutFailed && <p className="form-message form-message-error" role="alert">{messages.signOutError}</p>}
        <button className="button button-secondary mfa-sign-out" type="button" disabled={loading} onClick={onSignOut}>{messages.signOut}</button>
      </div>
      {loading && <LoadingDialog label={messages.mfaWorking} />}
    </section>
  );
}
