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

/** Pixel synchronization also covers native keyboard scrolling and focus.
 * Equality guards absorb the scroll events triggered on the other charts. */
export function createChartScrollCoordinator(onChange, contentWidth, observe = (callback) => new ResizeObserver(callback)) {
  const elements = new Set();
  let viewport = { scrollLeft: 0, width: 720 };
  let initialized = false;
  const publish = (scrollLeft) => {
    const widths = [...elements].map((element) => element.clientWidth).filter((width) => width > 0);
    const width = widths.length ? Math.min(...widths) : viewport.width;
    for (const element of elements) {
      if (element.scrollLeft !== scrollLeft) element.scrollLeft = scrollLeft;
    }
    if (viewport.scrollLeft !== scrollLeft || viewport.width !== width) {
      viewport = { scrollLeft, width };
      onChange(viewport);
    }
  };
  return {
    register(element) {
      elements.add(element);
      element.scrollLeft = viewport.scrollLeft;
      const onScroll = () => publish(element.scrollLeft);
      const measure = () => {
        if (!initialized && element.clientWidth > 0) {
          initialized = true;
          publish(Math.max(0, contentWidth - element.clientWidth));
        } else publish(element.scrollLeft);
      };
      const observer = observe(measure);
      element.addEventListener('scroll', onScroll, { passive: true });
      observer.observe(element);
      measure();
      return () => {
        element.removeEventListener('scroll', onScroll);
        observer.disconnect();
        elements.delete(element);
      };
    },
  };
}
