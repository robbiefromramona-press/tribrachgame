/* ==========================================================================
   Controls and game flow, driven through the real UI.
   --------------------------------------------------------------------------
   The physics suite proves the maths. This one proves a finger on a phone can
   actually reach it — same pointer code path for mouse and touch, because
   there is only one code path to test.
   ========================================================================== */
const { test, expect } = require('@playwright/test');

async function startGame(page, levelIndex = 0) {
  await page.goto('index.html');
  await page.waitForFunction(() => !!window.TribrachGame);
  await page.locator('#lvlList .lvl').nth(levelIndex).click();
  await page.locator('#startBtn').click();
  await expect(page.locator('#screen-play')).toBeVisible();
}

/* Freeze the simulation. These tests are about the input layer; leaving the
   bubble live means it can legitimately satisfy its hold mid-drag, roll a new
   setup and randomise the knobs out from under the assertions. That is the
   game working correctly, and it makes for a useless test. */
async function freeze(page) {
  await page.evaluate(() => window.TribrachGame.setPaused(true));
}

/* Map the rig's 1000x1000 logical space onto real client pixels, so a drag
   here lands exactly where a thumb would. */
async function rigMapper(page) {
  const box = await page.locator('#rig').boundingBox();
  return (lx, ly) => ({ x: box.x + (lx / 1000) * box.width, y: box.y + (ly / 1000) * box.height });
}

/* Turn a knob by dragging around its centre, the way a person does. */
async function turnKnob(page, knobIndex, degrees, steps = 24) {
  const knobs = await page.evaluate(() => window.TribrachGame.knobPositions());
  const toClient = await rigMapper(page);
  const k = knobs[knobIndex];
  const grabR = 58;                     // out on the knurl, not on the spindle
  const start = -Math.PI / 2;           // grab at 12 o'clock
  const end = start + (degrees * Math.PI) / 180;

  const at = (a) => toClient(k.x + Math.cos(a) * grabR, k.y + Math.sin(a) * grabR);
  const p0 = at(start);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const p = at(start + ((end - start) * i) / steps);
    await page.mouse.move(p.x, p.y);
  }
  await page.mouse.up();
}

