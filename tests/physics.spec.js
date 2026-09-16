/* ==========================================================================
   THE ACCEPTANCE CRITERIA.
   --------------------------------------------------------------------------
   These three are not flavour tests, they are the gameplay hook: they encode
   how an experienced operator actually levels a tribrach, two knobs at a time.
   If any of them go red, the vector maths is wrong and nothing else in the
   game is worth debugging until it is fixed.

   Each one is checked TWICE:
     - on the raw target T, which is pure algebra, and
     - on the integrated bubble position x, which is what the game actually
       judges pass/fail against. A criterion that holds for T but not for x
       would mean the spring/damper had introduced axis coupling.
   ========================================================================== */
const { test, expect } = require('@playwright/test');

const page$ = async (page) => {
  await page.goto('index.html');
  await page.waitForFunction(() => !!window.TribrachSim && !!window.TribrachGame);
};

/* Integrate the real spring/damper with jitter disabled. Jitter is a random
   term by design; leaving it on would make these assertions flaky for reasons
   that have nothing to do with the vectors under test. */
const settle = (page, turns, levelIndex = 0, seconds = 2) =>
  page.evaluate(([t, li, secs]) => {
    window.TribrachGame.setLevel(li);
    window.TribrachGame.setTurns(t[0], t[1], t[2]);
    window.TribrachGame.resetBubble(0, 0);
    return window.TribrachGame.stepN(Math.round(secs * 60), 1 / 60, true);
  }, [turns, levelIndex, seconds]);

const targetFor = (page, turns) =>
  page.evaluate((t) => window.TribrachSim.targetFor(t[0], t[1], t[2]), turns);

test.describe('acceptance criteria', () => {

  test('criterion 1: A and B turned equally in the SAME direction move the bubble on one axis only', async ({ page }) => {
    await page$(page);
    const q = 1.0;

    const T = await targetFor(page, [q, q, 0]);
    expect(Math.abs(T.x)).toBeLessThan(1e-12);   // horizontal components cancel
    expect(Math.abs(T.y)).toBeGreaterThan(0.05); // and it genuinely moved

    const x = await settle(page, [q, q, 0]);
    expect(Math.abs(x.x)).toBeLessThan(1e-9);
    expect(Math.abs(x.y)).toBeGreaterThan(0.05);
  });

  test('criterion 2: A and B turned EQUAL AND OPPOSITE move the bubble on the other axis only', async ({ page }) => {
    await page$(page);
    const q = 1.0;

    const T = await targetFor(page, [q, -q, 0]);
    expect(Math.abs(T.y)).toBeLessThan(1e-12);   // vertical components cancel
    expect(Math.abs(T.x)).toBeGreaterThan(0.05);

    const x = await settle(page, [q, -q, 0]);
    expect(Math.abs(x.y)).toBeLessThan(1e-9);
    expect(Math.abs(x.x)).toBeGreaterThan(0.05);
  });

  test('criterion 3: all three knobs turned equally do not move the bubble at all', async ({ page }) => {
    await page$(page);

    for (const q of [0.3, 1.0, 2.5, -1.7]) {
      const T = await targetFor(page, [q, q, q]);
      expect(Math.hypot(T.x, T.y)).toBeLessThan(1e-12);

      const x = await settle(page, [q, q, q]);
      expect(Math.hypot(x.x, x.y)).toBeLessThan(1e-9);
    }
  });

  test('the three direction vectors sum to zero (why criterion 3 holds)', async ({ page }) => {
    await page$(page);
    const dirs = await page.evaluate(() => window.TribrachSim.DIRS.map(d => ({ id: d.id, x: d.x, y: d.y })));

    expect(dirs.map(d => d.id)).toEqual(['A', 'B', 'C']);
    const sum = dirs.reduce((a, d) => ({ x: a.x + d.x, y: a.y + d.y }), { x: 0, y: 0 });
    expect(Math.hypot(sum.x, sum.y)).toBeLessThan(1e-12);

    // and each is a unit vector at its documented angle
    for (const d of dirs) expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 12);
    expect(dirs[0].x).toBeCloseTo(-0.866, 3); expect(dirs[0].y).toBeCloseTo(0.5, 3);
    expect(dirs[1].x).toBeCloseTo(0.866, 3);  expect(dirs[1].y).toBeCloseTo(0.5, 3);
    expect(dirs[2].x).toBeCloseTo(0, 12);     expect(dirs[2].y).toBeCloseTo(-1, 12);
  });
});

