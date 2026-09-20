/* ==========================================================================
   prep_layers.js — turn the 1920x1080 design layers into shippable sprites.
   --------------------------------------------------------------------------
   DEV-ONLY. Nothing in tools/ ships. The game is still one static index.html
   with no build step; this script just prepares the images that index.html
   then loads over plain relative paths.

   Why it exists: every layer the art package hands over is a full 1920x1080
   RGBA frame, even the ones that are 99% transparent — the bubble is 132x132
   of actual pixels inside a 2.7MB file. Twenty of those is ~61MB, which is an
   absurd first load for a game that is meant to be played on a phone.

   So, exactly the trick Stake-Out's tools/prep_v12_layers.py pulls:
     1. find each layer's non-transparent bounding box,
     2. crop to it and remember the offset,
     3. write .webp (small) with a .png beside it (fallback),
     4. print the offsets so they can be pasted into index.html.

   The offsets have to be baked into index.html rather than loaded from a JSON
   file, because the game runs off file:// in the tests and fetch() of a local
   JSON is blocked there. One less moving part anyway.

   Run:  node tools/prep_layers.js
   Reads:  _design-assets/tribrach-v2/{hud,startmenu}/*.png   (git-ignored)
   Writes: assets/img/{hud,startmenu}/*.{webp,png} + README.txt
   ========================================================================== */
'use strict';

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, '_design-assets', 'tribrach-v2');
const OUT = path.join(ROOT, 'assets', 'img');

/* The design canvas everything is registered against. Both layer packages were
   exported on it, which is the entire reason stacking them needs no manual
   nudging. */
const CANVAS_W = 1920, CANVAS_H = 1080;

/* Alpha at or below this counts as empty when hunting for the bounding box.
   Not zero: the exports carry a faint halo of near-transparent pixels around
   every edge, and trusting those would give every layer a bounding box the
   size of the whole canvas, which would defeat the point of the script. */
const ALPHA_FLOOR = 8;

/* WebP quality. 0.92 keeps the knurling on the knobs and the grain in the
   background plate clean; below about 0.85 the yellow bevels start to band. */
const WEBP_Q = 0.92;

/* Layers that must not ship as one sprite, with the sub-rectangles to cut out
   instead. Rectangles are in design-canvas pixels and were measured off the
   layers themselves (connected-component scan), not eyeballed.

   knobs   — the three knobs arrive on one layer, but each one has to rotate
             under its own finger, so they cannot share a bitmap.
   lcd     — this layer is nothing but baked sample values ("00:00:00",
             "12.4%"), all of which the game draws live. The only pixels worth
             keeping are the two % signs, because the Stake-Out digit atlas we
             match against has 0-9 and a decimal point and nothing else. */
const SPLIT = {
  /* v3 knob art: drawn straight down the axis, so each knob is a TRUE CIRCLE —
     measured aspect 1.000, and its alpha fills the circumscribed circle to
     within 0.2%. That is worth stating plainly because it is what lets
     index.html spin the whole sprite about the middle of its own bitmap and be
     geometrically right, with no correction of any kind.

     The two earlier passes were not circles. They were three-quarter views, so
     the cap was an ellipse and the knurl was the side wall of a cylinder, and
     no rotation of a flat bitmap moves either of those correctly. See the
     README for what that cost.

     Each crop is the knob's own bounding box plus 2px, so the centre of the
     crop is the axis and the anti-aliased rim is not clipped. */
  tribrach_04_knobs: [
    { name: 'knob_a', x: 488, y: 249, w: 174, h: 174 },
    { name: 'knob_b', x: 1266, y: 247, w: 177, h: 177 },
    { name: 'knob_c', x: 840, y: 728, w: 239, h: 239 },
  ],
  tribrach_06_lcd_readouts: [
    { name: 'pct_offset', x: 373, y: 339, w: 53, h: 55 },
    { name: 'pct_hold', x: 279, y: 647, w: 45, h: 47 },
    /* Both clock colons are the same glyph, so one crop gets drawn twice. It
       has to be a crop and not two filled squares: the dots are 11x10, rounded,
       and the pair leans to the right like the rest of the LCD face. Squares
       drawn to the bounding box came out chunky, upright and a shade too high,
       which is exactly how a colon announces that it was not part of the art. */
    { name: 'colon', x: 229, y: 198, w: 18, h: 34 },
  ],
};

