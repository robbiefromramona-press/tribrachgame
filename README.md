# Tribrach Leveling Simulator

A browser mini-game where you level a bullseye bubble by turning the three
leveling screws on a tribrach — the mount a total station or prism pole sits on.

Part of the TotalStationTech field-skills set, alongside Stake-Out. The bubble
physics is the same spring/damper ported straight out of `stakeoutgame`'s
`js/game-engine.js`; the only thing that changed is what drives the target —
three rotating knobs instead of prism-pole tilt.

**Play it:** open `index.html`. That's the whole install.

---

## The one rule

`index.html` is the entire game. Single self-contained file, vanilla JS, no
build step, no bundler, no runtime dependencies, no external fetches — not even
a webfont. Deploying is copying the file and the `assets/img/` folder beside it.

The game does load image sprites now (the v2 art package — see **Artwork**), but
it loads them over plain relative paths that resolve with no tooling whatsoever.
Open `index.html` off the filesystem and it runs, which is exactly how the test
suite drives it.

The `tests/` and `tools/` folders and `package.json` are a **dev-only harness**.
Nothing in them ships, nothing in them is needed to run or deploy the game, and
deleting the whole lot would not change a single pixel.

## How it plays

Drag any knob to turn that leveling screw. The bubble runs **toward** the screw
you raise. Get it inside the dashed tolerance ring and **hold it there** until
the green progress ring closes — a bubble that only clips centre on its way past
has not been levelled, which is the entire point.

The field trick the game is built around: **turn two knobs by equal amounts in
opposite directions** and the bubble moves on one axis only. That is how an
experienced operator actually levels a tribrach — one error at a time, instead
of chasing it in circles.

### Controls
- **Drag a knob** — mouse, pen or finger, one shared pointer-event path
- **Hold Shift while dragging** — 5× finer, for desktop precision work
- **ESCAPE TO MAIN MENU** — leaves the level. Nothing logged yet and you land
  back on the menu; part-way through and you still get the field report for the
  setups you did finish.
- **LOG AS-IS** — two-press, and always a fail. The hold is the only way to pass.
- Touch targets are deliberately much larger than the knobs are drawn
- The sim pauses (and the clock stops) when the tab is hidden

The start menu's TST lockup links out to totalstationtech.com in the same tab.

Portrait phones letterbox a 16:9 stage into an upright screen, so the rig ends
up small. There is a non-blocking banner suggesting a rotate — deliberately an
advisory and not a gate, since the game is cramped that way, not broken.

## The physics

The tribrach is a rigid plate on three screws 120° apart:

| Screw | φ | direction vector `d = [cos φ, sin φ]` | on screen |
|---|---|---|---|
| A | 150° | `(-0.866,  0.5)` | upper-left |
| B |  30° | `( 0.866,  0.5)` | upper-right |
| C | 270° | `( 0.000, -1.0)` | bottom |

Target position, where `q_i` is total accumulated rotation of knob `i` in
radians (positive = clockwise):

```
T = K * (q_A * d_A + q_B * d_B + q_C * d_C)
```

`T` then feeds Stake-Out's spring/damper unchanged:

```
a = k * (T - x) - c * v
v += a * dt
x += v * dt
```

**Pass/fail is judged on `x`, never on `T`.** The lag and the ~55–60% overshoot
are the mechanic, not a defect.

### Why the three criteria hold

The direction vectors sum to `(0,0)`. That single fact is why:

1. **A and B equal, same direction** → horizontal components cancel → bubble
   moves vertically only.
2. **A and B equal and opposite** → vertical components cancel → bubble moves
   horizontally only.
3. **All three equal** → nothing moves at all. The plate rises without tilting.

All three are covered by tests, checked both on raw `T` and on the integrated
bubble position. If any goes red, the vector maths is wrong and nothing else is
worth debugging first.

### Tuning knobs

Everything lives at the top of the `<script id="tribrach-sim">` block:

| Constant | What it does |
|---|---|
| `K` | bubble travel per radian of knob turn. Pure feel. |
| `KNOB_SENSE` | per-knob handedness, `[1,1,1]`. Flip all three if the rig feels backwards, or one if a single knob does. |
| `MAX_TRAVEL_RAD` | how far a screw runs before it bottoms out |
| `SPRING_K`, `DAMPING`, `MAX_VEL` | ported verbatim from Stake-Out |
| `JITTER_CALM_AT`, `JITTER_FLOOR` | the one deliberate departure — see below |

