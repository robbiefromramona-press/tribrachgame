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
