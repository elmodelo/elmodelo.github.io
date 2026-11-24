import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { LocaleMessages } from '../locales/types';
import { usePermissions } from '../hooks/usePermissions';
import { sortNetWorthRows } from '../lib/netWorth';
import AssetSnapshotDialog from './AssetSnapshotDialog';
import CircleMinusIcon from './CircleMinusIcon';

type Snapshot = { amount: number; postedAt: string; rawAmount?: string };
export interface NetWorthRow {
  id: string; name: string; currency: string; kind?: 'asset'; type?: 'ASSET' | 'LIABILITY';
  snapshot: Snapshot | null; count?: Snapshot | null; price?: Snapshot | null;
  cad: number | null; excludedFromNetWorth?: boolean;
}
interface TableProps {
  messages: LocaleMessages; rows: NetWorthRow[]; titleId: string;
  readOnly?: boolean; onSaved?: () => void; defaultAscending?: boolean;
  totalUnavailable?: boolean;
}

export default function NetWorthTableCard({ title, emptyMessage, notice, className = '', ...tableProps }: Omit<TableProps, 'titleId'> & {
  title: string; emptyMessage: string; notice?: ReactNode; className?: string;
}) {
  const titleId = useId();
  return <section className={`net-worth-card net-worth-table-card ${className}`} aria-labelledby={titleId}>
    <h2 id={titleId}>{title}</h2>
    {notice}
    {tableProps.rows.length ? <NetWorthTable {...tableProps} titleId={titleId} totalUnavailable={!!notice || tableProps.totalUnavailable} />
      : !notice && <p>{emptyMessage}</p>}
  </section>;
}

