import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabaseClient';
import { getLocaleMessages } from './locales';
import type { LocaleMessages } from './locales/types';
import RegistrationForm from './components/RegistrationForm';
import SignIn from './components/SignIn';
import './App.css';

type AuthStatus = 'loading' | 'ready' | 'error';

function App() {
  const [messages, setMessages] = useState<LocaleMessages>(() =>
    getLocaleMessages(typeof navigator !== 'undefined' ? navigator.language : 'en'),
  );
  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [authError, setAuthError] = useState<'signOut' | null>(null);
  const [showRegistration, setShowRegistration] = useState(false);

  useEffect(() => {
    document.documentElement.lang = messages.language;
  }, [messages.language]);

  useEffect(() => {
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user ?? null);
        setAuthStatus('ready');
        setAuthError(null);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setAuthStatus('error');
          return;
        }
        setUser(data.session?.user ?? null);
        setAuthStatus('ready');
      })
      .catch(() => {
        if (active) {
          setAuthStatus('error');
        }
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setAuthError('signOut');
      }
    } catch {
      setAuthError('signOut');
    }
  };

  const languageLabel = messages.language === 'es' ? 'Español' : 'English';
  const otherLanguageLabel = messages.language === 'es' ? 'English' : 'Español';

  return (
    <main className="app-shell" data-theme="dark">
      <header className="app-header">
        <a className="brand" href="/" aria-label={messages.brandHome}>
          <span className="brand-mark" aria-hidden="true">E</span>
          <span>elmodelo</span>
        </a>
        <button
          className="language-toggle"
          type="button"
          onClick={() => setMessages(getLocaleMessages(messages.language === 'es' ? 'en' : 'es'))}
          aria-label={messages.switchLanguage}
        >
          {otherLanguageLabel}
        </button>
      </header>

      <section className="auth-layout">
        {authStatus === 'loading' ? (
          <div className="auth-card status-card" role="status">
            <span className="loading-indicator" aria-hidden="true" />
            <p>{messages.checkingSession}</p>
          </div>
        ) : authStatus === 'error' ? (
          <div className="auth-card status-card" role="alert">
            <h1>{messages.authErrorTitle}</h1>
            <p>{messages.authCheckError}</p>
            <button
              className="button button-primary"
              type="button"
              onClick={() => window.location.reload()}
            >
              {messages.retry}
            </button>
          </div>
        ) : user ? (
          <div className="auth-card status-card">
            <span className="eyebrow">{messages.signedInEyebrow}</span>
            <h1>{messages.welcomeBack}</h1>
            <p>{user.email}</p>
            {authError && (
              <p className="form-message form-message-error" role="alert">
                {messages.signOutError}
              </p>
            )}
            <button className="button button-secondary" type="button" onClick={handleSignOut}>
              {messages.signOut}
            </button>
          </div>
        ) : showRegistration ? (
          <RegistrationForm
            messages={messages}
            onSignIn={() => setShowRegistration(false)}
          />
        ) : (
          <SignIn
            messages={messages}
            onRegister={() => setShowRegistration(true)}
          />
        )}
      </section>

      <footer className="app-footer">
        <span>{messages.footer}</span>
        <span className="language-current" aria-label={messages.currentLanguage}>
          {languageLabel}
        </span>
      </footer>
    </main>
  );
}

export default App;
