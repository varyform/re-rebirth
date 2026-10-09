import { hits } from './hits.js';

// Routes pointer/wheel events on the canvas to hit-region handlers.
export function attachPointer(canvas, onChange) {
  let session = null;

  const devicePoint = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * canvas.width) / r.width, y: ((e.clientY - r.top) * canvas.height) / r.height };
  };
  const find = (e) => {
    const { x, y } = devicePoint(e);
    return hits.find(x, y);
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const hit = find(e);
    if (!hit) return;
    e.preventDefault();
    const handler = hit.region.handler;
    // `redraw` lets handlers that act on a timer (held buttons) refresh the view.
    const s = handler.down?.({ p: hit.p, p0: hit.p, prev: hit.p, ddy: 0, fine: e.shiftKey, redraw: onChange });
    if (s) {
      session = { s, region: hit.region, p0: hit.p, prev: hit.p, lastY: e.clientY };
      hits.press(handler.key);
      canvas.setPointerCapture(e.pointerId);
    }
    onChange();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!session) {
      canvas.style.cursor = find(e)?.region.handler.cursor ?? 'default';
      return;
    }
    if (!session.s.move) return;
    const { x, y } = devicePoint(e);
    const p = session.region.inverse.transformPoint({ x, y });
    session.s.move({ p, p0: session.p0, prev: session.prev, ddy: e.clientY - session.lastY, fine: e.shiftKey });
    session.prev = p;
    session.lastY = e.clientY;
    onChange();
  });

  const end = () => {
    if (!session) return;
    session.s.up?.();
    session = null;
    hits.press(null);
    onChange();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('dblclick', (e) => {
    const handler = find(e)?.region.handler;
    if (!handler?.dblclick) return;
    handler.dblclick();
    onChange();
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      const hit = find(e);
      const handler = hit?.region.handler;
      if (!handler?.wheel) return;
      e.preventDefault();
      // Shift+wheel arrives as horizontal scroll in most browsers. dx/dy/zoom are
      // for views that pan; a trackpad pinch arrives as ctrl+wheel.
      handler.wheel({ delta: e.deltaY || e.deltaX, dx: e.deltaX, dy: e.deltaY, zoom: e.ctrlKey, fine: e.shiftKey, p: hit.p });
      onChange();
    },
    { passive: false },
  );
}
