import { useId, useState } from 'react';
import type { LocaleMessages } from '../locales/types';
import { loadNetWorth, netWorthAllocation } from '../lib/netWorth';

type Result = Awaited<ReturnType<typeof loadNetWorth>>;
const colors = ['#2878b5', '#cf6b29', '#339875', '#9c65b5', '#c54c70', '#8c791d', '#3c939e', '#7466d2'];

export default function NetWorthAllocationCard({ messages, result }: { messages: LocaleMessages; result: Result }) {
  const titleId = useId();
  const descriptionId = useId();
  const [activeId, setActiveId] = useState<string | null>(null);
  const rows = netWorthAllocation(result);
  const percent = new Intl.NumberFormat(messages.language, { style: 'percent', maximumFractionDigits: 1 });
  const money = new Intl.NumberFormat(messages.language, { style: 'currency', currency: 'CAD', currencyDisplay: 'code' });
  const hasDebt = result.rows.some(({ cad }) => cad !== null && cad < 0);
  const rowKey = (row: typeof rows[number]) => `${row.kind ?? 'account'}:${row.id}`;
  const label = (row: typeof rows[number]) => `${row.name}: ${money.format(row.cad)} · ${row.netWorthShare === null ? '—' : percent.format(row.netWorthShare)}`;
  let cumulative = 0;

  return <section className="net-worth-card net-worth-allocation-card" aria-labelledby={titleId}>
    <h2 id={titleId}>{messages.netWorthAllocation}</h2>
    {(result.conversionError || result.accountsError || result.assetsError) ? <p>{messages.netWorthAllocationUnavailable}</p>
      : !rows.length ? <p>{messages.netWorthAllocationEmpty}</p> : <>
        <p id={descriptionId}>{messages.netWorthAllocationDescription}</p>
        {result.incomplete && <p>{messages.netWorthIncomplete}</p>}
        {hasDebt && <p>{messages.netWorthAllocationDebt}</p>}
        {result.total !== null && result.total <= 0 && <p>{messages.netWorthAllocationNonpositive}</p>}
        <svg className="net-worth-pie" viewBox="-1.1 -1.1 2.2 2.2" role="img" aria-labelledby={titleId} aria-describedby={descriptionId}
          onPointerLeave={() => setActiveId(null)}>
          {rows.map((row, index) => {
            const start = cumulative * 2 * Math.PI - Math.PI / 2;
            cumulative += row.pieShare;
            const end = cumulative * 2 * Math.PI - Math.PI / 2;
            const color = colors[index % colors.length];
            const props = { fill: color, opacity: activeId && activeId !== rowKey(row) ? 0.4 : 1,
              onPointerEnter: () => setActiveId(rowKey(row)) };
            return rows.length === 1 ? <circle key={rowKey(row)} r="1" {...props}><title>{label(row)}</title></circle>
              : <path key={rowKey(row)} d={`M 0 0 L ${Math.cos(start)} ${Math.sin(start)} A 1 1 0 ${row.pieShare > 0.5 ? 1 : 0} 1 ${Math.cos(end)} ${Math.sin(end)} Z`}
                {...props}><title>{label(row)}</title></path>;
          })}
        </svg>
        <p className="net-worth-allocation-label">{messages.netWorthShare}</p>
        <ul className="net-worth-allocation-legend">
          {rows.map((row, index) => <li key={rowKey(row)}>
            <button type="button" className="net-worth-legend-item" data-active={activeId === rowKey(row)}
              onPointerEnter={() => setActiveId(rowKey(row))} onPointerLeave={() => setActiveId(null)}
              onFocus={() => setActiveId(rowKey(row))} onBlur={() => setActiveId(null)} aria-label={label(row)}>
              <span className="net-worth-swatch" style={{ background: colors[index % colors.length] }} aria-hidden="true" />
              <span className="net-worth-legend-account">{row.name}<small>{money.format(row.cad)}</small></span>
              <strong>{row.netWorthShare === null ? '—' : percent.format(row.netWorthShare)}</strong>
            </button>
          </li>)}
        </ul>
      </>}
  </section>;
}
