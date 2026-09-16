# Session log — Tribrach Leveling Simulator, initial build

## What got built
A complete, playable tribrach leveling game at `tribrach/index.html` — 51KB,
single self-contained file, vanilla JS, no build step. Plus a dev-only Playwright
harness (43 tests, desktop + mobile) that does not ship.

## Decisions taken (4 questions asked up front)
| Question | Answer |
|---|---|
| Body colour — brief said olive, reference render was yellow | **Yellow**, matching the render. Kept as CSS custom properties so an olive variant is a 3-line change. |
| How a round ends (no equivalent of Stake-Out's MEASURE shot) | **Hold steady for N seconds.** Bubble must stay inside tolerance continuously. Rewards settling, punishes overshoot — what actually happens in the field. |
| Reuse Stake-Out's tier numbers | **Yes**, tolerances 30/18/9/3% and `bubbleHump` verbatim. Setup counts lowered to 2/3/4/5 (Stake-Out uses 3/4/5/6 points) since levelling takes longer than a shot. |
| Repo location | **Subfolder of `stakeoutgame`** on branch `claude/tribrach-leveling-game-ob8lcf`. See caveat below. |

## Naming
Went with **tribrach**, the correct real-world term, not "TriBrack". Spelling is
consistent across the folder, code, UI and docs — a find-and-replace if a
stylised brand name was actually wanted.

## Read out of the Stake-Out source, not guessed
- **Tiers** — `js/game-engine.js:114-117`: tolerances 30/18/9/3, humps 0.50/0.75/0.75/1.00
- **Spring/damper** — `js/game-engine.js:690-706`: `SPRING_K=6`, `DAMPING=0.75`,
  `MAX_VEL=4.8`, `JITTER=1.5`, plus the escape/return "personality" multipliers

## The one deliberate physics change
Stake-Out's bubble target was a moving mouse, so its steady state was never still
and per-frame jitter was just texture. Here the target goes perfectly still when
you release a knob, which made that same jitter the only thing standing between
the player and a pass. Measured: against Level 4's 3% ring a 3-second hold was a
coin flip. **Fix:** jitter now fades as the bubble settles near centre
(`JITTER_CALM_AT` / `JITTER_FLOOR`). Off-centre it is as lively as Stake-Out.
Verified every tier is winnable — worst case, Level 4 peaks at 1.29% against a
3% ring.

## Things found and fixed during the build
1. **Paused clock kept running.** Added pause-on-hidden-tab, but the HUD still
   computed elapsed time from `Date.now()`, so the readout counted up while the
   sim was frozen and only snapped back on resume. Caught by a test. Fixed with a
   `nowMs()` that stops advancing while paused.
2. **The plate was drawn as a triangle.** First pass used a rounded polygon; the
   knobs visibly hung off the flat edges. Rebuilt as hub + arms + lobes, which
   unions into the real tribrach silhouette with concave fillets.
3. **Static body re-rendered every frame**, including a 20px blur over a
   full-size path, 60×/second. Cached it to an offscreen canvas, redrawn only on
   resize. **Test suite went from 1.6 minutes to 17 seconds** — that was a real
   phone-battery problem, not just a slow test.
4. **Turn counters were unreadable** dark-on-yellow behind the knob shadows.
   Moved to the HUD as a SCREW A/B/C row; only the engraved letter stays on the
   rig.
5. **Brand engraving was being overdrawn by the vial.** Moved to the lower hub
   shoulders, the only genuinely clear space on the plate.

## Acceptance criteria — all three verified exactly
Checked on raw target `T` *and* on the integrated bubble position, to machine
precision (errors ~1e-17):
1. A and B equal, same direction → vertical motion only ✔
2. A and B equal and opposite → horizontal motion only ✔
3. All three equal → no motion at all ✔

Also confirmed through real UI drags, not just direct maths calls.

## Not done / open
- **Now a standalone repo.** Originally built inside `stakeoutgame/tribrach/`
  because this session's container was scoped to that repo. Playtested, judged
  "surprisingly playable and addicting", and split out into its own
  `tribrachgame` repo with `index.html` at the root and its own `netlify.toml`.
  The interim copy in `stakeoutgame` was never pushed.
- **Not cloned to `C:/users/robbi/documents/tribrachgame` yet.** This container
  is Linux and has no Windows drive; clone it down from GitHub on that machine.
- **Not playtested by a human on a real phone.** Pointer handling is verified by
  tests on an emulated Pixel 7 (drag precision measured at 0.000 rad error), but
  "technically works" is not the same as "feels good". That check is still owed.
- `K = 0.16` (bubble travel per radian) is a first guess dialled in by eye. Most
  likely constant to want changing after real play.
