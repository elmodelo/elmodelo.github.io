import { Component, Suspense, type ReactNode } from 'react';
import type { LocaleMessages } from '../locales/types';
import LoadingDialog from './LoadingDialog';

interface Props {
  messages: LocaleMessages;
  fallbackClassName?: string;
  children: ReactNode;
}

export default class FeatureBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    const { children, messages, fallbackClassName = 'dashboard-panel' } = this.props;
    if (this.state.failed) {
      return (
        <div className={fallbackClassName} role="alert">
          <p className="form-message form-message-error">{messages.featureLoadError}</p>
          <button type="button" className="button button-secondary" onClick={() => window.location.reload()}>
            {messages.reloadPage}
          </button>
        </div>
      );
    }
    return <Suspense fallback={<LoadingDialog label={messages.loadingComponents} priority={70} />}>{children}</Suspense>;
  }
}
