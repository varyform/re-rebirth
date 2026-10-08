// Immediate-mode hit regions: drawing code registers interactive shapes while it
// paints, capturing the current transform, so hit areas always match the pixels
// on screen. The list is rebuilt on every render; later regions win.

const regions = [];
let pressedKey = null;

function add(ctx, test, handler) {
  regions.push({ inverse: ctx.getTransform().inverse(), test, handler });
}

export const hits = {
  clear() {
    regions.length = 0;
  },

  rect(ctx, x, y, w, h, handler) {
    add(ctx, (p) => p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h, handler);
  },

  circle(ctx, cx, cy, r, handler) {
    add(ctx, (p) => (p.x - cx) ** 2 + (p.y - cy) ** 2 <= r * r, handler);
  },

  // (x, y) in canvas backing-store pixels. Returns the region and the point in its local units.
  find(x, y) {
    for (let i = regions.length - 1; i >= 0; i--) {
      const region = regions[i];
      const p = region.inverse.transformPoint({ x, y });
      if (region.test(p)) return { region, p };
    }
    return null;
  },

  // Momentary visual feedback for the control currently held down.
  press(key) {
    pressedKey = key ?? null;
  },

  isPressed(key) {
    return pressedKey !== null && pressedKey === key;
  },
};
