# Session log — 2026-09-20 — v2 art package overhaul

Visual-only reskin onto the new TriBrach art package. No gameplay, physics,
scoring, timing or difficulty values were changed. Two new interactive
elements were added because the art introduced them.

---

## 0. Getting the repo local

It had never been cloned — the original build ran in a sandbox with no machine
access. Cloned to `C:\Users\robbi\GitHub\Repos\tribrachgame` (public, one
commit, `4066b5b`). Test baseline re-confirmed on this machine before touching
anything: **43 passed, 1 skipped**.

The art was not staged in the repo root as the brief assumed. It was in
`G:\My Drive\Claude\webapps\tribrach game\updated UI\`, in two folders:
`TriBrach_Layer_Package_1920x1080` (HUD) and
`TriBrach_Start_Menu_Layers_1920x1080` (menu).

## 1. What the audit turned up

**The old build had zero image assets.** It was 100% procedural Canvas + CSS on
a 1000×1000 *square* grid with the HUD as stacked DOM. So there was no existing
image-reference pattern to follow — one had to be established. Mirrored
Stake-Out: `assets/img/{hud,startmenu}/`, relative paths, no tooling.

**Difficulty audit came back clean** — exactly 4 tiers, no fifth, matching the
relabel table.

**LCD font found:** `stakeoutgame/assets/img/v12/lcd_digits.png`. Not a webfont
— a sprite atlas, 1056×396, eleven 96×132 cells per row, three rows
(green/yellow/red). Copied it in and ported `drawDigits()` from
`stakeoutgame/js/ui-skin.js:152`. Green sampled at `rgb(10,232,5)`.

## 2. Four decisions taken to you before building

| Question | Your call |
|---|---|
| Setup counter, TOL, screw turns and LOG AS-IS have no home in the new art | Overlay the first two plus LOG AS-IS in the dark column under ESCAPE; drop the per-screw turn numbers |
| Fixed 16:9 art vs a mobile-portrait-first game | Letterbox + rotate prompt |
| A test pins the old tier name strings | Update the names and that one assertion |
| ~61MB of full-canvas PNGs | Crop + WebP, mirror Stake-Out's prep script |

One refinement made during the build: the rotate prompt is a **non-blocking
banner**, not a modal. A modal would have sat on top of the menu and broken
`startGame()` in about fifteen tests, and a Pixel 7 in portrait still gives a
~68px touch target — cramped, not unplayable.

## 3. Geometry, measured not guessed

Everything was measured off the layers themselves with connected-component and
circle-fit passes, then baked into the `SPRITES` table in `index.html`.

- Vial glass centre `(961, 417)`, radii `227 × 209` (slightly elliptical — it
  is a perspective render)
- Knobs A `(575, 336)`, B `(1354, 335)`, C `(959, 847)` — C is drawn much
  larger, it is nearest the camera
- Hold ring centre `(271, 654)`, track `r 101 → 139`, **40 segments at 9°**,
  fill starts at twelve o'clock. Found by minimising the variance of the radius
  over the lit arc's pixels; the first two attempts clamped at a search
  boundary and gave nonsense.
- `#rig` occupies design rect `(460, 30, 1000, 1000)`

That last one is the load-bearing choice. Keeping `#rig` **square and exactly
1000 units** means `rigMapper`, `grabR` and `knobPositions()` in the test
helpers all keep working untouched, and — more importantly — a circular drag
gesture stays circular. A non-uniform scale would have skewed the rotation the
player gets for a given sweep.

## 4. Two real defects in the art package

Both came from the package being split out of a **flattened** master, so two
layers kept pixels belonging to a layer above them. Both are patched in
`tools/prep_layers.js` rather than worked around at runtime.

**`01_static_ui` had the sample hold-fill baked into the ring track** — the
progress bar could never have read 0%. Fix: the track is 40 segments at 9°, and
180° is exactly 20 of them, so a point reflection through the ring centre lands
every lit pixel on a matching *unlit* segment with the gaps in phase. The lit
wedge is overwritten with its own opposite side. Seamless.

