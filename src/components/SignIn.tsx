import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { LocaleMessages } from '../locales/types';
import PasswordField from './PasswordField';

interface SignInProps {
  messages: LocaleMessages;
  onRegister: () => void;
}

export default function SignIn({ messages, onRegister }: SignInProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(messages.signInError);
      }
    } catch {
      setError(messages.unexpectedError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-card" aria-labelledby="sign-in-title">
      <div className="auth-card-heading">
      </div>

      <form className="auth-form" onSubmit={handleSignIn}>
        <div className="form-field">
          <label htmlFor="sign-in-email">{messages.emailLabel}</label>
          <input
            id="sign-in-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={messages.emailPlaceholder}
          />
        </div>
        <PasswordField
          id="sign-in-password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          messages={messages}
        />

        {error && <p className="form-message form-message-error" role="alert">{error}</p>}

        <button className="button button-primary" type="submit" disabled={loading}>
          {loading ? messages.signingIn : messages.signInButton}
        </button>
      </form>

      <div className="auth-card-footer">
        <button className="text-button" type="button" onClick={onRegister}>
          {messages.registerLink}
        </button>
      </div>
    </section>
  );
}
