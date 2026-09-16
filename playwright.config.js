// Dev-only harness. Nothing here ships — the game is one static index.html.
//
// This environment pre-installs Chromium and pins PLAYWRIGHT_BROWSERS_PATH at
// it, but the npm @playwright/test version wants a newer build number than the
// one on disk. Rather than downloading a second browser, point launch() at the
// Chromium that is already here. CHROMIUM_PATH lets CI or another machine
// override it; leave it unset and Playwright resolves its own browser normally.
const { defineConfig, devices } = require('@playwright/test');
const fs = require('fs');

function localChromium() {
  const explicit = process.env.CHROMIUM_PATH;
  if (explicit) return explicit;
  for (const p of [
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ]) if (fs.existsSync(p)) return p;
  return undefined;   // fall back to Playwright's own managed download
}

const executablePath = localChromium();

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    // index.html is fully self-contained, so file:// is a legitimate host.
    // No dev server, no ports, nothing to start.
    baseURL: 'file://' + __dirname + '/',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } } },
    { name: 'mobile',  use: { ...devices['Pixel 7'],        launchOptions: { executablePath } } },
  ],
});
