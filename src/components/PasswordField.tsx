import { useState } from 'react';
import type { LocaleMessages } from '../locales/types';

interface PasswordFieldProps {
  id: string;
  autoComplete: 'current-password' | 'new-password';
  value: string;
  onChange: (value: string) => void;
  messages: LocaleMessages;
}

export default function PasswordField({
  id,
  autoComplete,
  value,
  onChange,
  messages,
}: PasswordFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const visibilityLabel = showPassword ? messages.hidePassword : messages.showPassword;

  return (
    <div className="form-field">
      <label htmlFor={id}>{messages.passwordLabel}</label>
      <div className="password-input-wrapper">
        <input
          id={id}
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          className="password-visibility-toggle"
          type="button"
          onClick={() => setShowPassword((visible) => !visible)}
          aria-label={visibilityLabel}
          title={visibilityLabel}
          aria-pressed={showPassword}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
            {showPassword ? (
              <>
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
              </>
            ) : (
              <>
                <path d="m3 3 18 18M10.6 5.2A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a15.7 15.7 0 0 1-3.2 4.1M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10 10 0 0 0 4-.8" />
                <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
              </>
            )}
          </svg>
        </button>
      </div>
    </div>
  );
}