**`03_level_glass` had a fan artifact** where the bubble was lifted out and the
hole smeared shut with nearest pixels. Fix: the vial, crosshair and rings are
symmetric about the vertical axis, so the patch is the glass's own mirror image
faded in through a soft ellipse.

## 5. The knob-rotation compromise

The two upper knobs are three-quarter-view ovals. Spinning an oval bitmap makes
its outline wobble, and worse, uncovers the flattened background behind it
(which is reconstructed smear, not clean plate).

Solution: spin the bitmap into an offscreen canvas, then `destination-in`
against the *unrotated* sprite. The silhouette stays pinned exactly where the
artwork put it while the knurling underneath visibly rotates. A small TST-yellow
index tick rides the knurl so the amount of turn is unambiguous.

**Three face-on knob renders would remove the need for the trick entirely** —
worth considering for a v3 art pass.

## 6. What changed, file by file

- `index.html` — rewritten renderer and shell. Physics block untouched apart
  from the four tier `name` strings.
- `tools/prep_layers.js` — new. Crop, WebP+PNG, split the knobs and the two `%`
  glyphs, repair layers 01 and 03, emit `assets/img/README.txt`.
- `assets/img/**` — new. ~1MB of WebP (plus PNG fallbacks) out of 61MB.
- `tests/physics.spec.js` — the tier *name* array only. Tolerances, humps,
  setup counts and dwell ordering assertions are untouched, which is the point:
  a relabel must never be able to move a number.
- `README.md` — artwork section, new tier table with the old names alongside.
- `.gitignore` — `_design-assets/` (the 61MB masters) and `.claude/`.

## 7. New behaviour (the only two)

- **ESCAPE TO MAIN MENU** — wired to `#quitBtn`, the back-to-menu flow that
  already existed. Nothing logged, you land on the menu; part-way through, you
  still get the field report.
- **TST lockup on the start menu** → `https://totalstationtech.com`, same tab.

## 8. Verification

`npx playwright test` — **43 passed, 1 skipped.** Baseline held.

Checked by hand in the browser: menu renders pixel-accurate with the selected
tier glowing; play screen stacks correctly; hold ring reads 0% when idle and
fills with live segments and a live `%`; bubble tracks; ESCAPE returns to menu;
TST href correct; portrait letterboxes with no overflow and shows the advisory;
field report legible.

## 9. Open items

- **PNG fallbacks are ~10MB of the 11MB in `assets/`.** WebP covers ~97% of
  browsers and the fallbacks will essentially never load. Say the word and they
  come out, taking the repo to about 1MB.
- **Stake-Out's start menu is probably missing a totalstationtech.com return
  link too** — same oversight TriBrach had. Flagged, not done, as instructed.
- Three face-on knob renders would retire the silhouette-clip trick.
- Not pushed. Awaiting the go-ahead.

---

# Follow-up pass — same day — first three fixes

Four things came back from playtesting. Two are now done; two are waiting on
cleaned art.

## Done: clock colons

Measured them rather than trusting the bounding box. The real dots are **11×10**,
rounded, and the pair leans right with the rest of the LCD face; I had been
drawing **15×14** axis-aligned squares about 2px up and left. Now cut from the
art as a `colon` sprite, same as the `%` signs, so it matches exactly and cannot
drift. One crop is drawn twice — both colons are the same glyph.

## Done: portrait start menu

Adopted Stake-Out's per-screen aspect idea. Because every menu element is its own
sprite, this needed **no new art** — just a second rectangle table
(`MENU_PORTRAIT`) on a **1200×2300** canvas. On a 375×812 phone the menu now
fills 87% of the height, against 26% before and 37% if we had copied Stake-Out's
5:4 exactly.

The site photo is scaled to the canvas width at the top with a gradient carrying
it into the dark, rather than `cover`-cropping a 16:9 shot to a 1:1.9 canvas,
which would have discarded the crane skyline. `static_copy` is dropped in
portrait — no room, and its only informational content is already in the TST
lockup.

