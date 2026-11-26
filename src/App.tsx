import { lazy, useEffect, useState } from 'react';
import type { LocaleMessages } from './locales/types';
import FeatureBoundary from './components/FeatureBoundary';
import SignIn from './components/SignIn';
import MfaGate from './components/MfaGate';
import IdleWarning from './components/IdleWarning';
import Menu, { savedFilterSection, type AppSection } from './components/Menu';
import PreferencesStatus from './components/PreferencesStatus';
import StatusBar from './components/StatusBar';
import { StatusMessagesProvider } from './hooks/useStatusMessages';
import LoadingDialog, { LoadingDialogProvider } from './components/LoadingDialog';
import { useAuth } from './hooks/useAuth';
import { PreferencesProvider, usePreferences } from './hooks/usePreferences';
import { PermissionsProvider } from './hooks/usePermissions';
import { useLanguage, type Language } from './hooks/useLanguage';
import { useTheme, type Theme } from './hooks/useTheme';
import { useTrackedAccounts } from './hooks/useTrackedAccounts';
import { fetchUncategorizedTransactionCount, UNCATEGORIZED_TRANSACTION_FILTERS } from './lib/transactionQuery';
import { sortSavedTransactionFilters } from './lib/transactionFilterPresets';
import { restoreLastPanel, rememberLastPanel } from './lib/lastPanel';
import { supabase } from './lib/supabaseClient';
// Keep shared foundations before feature overrides; these styles are global.
import './App.css';
import './styles/controls.css';
import './styles/auth.css';
import './styles/navigation.css';
import './styles/preferences.css';
import './styles/transactions.css';
import './styles/cash-flow.css';
import './styles/net-worth.css';

const RegistrationForm = lazy(() => import('./components/RegistrationForm'));
const PreferencesPanel = lazy(() => import('./components/PreferencesPanel'));
const TransactionsPanel = lazy(() => import('./components/TransactionsPanel'));
const NetWorthPanel = lazy(() => import('./components/NetWorthPanel'));
const NetWorthChartsPanel = lazy(() => import('./components/NetWorthChartsPanel'));
const CashFlowPanel = lazy(() => import('./components/CashFlowPanel'));

function App() {
  const auth = useAuth();
  const userId = auth.status === 'ready' && auth.mfaVerified && auth.idle.hasAccess ? auth.user?.id : undefined;
  return <LoadingDialogProvider><StatusMessagesProvider key={userId ?? 'guest'}><PreferencesProvider userId={userId}><Application auth={auth} /></PreferencesProvider></StatusMessagesProvider></LoadingDialogProvider>;
}

