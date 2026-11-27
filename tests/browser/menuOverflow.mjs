import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../..', import.meta.url));
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
<div id="root"></div><script type="module">
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Menu from '/src/components/Menu.tsx';
import { getLocaleMessages } from '/src/locales/index.ts';
import '/src/index.css';
import '/src/App.css';
import '/src/styles/navigation.css';
function Fixture() {
  const [target, setTarget] = useState(null);
  return <main className="app-shell"><header className="app-header">
    <div className="header-brand has-menu"><div className="header-menu" ref={setTarget} /></div>
  </header><section className="dashboard-layout">
    <Menu messages={getLocaleMessages('en')} section="transactions" onSelect={() => {}}
      toggleTarget={target} pinnedFilters={Array.from({length: 12}, (_, i) => ({id: String(i), name: 'Saved filter ' + i}))} />
    <div className="dashboard-main"><div className="dashboard-content"><section className="dashboard-panel">
      <h1>Transactions</h1><div className="panel-scroll"><div style={{height: 2000}}>Scrollable content</div></div>
    </section></div></div>
  </section></main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
</script></body></html>`;
const server = await createServer({
  root,
  server: { host: '127.0.0.1', port: 5190, strictPort: true, ws: false },
  plugins: [{ name: 'menu-overflow-fixture', configureServer(s) {
    s.middlewares.use(async (req, res, next) => {
      if (req.url !== '/__menu-qa') return next();
      res.setHeader('Content-Type', 'text/html');
      // Vite only transforms JSX in a module with a JSX filename.
      const page = html.replace('<script type="module">', '<script type="module" src="/__menu-fixture.jsx"></script><script type="text/plain">');
      res.end(await s.transformIndexHtml(req.url, page));
    });
  }, resolveId(id) { if (id === '/__menu-fixture.jsx') return id; },
  load(id) { if (id === '/__menu-fixture.jsx') return html.split('<script type="module">')[1].split('</script>')[0]; } }],
});
const profile = mkdtempSync('/private/tmp/menu-chrome-');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let chrome, socket;
try {
  await server.listen();
  chrome = spawn(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--remote-debugging-port=9247', '--user-data-dir=' + profile, 'about:blank',
  ], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch('http://127.0.0.1:9247/json')).json(); break; }
    catch { await delay(100); }
  }
  assert.ok(targets, 'Chrome did not start');
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => { socket.onopen = resolve; });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(message.error); else resolve(message.result);
  };
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  for (const [width, height, mobile] of [[800, 360, true], [1024, 500, true], [390, 844, true], [800, 360, false], [1280, 800, false]]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, mobile, deviceScaleFactor: 1 });
    await cdp('Page.navigate', { url: 'http://127.0.0.1:5190/__menu-qa' });
    for (let i = 0; i < 100 && !await evaluate("!!document.querySelector('.menu-toggle')"); i++) await delay(50);
    const dropdown = width <= 1024;
    const visibility = () => evaluate("getComputedStyle(document.querySelector('.main-menu')).visibility");
    assert.equal(await visibility(), dropdown ? 'hidden' : 'visible', `${width}x${height}: collapsed scroll container visibility`);
    if (dropdown) await evaluate("document.querySelector('.menu-toggle').click()");
    await delay(250);
    assert.equal(await visibility(), 'visible');
    assert.equal(await evaluate(`(() => {
      const menu = document.querySelector('.main-menu');
      menu.scrollTop = menu.scrollHeight;
      return menu.scrollHeight > menu.clientHeight && menu.scrollTop > 0;
    })()`), true, `${width}x${height}: long menu remains scrollable`);
    assert.equal(await evaluate(`(() => {
      const panel = document.querySelector('.panel-scroll');
      panel.scrollTop = 100;
      return panel.scrollTop > 0;
    })()`), true, 'Content remains scrollable');
    if (dropdown) {
      await evaluate("document.querySelector('.menu-items .menu-button').click()");
      await delay(250);
      assert.equal(await visibility(), 'hidden', 'Selecting a section hides the scroll container');
    }
  }
  console.log('Menu overflow checks passed: mobile landscape, portrait, desktop emulation, desktop sidebar, menu and content scrolling.');
} finally {
  socket?.close();
  if (chrome && chrome.exitCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill();
    await exited;
  }
  await server.close();
  rmSync(profile, { recursive: true, force: true });
}