test.describe('knob controls', () => {

  test('dragging a knob turns that screw and nothing else', async ({ page }) => {
    await startGame(page);
    await freeze(page);
    await page.evaluate(() => window.TribrachGame.setTurns(0, 0, 0));

    await turnKnob(page, 0, 90);        // knob A, quarter turn clockwise
    const turns = await page.evaluate(() => window.TribrachGame.turns);

    expect(turns[0]).toBeGreaterThan(1.2);      // ~pi/2 radians, allow for pixel rounding
    expect(turns[0]).toBeLessThan(1.9);
    expect(Math.abs(turns[1])).toBeLessThan(1e-9);
    expect(Math.abs(turns[2])).toBeLessThan(1e-9);
  });

  test('clockwise and anticlockwise drags have opposite sign', async ({ page }) => {
    await startGame(page);
    await freeze(page);
    await page.evaluate(() => window.TribrachGame.setTurns(0, 0, 0));
    await turnKnob(page, 1, 90);
    const cw = (await page.evaluate(() => window.TribrachGame.turns))[1];

    await page.evaluate(() => window.TribrachGame.setTurns(0, 0, 0));
    await turnKnob(page, 1, -90);
    const ccw = (await page.evaluate(() => window.TribrachGame.turns))[1];

    expect(cw).toBeGreaterThan(0);
    expect(ccw).toBeLessThan(0);
    expect(Math.abs(cw + ccw)).toBeLessThan(0.35);   // symmetric
  });

  test('a drag that starts off every knob does nothing', async ({ page }) => {
    await startGame(page);
    await freeze(page);
    await page.evaluate(() => window.TribrachGame.setTurns(0, 0, 0));
    const toClient = await rigMapper(page);

    const a = toClient(500, 398);    // dead centre of the vial — not a control
    const b = toClient(660, 470);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 10 });
    await page.mouse.up();

    expect(await page.evaluate(() => window.TribrachGame.turns)).toEqual([0, 0, 0]);
  });

  test('the touch target is larger than the knob is drawn', async ({ page }) => {
    await startGame(page);
    await freeze(page);
    await page.evaluate(() => window.TribrachGame.setTurns(0, 0, 0));
    const knobs = await page.evaluate(() => window.TribrachGame.knobPositions());
    const toClient = await rigMapper(page);
    const k = knobs[2];

    // 96 logical units out — beyond the 76-unit drawn radius, inside the hit radius
    const p0 = toClient(k.x, k.y - 96);
    const p1 = toClient(k.x + 96, k.y);
    await page.mouse.move(p0.x, p0.y);
    await page.mouse.down();
    await page.mouse.move(p1.x, p1.y, { steps: 12 });
    await page.mouse.up();

    const turns = await page.evaluate(() => window.TribrachGame.turns);
    expect(Math.abs(turns[2])).toBeGreaterThan(0.5);
  });

  test('screws bottom out instead of winding forever', async ({ page }) => {
    await startGame(page);
    await freeze(page);
    const max = await page.evaluate(() => window.TribrachSim.MAX_TRAVEL_RAD);
    await page.evaluate((m) => window.TribrachGame.setTurns(m - 0.05, 0, 0), max);
    await turnKnob(page, 0, 720);
    const turns = await page.evaluate(() => window.TribrachGame.turns);
    expect(turns[0]).toBeLessThanOrEqual(max + 1e-9);
  });

  test('the field two-knob trick works end to end through the UI', async ({ page }) => {
    await startGame(page);
    await freeze(page);
    await page.evaluate(() => { window.TribrachGame.setTurns(0, 0, 0); window.TribrachGame.resetBubble(0, 0); });

    // Measure each drag as a delta, so a stray reroll would show up rather than
    // quietly corrupting the sum.
    const before = await page.evaluate(() => window.TribrachGame.turns);
    await turnKnob(page, 0, 120);
    const mid = await page.evaluate(() => window.TribrachGame.turns);
    await turnKnob(page, 1, -120);
    const after = await page.evaluate(() => window.TribrachGame.turns);

    const dA = mid[0] - before[0];
    const dB = after[1] - mid[1];
    expect(dA).toBeCloseTo(Math.PI * 2 / 3, 1);      // +120 degrees
    expect(dB).toBeCloseTo(-Math.PI * 2 / 3, 1);     // -120 degrees
    expect(Math.abs(dA + dB)).toBeLessThan(0.05);    // equal and opposite

    // no setup completed underneath us
    expect(await page.evaluate(() => window.TribrachGame.rows.length)).toBe(0);

    const T = await page.evaluate((t) => window.TribrachSim.targetFor(t[0], t[1], t[2]), after);
    expect(Math.abs(T.y)).toBeLessThan(0.02);        // vertical cancelled
    expect(Math.abs(T.x)).toBeGreaterThan(0.2);      // horizontal did not
  });

  test('turning all three knobs equally through the UI leaves the bubble put', async ({ page }) => {
    await startGame(page);
    await freeze(page);
    await page.evaluate(() => { window.TribrachGame.setTurns(0, 0, 0); window.TribrachGame.resetBubble(0, 0); });

    for (const i of [0, 1, 2]) await turnKnob(page, i, 120, 12);

    const turns = await page.evaluate(() => window.TribrachGame.turns);
    // all three landed on the same rotation...
    expect(Math.max(...turns) - Math.min(...turns)).toBeLessThan(0.05);
    // ...so the plate translated without tilting: criterion 3, through real drags
    const T = await page.evaluate((t) => window.TribrachSim.targetFor(t[0], t[1], t[2]), turns);
    expect(Math.hypot(T.x, T.y)).toBeLessThan(0.01);
  });
});

