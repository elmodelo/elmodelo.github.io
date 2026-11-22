import { useEffect, useId, useRef, useState } from 'react';
import type { LocaleMessages } from '../locales/types';
import { assetSnapshotInput, saveAssetSnapshot } from '../lib/assets';
import { supabase } from '../lib/supabaseClient';

function localNow() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

export default function AssetSnapshotDialog({ asset, messages, onClose, onSaved }: {
  asset: { id: string; name: string; currency: string }; messages: LocaleMessages; onClose: () => void; onSaved: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const [count, setCount] = useState('');
  const [value, setValue] = useState('');
  const [postedAt, setPostedAt] = useState(localNow);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="result-dialog asset-snapshot-dialog" aria-labelledby={`${id}-title`}
    aria-describedby={`${id}-help`} onCancel={(event) => {
      if (pending.current) event.preventDefault();
    }} onClose={(event) => { if (!event.currentTarget.open && !pending.current) onClose(); }}>
    <h2 id={`${id}-title`}>{messages.assetUpdate}: {asset.name}</h2>
    <p id={`${id}-help`}>{messages.assetSnapshotHelp}</p>
    <form aria-busy={saving} onSubmit={async (event) => {
      event.preventDefault();
      if (pending.current) return;
      let input;
      try { input = assetSnapshotInput(count, value, postedAt); }
      catch { setError(messages.assetInvalid); return; }
      pending.current = true; setSaving(true); setError('');
      try {
        await saveAssetSnapshot(supabase, asset.id, input);
        onSaved();
      } catch (cause) {
        const code = (cause as { code?: string }).code;
        setError(code === '23505' ? messages.assetConflict : code === '42501' ? messages.assetPermissionError : messages.assetSaveError);
      } finally { pending.current = false; setSaving(false); }
    }}>
      <label htmlFor={`${id}-count`}>{messages.assetCount}</label>
      <input id={`${id}-count`} type="text" inputMode="decimal" autoFocus value={count} disabled={saving}
        onChange={(event) => setCount(event.target.value)} placeholder="0" />
      <label htmlFor={`${id}-value`}>{messages.assetUnitValue} ({asset.currency})</label>
      <input id={`${id}-value`} type="text" inputMode="decimal" value={value} disabled={saving}
        onChange={(event) => setValue(event.target.value)} placeholder="0.00" />
      <label htmlFor={`${id}-date`}>{messages.assetPostedAt}</label>
      <input id={`${id}-date`} type="datetime-local" step="1" required value={postedAt} disabled={saving}
        onChange={(event) => setPostedAt(event.target.value)} />
      {error && <p className="form-message form-message-error" role="alert">{error}</p>}
      <div className="asset-dialog-actions">
        <button type="button" className="button button-secondary" disabled={saving} onClick={onClose}>{messages.cancel}</button>
        <button type="submit" className="button button-primary" disabled={saving}>{saving ? messages.assetSaving : messages.assetSave}</button>
      </div>
    </form>
  </dialog>;
}
