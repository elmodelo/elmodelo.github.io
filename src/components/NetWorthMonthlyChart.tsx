import { useLayoutEffect, useId, useRef, useState } from 'react';
import type { LocaleMessages } from '../locales/types';
import { MONTH_WIDTH, visibleChartDomain } from '../lib/netWorthChartViewport';

export type MonthlyRow = { month: string; date: string; assets: number | null; liabilities: number | null; netWorth: number | null; portfolio: number | null; growth: number | null; average: number | null };
type Series = { key: 'assets' | 'liabilities' | 'netWorth' | 'portfolio' | 'growth' | 'average'; label: string; color: string };
export default function MonthlyChart({ messages, title, description, rows, series, percent = false, viewport = { scrollLeft: 0, width: 720 }, registerViewport }: {
  messages: LocaleMessages; title: string; description?: string; rows: MonthlyRow[]; series: Series[]; percent?: boolean;
  viewport?: { scrollLeft: number; width: number }; registerViewport?: (element: HTMLDivElement) => () => void;
}) {
  const id = useId();
  const [active, setActive] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (scrollRef.current && registerViewport) return registerViewport(scrollRef.current);
  }, [registerViewport]);
  const { min, max } = visibleChartDomain(rows, series.map(({ key }) => key), viewport, percent);
  const top = 16, bottom = 280;
  const width = Math.max(viewport.width, rows.length * MONTH_WIDTH);
  const step = MONTH_WIDTH;
  const x = (index: number) => step * (index + 0.5);
  const y = (value: number) => bottom - (value - min) / (max - min) * (bottom - top);
  const format = new Intl.NumberFormat(messages.language, percent ? { style: 'percent', maximumFractionDigits: 2 } : { style: 'currency', currency: 'CAD', currencyDisplay: 'code', maximumFractionDigits: 0 });
  const axis = new Intl.NumberFormat(messages.language, percent ? { style: 'percent', maximumFractionDigits: 1 } : { notation: 'compact', maximumFractionDigits: 1 });
  const month = (value: string) => new Intl.DateTimeFormat(messages.language, { year: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`));
  const valueLabel = (value: number | null) => value === null ? messages.netWorthUnavailable : format.format(value);
  const label = (row: MonthlyRow) => `${month(row.month)}: ${series.map((s) => `${s.label}: ${valueLabel(row[s.key])}`).join(' · ')}`;
  const activeRow = rows.find(({ month }) => month === active);
  const linePath = (key: Series['key']) => {
    let gap = true;
    return rows.map((row, index) => {
      if (row[key] === null) { gap = true; return ''; }
      const command = gap ? 'M' : 'L'; gap = false;
      return `${command}${x(index)},${y(row[key]!)}`;
    }).join(' ');
  };
  return <section className="net-worth-card net-worth-monthly-card" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>{title}</h2>
    {description && <p className="net-worth-charts-help">{description}</p>}
    <ul className="net-worth-chart-legend">{series.map((s) => <li key={s.key}>
      <span className="net-worth-swatch" style={{ background: s.color }} aria-hidden="true" />{s.label}
    </li>)}</ul>
    <div className="net-worth-chart-viewport">
      <svg className="net-worth-chart-y-axis" width="88" height="330" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((tick) => {
          const value = min + (max - min) * tick / 4;
          return <text className="net-worth-chart-axis-label" key={tick} x="78" y={y(value) + 4} textAnchor="end">{axis.format(value)}</text>;
        })}
      </svg>
      <div ref={scrollRef} className="net-worth-chart-scroll" tabIndex={0} role="region" aria-labelledby={`${id}-title`}>
      <svg width={width} height="330" viewBox={`0 0 ${width} 330`} role="img" aria-labelledby={`${id}-title`}>
        <defs><clipPath id={`${id}-plot`}><rect x="0" y={top} width={width} height={bottom - top} /></clipPath></defs>
        {[0, 1, 2, 3, 4].map((tick) => {
          const value = min + (max - min) * tick / 4;
          return <line key={tick} className="net-worth-chart-grid" x1="0" x2={width} y1={y(value)} y2={y(value)} />;
        })}
        <line className="net-worth-chart-zero" x1="0" x2={width} y1={y(0)} y2={y(0)} />
        {percent && series.map((s) => <path key={s.key} d={linePath(s.key)} clipPath={`url(#${id}-plot)`} fill="none" stroke={s.color} strokeWidth="2.5" />)}
        {rows.map((row, index) => <g key={row.month} tabIndex={0} role="img" aria-label={label(row)}
          onPointerEnter={() => setActive(row.month)} onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(row.month)} onBlur={() => setActive(null)} onClick={() => setActive(row.month)}>
          <title>{label(row)}</title>
          <rect x={x(index) - step / 2 + 2} y={top} width={step - 4} height={bottom - top} fill="currentColor" opacity={active === row.month ? 0.06 : 0} />
          {series.map((s, seriesIndex) => {
            const value = row[s.key];
            if (value === null) return null;
            const barWidth = series.length === 1 ? step * 0.72 : Math.min(18, (step - 16) / series.length);
            return percent ? <circle key={s.key} clipPath={`url(#${id}-plot)`} cx={x(index)} cy={y(value)} r={active === row.month ? 5 : 3} fill={s.color} />
              : <rect key={s.key} clipPath={`url(#${id}-plot)`} x={x(index) + (seriesIndex - series.length / 2) * barWidth + 1} y={Math.min(y(0), y(value))}
                width={barWidth - 2} height={Math.max(1, Math.abs(y(value) - y(0)))} fill={s.color} />;
          })}
          <text className="net-worth-chart-month" x={x(index)} y="306" textAnchor="middle">{month(row.month)}</text>
        </g>)}
      </svg>
      </div>
    </div>
    <p className="net-worth-chart-readout" aria-live="polite">{activeRow ? label(activeRow) : ''}</p>
    <details className="net-worth-chart-data"><summary>{messages.netWorthChartsData}</summary>
      <div className="net-worth-chart-scroll" tabIndex={0} role="region" aria-label={title}>
        <table className="net-worth-table"><caption>{title}</caption><thead><tr><th scope="col">{messages.netWorthHistoryMonth}</th>
          {series.map((s) => <th scope="col" key={s.key}>{s.label}</th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.month}><th scope="row">{month(row.month)}</th>
            {series.map((s) => <td key={s.key} className="net-worth-amount">{valueLabel(row[s.key])}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  </section>;
}
