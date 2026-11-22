import { useId, useState } from 'react';
import type { LocaleMessages } from '../locales/types';
import { usePermissions } from '../hooks/usePermissions';
import { fetchLatestAssets } from '../lib/assets';
import AssetSnapshotDialog from './AssetSnapshotDialog';

type Asset = Awaited<ReturnType<typeof fetchLatestAssets>>[number] & { cad?: number | null };
const money = (amount: number, currency: string, language: string, unitPrice = false) => new Intl.NumberFormat(language, {
  style: 'currency', currency, currencyDisplay: 'code', ...(unitPrice ? { maximumFractionDigits: 20 } : {}),
}).format(amount);

export default function AssetCard({ asset, messages, onSaved }: { asset: Asset; messages: LocaleMessages; onSaved: () => void }) {
  const titleId = useId();
  const { canWrite } = usePermissions();
  const [editing, setEditing] = useState(false);
  const date = (timestamp: string) => <time dateTime={timestamp}>{new Intl.DateTimeFormat(messages.language, {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  }).format(new Date(timestamp))}</time>;
  return <section className="net-worth-card asset-card" aria-labelledby={titleId}>
    <h2 id={titleId}>{asset.name}</h2>
    <p className="asset-valuation">{!asset.snapshot ? messages.assetMissing
      : asset.currency === 'USD'
        ? asset.cad != null ? money(asset.cad, 'CAD', messages.language) : messages.assetCadUnavailable
        : money(asset.snapshot.amount, 'CAD', messages.language)}</p>
    {asset.currency === 'USD' && asset.snapshot && <p className="asset-native-value">
      ({money(asset.snapshot.amount, 'USD', messages.language)})
    </p>}
    {asset.count && asset.price && asset.count.amount > 1 && <p className="asset-calculation">
      {new Intl.NumberFormat(messages.language, { maximumFractionDigits: 20 }).format(asset.count.amount)}
      {' × '}{money(asset.price.amount, asset.currency, messages.language, true)}
    </p>}
    <p>{messages.assetValuationDate}: {asset.price ? date(asset.price.postedAt) : '—'}</p>
    {asset.count && asset.count.postedAt !== asset.price?.postedAt && <p>{messages.assetCountDate}: {date(asset.count.postedAt)}</p>}
    {canWrite && <button type="button" className="button button-secondary" onClick={() => setEditing(true)}>{messages.assetUpdate}</button>}
    {editing && <AssetSnapshotDialog asset={asset} messages={messages} onClose={() => setEditing(false)} onSaved={() => {
      setEditing(false); onSaved();
    }} />}
  </section>;
}
