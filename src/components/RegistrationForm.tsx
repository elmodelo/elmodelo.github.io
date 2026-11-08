import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { LocaleMessages } from '../locales/types';

interface RegistrationFormProps {
  messages: LocaleMessages;
  onSignIn: () => void;
}

export default function RegistrationForm({ messages, onSignIn }: RegistrationFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage({ type: 'error', text: messages.registrationError });
      } else if (data.user && data.session === null) {
        setMessage({ type: 'success', text: messages.registrationConfirmation });
      } else {
        setMessage({ type: 'success', text: messages.registrationSuccess });
      }
    } catch {
      setMessage({ type: 'error', text: messages.unexpectedError });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-card" aria-labelledby="registration-title">
      <div className="auth-card-heading">
      </div>

      <form className="auth-form" onSubmit={handleRegister}>
        <div className="form-field">
          <label htmlFor="registration-email">{messages.emailLabel}</label>
          <input
            id="registration-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={messages.emailPlaceholder}
          />
        </div>
        <div className="form-field">
          <label htmlFor="registration-password">{messages.passwordLabel}</label>
          <input
            id="registration-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {message && (
          <p
            className={`form-message form-message-${message.type}`}
            role={message.type === 'error' ? 'alert' : 'status'}
          >
            {message.text}
          </p>
        )}

        <button className="button button-primary" type="submit" disabled={loading}>
          {loading ? messages.registering : messages.registerButton}
        </button>
      </form>

      <div className="auth-card-footer">
        <button className="text-button" type="button" onClick={onSignIn}>
          {messages.signInLink}
        </button>
      </div>
    </section>
  );
}
