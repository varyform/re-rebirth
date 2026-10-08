// Mixer channels: [device id, panel label]. Shared by the renderer and the audio graph.
export const CHANNELS = [
  ['bass1', 'BASS 1'],
  ['bass2', 'BASS 2'],
  ['r808', 'DRUM 08'],
  ['r909', 'DRUM 09'],
];

// Insert-effect routing targets, as shown on the target readouts.
export const TARGETS = [...CHANNELS.map(([, label]) => label), 'MASTER'];
