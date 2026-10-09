import { songBars, TICKS_PER_BAR } from '../../song/song.js';
import { hits } from '../../ui/hits.js';
import { click, release, repeat } from '../../ui/handlers.js';
import { openAbout } from '../about.js';
import { Knob } from '../controls.js';
import { drawLogo, LOGO_W } from '../logo.js';
import { brushed, button, icon, lcd, led, MONO, panel, screws, sevenSeg, sevenSegWidth, text } from '../primitives.js';
import { C, KNOB } from '../theme.js';

const LABEL = { size: 6, color: C.inkMuted, spacing: 1 };
const BUTTONS = [
  ['rew', 'REW'],
  ['ff', 'FF'],
  ['stop', 'STOP'],
  ['play', 'PLAY'],
  ['rec', 'REC'],
];
const SONG_X = 214;
const SONG_W = 250;

const BASE_H = 72;

export class Transport {
  constructor(state, app, x, y, w, h) {
    Object.assign(this, { state, app, x, y, w, h });
    const { clock } = app;
    this.actions = {
      rew: (bars) => clock.seekBar(-bars),
      ff: (bars) => clock.seekBar(bars),
      stop: () => clock.stop(),
      play: () => clock.play(),
      rec: () => clock.setRec(!state.transport.rec),
    };
    state.define('master.volume', 0.8);
    state.define('song.shuffle', 0.5);
    this.master = new Knob({ x: w - 30, y: 37, r: 14, param: 'master.volume', label: 'MASTER', style: KNOB.fx });
    this.shuffle = new Knob({ x: 494, y: 34, r: 13, param: 'song.shuffle', label: 'SHUFFLE', style: KNOB.fx });
  }

  draw(ctx) {
    const { w, h, state } = this;
    const t = state.transport;

    panel(ctx, 0, 0, w, h, C.transport);
    brushed(ctx, 0, 0, w, h, 0.35);
    screws(ctx, w, h, 7, 8);
    // Controls are laid out for the base height; a taller bar centres them.
    ctx.save();
    ctx.translate(0, Math.max(0, (h - BASE_H) / 2));
    drawLogo(ctx, 20, 38);
    hits.rect(ctx, 16, 14, LOGO_W, 40, { ...click(() => openAbout(state)), cursor: 'pointer' });
    this.drawSong(ctx);
    this.shuffle.draw(ctx, state);

    // The control cluster is laid out for a 772-wide bar; keep it beside the master knob.
    ctx.save();
    ctx.translate(w - 772, 0);

    // Tempo readout + nudge buttons
    text(ctx, 'TEMPO', 292, 12, LABEL);
    lcd(ctx, 240, 19, 104, 40);
    const tempo = t.tempo.toFixed(1).padStart(5, ' ');
    sevenSeg(ctx, tempo, 240 + (104 - sevenSegWidth(tempo, 15)) / 2, 26, 15, 26);
    hits.rect(ctx, 240, 19, 104, 40, this.tempoDrag());
    this.nudgeButton(ctx, 'up', 19, 1);
    this.nudgeButton(ctx, 'down', 40, -1);

    // Song position (bar.step)
    text(ctx, t.mode === 'song' ? 'SONG POSITION' : 'PATTERN POSITION', 430, 12, LABEL);
    lcd(ctx, 380, 19, 100, 40);
    const pos = `${String(t.bar).padStart(3, '0')}.${String(Math.max(0, t.step) + 1).padStart(2, '0')}`;
    sevenSeg(ctx, pos, 380 + (100 - sevenSegWidth(pos, 12)) / 2, 28, 12, 22);

    // Transport buttons
    const lights = { play: [t.playing, C.ledGreen], stop: [!t.playing, C.ledRed], rec: [t.rec, C.ledRed] };
    BUTTONS.forEach(([kind, label], i) => {
      const bx = 492 + i * 34;
      const key = `transport.${kind}`;
      const active = lights[kind]?.[0] ?? false;
      const held = active || hits.isPressed(key);
      const off = button(ctx, bx, 24, 30, 26, { face: held ? C.btnPressed : C.btnDark, pressed: held });
      // REW / FF repeat while held, speeding up; the rest act once per click.
      const seeks = kind === 'rew' || kind === 'ff';
      hits.rect(ctx, bx, 24, 30, 26, seeks ? repeat(this.actions[kind], key) : click(this.actions[kind], key));
      const iconColor = kind === 'rec' ? C.ledRed : kind === 'play' && t.playing ? C.ledGreen : C.inkLight;
      icon(ctx, kind, bx + 15, 37 + off, 10, iconColor);
      text(ctx, label, bx + 15, 61, LABEL);
      if (lights[kind]) led(ctx, bx + 15, 15, 2.4, active, lights[kind][1]);
    });

    // Play mode
    text(ctx, 'MODE', 691, 12, LABEL);
    led(ctx, 671, 26, 2.4, t.mode === 'pattern', C.ledYellow);
    text(ctx, 'PATTERN', 677, 26.5, { ...LABEL, align: 'left', spacing: 0.3, color: C.inkLight });
    led(ctx, 671, 38, 2.4, t.mode === 'song', C.ledYellow);
    text(ctx, 'SONG', 677, 38.5, { ...LABEL, align: 'left', spacing: 0.3, color: C.inkLight });
    const modeOff = button(ctx, 666, 48, 50, 13, { pressed: hits.isPressed('transport.mode') });
    text(ctx, 'SELECT', 691, 55 + modeOff, { ...LABEL, size: 5.5 });
    const nextMode = () => this.app.clock.setMode(t.mode === 'pattern' ? 'song' : 'pattern');
    hits.rect(ctx, 666, 48, 50, 13, click(nextMode, 'transport.mode'));
    ctx.restore();

    this.master.draw(ctx, state);
    ctx.restore();
  }