test.describe('bubble behaviour', () => {

  test('the bubble moves TOWARD the screw you raise', async ({ page }) => {
    await page$(page);
    // Raise A alone. A sits upper-left, so the bubble should end up upper-left.
    const a = await settle(page, [1.5, 0, 0]);
    expect(a.x).toBeLessThan(0);
    expect(a.y).toBeGreaterThan(0);

    const c = await settle(page, [0, 0, 1.5]);   // C is at the bottom
    expect(Math.abs(c.x)).toBeLessThan(1e-9);
    expect(c.y).toBeLessThan(0);
  });

  test('it lags and overshoots rather than teleporting to the target', async ({ page }) => {
    await page$(page);
    const trace = await page.evaluate(() => {
      const G = window.TribrachGame;
      G.setLevel(0);
      G.setTurns(0, 0, 0);            // screws parked at centre
      G.resetBubble(0.85, 0);         // bubble starts out at the rim
      const out = [];
      for (let i = 0; i < 600; i++) { out.push(G.stepN(1, 1 / 60, true).x); }
      return out;
    });

    // not at the target on the very next frame
    expect(Math.abs(trace[0])).toBeGreaterThan(0.5);
    // it swings PAST centre before settling — that is the overshoot
    expect(Math.min(...trace)).toBeLessThan(-0.15);

    /* A real vial rings down: each swing is smaller than the last. Assert the
       decaying envelope rather than a value at some arbitrary instant — the
       system is very underdamped (ratio ~0.11) and is still visibly moving at
       three seconds, which is the point of the mechanic, not a bug. */
    const peaks = [];
    for (let i = 1; i < trace.length - 1; i++) {
      const a = Math.abs(trace[i]);
      if (a > Math.abs(trace[i - 1]) && a >= Math.abs(trace[i + 1])) peaks.push(a);
    }
    expect(peaks.length).toBeGreaterThan(4);
    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i], `swing ${i} (${peaks[i].toFixed(3)}) should be smaller than swing ${i - 1} (${peaks[i - 1].toFixed(3)})`)
        .toBeLessThan(peaks[i - 1]);
    }
    // and it does eventually come to rest
    expect(Math.abs(trace[trace.length - 1])).toBeLessThan(0.02);
  });

  test('every difficulty tier is actually winnable with the screws parked at centre', async ({ page }) => {
    await page$(page);
    // Jitter ON here, deliberately: this is the test that would have caught
    // Level 4 being a coin flip against a 3% ring.
    const held = await page.evaluate(() => {
      const G = window.TribrachGame, S = window.TribrachSim;
      return S.LEVELS.map((lvl, i) => {
        G.setLevel(i);
        G.setTurns(0, 0, 0);
        G.resetBubble(0, 0);
        let run = 0, best = 0;
        for (let n = 0; n < 60 * 60; n++) {           // 60 seconds
          G.stepN(1, 1 / 60, false);
          if (G.offsetPct <= lvl.bubbleTolerancePct) { run += 1 / 60; best = Math.max(best, run); }
          else run = 0;
        }
        return { name: lvl.name, dwell: lvl.dwellSec, best };
      });
    });

    for (const h of held) {
      expect(h.best, `${h.name} needs a ${h.dwell}s hold, longest achieved ${h.best.toFixed(1)}s`)
        .toBeGreaterThan(h.dwell);
    }
  });
});

test.describe('difficulty tiers match Stake-Out', () => {
  test('names, tolerances and humps are the ported values', async ({ page }) => {
    await page$(page);
    const levels = await page.evaluate(() => window.TribrachSim.LEVELS);

    expect(levels).toHaveLength(4);
    expect(levels.map(l => l.bubbleTolerancePct)).toEqual([30, 18, 9, 3]);
    expect(levels.map(l => l.bubbleHump)).toEqual([0.50, 0.75, 0.75, 1.00]);
    expect(levels.map(l => l.name)).toEqual([
      'Level 1 — Rookie',
      'Level 2 — Journeyman',
      'Level 3 — Foreman',
      'Level 4 — No Room For Error',
    ]);
    // tribrach-specific: fewer setups than Stake-Out's 3/4/5/6 points
    expect(levels.map(l => l.setups)).toEqual([2, 3, 4, 5]);
    // dwell must rise with difficulty
    const d = levels.map(l => l.dwellSec);
    expect(d).toEqual([...d].sort((a, b) => a - b));
  });
});
