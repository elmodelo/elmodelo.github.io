import { useEffect, useState } from 'react';
import type { LocaleMessages } from './locales/types';
import RegistrationForm from './components/RegistrationForm';
import SignIn from './components/SignIn';
import Menu, { type AppSection } from './components/Menu';
import SettingsPanel from './components/SettingsPanel';
import TransactionsPanel from './components/TransactionsPanel';
import LoadingDialog from './components/LoadingDialog';
import { useAuth } from './hooks/useAuth';
import { useLanguage, type Language } from './hooks/useLanguage';
import { useTheme, type Theme } from './hooks/useTheme';
import { useTrackedAccounts } from './hooks/useTrackedAccounts';
import { fetchUncategorizedTransactionCount, UNCATEGORIZED_TRANSACTION_FILTERS } from './lib/transactionQuery';
import { supabase } from './lib/supabaseClient';
import './App.css';

function App() {
  const { user, status: authStatus, signOutFailed, signingOut, signOut, retrySessionCheck } = useAuth();
  const { messages, setLanguage } = useLanguage(user?.id);
  const [showRegistration, setShowRegistration] = useState(false);
  const [headerMenuTarget, setHeaderMenuTarget] = useState<HTMLDivElement | null>(null);
  const { theme, setTheme } = useTheme(user?.id);

  useEffect(() => {
    document.documentElement.lang = messages.language;
  }, [messages.language]);

  return (
    <main className="app-shell" data-theme={theme}>
      {(user && authStatus === 'ready') && (
        <header className="app-header">
          <div className='header-brand has-menu'>
            <div className="header-menu" ref={setHeaderMenuTarget} />
            <a className="brand" href="/" aria-label={messages.brandHome}>
              <img className="brand-mark" src="/icons/brand-mark.png" alt="" aria-hidden="true" />
              <span>elModelo</span>
            </a>
          </div>
        </header>
      )}

      <section className={user && authStatus === 'ready' ? 'dashboard-layout' : 'auth-layout'}>
        {authStatus === 'loading' ? (
          <LoadingDialog label={messages.checkingSession} />
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
            key={user.id}
            userId={user.id}
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

      {signingOut && <LoadingDialog label={messages.signingOut} />}

      <footer className="app-footer">
      </footer>
    </main>
  );
}

interface DashboardProps {
  userId: string;
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
  userId,
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
  const { accounts, trackedAccountIds, setTrackedAccountIds, status: accountsStatus, retryAccounts } = useTrackedAccounts(userId);
  const [categoryRevision, setCategoryRevision] = useState(0);
  const [uncategorizedResult, setUncategorizedResult] = useState<{ accountIds: string[]; count: number } | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function checkUncategorizedTransactions() {
      try {
        const { count, error } = await fetchUncategorizedTransactionCount(supabase, trackedAccountIds, controller.signal);
        if (active) {
          setUncategorizedResult({ accountIds: trackedAccountIds, count: error ? 0 : (count ?? 0) });
        }
      } catch {
        if (active) setUncategorizedResult({ accountIds: trackedAccountIds, count: 0 });
      }
    }
    void checkUncategorizedTransactions();
    return () => {
      active = false;
      controller.abort();
    };
  }, [trackedAccountIds, section, categoryRevision]);

  const uncategorizedCount = uncategorizedResult?.accountIds === trackedAccountIds ? uncategorizedResult.count : 0;

  return (
    <>
      <Menu
        messages={messages} section={section} onSelect={setSection} toggleTarget={headerMenuTarget}
        uncategorizedCount={uncategorizedCount}
      />
      <div className="dashboard-content">
        {section === 'transactions' || section === 'uncategorized' ? (
          accountsStatus === 'loading' ? <LoadingDialog label={messages.loadingAccounts} />
            : accountsStatus === 'error' ? (
              <section className="dashboard-panel" role="alert">
                <h1>{messages.transactions}</h1>
                <p className="form-message form-message-error">{messages.accountsError}</p>
                <button className="button button-secondary" type="button" onClick={retryAccounts}>
                  {messages.retry}
                </button>
              </section>
            ) : <TransactionsPanel
              key={section}
              messages={messages}
              userId={userId}
              trackedAccountIds={trackedAccountIds}
              filters={section === 'uncategorized' ? UNCATEGORIZED_TRANSACTION_FILTERS : undefined}
              title={section === 'uncategorized' ? messages.uncategorized : messages.transactions}
              onCategoriesChanged={() => setCategoryRevision((previous) => previous + 1)}
            />
        ) : section === 'settings' ? (
          <SettingsPanel
            messages={messages}
            theme={theme}
            onThemeChange={onThemeChange}
            onLanguageChange={onLanguageChange}
            accounts={accounts}
            trackedAccountIds={trackedAccountIds}
            onTrackedAccountIdsChange={setTrackedAccountIds}
            accountsStatus={accountsStatus}
            onRetryAccounts={retryAccounts}
          />
        ) : (
          <section className="dashboard-panel" aria-labelledby="account-title">
            <h1 id="account-title">{messages.myAccount}</h1>
            <div className="panel-scroll" tabIndex={0} role="region" aria-labelledby="account-title">
              <p>{email}</p>
              {signOutFailed && (
                <p className="form-message form-message-error" role="alert">
                  {messages.signOutError}
                </p>
              )}
            </div>
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