**The one intentional change from Stake-Out.** Stake-Out's bubble target was a
moving mouse, so its steady state was never actually still and the per-frame
jitter just added texture. Here the target goes perfectly still the moment you
release a knob, which turns that same jitter into the only thing between you and
a pass — and against Level 4's 3% ring, a 3-second hold becomes a coin flip. So
jitter now fades as the bubble settles near centre. Off-centre it is as lively
as Stake-Out; parked dead centre it calms down like real fluid.

## Difficulty tiers

Tolerances and `bubbleHump` are lifted verbatim from Stake-Out so the two games
grade identically. Setup counts are lower than Stake-Out's 3/4/5/6 points —
levelling takes longer than taking a shot.

The tier NAMES come from the v2 art package and no longer echo Stake-Out's
wording. The numbers behind them never moved — the rename was labels only, and
`tests/physics.spec.js` pins the tolerances, humps and setup counts so it stays
that way.

| Tier | Setups | Tolerance | Hold | was called |
|---|---|---|---|---|
| Apprentice | 2 | 30% | 1.5s | Level 1 — Rookie |
| Journeyman | 3 | 18% | 2.0s | Level 2 — Journeyman |
| Foreman | 4 | 9% | 2.5s | Level 3 — Foreman |
| Shop Rocket | 5 | 3% | 3.0s | Level 4 — No Room For Error |

## Artwork

Both screens are layer stacks from the v2 art package, drawn on a 1920×1080
design canvas. The whole layout lives in those design pixels and one CSS
transform letterboxes the stage into the viewport — no breakpoints, nothing to
keep in sync. The field report and the toast sit *outside* that stage and stay
ordinary responsive DOM, because shrinking a table of numbers by the same factor
as the artwork makes it unreadable on a phone.

### The portrait start menu

Like Stake-Out, each screen gets its own aspect rather than one canvas for the
whole game (Stake-Out does it with `--aw`/`--ah` per stage; its menu is 5:4 and
its instrument 2:1). A 16:9 menu letterboxed into an upright phone is a band
across the middle using about a fifth of the screen.

The difference is that TriBrach's menu is not one baked image — every element is
already its own sprite, so portrait needed no new art, only a second set of
rectangles in `MENU_PORTRAIT`. Same sprites, taller canvas, stacked instead of
side by side; landscape still uses the package's own positions and is untouched.

The portrait canvas is **1200×2300**, deliberately much taller than Stake-Out's
5:4: at 5:4 a 375×812 phone still fills only 37% of its height, where this fills
87%. The site photo is scaled to the canvas width and left at the top, with a
gradient carrying it down into the dark so the stacked buttons sit on clean ink
— cropping it to *cover* a canvas that tall would throw away the crane skyline,
which is most of what the shot is for. `static_copy` is dropped in portrait;
there is no room for a 1792px strip of micro-type and the only part of it that
carries information (TOOLS | SKILLS | REAL RESULTS) is already in the TST lockup.

The **play** screen stays 1920×1080 in both orientations, because the rig's
geometry and the drag maths that depends on it are pinned to that canvas.

Most layers are static images. Three things have to be painted live, because the
package ships them as one frozen sample state and the game needs every state:

| Live element | Where it is drawn |
|---|---|
| bubble, knobs, tolerance ring | `#rig`, a 1000×1000 canvas over the tribrach |
| LCD digits (time, offset, hold %) | `#hudfx`, a 1920×1080 overlay canvas |
| hold-progress arc | `#hudfx` — 40 segments, 9° pitch, from twelve o'clock |

The LCD glyphs come from `assets/img/lcd_digits.png`, the same atlas Stake-Out
uses, so the two games' readouts match.

### tools/prep_layers.js

Dev-only. The package hands over twenty full-canvas 1920×1080 RGBA PNGs — about
61MB, including a 2.7MB file holding a 132×132 bubble. The script crops each
layer to its alpha bounding box, writes `.webp` with a `.png` fallback, and
prints the offsets that are pasted into the `SPRITES` table in `index.html`.
61MB becomes about 1MB of WebP. `assets/img/README.txt` records every offset.

It also **repairs two layers**, because the package was split out of a flattened
master and two of them kept pixels belonging to a layer above:

- **`01_static_ui`** had the sample hold-fill (about a third of the ring) baked
  into the track, so the bar could never read 0%. The track is 40 segments at 9°,
  and 180° is exactly 20 of them — so a point reflection through the ring centre
  lands every lit pixel on a matching *unlit* segment, gaps and all. The wedge is
  overwritten with its own opposite side.
