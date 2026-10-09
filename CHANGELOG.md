# Changelog

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
