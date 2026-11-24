import { memo, useEffect, useLayoutEffect, useId, useMemo, useRef, useState } from 'react';
import type { LocaleMessages } from '../locales/types';
import { MONTH_WIDTH, visibleChartDomain } from '../lib/netWorthChartViewport';

export type MonthlyRow = { month: string; date: string; assets: number | null; liabilities: number | null; netWorth: number | null; portfolio: number | null; growth: number | null; average: number | null };
export type MonthlySeries = { key: 'assets' | 'liabilities' | 'netWorth' | 'portfolio' | 'growth' | 'average'; label: string; color: string };
export default function MonthlyChart({ messages, title, description, rows, series, percent = false, viewport = { scrollLeft: 0, width: 720 }, registerViewport }: {
  messages: LocaleMessages; title: string; description?: string; rows: MonthlyRow[]; series: MonthlySeries[]; percent?: boolean;
  viewport?: { scrollLeft: number; width: number }; registerViewport?: (element: HTMLDivElement) => () => void;
}) {
  const id = useId();
  const [active, setActive] = useState<{ month: string; x: number; y: number; keyboard: boolean } | null>(null);
  const [popupPosition, setPopupPosition] = useState({ left: 0, top: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollingUntil = useRef(0);
  useLayoutEffect(() => {
    if (scrollRef.current && registerViewport) return registerViewport(scrollRef.current);
  }, [registerViewport]);
  const { min, max } = visibleChartDomain(rows, series.map(({ key }) => key), viewport, percent);
  const top = 16, bottom = 280;
  const width = Math.max(viewport.width, rows.length * MONTH_WIDTH);
  const step = MONTH_WIDTH;
  const x = (index: number) => step * (index + 0.5);
  const y = (value: number) => bottom - (value - min) / (max - min) * (bottom - top);
  const format = useMemo(() => new Intl.NumberFormat(messages.language, percent
    ? { style: 'percent', maximumFractionDigits: 2 }
    : { style: 'currency', currency: 'CAD', currencyDisplay: 'code', maximumFractionDigits: 0 }), [messages.language, percent]);
  const axis = useMemo(() => new Intl.NumberFormat(messages.language, percent
    ? { style: 'percent', maximumFractionDigits: 1 } : { notation: 'compact', maximumFractionDigits: 1 }), [messages.language, percent]);
  const monthFormat = useMemo(() => new Intl.DateTimeFormat(messages.language,
    { year: 'numeric', month: 'short', timeZone: 'UTC' }), [messages.language]);
  const formattedRows = useMemo(() => rows.map((row) => {
    const dateLabel = monthFormat.format(new Date(`${row.month}-01T00:00:00Z`));
    const values = Object.fromEntries(series.map(({ key }) => [key, row[key] === null ? messages.netWorthUnavailable : format.format(row[key]!)]));
    return { month: row.month, dateLabel, values,
      label: `${dateLabel}: ${series.map((s) => `${s.label}: ${values[s.key]}`).join(' · ')}` };
  }), [rows, series, monthFormat, format, messages.netWorthUnavailable]);
  const activeRow = formattedRows.find(({ month }) => month === active?.month);
  const showMonth = (month: string, index: number, pointer?: { clientX: number; clientY: number }, keyboard = false) => {
    if (pointer && performance.now() < scrollingUntil.current) return;
    const container = viewportRef.current;
    const scroller = scrollRef.current;
    if (!container || !scroller) return;
    const bounds = container.getBoundingClientRect();
    setActive({ month, keyboard,
      x: pointer ? pointer.clientX - bounds.left : scroller.getBoundingClientRect().left - bounds.left + x(index) - scroller.scrollLeft,
      y: pointer ? pointer.clientY - bounds.top : top + 40 });
  };
  useLayoutEffect(() => {
    if (!active || !popupRef.current || !viewportRef.current) return;
    const popup = popupRef.current.getBoundingClientRect();
    const container = viewportRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(active.x + 12, container.width - popup.width - 8));
    const below = active.y + 12;
    const top = Math.max(8, Math.min(below + popup.height <= container.height - 8 ? below : active.y - popup.height - 12,
      container.height - popup.height - 8));
    setPopupPosition({ left, top });
  }, [active, viewport.width]);
  const popupOpen = active !== null;
  useEffect(() => {
    if (!popupOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !viewportRef.current?.contains(event.target)) setActive(null);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [popupOpen]);
  const linePath = (key: MonthlySeries['key']) => {
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
    <div ref={viewportRef} className="net-worth-chart-viewport" onPointerLeave={() => setActive(null)}
      onKeyDown={(event) => { if (event.key === 'Escape') setActive(null); }}>
      <svg className="net-worth-chart-y-axis" width="88" height="330" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((tick) => {
          const value = min + (max - min) * tick / 4;
          return <text className="net-worth-chart-axis-label" key={tick} x="78" y={y(value) + 4} textAnchor="end">{axis.format(value)}</text>;
        })}
      </svg>
      <div ref={scrollRef} onScroll={() => {
        scrollingUntil.current = performance.now() + 120;
        if (active?.keyboard) showMonth(active.month, rows.findIndex((row) => row.month === active.month), undefined, true);
        else setActive(null);
      }} className="net-worth-chart-scroll" tabIndex={0} role="region" aria-labelledby={`${id}-title`}>
      <svg width={width} height="330" viewBox={`0 0 ${width} 330`} role="img" aria-labelledby={`${id}-title`}>
        <defs><clipPath id={`${id}-plot`}><rect x="0" y={top} width={width} height={bottom - top} /></clipPath></defs>
        {[0, 1, 2, 3, 4].map((tick) => {
          const value = min + (max - min) * tick / 4;
          return <line key={tick} className="net-worth-chart-grid" x1="0" x2={width} y1={y(value)} y2={y(value)} />;
        })}
        <line className="net-worth-chart-zero" x1="0" x2={width} y1={y(0)} y2={y(0)} />
        {percent && series.map((s) => <path key={s.key} d={linePath(s.key)} clipPath={`url(#${id}-plot)`} fill="none" stroke={s.color} strokeWidth="2.5" />)}
        {rows.map((row, index) => <g key={row.month} tabIndex={0} role="img" aria-label={formattedRows[index].label}
          aria-describedby={active?.month === row.month ? `${id}-tooltip` : undefined}
          onPointerEnter={(event) => showMonth(row.month, index, event)} onPointerMove={(event) => showMonth(row.month, index, event)}
          onFocus={() => showMonth(row.month, index, undefined, true)} onBlur={() => setActive(null)} onClick={() => showMonth(row.month, index)}>
          <rect x={x(index) - step / 2 + 2} y={top} width={step - 4} height={bottom - top} fill="currentColor" opacity={active?.month === row.month ? 0.06 : 0} />
          {series.map((s, seriesIndex) => {
            const value = row[s.key];
            if (value === null) return null;
            const barWidth = series.length === 1 ? step * 0.72 : Math.min(18, (step - 16) / series.length);
            return percent ? <circle key={s.key} clipPath={`url(#${id}-plot)`} cx={x(index)} cy={y(value)} r={active?.month === row.month ? 5 : 3} fill={s.color} />
              : <rect key={s.key} clipPath={`url(#${id}-plot)`} x={x(index) + (seriesIndex - series.length / 2) * barWidth + 1} y={Math.min(y(0), y(value))}
                width={barWidth - 2} height={Math.max(1, Math.abs(y(value) - y(0)))} fill={s.color} />;
          })}
          <text className="net-worth-chart-month" x={x(index)} y="306" textAnchor="middle">{formattedRows[index].dateLabel}</text>
        </g>)}
      </svg>
      </div>
      {activeRow && <div ref={popupRef} id={`${id}-tooltip`} className="net-worth-chart-tooltip" role="tooltip" style={popupPosition}>
        <strong>{activeRow.dateLabel}</strong>
        <dl>{series.map((s) => <div key={s.key}>
          <dt><span className="net-worth-swatch" style={{ background: s.color }} aria-hidden="true" />{s.label}</dt>
          <dd>{activeRow.values[s.key]}</dd>
        </div>)}</dl>
      </div>}
    </div>
    <MonthlyValuesTable messages={messages} title={title} titleId={`${id}-title`} rows={formattedRows} series={series} percent={percent} />
  </section>;
}

type FormattedRow = { month: string; dateLabel: string; values: Record<string, string>; label: string };

// Table content is independent of the scroll position and hover state.
const MonthlyValuesTable = memo(function MonthlyValuesTable({ messages, title, titleId, rows, series, percent }: {
  messages: LocaleMessages; title: string; titleId: string; rows: FormattedRow[]; series: MonthlySeries[]; percent: boolean;
}) {
  return (
    <details className="net-worth-chart-data"><summary>{messages.netWorthChartsData}</summary>
      <div className="net-worth-chart-scroll" tabIndex={0} role="region" aria-label={title}>
        <table className="net-worth-table" aria-labelledby={titleId}><thead><tr><th scope="col">{messages.netWorthHistoryMonth}</th>
          {series.map((s) => <th scope="col" key={s.key}><span className={percent ? 'net-worth-chart-wrapped-header' : undefined}>{s.label}</span></th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.month}><th scope="row">{row.dateLabel}</th>
            {series.map((s) => <td key={s.key} className="net-worth-amount">{row.values[s.key]}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
});