/* Layers the game reproduces from scratch, so shipping them would be dead
   weight. 07 is the hold ring's lit arc frozen at roughly a third full — the
   game has to draw every fill from 0 to 100%, so it draws the arc itself and
   only borrows the geometry and the colour. */
const SKIP = ['tribrach_07_hold_fill'];

/* ---- repairs -------------------------------------------------------------
   The package was split out of a FLATTENED master, so two layers still carry
   pixels that belong to a layer above them. Both would be permanently wrong on
   screen — a progress ring that is never empty, and a hole in the glass — so
   they get patched here rather than worked around at runtime.

   ring   The static-UI plate has the sample fill (about a third of the ring)
          baked into the track, so the bar could never read 0%. The track is 40
          segments at a 9 degree pitch, and 180 degrees is exactly 20 of them —
          which means a point reflection through the ring's centre lands every
          pixel on the matching spot of an UNLIT segment, phase and all. So the
          lit wedge is simply overwritten with its own opposite side.

   glass  The bubble was lifted off the vial and the hole left behind was
          filled by smearing the nearest pixels, which left a fan radiating to
          the rim. The vial is symmetric about its vertical axis and so are the
          crosshair and the rings, so the patch is the glass's own mirror
          image, faded in through a soft ellipse so there is no seam. */
