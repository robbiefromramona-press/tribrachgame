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
a webfont. Deploying is copying one file.

The `tests/` folder and `package.json` are a **dev-only harness**. Nothing in
them ships, nothing in them is needed to run or deploy the game, and deleting
the whole lot would not change a single pixel. The single-file convention is
intact.

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
- Touch targets are deliberately much larger than the knobs are drawn
- The sim pauses (and the clock stops) when the tab is hidden

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

| Tier | Setups | Tolerance | Hold |
|---|---|---|---|
| Level 1 — Rookie | 2 | 30% | 1.5s |
| Level 2 — Journeyman | 3 | 18% | 2.0s |
| Level 3 — Foreman | 4 | 9% | 2.5s |
| Level 4 — No Room For Error | 5 | 3% | 3.0s |

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
