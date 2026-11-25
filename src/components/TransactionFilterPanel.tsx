import LoadingDialog from './LoadingDialog';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchCategories } from '../lib/transactionCategorization';
import { usePreferences } from '../hooks/usePreferences';
import { buildTransactionFilters, EMPTY_TRANSACTION_FILTER, isTransactionFilterValues, type TransactionFilterValues } from '../lib/transactionFilterPresets';
import { parseFilterPowerSearch } from '../lib/transactionSearch';
import { isRelativeDateRange, MAX_RELATIVE_DAYS, relativeDateExpression } from '../lib/relativeTransactionDates';
import type { LocaleMessages } from '../locales/types';

interface Props {
  messages: LocaleMessages;
  trackedAccountIds: string[];
  values: TransactionFilterValues;
  activePresetId?: string;
  focusName?: boolean;
  onApply: (values: TransactionFilterValues, presetId: string) => void;
  onClose: () => void;
}
type Option = { id: string; name: string };

export default function TransactionFilterPanel({ messages, trackedAccountIds, values, activePresetId, focusName = false, onApply, onClose }: Props) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const { preferences, status, update } = usePreferences();
  const [draft, setDraft] = useState(values);
  const [accounts, setAccounts] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [presetId, setPresetId] = useState(activePresetId ?? '');
  const [name, setName] = useState(() => preferences.transaction_filters.find((preset) => preset.id === activePresetId)?.name ?? '');
  const [savedMessage, setSavedMessage] = useState(false);
  const valid = isTransactionFilterValues(draft);
  const relativeDate = draft.relativeDate;
  const invalidRelativeDate = relativeDate !== undefined && !isRelativeDateRange(relativeDate);
  const invalidPowerSearch = parseFilterPowerSearch(draft.powerSearch ?? '') === null;
  const canSave = status !== 'loading' && status !== 'load-error';
  const canSaveDraft = canSave && valid && !!name.trim();
  const presets = preferences.transaction_filters;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    if (focusName) nameRef.current?.focus();
    return () => dialog.close();
  }, [focusName]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load() {
      try {
        const [accountResult, categoryResult] = await Promise.all([
          supabase.schema('finance').from('account').select('id, name').order('name').abortSignal(controller.signal),
          fetchCategories(supabase, controller.signal),
        ]);
        if (accountResult.error || !accountResult.data) throw new Error('Accounts unavailable');
        if (active) { setAccounts(accountResult.data); setCategories(categoryResult); setLoadStatus('ready'); }
      } catch { if (active) setLoadStatus('error'); }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [attempt]);

  function change<K extends keyof TransactionFilterValues>(key: K, value: TransactionFilterValues[K]) {
    setDraft((previous) => ({ ...previous, [key]: value, sourceSearch: undefined }));
    setSavedMessage(false);
  }

  function saveDraft() {
    if (!canSaveDraft) return;
    const existing = presets.find((preset) => preset.name === name.trim());
    const saved = { id: existing?.id ?? crypto.randomUUID(), name: name.trim(), values: structuredClone(draft) };
    update('transaction_filters', (previous) => [
      ...previous.filter((preset) => preset.id !== saved.id),
      { ...saved, pin_to_menu: previous.find((preset) => preset.id === saved.id)?.pin_to_menu === true },
    ]);
    setPresetId(saved.id);
    setSavedMessage(true);
  }
  function options(field: 'accounts' | 'categories', label: string, items: Option[]) {
    const selected = draft[field];
    return <fieldset className="transaction-filter-options">
      <legend>{label}</legend>
      <label className="preferences-option">
        <input type="checkbox" checked={selected === null} onChange={(event) => change(field, event.target.checked ? null : [])} />
        <span>{messages.filterAll}</span>
      </label>
      <div className="transaction-filter-option-list">
        {items.map((item) => <label className="preferences-option" key={item.id}>
          <input type="checkbox" checked={selected === null || selected.includes(item.id)} onChange={(event) => {
            const ids = selected ?? items.map((option) => option.id);
            change(field, event.target.checked ? [...ids, item.id] : ids.filter((value) => value !== item.id));
          }} />
          <span>{item.name}</span>
        </label>)}
      </div>
      {items.length === 0 && <p>{field === 'accounts' ? messages.noAccounts : messages.noCategories}</p>}
    </fieldset>;
  }

  return <dialog ref={dialogRef} id={id} className="transaction-filter-panel" aria-labelledby={`${id}-title`}
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="transaction-filter-heading">
      <h2 id={`${id}-title`}>{messages.filterTransactions}</h2>
      <button type="button" className="button button-secondary transaction-filter-close" aria-label={messages.close} title={messages.close} onClick={onClose}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
    </div>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!valid) return;
      const preset = presets.find((item) => item.id === presetId);
      const asOf = new Date();
      const matchesPreset = preset
        && (preset.values.relativeDate ? relativeDateExpression(preset.values.relativeDate) : '') === (relativeDate ? relativeDateExpression(relativeDate) : '')
        && (preset.values.powerSearch ?? '').trim() === (draft.powerSearch ?? '').trim()
        && JSON.stringify(buildTransactionFilters(preset.values, asOf)) === JSON.stringify(buildTransactionFilters(draft, asOf));
      onApply(draft, matchesPreset ? presetId : '');
    }}>
      <fieldset className="transaction-filter-saved">
        <legend>{messages.savedFilters}</legend>
        <label htmlFor={`${id}-saved`}>{messages.loadFilter}</label>
        <select id={`${id}-saved`} value={presetId} disabled={!canSave} onChange={(event) => {
          const preset = presets.find((item) => item.id === event.target.value);
          setPresetId(event.target.value);
          setSavedMessage(false);
          if (preset) { setDraft(preset.values); setName(preset.name); } else setName('');
        }}>
          <option value="">{messages.chooseFilter}</option>
          {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
        </select>
        <label htmlFor={`${id}-name`}>{messages.filterName}</label>
        <input id={`${id}-name`} ref={nameRef} value={name} maxLength={100}
          onChange={(event) => { setName(event.target.value); setSavedMessage(false); }}
          onKeyDown={(event) => {
            if (!focusName || event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            saveDraft();
          }} />
        <div className="transaction-filter-actions">
          <button type="button" className="button button-secondary" disabled={!canSaveDraft} onClick={saveDraft}>{messages.saveFilter}</button>
          <button type="button" className="button button-secondary" disabled={!canSave || !presetId} onClick={() => {
            update('transaction_filters', (previous) => previous.filter((preset) => preset.id !== presetId));
            setPresetId(''); setName(''); setSavedMessage(false);
          }}>{messages.deleteFilter}</button>
        </div>
        {savedMessage && <p role="status">{status === 'save-error' ? messages.preferencesSaveError : status === 'saved' || status === 'idle' ? messages.preferencesSaved : messages.savingPreferences}</p>}
        <p className="transaction-filter-help">{messages.filterSaveHelp}</p>
      </fieldset>
      {loadStatus === 'error' ? <div role="alert">
        <p>{messages.filterOptionsError}</p>
        <button type="button" className="button button-secondary" onClick={() => { setLoadStatus('loading'); setAttempt((value) => value + 1); }}>{messages.retry}</button>
      </div> : loadStatus === 'loading' ? <LoadingDialog label={messages.loadingFilters} /> :
        <div className="transaction-filter-grid">
          {options('accounts', messages.transactionAccount, accounts.filter((account) => trackedAccountIds.includes(account.id)))}
          {options('categories', messages.transactionCategory, categories)}
        </div>}
      <p className="transaction-filter-help">{messages.filterScopeHelp}</p>
      <div className="transaction-filter-grid">
        <label>{messages.filterRelativeDate}
          <select value={relativeDate?.kind ?? ''} aria-describedby={relativeDate ? `${id}-relative-help` : undefined}
            onChange={(event) => {
              const kind = event.target.value;
              change('relativeDate', kind === 'last-month' ? { kind } : kind === 'last-days' ? { kind, days: 30 } : undefined);
            }}>
            <option value="">{messages.filterRelativeNone}</option>
            <option value="last-days">{messages.filterRelativeDays}</option>
            <option value="last-month">{messages.filterRelativeMonth}</option>
          </select>
        </label>
        {relativeDate?.kind === 'last-days' && <label>{messages.filterRelativeDayCount}
          <input type="number" min={1} max={MAX_RELATIVE_DAYS} step={1} required
            aria-invalid={invalidRelativeDate || undefined}
            value={Number.isFinite(relativeDate.days) ? relativeDate.days : ''}
            onChange={(event) => change('relativeDate', { kind: 'last-days', days: event.target.valueAsNumber })} />
        </label>}
      </div>
      {relativeDate && <p id={`${id}-relative-help`} className="transaction-filter-help">{messages.filterRelativeHelp}</p>}
      <div className="transaction-filter-grid">
        <label>{messages.filterFrom}<input type="date" value={draft.from} max={draft.to || undefined} onChange={(event) => change('from', event.target.value)} /></label>
        <label>{messages.filterTo}<input type="date" value={draft.to} min={draft.from || undefined} onChange={(event) => change('to', event.target.value)} /></label>
      </div>
      <label>{messages.filterSearch}<input type="search" value={draft.search} onChange={(event) => change('search', event.target.value)} /></label>
      <p className="transaction-filter-help">{messages.filterSearchHelp}</p>
      <div className="transaction-filter-grid">
        <label>{messages.filterMinimum}<input type="number" step="any" value={draft.minimum} onChange={(event) => change('minimum', event.target.value)} /></label>
        <label>{messages.filterMaximum}<input type="number" step="any" value={draft.maximum} onChange={(event) => change('maximum', event.target.value)} /></label>
      </div>
      <p className="transaction-filter-help">{messages.filterAmountHelp}</p>
      <label>{messages.filterPowerSearch}
        <textarea rows={2} value={draft.powerSearch ?? ''} aria-describedby={`${id}-power-help`}
          aria-invalid={invalidPowerSearch || undefined}
          onChange={(event) => change('powerSearch', event.target.value)} />
      </label>
      <p id={`${id}-power-help`} className="transaction-filter-help">{messages.filterPowerSearchHelp}</p>
      {!valid && <p role="alert" className="form-message form-message-error">
        {invalidRelativeDate ? messages.filterRelativeInvalid : invalidPowerSearch ? messages.filterPowerSearchInvalid : messages.filterInvalid}
      </p>}
      <div className="transaction-filter-actions">
        <button type="button" className="button button-secondary" onClick={() => { setDraft(EMPTY_TRANSACTION_FILTER); setPresetId(''); setName(''); setSavedMessage(false); }}>{messages.resetFilters}</button>
        <button type="button" className="button button-secondary" onClick={onClose}>{messages.cancel}</button>
        <button type="submit" className="button button-primary" disabled={!valid}>{messages.applyFilters}</button>
      </div>
    </form>
  </dialog>;
}
