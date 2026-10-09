// Analogue VU meter: backlit face, arc scale from -20 to +3 VU with a red zone
// above 0, and a needle pivoting below the face. `value` is needle travel 0..1,
// laid out linear in amplitude like a real VU scale (see AudioEngine.updateVu).
import { line, rrect, text, vgrad } from './primitives.js';
import { C } from './theme.js';

const SWEEP = Math.PI / 2; // needle travel, centred on vertical
const MARKS = [-20, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3];
const LABELS = { '-20': '20', '-10': '10', '-7': '7', '-5': '5', '-3': '3', 0: '0', 3: '+3' };
const travel = (vu) => (10 ** (vu / 20) - 0.1) / (10 ** (3 / 20) - 0.1);

export function vuMeter(ctx, x, y, w, h, value, label) {
  // Bezel and face
  rrect(ctx, x - 1.5, y - 1.5, w + 3, h + 3, 3.5);
  ctx.fillStyle = '#050506';
  ctx.fill();
  rrect(ctx, x, y, w, h, 2.5);
  ctx.fillStyle = vgrad(ctx, y, y + h, C.vuFace);
  ctx.fill();

  ctx.save();
  rrect(ctx, x, y, w, h, 2.5);
  ctx.clip();
  const cx = x + w / 2;
  const R = Math.min(w * 0.62, h * 1.25); // arc radius
  const py = y + h * 0.18 + R; // pivot, below the face
  const at = (t, r) => {
    const a = -Math.PI / 2 - SWEEP / 2 + SWEEP * t;
    return [cx + Math.cos(a) * r, py + Math.sin(a) * r];
  };
  const arc = (t0, t1, r) => {
    ctx.beginPath();
    ctx.arc(cx, py, r, -Math.PI / 2 - SWEEP / 2 + SWEEP * t0, -Math.PI / 2 - SWEEP / 2 + SWEEP * t1);
    ctx.stroke();
  };

  // Scale: main arc, red zone, ticks and numbers
  const rs = R * 0.9;
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = C.vuInk;
  arc(0, travel(0), rs);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = C.vuRed;
  arc(travel(0), 1, rs + 1.2);
  for (const vu of MARKS) {
    const t = travel(vu);
    const major = vu in LABELS;
    ctx.strokeStyle = vu > 0 ? C.vuRed : C.vuInk;
    ctx.lineWidth = major ? 1 : 0.7;
    line(ctx, ...at(t, rs), ...at(t, rs + (major ? 4 : 2.5)));
    if (major) {
      const [tx, ty] = at(t, rs + 9);
      text(ctx, LABELS[vu], tx, ty, { size: 5.5, weight: 800, color: vu > 0 ? C.vuRed : C.vuInk });
    }
  }
  text(ctx, 'VU', cx, y + h - 13, { size: 8, weight: 900, color: C.vuInk, spacing: 1 });
  text(ctx, label, x + 7, y + h - 7, { size: 6, weight: 800, align: 'left', color: C.vuInk });

  // Needle with a soft shadow
  const t = Math.max(-0.02, Math.min(1.03, value));
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(60,35,0,0.25)';
  ctx.lineWidth = 1.6;
  const [nx, ny] = at(t, R * 0.98);
  line(ctx, cx + 1.5, py + 1.5, nx + 1.5, ny + 1.5);
  ctx.strokeStyle = C.vuNeedle;
  ctx.lineWidth = 1.1;
  line(ctx, cx, py, ...at(t, R * 0.98));

  // Glass: a faint top glare and an inner shadow
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x, y, w, h * 0.22);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  rrect(ctx, x, y, w, h, 2.5);
  ctx.stroke();
  ctx.restore();
}
