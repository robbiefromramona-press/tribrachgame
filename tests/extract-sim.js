/* Pulls the <script id="tribrach-sim"> block straight out of index.html and
   evaluates it, so the tests exercise the SHIPPING code rather than a copy
   that can silently drift out of sync. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadSim(htmlPath) {
  const html = fs.readFileSync(
    htmlPath || path.join(__dirname, '..', 'index.html'), 'utf8');
  const m = html.match(/<script id="tribrach-sim">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('could not find <script id="tribrach-sim"> in index.html');
  const sandbox = { window: {}, Math: Math, console: console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(m[1], sandbox, { filename: 'tribrach-sim.js' });
  if (!sandbox.window.TribrachSim) throw new Error('sim did not export TribrachSim');
  return sandbox.window.TribrachSim;
}

module.exports = { loadSim };
