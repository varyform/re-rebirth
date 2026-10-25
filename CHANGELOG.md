# Changelog

## Unreleased

### Fixed
- **Bass lines no longer play notes ReBirth leaves silent:** in ReBirth songs, a step after a rest that carries a slide was read as a held note and played. It's a rest, as in ReBirth. Heard in TGV's KiloMix '98 (bass line 1 from bar 65), Voodoo Ray and a few other songs.

## 0.7.1 — 2026-10-24

### New
- **Song progress in the rack:** in song mode the SONG display fills as the song plays, with a line along its bottom showing where you are (and the loop, in yellow, when it's on). Click or drag across the display to jump to that bar.

## 0.7.0 — 2026-10-12

### New
- **Save as a ReBirth song (.rbs):** ⌘/Ctrl ⇧ S, Shift-click SAVE in the rack, or SAVE .RBS in the EXPORT window. Patterns, the arrangement, every knob and its automation, mixer and effects go into a ReBirth 2.0.1 file that ReBirth (and Re-Rebirth) can open. What the format has no room for (the bass lines' volume knobs, the delay return) is named in the notice. Saved songs are named after the file they came from, not their title, which in ReBirth songs is often a credit.

## 0.6.0 — 2026-10-11

### New
- **Keyboard shortcuts for everything**, and **/** to list the ones that work where you are (it changes with the stage, the instrument and the picker):
  - 1–5 switch stages (RACK, PATTERNS, ARRANGE, AUTOMATE, MIX); ↑ ↓ the instrument; [ ] its pattern (in ARRANGE, the brush); P the pattern picker; M the instrument on or off, Shift M solo.
  - Space play / stop, R record, ← → back or forward a bar (Shift: 4), Home to the start, ⌘/Ctrl Z undo the last pass or edit, ⌘/Ctrl S save, O open, E export WAV.
  - PATTERNS: the drum machines play from the home row (A S D F…, Shift for accent), ← → pick the lane. ARRANGE: ⌘/Ctrl D duplicate A–B, ⌫ delete it, I insert 4 bars. AUTOMATE: L loop, T LATCH / TOUCH.
- **PATTERNS stage** for writing parts in big, readable type. FOCUS on the transport opens it; RACK on its bar goes back.
  - One instrument fills the window: Bass Line 1 or 2, Drum 08 or Drum 09. A rail down the left has a strip per machine: its ON light, a level meter that shows whether it's sounding (click it to bring that machine up), and the pattern it's playing. Each strip also has the channel's volume as a bar beside its meters: drag or scroll it, or move a MiniLab slider (F1–F4). A machine that's switched off, muted or outside a solo keeps a grey, ghosted meter of what it would play, so you can see it running along and bring it in on time. It fits any window shape, wide or tall: the step grid takes the extra room, and its cells, lights and type grow with it. Drum machines show every lane at once across the whole panel, with the selected instrument's knobs below. The stage and instrument are remembered.
  - Type bass lines on the computer keyboard: A W S E D F T G Y H U J K play C to C and write the selected step, then the cursor moves on. Shift adds accent, Z / X set the octave, Tab slides the note you just typed into the next one, Backspace writes a rest, the arrow keys move the cursor. The bass line's header spells this out.
  - **Pattern picker:** click a machine's pattern on the rail to see all 32 of its patterns at once, in place of the instrument: bass lines as little piano rolls (notes at their pitch, accents brighter, slides joined), drum patterns as lane grids. Click one to play it, or step with the arrow keys (← → pattern by pattern, ↑ ↓ bank by bank); the one playing is outlined and shows the playhead. Click another machine on the rail to see its patterns, or the readout again (or Escape, or CLOSE) to go back. Handy for trying combinations, like A1 on one bass line against A4 on the other.
  - PATTERNS always loops the patterns you pick, even when the song was saved in song mode: what you choose stays until you choose another (while playing, at the end of the current pattern). Its position display shows the instrument's pattern and step ("B3 05") instead of an ever-growing bar count. AUTOMATE plays the song; the rack keeps its own PATTERN / SONG choice and gets it back when you return.
  - A slim bar on top has the stages, play, stop, tempo, position, MIDI and full screen (F types a note here); record is in AUTOMATE and the rack. The bar and rail keep their size whatever the stage or instrument.
- **ARRANGE stage** for building the song out of patterns: one row per machine, bars across, showing which pattern plays when.
  - Drag along a row to paint bars with that row's brush pattern; click the row's name to pick the brush from its pattern picker (or step it with the arrow keys), shift-click a bar to pick up the pattern there. Painting past the end makes the song longer.
  - The thin lane under each row is the machine's ON switch: drag to switch it off (or back on) for those bars.
  - On the ruler, drag to mark bars A–B (or drag A and B), then DUPLICATE A–B or DELETE A–B; INSERT 4 BARS AT A opens space. Knob automation moves along with the bars. Drag END to set the song's length; click the ruler to jump there.
  - UNDO takes back edits (shared with recording passes). Scroll to move along the song, pinch or ctrl+scroll to zoom, FIT to see it all.
- **AUTOMATE stage** for recording knob moves over a loop, pass after pass:
  - A timeline under the bar shows the whole song: drag A and B on it to set the loop (they snap to bars, to beats with Shift), drag anywhere else to draw a new loop, click to jump there. LOOP A–B switches it on and off.
  - Arm REC and play: the loop keeps going round, and every knob you touch is recorded. No arming per knob.
  - LATCH (the default) holds a knob's last value until the end of the pass; TOUCH lets it go a moment after you stop moving it. Either way the knob's old automation carries on after.
  - UNDO PASS takes back the pass being recorded, or the one before; up to 32 passes.
  - The timeline's lanes show the automation of the devices on screen, zoomed to the loop; knobs touched in this pass are marked and listed first.
- **MIX stage** for balancing the song: the four channel strips side by side with long faders, each with a SOLO button, and the effects and master column beside them, all as large as the window allows. The rail stays on the left. The master's VU needles sit side by side when there's more width than height, so the dials stay round instead of squashed.
- Knobs and faders the song automates have a small orange dot, here and in the rack: playback moves them, so to change them for good, record over them in AUTOMATE.
- **EXPORT WAV** on the PATTERNS / AUTOMATE / MIX bar: renders the whole song, the A–B loop, or the current patterns for 4 to 32 bars, faster than real time with the same sound engine, and gives you a 48 kHz 16-bit stereo WAV (on iPad and iPhone through the share sheet, so you can save it to Files or AirDrop it). It shows the length first and the peak level after, and warns if the master clipped.
- **MIDI controllers** (Chrome, Edge and Firefox; Safari has no Web MIDI). MIDI on the bar connects (its light shows the connection; it reconnects by itself next time) and opens the MIDI window.
  - **SET UP MY CONTROLLER** asks for each control in turn in big type (turn knob 1, … move slider 4, the big knob, its click, Shift, the mod strip, pad 1, Shift + pads 4–7), with a picture of the controller lighting the one to touch. About half a minute, and every control does its job whatever numbers it sends; skip what your controller doesn't have. Until then a guess at an Arturia MiniLab 3's factory program stands in.
  - The controls follow the instrument on screen. Knobs 1–6 play it: on a bass line cutoff, resonance, env mod, decay, accent, tuning; on a drum machine the selected instrument's knobs (hit a pad to select one), its accent level and pan. Knob 7 is its delay send, knob 8 the distortion amount. Sliders 1–4: the four channel volumes. Mod strip: the bass line's cutoff, or the delay feedback on drums. The big knob steps through patterns (with Shift, instruments) and its click opens the pattern picker; Shift + pads 4–7 are loop, stop, play and record, as printed on a MiniLab 3.
  - Each on-screen control a hardware control drives wears its number (green badge: 1–8, F1–F4, MW, or the CC of a learned control). Moving something that isn't on screen shows its name and value at the bottom.
  - Keys write notes on the selected step in PATTERNS (hit hard for accent; the 25 keys cover the 303's two octaves), and play the bass line elsewhere when stopped. Pads play the drum machine on screen (Drum 09 while a bass line is shown), hit hard for accent, even while the song plays.
  - Knob moves are recorded like mouse moves, so in AUTOMATE you can ride several knobs at once.
  - Endless and ordinary knobs both work, worked out from what they send and remembered: endless ones in any of the usual relative modes (offset around 64, two's complement, sign bit), ordinary ones taking over only once they reach the knob's value, so nothing jumps.
  - **MIDI LEARN** (from the MIDI window): click a knob or fader on screen, then move a control; while learning, every control you move shows its channel, CC and value. A knob learned on an instrument's control follows the instrument on screen (learn on Bass Line 1's cutoff, and it rides Bass Line 2's when that's up). Double-click forgets a binding; Escape or a click on LEARN ends learning.
  - RESET in the MIDI window goes back to the guessed layout with nothing learned. Opening the app with `?reset` after the address clears all its settings kept in the browser (stage, MIDI); your songs, library and autosaved work stay.
- **Share songs** from the library with the system share sheet (AirDrop to an iPad, Mail, Files...): the share icon on a row sends that song, SHARE in the toolbar sends every song listed (just the search results while searching). Browsers that can't share files download them instead.
- Press F to switch full screen on and off. In Chrome and Edge, Escape then closes About, the library or automation first and leaves full screen only from the rack (hold Escape to leave straight away); other browsers leave full screen on Escape as usual.

### Changed
- Lines stay fine however large the view: panel and button edges, rims, separators, tick marks and graph lines are at most one pixel wide, while controls, icons and type grow. Big views look crisp instead of blown up. Panel edges also follow the rounded corners instead of poking out of them.
- Recording knob moves works the same way in the rack: a knob you move keeps your value (LATCH) instead of being pulled back by its old automation, and returns to the old curve when you stop, seek, or the loop comes round.
- Re-Rebirth now lives at [rb.varyform.info](https://rb.varyform.info).
- The song library's list is easier to read: bigger song titles, file names and stars.

## 0.5.0 — 2026-10-10

### New
- **Song library.** A LIBRARY button opens every song you've added, kept in the browser between visits:
  - Drop several files or whole folders anywhere (or use ADD FILES / ADD FOLDER); folders are searched all the way down. Dropping one song still just opens it, and every song you open joins the library.
  - Each song is listed once, however many folders it turns up in.
  - Songs are grouped by the ReBirth edition (mod) they were made for, Standard ReBirth first. Songs that need a mod's sounds, or aren't ReBirth 2.0 songs, are listed but greyed out.
  - Shows each song's embedded title next to its file name, with ReBirth version, tempo and length. Click a column to sort, again to reverse.
  - Search by title, file name or mod: every word you type has to match. Escape clears the search, a second Escape closes the library.
  - Rate songs with up to five stars; click a row to open it (it keeps playing if the rack was playing); × removes a song.

## 0.4.0 — 2026-10-10

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
  - Pattern filter: ReBirth's frequency range (about 10 Hz to 14 kHz) and resonance, with the lowpass getting quieter and the bandpass louder as resonance rises. The 56 waves are now ReBirth's, measured one by one: every half step either throws the filter up (as far as 9.5 octaves at full amount) or lets it keep falling at the decay knob's rate, from a blip to a hold at full decay. The wave display shows those half steps.
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
