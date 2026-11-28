// One reversible timeline shared by the hand rig, framing and orchard reveal.
// Progress is the smoothed scroll position; no phase relies on elapsed time.
const smooth = (value, start, end) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
};

export function journeyAt(progress) {
  const focus = smooth(progress, 0.02, 0.72);
  return {
    reach: smooth(progress, 0, 0.70),
    focus,
    zoom: 1 + focus * 0.28,
    gesture: smooth(progress, 0.76, 0.92),
    settle: smooth(progress, 0.74, 0.96),
    textDissolve: smooth(progress, 0.015, 0.34),
    orchardOpacity: 1 - smooth(progress, 0.78, 0.91),
    divineLight: smooth(progress, 0.015, 0.38),
    pointerWeight: 1 - smooth(progress, 0.32, 0.76),
  };
}