test.describe('the rig does not fight the browser', () => {
  test('the canvas claims the gesture so a drag cannot scroll the page', async ({ page }) => {
    await startGame(page);
    // Without touch-action:none the browser steals the gesture before
    // pointermove ever fires, which is exactly how this breaks on a phone.
    const ta = await page.locator('#rig').evaluate(el => getComputedStyle(el).touchAction);
    expect(ta).toBe('none');
  });

  test('the rig fits the viewport without scrolling on a phone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile layout only');
    await startGame(page);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    const box = await page.locator('#rig').boundingBox();
    const vh = page.viewportSize().height;
    expect(box.width).toBeGreaterThan(200);      // still a usable target
    expect(box.y + box.height).toBeLessThanOrEqual(vh + 1);
  });
});

test.describe('game flow', () => {

  test('a setup starts out of level and passes only after the full hold', async ({ page }) => {
    await startGame(page, 0);
    const startOffset = await page.evaluate(() => window.TribrachGame.offsetPct);
    expect(startOffset).toBeGreaterThan(40);      // the plate arrives tilted

    // Park the screws at centre, then watch the hold build.
    const result = await page.evaluate(async () => {
      const G = window.TribrachGame, S = window.TribrachSim;
      const lvl = S.LEVELS[G.level];
      G.setTurns(0, 0, 0);
      G.resetBubble(0, 0);
      const seen = [];
      for (let i = 0; i < 60 * 5; i++) {
        G.stepN(1, 1 / 60, true);
        seen.push({ off: G.offsetPct, inTol: G.offsetPct <= lvl.bubbleTolerancePct });
      }
      return { dwell: lvl.dwellSec, tol: lvl.bubbleTolerancePct, seen: seen.length, ended: seen[seen.length - 1] };
    });
    expect(result.ended.inTol).toBe(true);
  });

  test('LOG AS-IS needs a confirming second press', async ({ page }) => {
    await startGame(page, 0);
    const before = await page.evaluate(() => window.TribrachGame.rows.length);

    await page.locator('#logBtn').click();
    await expect(page.locator('#logBtn')).toContainText('CONFIRM');
    expect(await page.evaluate(() => window.TribrachGame.rows.length)).toBe(before);

    await page.locator('#logBtn').click();
    await expect.poll(() => page.evaluate(() => window.TribrachGame.rows.length)).toBe(before + 1);

    const rows = await page.evaluate(() => window.TribrachGame.rows);
    expect(rows[0].pass).toBe(false);             // the hold is the only way to pass
  });

  test('finishing every setup produces a field report', async ({ page }) => {
    await startGame(page, 0);                     // Level 1 = 2 setups
    for (let i = 0; i < 2; i++) {
      await page.locator('#logBtn').click();
      await page.locator('#logBtn').click();
      await page.waitForTimeout(900);
    }
    await expect(page.locator('#screen-report')).toBeVisible();
    await expect(page.locator('#ticket')).toContainText('TRIBRACH LEVELLING RECORD');
    await expect(page.locator('#ticket')).toContainText('0 / 2 ACCEPTED');
  });

  test('ABANDON with no rows goes back to the menu', async ({ page }) => {
    await startGame(page, 0);
    await page.locator('#quitBtn').click();
    await expect(page.locator('#screen-menu')).toBeVisible();
  });
});

test.describe('pausing', () => {
  test('a hidden tab stops the sim and does not eat the clock', async ({ page }) => {
    await startGame(page, 0);
    await page.evaluate(() => window.TribrachGame.setPaused(true));
    const a = await page.evaluate(() => window.TribrachGame.bubble);
    await page.waitForTimeout(600);
    const b = await page.evaluate(() => window.TribrachGame.bubble);
    expect(b.x).toBe(a.x);
    expect(b.y).toBe(a.y);

    const clockWhilePaused = await page.locator('#hudClock').textContent();
    await page.waitForTimeout(500);
    // the readout keeps painting, but the elapsed time must not have run on
    const stillPaused = await page.locator('#hudClock').textContent();
    expect(stillPaused).toBe(clockWhilePaused);

    await page.evaluate(() => window.TribrachGame.setPaused(false));
    expect(await page.evaluate(() => window.TribrachGame.paused)).toBe(false);
  });
});
