// Raw palette for the canvas renderer — the only place literal colors live.

export const C = {
  rackBg: '#09090a',
  rail: ['#1b1c1f', '#5a5c61', '#3a3c40', '#18191c'],
  railHole: '#050506',

  inkLight: '#e9e9ec',
  inkMuted: '#8d929c',

  ledRed: '#ff2a1a',
  ledOrange: '#ff8a1a',
  ledGreen: '#5dff4a',
  ledYellow: '#ffd21a',

  lcd: ['#0b0605', '#170c09'],
  lcdOn: '#ff4326',
  lcdOff: 'rgba(255,67,38,0.08)',
  lcdGreen: ['#060d07', '#0b170c'],
  lcdGreenOn: '#79ff63',
  lcdGreenDim: '#2f6a28',
  lcdGreenMid: '#5fbf52',

  transport: ['#33363d', '#1c1e23'],
  btnDark: ['#56595f', '#2a2c31'],
  btnPressed: ['#2a2c31', '#3c3f45'],

  fx: ['#3a3f4a', '#22252c'],
  fxTitle: ['#17191d', '#0f1013'],
  mixer: '#d9dce3',
  delay: '#4fb3ff',
  dist: '#ff7a2f',
  comp: '#5fe08a',
  pcf: '#c08bff',
  faderCap: ['#f2f3f5', '#9a9ea6', '#c9ccd2'],

  bassPanel: ['#e6e8eb', '#b4b8be'],
  bassHeader: ['#26272a', '#121315'],
  bassSeq: ['#2c2d31', '#151618'],
  bassInk: '#1b1b1e',
  bassAccent: '#ff6a1a',
  bassNote: '#ffb347',
  bassNoteAccent: '#fff1c9',
  bassNoteOff: '#5a4730',
  bassCell: '#0b0b0a',
  bassPad: ['#5b5d63', '#34363b'],
  bassPadOn: ['#ffc08a', '#ff6a1a'],

  r808Steps: ['#e8371f', '#f28c1c', '#f4d03a', '#efe9d8'],

  logo: ['#ffffff', '#c9ccd2', '#7d828c', '#dfe2e8'],

  // Automation / grid windows
  screen: ['#0b0c0f', '#12141a'],
  lanes: { bass1: '#ffb347', bass2: '#ff6a1a', r808: '#f4d03a', r909: '#ef6a1d', mixer: '#d9dce3', fx: '#c08bff' },
  cellOff: 'rgba(255,255,255,0.07)',
};

// Knob looks. `pointers`: [color, fromRadius, toRadius, widthRatio].
export const KNOB = {
  bass: {
    body: ['#4d4d4f', '#0c0c0d'],
    knurl: 'rgba(255,255,255,0.10)',
    cap: ['#f4f5f7', '#8f9399'],
    capRatio: 0.56,
    pointers: [
      ['#141414', 0.08, 0.5, 0.11],
      ['#f2f2f2', 0.64, 0.95, 0.12],
    ],
    tick: '#2a2a2d',
  },
  r808: {
    body: ['#3c3b39', '#060606'],
    knurl: 'rgba(255,255,255,0.08)',
    cap: ['#2d2c2a', '#0d0d0c'],
    capRatio: 0.7,
    pointers: [['#ff8a1a', 0.22, 0.95, 0.15]],
    tick: '#bdb6a6',
  },
  r909: {
    body: ['#f1f1ee', '#8a8b86'],
    knurl: 'rgba(0,0,0,0.12)',
    cap: ['#fafaf8', '#b9bab5'],
    capRatio: 0.64,
    pointers: [['#1a1a1a', 0.18, 0.92, 0.13]],
    tick: '#2b2b2b',
  },
  fx: {
    body: ['#5f6574', '#14161b'],
    knurl: 'rgba(255,255,255,0.08)',
    cap: ['#30343e', '#121419'],
    capRatio: 0.68,
    pointers: [['#e9e9ec', 0.22, 0.95, 0.15]],
    tick: '#9aa1b0',
  },
};

export const SELECTOR = {
  bass: { ink: '#1b1b1e', face: ['#4a4c51', '#222326'], text: '#ececec', led: '#ff2a1a' },
  r808: { ink: '#ece5d3', face: ['#4c4a46', '#22211f'], text: '#ece5d3', led: '#ff2a1a' },
  r909: { ink: '#cfd0cb', face: ['#efefeb', '#b5b6b1'], text: '#1d1d1d', led: '#ff7a1a' },
};
