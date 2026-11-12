// Draw the dimming layer with transparent holes over visible target rows.
// Clipping keeps scrolled rows from punching holes through the sticky header
// or other parts of the dashboard.
export function getCategorizeBackdrop(viewport, rows, clip) {
  const { width, height } = viewport;
  const holes = rows.flatMap((row) => {
    const left = Math.max(0, clip.left, row.left);
    const right = Math.min(width, clip.right, row.right);
    const top = Math.max(0, clip.top, row.top);
    const bottom = Math.min(height, clip.bottom, row.bottom);
    return right > left && bottom > top ? [`M${left} ${top}H${right}V${bottom}H${left}Z`] : [];
  });
  const path = `M0 0H${width}V${height}H0Z${holes.join('')}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><path fill="black" fill-opacity=".25" fill-rule="evenodd" d="${path}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