The play screen stays 1920×1080 in both orientations. Its rig geometry and drag
maths are pinned to that canvas and there is no reason to disturb them.

### A third defect found while doing it

`startmenu_03_title_branding` had **construction-photo bleed baked into its
top-right** (buildings and the sun) plus a scrap of the hero's rotation arrows
at the bottom-left. Invisible in landscape — it lands on the identical pixels in
the background layer — but the portrait menu moves the wordmark away from the
photo and the debris floated along with it.

Erased by rectangle, not colour key: the sun is the same yellow as the wordmark,
so no per-pixel test can separate them. Over the "h" the bleed runs straight into
the letter with no transparent gap, so the cut line came from scanning the
columns — the block ends by y 150, the ascender picks up at 151-153.

## Waiting on art: bubble and knobs

Measured the damage so the ask could be specific:

- **Bubble** — 8.7% of its opaque pixels are the vial's crosshair and ring arcs,
  baked in and travelling with it.
- **Knobs** — 8.5% / 8.5% / 17% of A / B / C is tribrach-body yellow. That
  crescent swinging round is probably most of the "wobble", more than the
  knurling. It cannot just be masked off: ~80% of it has no body-layer pixels
  behind it, so removing it leaves holes.

Requested, all full 1920×1080 RGBA registered to the same canvas so the prep
script places them automatically:

1. `tribrach_04_knobs_v2.png` — three knobs **face-on** (true circles, so rigid
   rotation is correct and the bbox centre is the axis), knob only, no yellow,
   no shadow.
2. `tribrach_02_static_body_v2.png` — the body with the knob holes filled in,
   contact shadows included.
3. `tribrach_05_bubble_v2.png` — bubble only, no crosshair or ring arcs. Some
   translucency preferred: the vial's real crosshair is drawn underneath, so it
   will read through correctly at every position instead of being painted on.

Face-on knobs were chosen over a rotation sprite sheet: one image each instead
of 24-36 frames, and it removes the wobble outright rather than hiding it.

## Verification

`npx playwright test` — **43 passed, 1 skipped**, unchanged.

Checked by hand: colons read as proper dots; portrait menu fills the phone with
no floating debris and the wordmark intact; landscape menu unchanged.

---

# Follow-up pass 2 — same day — v2 art landed

Cleaned art arrived: a body plate with the knob sockets filled, knob-only
sprites, and a clean translucent bubble. All four playtest items are now done.

## What the new art fixed outright

- **Bubble** — no crosshair or ring arcs, and translucent, so the vial's own
  crosshair reads through it from the glass layer underneath. The refraction is
  now correct at every position instead of painted on at one. 124x124, centred
  at (1073, 342), essentially where the old one sat.
- **Knobs** — knob-only, no body yellow. The swinging crescent is gone.
- **Body** — knob sockets filled, and the vial aperture left open so the glass
  layer shows through it. Main component bbox is `475,45,970,982`, identical to
  the layer it replaces, so nothing else had to move.

## Measuring the knobs before wiring them

The caps are **not** quite face-on. Taking the bounding box of each yellow ring
(at any brightness — a bright-yellow mask catches only the lit arc and the
circle fit drifts badly) gives ellipses, not circles:

| knob | cap centre | ring rx / ry | tilt |
|---|---|---|---|
| A | 564.5, 320 | 47.5 / 42 | 0.884 |
| B | 1359.5, 319 | 52.5 / 42 | 0.800 |
| C | 960, 823.5 | 62 / 42.5 | 0.685 |

Two things worth noting. The axis is **not** the middle of the knob's
silhouette — the skirt hangs below the cap, so it sits well above it. And A and
B are offset toward the middle of the rig by about the same amount in opposite
directions, which is the giveaway that this is genuine perspective rather than a
detection artifact.

Each knob is now cropped as a **square centred on its own axis**, so the middle
of the bitmap is the rotation centre and there is nothing extra to carry around.

## Two wrong turns on the rotation, and the fix

