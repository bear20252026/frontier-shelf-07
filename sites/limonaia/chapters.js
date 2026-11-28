const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t=clamp(value); return t*t*(3-2*t); };

// Keep the reach intact, with a short, readable gesture hold before the burn.
export function chaptersAt(scrollScreens) {
  return {
    opening: smooth(scrollScreens/2.1),
    transition: smooth((scrollScreens-2.20)/1.20),
    fall: smooth((scrollScreens-3.20)/1.70),
  };
}
