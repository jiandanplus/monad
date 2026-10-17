/** The renderer and input share the exact top-down 3 × 3 region geometry. */
export function createLayout(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
        throw new RangeError('Positive finite dimensions required');
    const padding = Math.min(14, width * .025, height * .025);
    return { width, height, left: padding, top: padding, cellW: (width - padding * 2) / 3, cellH: (height - padding * 2) / 3 };
}
export function districtCenter(layout, index) {
    if (!Number.isInteger(index) || index < 0 || index > 8)
        throw new RangeError('District 0..8 required');
    return { x: layout.left + (index % 3 + .5) * layout.cellW, y: layout.top + (Math.floor(index / 3) + .5) * layout.cellH };
}
export function pickDistrict(layout, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y))
        return null;
    const column = Math.floor((x - layout.left) / layout.cellW), row = Math.floor((y - layout.top) / layout.cellH);
    return column >= 0 && column < 3 && row >= 0 && row < 3 ? row * 3 + column : null;
}

/** Keep historical logs out of effects, even when a wallet switch clears its snapshot. */
export function createActivityGate() {
  let scope = null;
  const seen = new Set();
  return {
    ingest(nextScope, newestFirstEvents, enabled) {
      const primed = scope === nextScope;
      if (!primed) { scope = nextScope; seen.clear(); }
      const effects = [];
      for (const event of [...newestFirstEvents].reverse()) {
        if (primed && enabled && !seen.has(event.hash)) effects.push(event);
        seen.add(event.hash);
      }
      return effects;
    },
  };
}
