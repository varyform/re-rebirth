// Mixer channels: [device id, panel label]. Shared by the renderer and the audio graph.
export const CHANNELS = [
  ['bass1', 'BASS 1'],
  ['bass2', 'BASS 2'],
  ['r808', 'DRUM 08'],
  ['r909', 'DRUM 09'],
];

const LABELS = CHANNELS.map(([, label]) => label);

// Heard: machine on, channel not muted.
export const audibleChannel = (state, id) => state.on01(`${id}.on`) && !state.on01(`mixer.${id}.mute`);

// Solo is no mode of its own: it switches the other machines off, so what you
// see on their ON lights is what you hear. Soloing the one machine that's on
// brings back the ones it switched off (or all of them, if it didn't).
const onKey = (id) => `${id}.on`;
export const isSolo = (state, id) => CHANNELS.every(([c]) => state.on01(onKey(c)) === (c === id));

export function toggleSolo(state, id) {
  const ids = CHANNELS.map(([c]) => c);
  if (isSolo(state, id)) {
    const before = state.ui.soloBefore?.id === id ? state.ui.soloBefore.on : null;
    for (const c of ids) state.set(onKey(c), before ? before[c] : 1);
    state.ui.soloBefore = null;
    return;
  }
  state.ui.soloBefore = { id, on: Object.fromEntries(ids.map((c) => [c, state.get(onKey(c))])) };
  for (const c of ids) state.set(onKey(c), c === id ? 1 : 0);
}

// Routing choices for the single-instance effects, stored as choice params.
export const COMP_TARGETS = ['MASTER', ...LABELS];
export const PCF_TARGETS = ['OFF', ...LABELS];
