import { useId, useState } from 'react';
import type { LocaleMessages } from '../locales/types';
import { usePermissions } from '../hooks/usePermissions';
import { fetchLatestAssets } from '../lib/assets';
import OverflowMenu from './OverflowMenu';
import AssetSnapshotDialog from './AssetSnapshotDialog';
import CircleMinusIcon from './CircleMinusIcon';

type Asset = Awaited<ReturnType<typeof fetchLatestAssets>>[number] & { cad?: number | null };
const money = (amount: number, currency: string, language: string) => new Intl.NumberFormat(language, {
  style: 'currency', currency, currencyDisplay: 'code', minimumFractionDigits: 0, maximumFractionDigits: 0,
}).format(amount);

export default function AssetCard({ asset, messages, onSaved, readOnly = false }: { asset: Asset; messages: LocaleMessages; onSaved: () => void; readOnly?: boolean }) {
  const titleId = useId();
  const { canWrite } = usePermissions();
  const [editing, setEditing] = useState(false);
  const liability = asset.type === 'LIABILITY';
  const valuation = asset.currency === 'USD' ? asset.cad : asset.snapshot?.amount;
  const date = (timestamp: string) => <time dateTime={timestamp}>{new Intl.DateTimeFormat(messages.language, {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  }).format(new Date(timestamp))}</time>;
  return <section className="net-worth-card asset-card" aria-labelledby={titleId}>
    <div className="asset-card-heading">
      <div className="asset-card-identity">
        <h2 id={titleId} className={liability ? 'liability-name' : undefined} data-negative={liability || undefined}>
          {liability && <CircleMinusIcon />}<span>{asset.name}</span>
        </h2>
        {liability && <span className="liability-badge">{messages.liability}</span>}
      </div>
      {canWrite && !readOnly && <OverflowMenu label={messages.assetActions.replace('{name}', asset.name)}>{(close) =>
        <button type="button" role="menuitem" tabIndex={-1} onClick={() => {
          close(); setEditing(true);
        }}>{messages.assetUpdate}</button>
      }</OverflowMenu>}
    </div>
    <p className="asset-valuation" data-negative={!!asset.snapshot && valuation != null && (liability || valuation < 0) || undefined}>{!asset.snapshot ? messages.assetMissing
      : asset.currency === 'USD'
        ? asset.cad != null ? money(asset.cad, 'CAD', messages.language) : messages.assetCadUnavailable
        : money(asset.snapshot.amount, 'CAD', messages.language)}</p>
    {asset.currency === 'USD' && asset.snapshot && <p className="asset-native-value" data-negative={liability || asset.snapshot.amount < 0 || undefined}>
      ({money(asset.snapshot.amount, 'USD', messages.language)})
    </p>}
    {asset.count && asset.price && asset.count.amount > 1 && <p className="asset-calculation">
      {new Intl.NumberFormat(messages.language, { maximumFractionDigits: 20 }).format(asset.count.amount)}
      {' × '}<span data-negative={liability || asset.price.amount < 0 || undefined}>{money(asset.price.amount, asset.currency, messages.language)}</span>
    </p>}
    <p>{messages.assetValuationDate}: {asset.price ? date(asset.price.postedAt) : '—'}</p>
    {asset.count && asset.count.postedAt !== asset.price?.postedAt && <p>{messages.assetCountDate}: {date(asset.count.postedAt)}</p>}
    {editing && !readOnly && <AssetSnapshotDialog asset={asset} messages={messages} onClose={() => setEditing(false)} onSaved={() => {
      setEditing(false); onSaved();
    }} />}
  </section>;
}