const REPAIRS = {
  tribrach_01_static_ui: { kind: 'ring', cx: 271, cy: 654, rIn: 92, rOut: 148, fromDeg: -10, toDeg: 84 },
  tribrach_03_level_glass: { kind: 'mirror', axisX: 961, cx: 1080, cy: 320, rx: 125, ry: 115, solid: 0.62 },

  /* title  The wordmark layer kept a bite of the construction photo above
            "…ach" (buildings and the sun), and a scrap of the hero's rotation
            arrows under the "T". Both are invisible in the landscape menu,
            because there they sit exactly on top of the identical pixels in
            the background layer — but the portrait menu moves the wordmark
            away from the photo and they come along as floating debris.

            Rectangles, not a colour key: the sun is the same yellow as the
            wordmark, so nothing can tell them apart by pixel. The two top
            rectangles deliberately stop either side of the 'h' ascender
            (x 1688-1748) rather than risk clipping it. */
  startmenu_03_title_branding: {
    kind: 'erase',
    rects: [
      { x: 1485, y: 76,  w: 203, h: 82 },   // buildings, left of the h stem
      { x: 1748, y: 76,  w: 77,  h: 82 },   // sun and buildings, right of it
      /* The strip directly over the h stem. Here the bleed runs straight into
         the letter with no transparent gap between them, so the cut is placed
         by scanning the columns: the block ends by y 150 and the ascender
         picks up at 151-153. The reticle arc that belongs in this layer sits
         further left (around x 1395) and is not touched. */
      { x: 1688, y: 76,  w: 60,  h: 74 },
      { x: 960,  y: 262, w: 240, h: 64 },   // rotation-arrow scrap, bottom left
    ],
  },
};

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const report = [];

  for (const group of ['hud', 'startmenu']) {
    const srcDir = path.join(SRC, group);
    const outDir = path.join(OUT, group);
    fs.mkdirSync(outDir, { recursive: true });

    // the registration composite is a proofing aid, not a layer — skip it
    const files = fs.readdirSync(srcDir)
      .filter((f) => /\.png$/i.test(f) && !/registration_composite/i.test(f))
      .sort();

    report.push('', '[' + group + ']');

    for (const file of files) {
      const stem = file.replace(/\.png$/i, '');
      if (SKIP.indexOf(stem) >= 0) {
        report.push('  ' + stem.padEnd(34) + ' SKIPPED (drawn live by the game)');
        continue;
      }

      let b64 = fs.readFileSync(path.join(srcDir, file)).toString('base64');
      if (REPAIRS[stem]) {
        b64 = await repair(page, b64, REPAIRS[stem]);
        report.push('  ' + stem.padEnd(34) + ' repaired (' + REPAIRS[stem].kind + ')');
      }

      /* Split layers get their sub-rectangles cut out and nothing else. */
      if (SPLIT[stem]) {
        const parts = await page.evaluate(async (args) => {
          const img = new Image();
          img.src = 'data:image/png;base64,' + args.b64;
          await img.decode();
          return args.rects.map((r) => {
            const c = document.createElement('canvas');
            c.width = r.w;
            c.height = r.h;
            c.getContext('2d').drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
            return { r: r, webp: c.toDataURL('image/webp', args.q), png: c.toDataURL('image/png') };
          });
        }, { b64, rects: SPLIT[stem], q: WEBP_Q });

        for (const p of parts) {
          const w = writeFile(outDir, p.r.name, 'webp', p.webp);
          const g = writeFile(outDir, p.r.name, 'png', p.png);
          report.push(
            '  ' + p.r.name.padEnd(34) +
            ' x=' + String(p.r.x).padStart(4) + ' y=' + String(p.r.y).padStart(4) +
            ' w=' + String(p.r.w).padStart(4) + ' h=' + String(p.r.h).padStart(4) +
            '   cut from ' + stem + '   ' + kb(w) + ' webp / ' + kb(g) + ' png'
          );
          console.log("    '" + p.r.name + "': { x: " + p.r.x + ", y: " + p.r.y +
                      ", w: " + p.r.w + ", h: " + p.r.h + " },");
        }
        continue;
      }

      const cut = await page.evaluate(async (args) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + args.b64;
        await img.decode();

        const full = document.createElement('canvas');
        full.width = img.width;
        full.height = img.height;
        const fx = full.getContext('2d');
        fx.drawImage(img, 0, 0);

        const W = img.width, H = img.height;
        const data = fx.getImageData(0, 0, W, H).data;

        // scan for the alpha bounding box
        let x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (data[(y * W + x) * 4 + 3] > args.floor) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
        }
        if (x1 < 0) return null;                       // fully transparent

        const w = x1 - x0 + 1, h = y1 - y0 + 1;
        const crop = document.createElement('canvas');
        crop.width = w;
        crop.height = h;
        crop.getContext('2d').drawImage(full, x0, y0, w, h, 0, 0, w, h);

        return {
          x: x0, y: y0, w: w, h: h,
          srcW: W, srcH: H,
          webp: crop.toDataURL('image/webp', args.q),
          png: crop.toDataURL('image/png'),
        };
      }, { b64, floor: ALPHA_FLOOR, q: WEBP_Q });

      if (!cut) {
        report.push('  ' + file.padEnd(34) + ' SKIPPED (fully transparent)');
        continue;
      }

      const base = stem;
      const wBytes = writeFile(outDir, base, 'webp', cut.webp);
      const pBytes = writeFile(outDir, base, 'png', cut.png);

      const srcBytes = fs.statSync(path.join(srcDir, file)).size;
      report.push(
        '  ' + base.padEnd(34) +
        ' x=' + String(cut.x).padStart(4) +
        ' y=' + String(cut.y).padStart(4) +
        ' w=' + String(cut.w).padStart(4) +
        ' h=' + String(cut.h).padStart(4) +
        '   ' + kb(srcBytes) + ' -> ' + kb(wBytes) + ' webp / ' + kb(pBytes) + ' png'
      );

      // the line to paste into index.html's SPRITES table
      console.log("    '" + base + "': { x: " + cut.x + ", y: " + cut.y +
                  ", w: " + cut.w + ", h: " + cut.h + " },");
    }
  }

  await browser.close();

  const header = [
    'Generated by tools/prep_layers.js. Do not hand-edit; re-run the script.',
    '',
    'Every sprite here is a crop out of a ' + CANVAS_W + 'x' + CANVAS_H + ' design layer.',
    'x/y is where the crop sits on that canvas — draw it there and the stack',
    'registers with no further nudging. Those same numbers are baked into the',
    'SPRITES table in index.html.',
    '',
    'Masters are NOT in this repo (61MB of full-canvas RGBA). They live in',
    'the shared Drive folder: Claude/webapps/tribrach game/updated UI/.',
    'Drop them back into _design-assets/tribrach-v2/{hud,startmenu}/ to re-run.',
  ].join('\n');

  fs.writeFileSync(path.join(OUT, 'README.txt'), header + '\n' + report.join('\n') + '\n');
  console.log('\nWrote ' + path.relative(ROOT, path.join(OUT, 'README.txt')));
}