  // Song name + arrangement status, file buttons, loop switch.
  drawSong(ctx) {
    const { state } = this;
    const { info, song, transport: t } = state;
    text(ctx, 'SONG', SONG_X, 12, { ...LABEL, align: 'left' });
    lcd(ctx, SONG_X, 19, SONG_W, 22, C.lcdGreen);
    const name = (info.title || info.file || 'UNTITLED').toUpperCase();
    const fit = name.length > 40 ? `${name.slice(0, 39)}\u2026` : name;
    text(ctx, fit, SONG_X + 5, 25.5, { size: 6.5, weight: 700, family: MONO, align: 'left', color: C.lcdGreenOn });
    const bars = songBars(song);
    const status = bars
      ? `${t.mode === 'song' ? 'SONG' : 'PATTERN'} MODE \u00B7 ${bars} BARS${t.loop ? ` \u00B7 LOOP ${song.loopStart / TICKS_PER_BAR + 1}-${song.loopEnd / TICKS_PER_BAR}` : ''}`
      : t.mode === 'song'
        ? 'EMPTY SONG \u00B7 ARM REC TO RECORD'
        : 'PATTERN MODE \u00B7 NO SONG';
    const notice = state.notice && performance.now() < state.notice.until ? state.notice.text : null;
    const line2 = notice ? (notice.length > 52 ? `${notice.slice(0, 51)}\u2026` : notice) : status;
    text(ctx, line2, SONG_X + 5, 34.5, { size: 5.5, family: MONO, align: 'left', color: notice ? C.lcdGreenOn : C.lcdGreenMid });

    const files = this.app.files;
    // OPEN and SAVE open system UI, so they fire on release (see `release`).
    const buttons = [
      ['NEW', () => files.newSong(), click],
      ['OPEN', () => files.pick(), release],
      ['SAVE', () => files.save(), release],
    ];
    buttons.forEach(([label, fn, handler], i) => {
      const bx = SONG_X + i * 46;
      const key = `song.${label}`;
      const off = button(ctx, bx, 47, 42, 15, { pressed: hits.isPressed(key) });
      text(ctx, label, bx + 21, 55 + off, { size: 6, weight: 800, color: C.inkLight, spacing: 0.6 });
      hits.rect(ctx, bx, 47, 42, 15, handler(fn, key));
    });
    const lx = SONG_X + 3 * 46;
    const off = button(ctx, lx, 47, 42, 15, { pressed: t.loop, face: t.loop ? C.btnPressed : C.btnDark });
    icon(ctx, 'loop', lx + 11, 54.5 + off, 8, t.loop ? C.ledYellow : C.inkLight);
    text(ctx, 'LOOP', lx + 27, 55 + off, { size: 6, weight: 800, color: C.inkLight, spacing: 0.6 });
    hits.rect(ctx, lx, 47, 42, 15, click(() => (t.loop = !t.loop)));
    text(ctx, 'DROP .RBS / .JSON', SONG_X + 4 * 46 + 4, 55, { size: 5, align: 'left', color: C.inkMuted, spacing: 0.4 });
  }

  nudgeButton(ctx, dir, y, sign) {
    const key = `transport.tempo.${dir}`;
    const off = button(ctx, 349, y, 16, 19, { pressed: hits.isPressed(key) });
    icon(ctx, dir, 357, y + 9.5 + off, 6, C.inkLight);
    hits.rect(ctx, 349, y, 16, 19, click((ev) => this.state.setTempo(this.state.transport.tempo + sign * (ev.fine ? 0.1 : 1)), key));
  }

  // Drag the readout: 2 px per BPM, shift for 0.1 steps.
  tempoDrag() {
    const { state } = this;
    const nudge = (amount) => state.setTempo(state.transport.tempo + amount);
    return {
      cursor: 'ns-resize',
      down: () => {
        let acc = 0;
        return {
          move: (ev) => {
            acc -= ev.ddy / (ev.fine ? 20 : 2);
            const whole = Math.trunc(acc);
            if (!whole) return;
            acc -= whole;
            nudge(whole * (ev.fine ? 0.1 : 1));
          },
        };
      },
      wheel: (ev) => nudge(-Math.sign(ev.delta) * (ev.fine ? 0.1 : 1)),
    };
  }

}
