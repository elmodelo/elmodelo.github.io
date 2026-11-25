import LoadingDialog from './LoadingDialog';
import { useEffect, useId, useRef, useState } from 'react';
import type { LocaleMessages } from '../locales/types';
import { changedAssetSnapshotInput, saveAssetSnapshot, newAssetInput, createAsset } from '../lib/assets';
import { evaluateAssetExpression } from '../lib/decimalExpression';
import { supabase } from '../lib/supabaseClient';

function resolveArithmetic(text: string, update: (value: string) => void, allowNegative = false) {
  if (!text.trim()) return;
  try { update(evaluateAssetExpression(text, allowNegative)); }
  catch { /* Keep invalid input editable; submit displays the validation error. */ }
}

function localNow() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

export default function AssetSnapshotDialog({ asset, messages, onClose, onSaved, creationType = 'ASSET' }: {
  asset?: {
    id: string; name: string; currency: string; type?: 'ASSET' | 'LIABILITY';
    count?: { amount: number; rawAmount?: string } | null;
    price?: { amount: number; rawAmount?: string } | null;
  }; creationType?: 'ASSET' | 'LIABILITY'; messages: LocaleMessages; onClose: () => void; onSaved: (inactive?: boolean) => void;
}) {
  const liability = (asset?.type ?? creationType) === 'LIABILITY';
  const addLabel = liability ? messages.liabilityAdd : messages.assetAdd;
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('CAD');
  const [count, setCount] = useState(() => asset?.count?.rawAmount ?? String(asset?.count?.amount ?? ''));
  const [value, setValue] = useState(() => asset?.price?.rawAmount ?? String(asset?.price?.amount ?? ''));
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
    <LoadingDialog label={messages.assetSaving} open={saving} />
    <h2 id={`${id}-title`}>{asset ? `${messages.assetUpdate}: ${asset.name}` : addLabel}</h2>
    <p id={`${id}-help`} className="asset-dialog-help">{asset ? (liability ? messages.liabilitySnapshotHelp : messages.assetSnapshotHelp) : liability ? messages.liabilityCreateHelp : messages.assetCreateHelp}</p>
    <form aria-busy={saving} onSubmit={async (event) => {
      event.preventDefault();
      if (pending.current) return;
      let input;
      try { input = asset ? changedAssetSnapshotInput(asset, count, value, postedAt)
        : newAssetInput(name, currency, count, value, postedAt, creationType); }
      catch { setError(liability ? messages.liabilityInvalid : asset ? messages.assetInvalid : messages.assetCreateInvalid); return; }
      if (input === null) { onClose(); return; }
      pending.current = true; setSaving(true); setError('');
      try {
        if (asset) await saveAssetSnapshot(supabase, asset.id, input);
        else await createAsset(supabase, input);
        onSaved(!asset && (Number(input.p_count) === 0 || Number(input.p_value) === 0));
      } catch (cause) {
        const code = (cause as { code?: string }).code;
        setError(code === '23505' ? (asset ? messages.assetConflict : messages.assetNameConflict) : code === '42501' ? messages.assetPermissionError : messages.assetSaveError);
      } finally { pending.current = false; setSaving(false); }
    }}>
      {!asset && <div className="asset-identity-fields">
        <div className="form-field">
          <label htmlFor={`${id}-name`}>{liability ? messages.liabilityName : messages.assetName}</label>
          <input id={`${id}-name`} type="text" required autoFocus value={name} disabled={saving}
            onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor={`${id}-currency`}>{messages.assetCurrency}</label>
          <select id={`${id}-currency`} required value={currency} disabled={saving}
            onChange={(event) => setCurrency(event.target.value)}>
            <option value="CAD">CAD</option><option value="USD">USD</option>
          </select>
        </div>
      </div>}
      <div className="asset-amount-fields">
        <div className="form-field">
          <label htmlFor={`${id}-count`}>{messages.assetCount}</label>
          <input id={`${id}-count`} type="text" inputMode="text" autoFocus={!!asset} required={!asset} value={count} disabled={saving}
            onChange={(event) => setCount(event.target.value)} onBlur={() => resolveArithmetic(count, setCount)} placeholder="0" />
        </div>
        <div className="form-field">
          <label htmlFor={`${id}-value`}>{messages.assetUnitValue} ({asset?.currency ?? currency})</label>
          <input id={`${id}-value`} type="text" inputMode="text" required={!asset} value={value} disabled={saving}
            onChange={(event) => setValue(event.target.value)} onBlur={() => resolveArithmetic(value, setValue, liability)} placeholder="0.00" />
        </div>
      </div>
      <div className="form-field">
        <label htmlFor={`${id}-date`}>{messages.assetPostedAt}</label>
        <input id={`${id}-date`} type="datetime-local" step="1" required value={postedAt} disabled={saving}
          onChange={(event) => setPostedAt(event.target.value)} />
      </div>
      {error && <p className="form-message form-message-error" role="alert">{error}</p>}
      <div className="asset-dialog-actions">
        <button type="button" className="button button-secondary" disabled={saving} onClick={onClose}>{messages.cancel}</button>
        <button type="submit" className="button button-primary" disabled={saving}>{saving ? messages.assetSaving : asset ? messages.assetSave : addLabel}</button>
      </div>
    </form>
  </dialog>;
}