- **`03_level_glass`** had a fan artifact where the bubble was lifted off and the
  hole smeared shut. The vial and its crosshair are symmetric about the vertical
  axis, so the patch is the glass's own mirror image faded in through a soft
  ellipse.
- **`startmenu_03_title_branding`** kept a bite of the construction photo above
  "…ach" and a scrap of the hero's rotation arrows under the "T". Invisible in
  the landscape menu, because there they land on the identical pixels in the
  background layer — but the portrait menu moves the wordmark away from the
  photo and they come with it. Erased by rectangle, not by colour key: the sun
  in the photo is the same yellow as the wordmark, so nothing can separate them
  per-pixel.

Two more were fixed at source rather than in code, by re-exporting the art:

- the **bubble** used to carry the vial's crosshair and ring arcs — 8.7% of its
  pixels — and dragged them around the glass with it. The v2 bubble is clean
  *and* translucent, so the crosshair now reads through it from the glass layer
  underneath and refracts correctly at every position instead of being painted
  on at one.
- the **knobs** used to carry tribrach-body yellow: 8.5% / 8.5% / 17% of A / B /
  C, swinging round as a crescent every time they turned. It could not simply be
  masked off, because ~80% of that yellow had no body pixels behind it. The v2
  pass fixed both ends at once — knob-only sprites, and a body layer with the
  knob sockets filled in. The v3 pass then redrew the knobs face-on, which is
  what finally made the rotation itself correct (see below).

Masters are **not** in this repo — they live in the shared Drive folder under
`Claude/webapps/tribrach game/updated UI/`. Drop them back into
`_design-assets/tribrach-v2/{hud,startmenu}/` to re-run the script.

### Knob rotation, and why it is now three lines

The v3 knob art is drawn straight down the axis, so each knob is a **true
circle** — measured aspect 1.000, alpha filling the circumscribed circle to
within 0.2%. Rotating the sprite about the middle of its own bitmap is therefore
exactly correct: the disc maps onto itself at every angle, and the gear teeth
carry the motion. `drawKnob` is a translate, a rotate and a draw.

It is worth recording what that replaced, because it is the same trap twice.
Both earlier art passes drew the knobs in three-quarter view, and neither could
be rotated correctly:

- the cap was an **ellipse**, and an ellipse spun in the screen plane does not
  map onto itself — the outline lurches twice per turn;
- the knurl was the **side wall of a cylinder**, which no rotation of a flat
  bitmap moves correctly at all. Spin it and the shaded wall swings around the
  cap, tearing a hole where it used to be.

Working around that took an un-squash / rotate / re-squash through a padded
scratch canvas, with the skirt pinned and only the cap face turning. It worked,
and it was still a workaround. Face-on art deleted the problem instead.

The small TST-yellow index tick is kept deliberately. The teeth show *that* the
knob is turning, but there are twenty-odd of them and they all look alike, so
they cannot show *how far*. The tick sits on the brushed face inside the art's
own yellow ring — put it on the ring and the two yellows muddle together.

Note that *input* is measured as a plain screen-space angle: a finger sweeping a
circle turns the screw by the angle swept on the glass, which is what the drag
feels like and what the tests assert.

## Tests

```bash
npm install
npx playwright test
```

43 tests across desktop and mobile viewports: the three acceptance criteria,
bubble behaviour (overshoot, decaying ring-down, every tier provably winnable),
the tier table, knob drag precision, hit-target size, screw travel stops, pause
behaviour and the full game flow.

`tests/extract-sim.js` is a small side utility, not part of the suite: it pulls
the `<script id="tribrach-sim">` block straight out of `index.html` and evals it,
so you can tune the physics from plain Node without a browser. That is how the
jitter falloff above was measured:

```bash
node -e 'const {loadSim}=require("./tests/extract-sim.js"); const S=loadSim(); console.log(S.targetFor(1,1,0))'
```

This environment ships its own Chromium, so `playwright.config.js` points
`executablePath` at it rather than downloading another. Override with
`CHROMIUM_PATH=/path/to/chrome` elsewhere, or unset it and let Playwright manage
its own.

## Deploying

GitHub -> Netlify, same as every other TotalStationTech tool. `netlify.toml`
declares `publish = "."` and no build command, so a Git-linked deploy needs
nothing configured in the Netlify UI — it just copies the repo root and serves
`index.html`.

To deploy: Netlify -> Add new site -> Import an existing project -> pick this
repo -> accept the detected settings. Every push to `main` redeploys.
