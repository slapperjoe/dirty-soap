// CDP perf driver for the apinox Monaco perf harness (task t_c20ec889).
// Launches headless chromium, opens perf.html, injects dev/perf-driver.js,
// polls for window.__driverDone, dumps window.__driverResult to JSON.
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = 9223;
const CHROME = '/usr/bin/chromium';
const URL = 'http://127.0.0.1:3111/perf.html';
const DRIVER = fs.readFileSync(path.join(__dirname, 'perf-driver.js'), 'utf8');
const OUT = path.join(__dirname, 'perf-baseline-after.json');

const chrome = spawn(CHROME, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--remote-debugging-port=' + PORT,
  '--window-size=1280,900',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function main() {
  // wait for chrome
  let tabs = null;
  for (let i = 0; i < 40; i++) {
    try { tabs = await getJson(`http://127.0.0.1:${PORT}/json`); break; } catch (e) { await sleep(250); }
  }
  if (!tabs) throw new Error('chrome not up');
  const page = tabs.find((t) => t.type === 'page') || tabs[0];
  console.log('[driver] target:', page.url, 'type:', page.type);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let msgId = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++msgId;
    pending.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  await new Promise((res) => ws.onopen = res);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  const errors = [];
  ws.addEventListener('message', (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        const txt = (m.params.args || []).map((a) => a.value || a.description || '').join(' ');
        if (txt) errors.push('[console] ' + txt.slice(0, 300));
      }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        errors.push('[exception] ' + (d.exception ? d.exception.description : d.text).slice(0, 300));
      }
    } catch (e) {}
  });
  await send('Page.navigate', { url: URL });
  await sleep(10000);

  // wait for __perf + editors (harness mounts editors asynchronously)
  let perf = false;
  for (let i = 0; i < 120; i++) {
    const r = await send('Runtime.evaluate', { expression: 'JSON.stringify({href:location.href, perf:typeof window.__perf, eds:window.__perf?window.__perf.getEditors().length:-1})', returnByValue: true });
    const raw = r && r.result; // RemoteObject
    if (i % 10 === 0) console.log('[driver] wait:', raw && raw.value ? raw.value : JSON.stringify(raw));
    if (raw && raw.value) {
      try {
        const o = JSON.parse(raw.value);
        if (o.perf === 'object' && o.eds >= 2) { perf = true; break; }
      } catch (e) {}
    }
    await sleep(500);
  }
  if (!perf) {
    const dbg = await send('Runtime.evaluate', { expression: `JSON.stringify({perf:!!window.__perf, monaco:!!window.__monaco, editors:window.__perf?window.__perf.getEditors().length:-1, rootHtml:(document.getElementById('root')||{}).innerHTML? 'has-root':'no-root'})`, returnByValue: true });
    throw new Error('perf not ready: ' + JSON.stringify(dbg) + '\nPAGE ERRORS:\n' + errors.slice(0, 8).join('\n'));
  }
  console.log('[driver] perf ready, running perf-driver.js...');

  // inject driver
  await send('Runtime.evaluate', { expression: DRIVER, awaitPromise: true });

  // poll for done (driver takes ~3.6+1.5+3.8+~1 = ~10s, allow 60s)
  let done = false;
  for (let i = 0; i < 120; i++) {
    const r = await send('Runtime.evaluate', { expression: 'window.__driverDone === true', returnByValue: true });
    if (r && r.result && r.result.value === true) { done = true; break; }
    await sleep(500);
  }
  if (!done) throw new Error('driver timed out');
  const res = await send('Runtime.evaluate', { expression: 'window.__driverResult', returnByValue: true });
  const result = res.result.value;
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log('[driver] wrote ' + OUT);
  console.log('delta keys:', JSON.stringify(result.delta, null, 1));
  process.exit(0);
}

main().catch((e) => { console.error('[driver] ERROR:', e.message); process.exit(1); });
process.on('exit', () => { try { chrome.kill('SIGKILL'); } catch (e) {} });
