# Changelog

## Unreleased

### New
- **Compressor screen.** The compressor shows its curve, redrawn as you turn AMOUNT and THRESHOLD, with a glowing dot riding it at the music's level, plus the last few seconds of gain reduction scrolling past.

### Sound
- **Bass lines rebuilt from measurements.** A ReBirth test song with one bass setting per bar gave the new voice:
  - The cutoff knob covers ReBirth's darker, narrower range.
  - Resonance peaks get sharper the higher the filter sits, and they no longer make the bass quieter.
  - Env mod lowers the resting cutoff as it widens the sweep.
  - The decay knob ranges from a click to a two-second fall.
  - Accent adds its own short sweep and a punch that lasts one step.
  - Notes are shorter: the gate is half a step, with a soft release.
  - Slides are quicker.
  - The square wave is ReBirth's slightly lopsided pulse.
  - More of the low fundamental comes through.
- **Effects measured against ReBirth.** A second test song ran a steady tone through every effect setting:
  - Delay: echoes now land on ReBirth's timing. Steps count sixteenths, and the triplet mode counts eighth-note triplets, so the classic 3-step delay is a dotted eighth again. Feedback halves each repeat at 64 and repeats forever at full, echoes keep their tone, and the send is gentler.
  - Distortion: shape 0 is ReBirth's 1.5-mode hard clipper; higher shapes fold the wave over more and more. Amount drives harder, up to +24 dB, without evening out the level.
  - Compressor: threshold works the right way round (turning it down compresses more, as on ReBirth), with ReBirth's ratio, knee and makeup gain. It's our own compressor now: like ReBirth's it follows the average level rather than peaks, with ReBirth's attack and release, so drum-heavy mixes are no longer squashed and transients survive.
  - Pattern filter: ReBirth's frequency range (about 10 Hz to 14 kHz) and resonance, with the lowpass getting quieter and the bandpass louder as resonance rises. Each step of the wave throws the filter up to 9.5 octaves (at full amount) and it falls back at the decay knob's rate, from a blip to a hold at full decay.
  - Channel faders follow ReBirth's curve: even steps in dB, so lower settings are much quieter than before.

### Fixed
- Old ReBirth 2.0 songs with no compressor assigned no longer play with it on the master (TGV's KiloMix '98 was squashed).
- The pattern filter lands on the right channel in ReBirth 2.0.1 songs (it was one channel off).
- Song automation lands exactly on its step instead of up to a step early.

## 0.3.0 — 2026-10-09

### New
- **Channel strips.** Like on ReBirth, every instrument has its own mix strip right next to it: on switch, pan, delay send, a level fader with separate left and right meters, and DIST / PCF / COMP buttons.
- **Master module.** Master fader with left/right meters, delay return and its own COMP button. The COMP buttons work as one group, so it's always visible where the single compressor sits (click the lit one to switch it off).
- **VU needles and spectrum.** The master shows two backlit analogue VU meters; click them to switch to a spectrum display and back.
- **Home screen icon.** "Add to Home Screen" on iPhone and iPad (and installing on Android or desktop Chrome) now gets a proper icon, and the app opens full screen without the browser bars.

### Changed
- Bass lines are a little more compact; Drum 08 got the room so its stacked knob labels no longer overlap.
- Effect modules have a brushed grey finish and new places: pattern filter beside Bass Line 2, compressor beside Drum 09.
- Mute and solo buttons are gone; each channel strip has an on switch instead.
- Opening a ReBirth 2.0.1 song whose compressor is unassigned no longer puts it on the master.

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
