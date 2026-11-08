import { useEffect, useState } from 'react';
import { getLocaleMessages } from './locales';
import type { LocaleMessages } from './locales/types';
import RegistrationForm from './components/RegistrationForm';
import SignIn from './components/SignIn';
import Menu, { type AppSection } from './components/Menu';
import TransactionsPanel from './components/TransactionsPanel';
import { useAuth } from './hooks/useAuth';
import { useTheme } from './hooks/useTheme';
import './App.css';

function App() {
  const [messages, setMessages] = useState<LocaleMessages>(() =>
    getLocaleMessages(typeof navigator !== 'undefined' ? navigator.language : 'en'),
  );
  const [showRegistration, setShowRegistration] = useState(false);
  const [headerMenuTarget, setHeaderMenuTarget] = useState<HTMLDivElement | null>(null);
  const { user, status: authStatus, signOutFailed, signOut, retrySessionCheck } = useAuth();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    document.documentElement.lang = messages.language;
  }, [messages.language]);

  const otherLanguageLabel = messages.language === 'es' ? 'English' : 'Español';

  return (
    <main className="app-shell" data-theme={theme}>
      <header className="app-header">
        <div className={user && authStatus === 'ready' ? 'header-brand has-menu' : 'header-brand'}>
          <div className="header-menu" ref={setHeaderMenuTarget} />
          <a className="brand" href="/" aria-label={messages.brandHome}>
            <img className="brand-mark" src="/icons/brand-mark.png" alt="" aria-hidden="true" />
            <span>elModelo</span>
          </a>
        </div>
        <div className="header-actions">
          <button
            className="language-toggle"
            type="button"
            onClick={() => setMessages(getLocaleMessages(messages.language === 'es' ? 'en' : 'es'))}
            aria-label={messages.switchLanguage}
          >
            {otherLanguageLabel}
          </button>
          <button
            className="theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? messages.switchToLightTheme : messages.switchToDarkTheme}
            title={theme === 'dark' ? messages.switchToLightTheme : messages.switchToDarkTheme}
          >
            {theme === 'dark' ? (
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path d="M20.2 15.3A8.6 8.6 0 0 1 8.7 3.8 8.7 8.7 0 1 0 20.2 15.3Z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <section className={user && authStatus === 'ready' ? 'dashboard-layout' : 'auth-layout'}>
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
              onClick={retrySessionCheck}
            >
              {messages.retry}
            </button>
          </div>
        ) : user ? (
          <Dashboard
            messages={messages}
            email={user.email}
            signOutFailed={signOutFailed}
            signOut={signOut}
            headerMenuTarget={headerMenuTarget}
          />
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
      </footer>
    </main>
  );
}

interface DashboardProps {
  messages: LocaleMessages;
  email: string | undefined;
  signOutFailed: boolean;
  signOut: () => void;
  headerMenuTarget: HTMLDivElement | null;
}

function Dashboard({ messages, email, signOutFailed, signOut, headerMenuTarget }: DashboardProps) {
  const [section, setSection] = useState<AppSection>('transactions');

  return (
    <>
      <Menu messages={messages} section={section} onSelect={setSection} toggleTarget={headerMenuTarget} />
      <div className="dashboard-content">
        {section === 'transactions' ? (
          <TransactionsPanel messages={messages} />
        ) : section === 'settings' ? (
          <section aria-labelledby="settings-title">
            <h1 id="settings-title">{messages.settings}</h1>
            <p>{messages.comingSoon}</p>
          </section>
        ) : (
          <section aria-labelledby="account-title">
            <h1 id="account-title">{messages.myAccount}</h1>
            <p>{email}</p>
            {signOutFailed && (
              <p className="form-message form-message-error" role="alert">
                {messages.signOutError}
              </p>
            )}
            <button className="button button-secondary" type="button" onClick={signOut}>
              {messages.signOut}
            </button>
          </section>
        )}
      </div>
    </>
  );
}

export default App;