/* Patch a layer before it is cropped. Returns fresh base64 PNG data. */
function repair(page, b64, spec) {
  return page.evaluate(async (args) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + args.b64;
    await img.decode();
    const W = img.width, H = img.height;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const s = args.spec;

    if (s.kind === 'ring') {
      /* Point reflection through the ring centre: (x,y) -> (2cx-x, 2cy-y).
         Because the lit wedge is a whole number of segments away from its
         opposite side, the segment gaps line up and the seam vanishes. */
      const src = x.getImageData(0, 0, W, H).data;
      const out = x.getImageData(0, 0, W, H);
      const y0 = Math.max(0, Math.floor(s.cy - s.rOut));
      const y1 = Math.min(H - 1, Math.ceil(s.cy + s.rOut));
      const x0 = Math.max(0, Math.floor(s.cx - s.rOut));
      const x1 = Math.min(W - 1, Math.ceil(s.cx + s.rOut));
      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          const dx = px - s.cx, dy = py - s.cy;
          const r = Math.hypot(dx, dy);
          if (r < s.rIn || r > s.rOut) continue;
          const a = Math.atan2(dx, -dy) * 180 / Math.PI;   // 0 = twelve o'clock
          if (a < s.fromDeg || a > s.toDeg) continue;
          const sx = Math.round(2 * s.cx - px), sy = Math.round(2 * s.cy - py);
          if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
          const di = (py * W + px) * 4, si = (sy * W + sx) * 4;
          out.data[di] = src[si];
          out.data[di + 1] = src[si + 1];
          out.data[di + 2] = src[si + 2];
          out.data[di + 3] = src[si + 3];
        }
      }
      x.putImageData(out, 0, 0);

    } else if (s.kind === 'mirror') {
      /* The layer's own mirror image, faded in through a soft ellipse. */
      const m = document.createElement('canvas');
      m.width = W;
      m.height = H;
      const mx = m.getContext('2d');
      mx.translate(2 * s.axisX, 0);
      mx.scale(-1, 1);
      mx.drawImage(c, 0, 0);

      mx.setTransform(1, 0, 0, 1, 0, 0);
      mx.globalCompositeOperation = 'destination-in';
      mx.save();
      mx.translate(s.cx, s.cy);
      mx.scale(s.rx, s.ry);
      const g = mx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(s.solid, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      mx.fillStyle = g;
      mx.fillRect(-1, -1, 2, 2);
      mx.restore();

      x.drawImage(m, 0, 0);

    } else if (s.kind === 'erase') {
      s.rects.forEach(function (r) { x.clearRect(r.x, r.y, r.w, r.h); });
    }

    return c.toDataURL('image/png').split(',')[1];
  }, { b64, spec });
}

function writeFile(dir, base, ext, dataUrl) {
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  fs.writeFileSync(path.join(dir, base + '.' + ext), buf);
  return buf.length;
}

function kb(n) { return (n / 1024).toFixed(0).padStart(5) + 'KB'; }

main().catch((err) => { console.error(err); process.exit(1); });