export function NetWorthTable({ messages, rows: input, titleId, readOnly = false, onSaved, defaultAscending = false, totalUnavailable = false }: TableProps) {
  const container = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    // Match the panel's single-column container breakpoint, including when
    // dashboard chrome makes the panel narrower than the browser viewport.
    const panel = container.current?.closest('.net-worth-panel') ?? container.current;
    if (!panel) return;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width <= 640));
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);
  const [hoveredColumn, setHoveredColumn] = useState<number | null>(null);
  const [editing, setEditing] = useState<NetWorthRow | null>(null);
  const { canWrite } = usePermissions();
  type SortColumn = 'postedAt' | 'name' | 'balance' | 'cad';
  const [sort, setSort] = useState<{ column: SortColumn; ascending: boolean }>({ column: 'cad', ascending: defaultAscending });
  const sortColumn = compact && sort.column === 'balance' ? 'cad' : sort.column;
  const rows = sortNetWorthRows(input, messages.language, sortColumn, sort.ascending) as NetWorthRow[];
  const included = input.filter((row) => !row.excludedFromNetWorth);
  const total = included.reduce((sum, row) => sum + (row.cad ?? 0), 0);
  const totalAvailable = !totalUnavailable && Number.isFinite(total)
    && included.every((row) => row.cad !== null && Number.isFinite(row.cad));
  const columns: { id: SortColumn; label: string; amount?: boolean }[] = [
    { id: 'postedAt', label: messages.netWorthTableDate },
    { id: 'name', label: messages.netWorthTableName },
    ...(!compact ? [{ id: 'balance' as const, label: messages.netWorthTableAmount, amount: true }] : []),
    { id: 'cad', label: compact ? messages.netWorthTableAmount : messages.netWorthTableCad, amount: true },
  ];
  const columnClass = (index: number, amount = false) => [
    amount ? 'net-worth-amount' : '', hoveredColumn === index ? 'net-worth-column-hover' : '',
  ].filter(Boolean).join(' ') || undefined;
  const date = (timestamp: string) => {
    const full = new Intl.DateTimeFormat(messages.language, {
      year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
    }).format(new Date(timestamp));
    return <time dateTime={timestamp} title={compact ? full : undefined} aria-label={compact ? full : undefined}>
      {compact ? new Intl.DateTimeFormat(messages.language, {
        year: '2-digit', month: 'numeric', day: 'numeric', timeZone: 'UTC',
      }).format(new Date(timestamp)) : full}
    </time>;
  };
  const money = (amount: number, currency: string) => new Intl.NumberFormat(messages.language, {
    style: 'currency', currency, currencyDisplay: compact ? 'narrowSymbol' : 'code', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);
  const count = (snapshot: Snapshot) => new Intl.NumberFormat(messages.language, {
    maximumFractionDigits: 0, useGrouping: false,
  }).format(snapshot.amount);
  return <>
    <div ref={container} className="panel-scroll" tabIndex={0} role="region" aria-labelledby={titleId}>
      <table className="net-worth-table" data-compact={compact || undefined}
        onPointerOver={(event) => {
          if (event.pointerType === 'touch' || !(event.target instanceof Element)) return;
          const cell = event.target.closest<HTMLTableCellElement>('th, td');
          setHoveredColumn(cell?.closest('table') === event.currentTarget && !cell.closest('tfoot') ? cell.cellIndex : null);
        }}
        onPointerLeave={() => setHoveredColumn(null)} onPointerCancel={() => setHoveredColumn(null)}>
        <thead><tr>
          {columns.map((column, index) => <th key={column.id} scope="col" className={columnClass(index, column.amount)}
            aria-sort={sortColumn === column.id ? (sort.ascending ? 'ascending' : 'descending') : 'none'}>
            <button type="button" className="sort-button" aria-label={column.id === 'cad' ? messages.netWorthTableCad : undefined} onClick={() => setSort((previous) => ({
              column: column.id, ascending: (compact && previous.column === 'balance' ? 'cad' : previous.column) === column.id ? !previous.ascending : column.id === 'name',
            }))}>
              <span className="net-worth-sort-label">{column.label}</span>
              <span className={sortColumn === column.id ? 'sort-icon active' : 'sort-icon'} aria-hidden="true">
                {sortColumn === column.id && !sort.ascending ? '▼' : '▲'}
              </span>
            </button>
          </th>)}
        </tr></thead>
        <tbody>{rows.map((row) => {
          const asset = row.kind === 'asset';
          const negative = (asset && row.type === 'LIABILITY') || (row.snapshot?.amount ?? 0) < 0;
          const observed = asset ? row.price : row.snapshot;
          return <tr key={`${row.kind ?? 'account'}:${row.id}`}>
            <td className={columnClass(0)}>
              {observed ? date(observed.postedAt) : '—'}
              {asset && row.count && row.count.postedAt !== row.price?.postedAt && <small className="net-worth-count-date">
                {messages.assetCountDate}: {date(row.count.postedAt)}
              </small>}
            </td>
            <th scope="row" className={columnClass(1)}>
              <div className="net-worth-row-heading">
                <span className="net-worth-account-name" data-negative={negative || undefined}>
                  {negative && !compact && <CircleMinusIcon />}<span>{row.name}{asset && row.count && row.count.amount > 1
                    && <span className="net-worth-row-count"> (x{count(row.count)})</span>}</span>
                </span>
                {asset && canWrite && !readOnly && onSaved && <button type="button" className="net-worth-overflow"
                  aria-label={`${messages.assetUpdate}: ${row.name}`} aria-haspopup="dialog" onClick={() => setEditing(row)}>
                  <span aria-hidden="true">⋯</span>
                </button>}
              </div>
              {row.excludedFromNetWorth && <small className="net-worth-excluded">{messages.netWorthExcluded}</small>}
            </th>
            {!compact && <td className={columnClass(2, true)} data-negative={row.snapshot && negative || undefined}>
              {row.snapshot ? money(row.snapshot.amount, row.currency) : messages.netWorthMissing}
            </td>}
            <td className={columnClass(compact ? 2 : 3, true)} data-negative={row.cad !== null && negative || undefined}>
              {row.cad === null ? '—' : money(row.cad, 'CAD')}
            </td>
          </tr>;
        })}</tbody>
        <tfoot><tr>
          <th scope="row" colSpan={columns.length - 1}>{messages.netWorthTableTotal}</th>
          <td className="net-worth-amount" data-negative={totalAvailable && total < 0 || undefined}>
            {totalAvailable ? money(total, 'CAD') : messages.netWorthUnavailable}
          </td>
        </tr></tfoot>
      </table>
    </div>
    {editing && !readOnly && canWrite && <AssetSnapshotDialog asset={editing} messages={messages} onClose={() => setEditing(null)}
      onSaved={() => { setEditing(null); onSaved?.(); }} />}
  </>;
}
