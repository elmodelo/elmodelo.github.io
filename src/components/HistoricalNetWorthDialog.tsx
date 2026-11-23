import { useEffect, useId, useRef, useState } from 'react';
import type { LocaleMessages } from '../locales/types';
import type { Account } from '../hooks/useTrackedAccounts';
import { supabase } from '../lib/supabaseClient';
import { clampHistoricalDate, fetchNetWorthDateBounds, historicalDateChoices } from '../lib/historicalDates';

type Bounds = { min: string; max: string };

export default function HistoricalNetWorthDialog({ messages, accounts, selectedDate, onSelect, onClose }: {
  messages: LocaleMessages; accounts: Account[]; selectedDate: string | null;
  onSelect: (date: string) => void; onClose: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ accounts: Account[]; attempt: number; bounds: Bounds | null } | null>(null);
  const [failure, setFailure] = useState<{ accounts: Account[]; attempt: number } | null>(null);
  const result = loaded?.accounts === accounts && loaded.attempt === attempt ? loaded : null;
  const error = failure?.accounts === accounts && failure.attempt === attempt;
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void fetchNetWorthDateBounds(supabase, accounts, controller.signal)
      .then((bounds) => { if (active) setLoaded({ accounts, attempt, bounds }); })
      .catch(() => { if (active) setFailure({ accounts, attempt }); });
    return () => { active = false; controller.abort(); };
  }, [accounts, attempt]);
  return <dialog ref={dialog} className="result-dialog asset-snapshot-dialog historical-date-dialog"
    aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`}
    onClose={(event) => { if (!event.currentTarget.open) onClose(); }}>
    <h2 id={`${id}-title`}>{messages.netWorthHistorical}</h2>
    <p id={`${id}-help`} className="asset-dialog-help">{messages.netWorthHistoricalHelp}</p>
    {error ? <div role="alert">
      <p>{messages.netWorthHistoryError}</p>
      <button type="button" className="button button-secondary" onClick={() => setAttempt((value) => value + 1)}>{messages.retry}</button>
    </div> : !result ? <p role="status">{messages.netWorthHistoryLoading}</p>
      : result.bounds ? <HistoricalDateForm key={`${result.bounds.min}:${result.bounds.max}`}
        bounds={result.bounds} selectedDate={selectedDate} messages={messages} onSelect={onSelect} onClose={onClose} />
        : <p role="status">{messages.netWorthHistoryEmpty}</p>}
    {(!result?.bounds || error) && <div className="asset-dialog-actions">
      <button type="button" className="button button-secondary" onClick={onClose}>{messages.cancel}</button>
    </div>}
  </dialog>;
}

export function HistoricalDateForm({ bounds, selectedDate, messages, onSelect, onClose }: {
  bounds: Bounds; selectedDate: string | null; messages: LocaleMessages;
  onSelect: (date: string) => void; onClose: () => void;
}) {
  const id = useId();
  const [date, setDate] = useState(() => selectedDate && selectedDate >= bounds.min && selectedDate <= bounds.max ? selectedDate : bounds.max);
  const [year, month, day] = date.split('-').map(Number);
  const choices = historicalDateChoices(bounds, date);
  return <form onSubmit={(event) => { event.preventDefault(); onSelect(date); }}>
    <div className="historical-date-fields">
      <div className="form-field">
        <label htmlFor={`${id}-year`}>{messages.netWorthHistoryYear}</label>
        <select id={`${id}-year`} autoFocus value={year} onChange={(event) => setDate(clampHistoricalDate(bounds, Number(event.target.value), month, day))}>
          {choices.years.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor={`${id}-month`}>{messages.netWorthHistoryMonth}</label>
        <select id={`${id}-month`} value={month} onChange={(event) => setDate(clampHistoricalDate(bounds, year, Number(event.target.value), day))}>
          {choices.months.map((value) => <option key={value} value={value}>{new Intl.DateTimeFormat(messages.language, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, value - 1, 1)))}</option>)}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor={`${id}-day`}>{messages.netWorthHistoryDay}</label>
        <select id={`${id}-day`} value={day} onChange={(event) => setDate(clampHistoricalDate(bounds, year, month, Number(event.target.value)))}>
          {choices.days.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
    </div>
    <div className="asset-dialog-actions">
      <button type="button" className="button button-secondary" onClick={onClose}>{messages.cancel}</button>
      <button type="submit" className="button button-primary">{messages.netWorthHistoryApply}</button>
    </div>
  </form>;
}
