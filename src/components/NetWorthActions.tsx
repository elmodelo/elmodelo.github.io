import type { LocaleMessages } from '../locales/types';
import { usePermissions } from '../hooks/usePermissions';
import OverflowMenu from './OverflowMenu';

export default function NetWorthActions({ messages, onAdd, showInactive, onShowInactiveChange, includeResp, onIncludeRespChange, onHistorical, historical = false, historyAvailable = true }: {
  messages: LocaleMessages; onAdd: (type: 'ASSET' | 'LIABILITY') => void;
  showInactive: boolean; onShowInactiveChange: (show: boolean) => void;
  includeResp: boolean; onIncludeRespChange: (include: boolean) => void;
  onHistorical?: () => void; historical?: boolean; historyAvailable?: boolean;
}) {
  const { canRead, canWrite } = usePermissions();
  if (!canRead) return null;
  return <OverflowMenu label={messages.netWorthActions}>{(close) => <>
    {onHistorical && historyAvailable && <button type="button" role="menuitem" tabIndex={-1} onClick={() => {
      close(); onHistorical();
    }}>{messages.netWorthHistorical}</button>}
    {canWrite && !historical && <button type="button" role="menuitem" tabIndex={-1} onClick={() => {
      close(); onAdd('ASSET');
    }}>{messages.assetAdd}</button>}
    {canWrite && !historical && <button type="button" role="menuitem" tabIndex={-1} onClick={() => {
      close(); onAdd('LIABILITY');
    }}>{messages.liabilityAdd}</button>}
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