**Attempt 1 — un-squash, rotate, re-squash the whole sprite.** Right idea for
the cap, and it does map the ellipse onto itself. But undoing the foreshortening
stretches the bitmap to 1/tilt of its height *before* it is rotated — 1.46x at
knob C — and that intermediate overflowed the scratch canvas. The corners came
back as torn geometry.

**Attempt 2 — same, with the buffer padded to fit the stretch.** The tearing
went away and the real problem showed: the knurled **skirt** is the side wall of
a cylinder, not a disc. No rotation of a flat bitmap moves it correctly. It swung
around the cap and tore a hole where it had been, which read as a yellow crescent
(the socket showing through).

**What shipped — only the cap turns.** The skirt, silhouette and shadow stay
exactly where the artist put them. The cap face is cut out once into its own
buffer — everything inside the yellow ring — and drawn back each frame through
un-squash / rotate / re-squash. The ellipse maps precisely onto itself at every
angle, so nothing moves except the brushed machining and the highlight, which is
the part that should move. The index tick now rides the same foreshortened
ellipse rather than a circle.

Input is deliberately left as a plain screen-space angle: a finger sweeping a
circle turns the screw by the angle swept on the glass. That is what the drag
feels like and what the tests assert. Only the rendering is corrected.

## Verification

`npx playwright test` — **43 passed, 1 skipped**, unchanged throughout.

Captured the rig at 1920x1080 at three knob angles to check it directly: the
silhouettes hold rock steady, no holes, no crescents, and the cap faces and
ticks turn. Confirmed in the browser that the crosshair reads through the new
bubble, the hold ring fills, and the colons read as dots.

## Still open

- **PNG fallbacks** are still ~10MB of the assets folder against ~1MB of WebP.
- **Stake-Out's start menu** still has no totalstationtech.com return link.

---

# Follow-up pass 3 — same day — v3 face-on knobs

New knob art arrived, drawn straight down the axis. Measured before wiring:

| knob | bbox | centre | aspect | circle fill |
|---|---|---|---|---|
| A | 490,251 170x170 | 574.5, 335.5 | 1.000 | 1.002 |
| B | 1268,249 173x173 | 1354, 335 | 1.000 | 1.002 |
| C | 842,730 235x235 | 959, 847 | 1.000 | 1.001 |

True circles, and seated exactly where the body plate's sockets already are.

## What it let me delete

`drawKnob` is now a translate, a rotate and a draw. Gone with it:

- `KNOB_TILT` and `KNOB_CAP_R`
- `capFace()` and the per-knob cap buffers
- the un-squash / rotate / re-squash transform
- the padded scratch canvas sized to survive the stretch
- the elliptical stop indicator

That is the whole workaround from pass 2, removed rather than improved. A disc
drawn down its own axis maps onto itself under rotation, so there is nothing
left to correct, and the gear teeth carry the motion on their own.

The index tick is kept: twenty-odd identical teeth show *that* the knob turns
but not *how far*. Moved to `r * 0.55`, on the brushed face — at `0.70` it
landed on the art's own yellow ring and the two yellows muddled together.

## Art supplied but not used

- **`knob_master512.png`** — a 512x512 single knob. Not wired in: everything
  else in the game is authored on the 1920x1080 canvas and upscales with it, so
  hi-res knobs alone would be sharper than the body they sit on. It would only
  help on a large, high-DPI desktop display; on a phone the 239px sprite is
  already being scaled *down*. Easy to swap in later if wanted.
- **`knob_sheet8.png`** — an 8-frame rotation sheet. Not needed, and would be a
  step backwards: canvas rotation of a circular sprite is continuous and exact,
  where 8 frames would quantise the turn to 45-degree steps.

Both are kept in `_design-assets/incoming/` (git-ignored) in case the crispness
question comes back.

## Verification

`npx playwright test` — **43 passed, 1 skipped**.

Captured the rig at 1920x1080 at several knob angles and cropped knob C at 2x:
outlines rock steady, teeth turning, tick legible, no holes or crescents.
