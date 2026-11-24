export const MONTH_WIDTH = 72;

/** Include partially visible month slots; all charts share these same bounds. */
export function visibleMonthRange(count, scrollLeft, viewportWidth) {
  return {
    first: Math.min(count, Math.max(0, Math.floor(scrollLeft / MONTH_WIDTH))),
    end: Math.min(count, Math.max(0, Math.ceil((scrollLeft + viewportWidth) / MONTH_WIDTH))),
  };
}

export function visibleChartDomain(rows, keys, viewport, percent = false) {
  const { first, end } = visibleMonthRange(rows.length, viewport.scrollLeft, viewport.width);
  const values = rows.slice(first, end).flatMap((row) => keys.map((key) => row[key])).filter(Number.isFinite);
  const low = Math.min(0, ...values), high = Math.max(0, ...values);
  const span = high - low || (percent ? 0.1 : 1);
  return { min: low < 0 ? low - span * 0.08 : 0, max: high + span * 0.08 };
}

/** Synchronize native scrolling once per frame, without writing back to the
 * source (which would interrupt momentum). Ignore the resulting follower events.
 * React only needs updates when the visible month slots or viewport size change. */
export function createChartScrollCoordinator(onChange, contentWidth,
  observe = (callback) => new ResizeObserver(callback),
  frames = { request: (callback) => requestAnimationFrame(callback), cancel: (id) => cancelAnimationFrame(id) }) {
  const elements = new Map();
  let viewport = { scrollLeft: 0, width: 720 };
  let published = viewport;
  let initialized = false;
  let pendingFrame = null;
  let source = null;

  const measuredWidth = () => {
    const widths = [...elements.values()].map(({ width }) => width).filter((width) => width > 0);
    return widths.length ? Math.min(...widths) : viewport.width;
  };
  const publish = (scrollLeft, origin = null) => {
    const width = measuredWidth();
    scrollLeft = Math.max(0, Math.min(scrollLeft, Math.max(0, contentWidth - width)));
    viewport = { scrollLeft, width };
    for (const [element, entry] of elements) {
      if (element !== origin && element.scrollLeft !== scrollLeft) {
        entry.expected = scrollLeft;
        element.scrollLeft = scrollLeft;
      }
    }
    const before = visibleMonthRange(Infinity, published.scrollLeft, published.width);
    const after = visibleMonthRange(Infinity, scrollLeft, width);
    if (published.width !== width || before.first !== after.first || before.end !== after.end) {
      published = viewport;
      onChange(viewport);
    }
  };
  return {
    register(element) {
      const entry = { width: element.clientWidth, expected: viewport.scrollLeft };
      elements.set(element, entry);
      element.scrollLeft = viewport.scrollLeft;
      const onScroll = () => {
        const left = element.scrollLeft;
        if (entry.expected !== null && Math.abs(left - entry.expected) < 0.01) return;
        if (Math.abs(left - viewport.scrollLeft) < 0.01) return;
        entry.expected = null;
        source = element;
        if (pendingFrame === null) pendingFrame = frames.request(() => {
          pendingFrame = null;
          const origin = source;
          source = null;
          if (elements.size) publish(origin?.scrollLeft ?? viewport.scrollLeft, origin);
        });
      };
      const measure = () => {
        if (!elements.has(element)) return;
        const atEnd = !source && Math.abs(viewport.scrollLeft - Math.max(0, contentWidth - viewport.width)) < 0.01;
        entry.width = element.clientWidth;
        if (!initialized && entry.width > 0) {
          initialized = true;
          publish(Math.max(0, contentWidth - entry.width));
        } else publish(atEnd ? Math.max(0, contentWidth - measuredWidth())
          : source?.scrollLeft ?? viewport.scrollLeft, source);
      };
      const observer = observe(measure);
      element.addEventListener('scroll', onScroll, { passive: true });
      observer.observe(element);
      measure();
      return () => {
        element.removeEventListener('scroll', onScroll);
        observer.disconnect();
        elements.delete(element);
        if (source === element) source = null;
        if (!elements.size && pendingFrame !== null) {
          frames.cancel(pendingFrame);
          pendingFrame = null;
        }
      };
    },
  };
}
