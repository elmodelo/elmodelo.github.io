import { useEffect, useState } from 'react';
import type { LocaleMessages } from './locales/types';
import RegistrationForm from './components/RegistrationForm';
import SignIn from './components/SignIn';
import Menu, { type AppSection } from './components/Menu';
import SettingsPanel from './components/SettingsPanel';
import TransactionsPanel from './components/TransactionsPanel';
import { useAuth } from './hooks/useAuth';
import { useLanguage, type Language } from './hooks/useLanguage';
import { useTheme, type Theme } from './hooks/useTheme';
import './App.css';

function App() {
  const { messages, setLanguage } = useLanguage();
  const [showRegistration, setShowRegistration] = useState(false);
  const [headerMenuTarget, setHeaderMenuTarget] = useState<HTMLDivElement | null>(null);
  const { user, status: authStatus, signOutFailed, signOut, retrySessionCheck } = useAuth();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    document.documentElement.lang = messages.language;
  }, [messages.language]);

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
            theme={theme}
            onThemeChange={setTheme}
            onLanguageChange={setLanguage}
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
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onLanguageChange: (language: Language) => void;
}

function Dashboard({
  messages,
  email,
  signOutFailed,
  signOut,
  headerMenuTarget,
  theme,
  onThemeChange,
  onLanguageChange,
}: DashboardProps) {
  const [section, setSection] = useState<AppSection>('transactions');

  return (
    <>
      <Menu messages={messages} section={section} onSelect={setSection} toggleTarget={headerMenuTarget} />
      <div className="dashboard-content">
        {section === 'transactions' ? (
          <TransactionsPanel messages={messages} />
        ) : section === 'settings' ? (
          <SettingsPanel
            messages={messages}
            theme={theme}
            onThemeChange={onThemeChange}
            onLanguageChange={onLanguageChange}
          />
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