function Application({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const { user, idle, appRole, mfaVerified, status: authStatus, signOutFailed, signingOut, signOut } = auth;
  const { status: preferencesStatus, retry: retryPreferences } = usePreferences();
  const { messages, setLanguage } = useLanguage();
  const [showRegistration, setShowRegistration] = useState(false);
  const [headerMenuTarget, setHeaderMenuTarget] = useState<HTMLDivElement | null>(null);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    document.documentElement.lang = messages.language;
  }, [messages.language]);

  return (
    <PermissionsProvider role={authStatus === 'ready' && idle.hasAccess ? appRole : null}>
      <PreferencesStatus messages={messages} status={preferencesStatus} onRetry={retryPreferences} />
      <main className="app-shell" data-theme={theme}>
        {(user && mfaVerified && idle.hasAccess && authStatus === 'ready') && (
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

        <section className={user && mfaVerified && idle.hasAccess && authStatus === 'ready' ? 'dashboard-layout' : 'auth-layout'}
          style={user && mfaVerified && idle.status === 'checking' ? { visibility: 'hidden' } : undefined}>
          {authStatus === 'loading' ? (
            <LoadingDialog label={messages.checkingSession} priority={100} />
          ) : authStatus === 'error' ? (
            <div className="auth-card status-card" role="alert">
              <h1>{messages.authErrorTitle}</h1>
              <p>{messages.authCheckError}</p>
              <button
                className="button button-primary"
                type="button"
                onClick={signOut}
              >
                {messages.signOut}
              </button>
            </div>
          ) : user && !mfaVerified ? (
            <MfaGate key={user.id} messages={messages} onSignOut={signOut} signOutFailed={signOutFailed} />
          ) : user && (idle.status === 'expired' || idle.status === 'error') ? (
            <div className="auth-card status-card" role="alert">
              <h1>{idle.status === 'expired' ? messages.idleExpiredTitle : messages.authErrorTitle}</h1>
              <p>{idle.status === 'expired' ? messages.idleExpired : messages.idleCheckError}</p>
              <button className="button button-secondary" type="button" onClick={signOut}>{messages.signOut}</button>
              {signOutFailed && <p>{messages.signOutError}</p>}
            </div>
          ) : user && !idle.hasAccess ? null : user && (preferencesStatus === 'loading' || preferencesStatus === 'load-error') ? (
            <div className="dashboard-main">
              <div className="dashboard-content" aria-busy={preferencesStatus === 'loading'} />
              <StatusBar />
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
            <FeatureBoundary messages={messages} fallbackClassName="auth-card status-card">
              <RegistrationForm messages={messages} onSignIn={() => setShowRegistration(false)} />
            </FeatureBoundary>
          ) : (
            <SignIn
              messages={messages}
              onRegister={() => setShowRegistration(true)}
            />
          )}
        </section>

        {user && mfaVerified && idle.status === 'checking' && <LoadingDialog label={messages.checkingSession} priority={100} />}
        {user && idle.status === 'warning' && <IdleWarning seconds={idle.seconds} messages={messages} onStay={idle.stay} onSignOut={signOut} />}
        {signingOut && <LoadingDialog label={messages.signingOut} />}

        <footer className="app-footer">
        </footer>
      </main>
    </PermissionsProvider>
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
  const { preferences, update } = usePreferences();
  const savedFilters = sortSavedTransactionFilters(preferences.transaction_filters, messages.language);
  const pinnedFilters = savedFilters.filter((preset) => preset.pin_to_menu === true);
  const [selectedSection, setSection] = useState<AppSection>(() => restoreLastPanel(userId, pinnedFilters.map(({ id }) => id)));
  const pinnedPreset = pinnedFilters.find((preset) => savedFilterSection(preset.id) === selectedSection);
  const section = selectedSection.startsWith('saved-filter:') && !pinnedPreset ? 'transactions' : selectedSection;
  if (section !== selectedSection) setSection(section);
  useEffect(() => {
    rememberLastPanel(userId, section);
  }, [userId, section]);
  const { accounts, trackedAccountIds, setTrackedAccountIds, cashFlowAccountIds, setCashFlowAccountIds, status: accountsStatus, retryAccounts } = useTrackedAccounts(userId);
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
        uncategorizedCount={uncategorizedCount} pinnedFilters={pinnedFilters}
      />
      <div className="dashboard-main">
        <LoadingDialog label={messages.loadingAccounts} open={accountsStatus === 'loading'} priority={80} />
        <div className="dashboard-content">
          {section === 'transactions' || section === 'uncategorized' || pinnedPreset ? (
            accountsStatus === 'loading' ? null
              : accountsStatus === 'error' ? (
                <section className="dashboard-panel" role="alert">
                  <h1>{messages.transactions}</h1>
                  <p className="form-message form-message-error">{messages.accountsError}</p>
                  <button className="button button-secondary" type="button" onClick={retryAccounts}>
                    {messages.retry}
                  </button>
                </section>
              ) : <FeatureBoundary key={section} messages={messages}>
                <TransactionsPanel
                  messages={messages}
                  accounts={accounts}
                  trackedAccountIds={trackedAccountIds}
                  filters={section === 'uncategorized' ? UNCATEGORIZED_TRANSACTION_FILTERS : undefined}
                  title={pinnedPreset?.name ?? (section === 'uncategorized' ? messages.uncategorized : messages.transactions)}
                  initialPreset={pinnedPreset}
                  onCategoriesChanged={() => setCategoryRevision((previous) => previous + 1)}
                />
              </FeatureBoundary>
          ) : section === 'net-worth' ? (
            <FeatureBoundary messages={messages}>
              <NetWorthPanel messages={messages} accounts={accounts} trackedAccountIds={trackedAccountIds}
                accountsStatus={accountsStatus} onRetryAccounts={retryAccounts} />
            </FeatureBoundary>
          ) : section === 'net-worth-charts' ? (
            <FeatureBoundary messages={messages}>
              <NetWorthChartsPanel messages={messages} accounts={accounts} trackedAccountIds={trackedAccountIds}
                accountsStatus={accountsStatus} onRetryAccounts={retryAccounts} />
            </FeatureBoundary>
          ) : section === 'cash-flow' ? (
            accountsStatus === 'loading' ? null
              : accountsStatus === 'error' ? (
                <section className="dashboard-panel" role="alert">
                  <h1>{messages.cashFlow}</h1>
                  <p className="form-message form-message-error">{messages.accountsError}</p>
                  <button className="button button-secondary" type="button" onClick={retryAccounts}>
                    {messages.retry}
                  </button>
                </section>
              ) : <FeatureBoundary messages={messages}>
                <CashFlowPanel messages={messages} accounts={accounts} cashFlowAccountIds={cashFlowAccountIds}
                  onCategoriesChanged={() => setCategoryRevision((previous) => previous + 1)} />
              </FeatureBoundary>
          ) : section === 'preferences' ? (
            <FeatureBoundary messages={messages}>
              <PreferencesPanel
                messages={messages}
                theme={theme}
                onThemeChange={onThemeChange}
                onLanguageChange={onLanguageChange}
                accounts={accounts}
                trackedAccountIds={trackedAccountIds}
                onTrackedAccountIdsChange={setTrackedAccountIds}
                cashFlowAccountIds={cashFlowAccountIds}
                onCashFlowAccountIdsChange={setCashFlowAccountIds}
                accountsStatus={accountsStatus}
                onRetryAccounts={retryAccounts}
                savedFilters={savedFilters}
                onPinFilter={(id, pinned) => update('transaction_filters', (previous) => previous.map((preset) =>
                  preset.id === id ? { ...preset, pin_to_menu: pinned } : preset))}
              />
            </FeatureBoundary>
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
        <StatusBar />
      </div>
    </>
  );
}

export default App;
