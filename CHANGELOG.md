# Changelog

## Unreleased

### New
- **Home screen icon.** "Add to Home Screen" on iPhone and iPad (and installing on Android or desktop Chrome) now gets a proper icon, and the app opens full screen without the browser bars.

## 0.2.0 — 2026-10-09

### New
- **DRUM 08 voice switches.** LT/LC, MT/MC, HT/HC, RS/CL and CP/MA switch the toms to congas, the rim shot to claves and the clap to maracas, like on ReBirth. Songs that use the alternate voices now play them.

### Sound
- Both drum machines measured voice by voice against a ReBirth test song that plays every sound alone: DRUM 08 snare (two pure drum heads, tone balances them), real toms next to the congas, cowbell, cymbal and open hat ring out much longer, closed hat brighter. DRUM 09 snare (pitch follows tune, longer tail), kick tune (the sweep always starts high, tune sets its speed), softer kick click, longer toms, cymbals and clap tail.
- Pan follows ReBirth's law: hard left/right is fully one side, and moderate settings are wider than before.

## 0.1.0 — 2026-10-09

### New
- **Automation window.** The new AUTOMATION button in the song section shows every recorded control of the song as a graph over time, grouped by device. Knob moves show as stepped lines, switches as lit blocks and pattern changes as labelled blocks. Drag or scroll to pan, pinch (or ctrl+scroll) or +/− to zoom, and click the bar ruler to jump there. Each lane shows its value at the playhead.
- **All lanes on the drum machines.** ALL LANES in a drum machine's header shows every instrument of the pattern as one grid instead of one step row at a time. Click or drag to paint steps across lanes. On DRUM 09, shift-click still cycles on / accent / flam. Click a lane name to hear it; the selected instrument's knobs stay next to the grid.
- **Example song built in.** The About window (click the logo) can load TGV's KiloMix '98 (by T.G.ViRUS, made for ReBirth 2.0) directly, so there's no file to pass around.

### Sound
- Bass lines measured against ReBirth's per-channel exports: darker filter range and envelope, fuller low end, and a level that sits right without the old −4 dB trim.
- DRUM 09 kick follows its tune knob like ReBirth's (a high tune starts the sweep much higher), keeps its low tail and has no click at attack 0. The clap's tail is softer.
- DRUM 08 kick clicks less at full tone.

### Faster
- Finished drum hits and unused effects no longer keep running, so long sessions use less CPU.

## 0.0.1

First version: two bass lines, DRUM 08 and DRUM 09, mixer with delay, distortion, compressor and pattern-controlled filter, pattern and song modes with recording, ReBirth 2.0 song import (.rbs), autosave and save/open, a rack that fills the window, and iOS support.
