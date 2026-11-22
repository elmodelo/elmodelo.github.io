import type { LocaleMessages } from '../locales/types';
import { usePermissions } from '../hooks/usePermissions';
import OverflowMenu from './OverflowMenu';

export default function NetWorthActions({ messages, onAdd, showInactive, onShowInactiveChange, includeResp, onIncludeRespChange }: {
  messages: LocaleMessages; onAdd: () => void;
  showInactive: boolean; onShowInactiveChange: (show: boolean) => void;
  includeResp: boolean; onIncludeRespChange: (include: boolean) => void;
}) {
  const { canRead, canWrite } = usePermissions();
  if (!canRead) return null;
  return <OverflowMenu label={messages.netWorthActions}>{(close) => <>
    {canWrite && <button type="button" role="menuitem" tabIndex={-1} onClick={() => {
      close(); onAdd();
    }}>{messages.assetAdd}</button>}
    <button type="button" role="menuitemcheckbox" aria-checked={showInactive} tabIndex={-1}
      className="net-worth-inactive-action" onClick={() => onShowInactiveChange(!showInactive)}>
      <span className="net-worth-menu-checkbox" aria-hidden="true">{showInactive ? '✓' : ''}</span>
      {messages.assetShowInactive}
    </button>
    <button type="button" role="menuitemcheckbox" aria-checked={includeResp} tabIndex={-1}
      className="net-worth-inactive-action" onClick={() => onIncludeRespChange(!includeResp)}>
      <span className="net-worth-menu-checkbox" aria-hidden="true">{includeResp ? '✓' : ''}</span>
      {messages.netWorthIncludeResp}
    </button>
  </>}</OverflowMenu>;
}
