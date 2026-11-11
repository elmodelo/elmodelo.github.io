// Keep the panel outside the row and inside the visible viewport. If neither
// side fits its full height, use the larger side and let the panel scroll.
// The anchor uses the row's vertical bounds and the Category cell's right edge.
export function getAnchoredPanelPosition(anchor, panel, viewport, gap = 8, margin = 12) {
  const topEdge = viewport.top + margin;
  const bottomEdge = viewport.top + viewport.height - margin;
  const below = Math.max(0, bottomEdge - anchor.bottom - gap);
  const above = Math.max(0, anchor.top - gap - topEdge);
  const placeBelow = panel.height <= below || (panel.height > above && below >= above);
  const maxHeight = placeBelow ? below : above;
  const height = Math.min(panel.height, maxHeight);
  return {
    left: Math.max(viewport.left + margin, Math.min(anchor.right - panel.width, viewport.left + viewport.width - margin - panel.width)),
    top: placeBelow ? anchor.bottom + gap : anchor.top - gap - height,
    maxHeight,
  };
}
