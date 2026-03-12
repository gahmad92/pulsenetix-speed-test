const { app, BrowserWindow, ipcMain } = require('electron');
const http  = require('http');
const https = require('https');
const os    = require('os');
const { execSync } = require('child_process');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200, height: 820,
    minWidth: 1000, minHeight: 700,
    frame: false, transparent: false,
    backgroundColor: '#050a0e',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
ipcMain.on('minimize', (e) => BrowserWindow.fromWebContents(e.sender).minimize());
ipcMain.on('maximize', (e) => { const w = BrowserWindow.fromWebContents(e.sender); w.isMaximized() ? w.unmaximize() : w.maximize(); });
ipcMain.on('close',    (e) => BrowserWindow.fromWebContents(e.sender).close());

// ── Server list ────────────────────────────────────────────
const SERVERS = [
  {
    id: 'tele2-eu',
    name: 'Tele2',
    region: 'Sweden, Europe',
    flag: '🇸🇪',
    protocol: 'http',
    pingHost: 'speedtest.tele2.net',
    pingPath: '/',
    downloadUrl: 'http://speedtest.tele2.net/100MB.zip',
    uploadHost: 'speedtest.tele2.net',
    uploadPath: '/upload.php',
    isDefault: true,
    enabled: true,
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    region: 'Nearest CF Node (PK/SG)',
    flag: '🌐',
    protocol: 'https',
    pingHost: 'speed.cloudflare.com',
    pingPath: '/__down?bytes=1',
    downloadUrl: 'https://speed.cloudflare.com/__down?bytes=104857600',
    uploadHost: 'speed.cloudflare.com',
    uploadPath: '/__up',
    enabled: true,
  },
  {
    id: 'thinkbroadband',
    name: 'ThinkBroadband',
    region: 'UK, Europe',
    flag: '🇬🇧',
    protocol: 'https',
    pingHost: 'ipv4.download.thinkbroadband.com',
    pingPath: '/5MB.zip',
    downloadUrl: 'https://ipv4.download.thinkbroadband.com/100MB.zip',
    uploadHost: 'speed.cloudflare.com',
    uploadPath: '/__up',
    enabled: true,
  },
  {
    id: 'scaleway-fr',
    name: 'Scaleway CDN',
    region: 'Paris, France',
    flag: '🇫🇷',
    protocol: 'http',
    pingHost: 'ping.online.net',
    pingPath: '/',
    downloadUrl: 'http://ping.online.net/100Mo.dat',
    uploadHost: 'ping.online.net',
    uploadPath: '/upload.php',
    enabled: true,
  },
];

ipcMain.handle('get-servers', () => SERVERS);

// ── Network interfaces ─────────────────────────────────────
ipcMain.handle('get-interfaces', () => {
  const ifaces = os.networkInterfaces();
  const result = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    const ipv4 = addrs.find(a => a.family === 'IPv4' && !a.internal);
    if (ipv4) result.push({ name, address: ipv4.address, mac: ipv4.mac || 'N/A', netmask: ipv4.netmask });
  }
  return result;
});

// ── Live network stats (packets in/out via os module) ──────
// We track bytes across polls to compute rates
let lastNetStats = null;
function getNetStats() {
  const ifaces = os.networkInterfaces();
  // On Windows/Linux we use a workaround — track via dummy counters
  // Real per-interface byte counters require native bindings or /proc/net/dev
  // We approximate via /proc/net/dev on Linux, netstat on Windows
  let rxBytes = 0, txBytes = 0, rxPkts = 0, txPkts = 0;
  try {
    if (process.platform === 'linux') {
      const raw = require('fs').readFileSync('/proc/net/dev', 'utf8');
      raw.split('\n').slice(2).forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 10) return;
        rxBytes += parseInt(parts[1])  || 0;
        rxPkts  += parseInt(parts[2])  || 0;
        txBytes += parseInt(parts[9])  || 0;
        txPkts  += parseInt(parts[10]) || 0;
      });
    } else if (process.platform === 'win32') {
      // Use netstat -e on Windows
      const out = execSync('netstat -e', { timeout: 500 }).toString();
      const lines = out.split('\n');
      const byteLine = lines.find(l => l.toLowerCase().includes('bytes'));
      if (byteLine) {
        const nums = byteLine.trim().split(/\s+/).filter(s => /^\d+$/.test(s));
        if (nums.length >= 2) { rxBytes = parseInt(nums[0]); txBytes = parseInt(nums[1]); }
      }
    }
  } catch(e) { /* ignore */ }
  return { rxBytes, txBytes, rxPkts, txPkts, ts: Date.now() };
}

ipcMain.handle('get-net-stats', () => {
  const current = getNetStats();
  let rxRate = 0, txRate = 0, rxPktRate = 0;
  if (lastNetStats) {
    const dt = (current.ts - lastNetStats.ts) / 1000;
    if (dt > 0) {
      rxRate    = Math.max(0, (current.rxBytes - lastNetStats.rxBytes) / dt);
      txRate    = Math.max(0, (current.txBytes - lastNetStats.txBytes) / dt);
      rxPktRate = Math.max(0, (current.rxPkts  - lastNetStats.rxPkts)  / dt);
    }
  }
  lastNetStats = current;
  return {
    rxBytes: current.rxBytes, txBytes: current.txBytes,
    rxRate, txRate, rxPktRate,
    rxPkts: current.rxPkts, txPkts: current.txPkts,
  };
});

// ── Resolve server IP ──────────────────────────────────────
ipcMain.handle('resolve-ip', (_, host) => {
  return new Promise(resolve => {
    require('dns').lookup(host, (err, address) => resolve(err ? 'N/A' : address));
  });
});

// ── Helper: make request ───────────────────────────────────
function makeRequest(options, useHttps) {
  return useHttps ? https.request(options) : http.request(options);
}
function makeGet(url) {
  return url.startsWith('https') ? https.get(url) : http.get(url);
}

// ── Ping test ──────────────────────────────────────────────
ipcMain.handle('ping-test', (_, serverId) => new Promise((resolve) => {
  const server = SERVERS.find(s => s.id === serverId) || SERVERS[0];
  const useHttps = server.protocol === 'https';
  const RUNS = 10, TIMEOUT = 5000;
  const results = []; let completed = 0, sent = 0, received = 0;

  const doRun = (seq) => {
    sent++;
    const start = Date.now();
    const mod = useHttps ? https : http;
    const req = mod.request({ hostname: server.pingHost, path: server.pingPath, method: 'HEAD', timeout: TIMEOUT }, (res) => {
      res.resume(); received++;
      results.push({ seq, rtt: Date.now() - start, status: 'ok' });
      completed++;
      completed < RUNS ? setTimeout(() => doRun(completed), 80) : finalize();
    });
    req.on('timeout', () => { req.destroy(); results.push({ seq, rtt: null, status: 'timeout' }); completed++; completed < RUNS ? setTimeout(() => doRun(completed), 80) : finalize(); });
    req.on('error',   () => {                      results.push({ seq, rtt: null, status: 'error'   }); completed++; completed < RUNS ? setTimeout(() => doRun(completed), 80) : finalize(); });
    req.end();
  };

  const finalize = () => {
    const rtts = results.filter(r => r.rtt !== null).map(r => r.rtt);
    const loss = ((sent - received) / sent * 100).toFixed(1);
    const min  = rtts.length ? Math.min(...rtts) : 0;
    const max  = rtts.length ? Math.max(...rtts) : 0;
    const avg  = rtts.length ? Math.round(rtts.reduce((a,b)=>a+b,0)/rtts.length) : 0;
    let jitter = 0;
    for (let i = 1; i < rtts.length; i++) jitter += Math.abs(rtts[i] - rtts[i-1]);
    jitter = rtts.length > 1 ? (jitter / (rtts.length-1)).toFixed(1) : 0;
    resolve({ avg, min, max, jitter: parseFloat(jitter), loss: parseFloat(loss), sent, received, results });
  };

  // warmup
  const mod = useHttps ? https : http;
  const wu = mod.request({ hostname: server.pingHost, path: server.pingPath, method: 'HEAD', timeout: 3000 }, r => { r.resume(); doRun(0); });
  wu.on('error', () => doRun(0)); wu.end();
}));

// ── Download test ──────────────────────────────────────────
ipcMain.handle('download-test', (event, serverId) => new Promise((resolve) => {
  const server = SERVERS.find(s => s.id === serverId) || SERVERS[0];
  const THREADS = 4;
  let totalBytes = 0, totalPackets = 0, done = 0, errors = 0;
  const startTime = Date.now(), speedSamples = [];
  let lastBytes = 0, lastTime = Date.now();
  const MAX_REDIRECTS = 3;

  const interval = setInterval(() => {
    const now = Date.now(), elapsed = (now - startTime) / 1000;
    const mb = totalBytes / (1024*1024), mbps = elapsed > 0 ? (mb/elapsed)*8 : 0;
    const ws = (now-lastTime)/1000, wb = totalBytes - lastBytes;
    const inst = ws > 0 ? (wb/(1024*1024)/ws)*8 : 0;
    lastBytes = totalBytes; lastTime = now;
    speedSamples.push(inst);
    event.sender.send('download-progress', {
      mb: mb.toFixed(2), mbps: mbps.toFixed(2), instantMbps: inst.toFixed(2),
      elapsed: elapsed.toFixed(1), packets: totalPackets, bytes: totalBytes,
      errors, activeThreads: THREADS - done,
    });
  }, 300);

  const finish = (hadError) => {
    if (hadError) errors++;
    if (++done === THREADS) {
      clearInterval(interval);
      const elapsed = (Date.now()-startTime)/1000, mb = totalBytes/(1024*1024);
      const mbps = elapsed > 0 ? (mb/elapsed)*8 : 0;
      const peakMbps = speedSamples.length ? Math.max(...speedSamples) : 0;
      resolve({ mb: mb.toFixed(2), mbps: mbps.toFixed(2), peakMbps: peakMbps.toFixed(2), elapsed: elapsed.toFixed(1), packets: totalPackets, bytes: totalBytes, errors });
    }
  };

  const startDownload = (url, redirectsLeft) => {
    try {
      const req = makeGet(url);
      req.on('response', (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400) {
          const loc = res.headers.location;
          res.resume();
          if (loc && redirectsLeft > 0) {
            const nextUrl = new URL(loc, url).toString();
            return startDownload(nextUrl, redirectsLeft - 1);
          }
          return finish(true);
        }
        if (status >= 400) {
          res.resume();
          return finish(true);
        }
        res.on('data', (chunk) => { totalBytes += chunk.length; totalPackets++; });
        res.on('end',   () => finish(false));
        res.on('error', () => finish(true));
      });
      req.setTimeout(90000, () => { req.destroy(); finish(true); });
      req.on('error', () => finish(true));
    } catch (e) {
      finish(true);
    }
  };

  for (let i = 0; i < THREADS; i++) startDownload(server.downloadUrl, MAX_REDIRECTS);
}));

// ── Upload test ────────────────────────────────────────────
ipcMain.handle('upload-test', (event, serverId) => new Promise((resolve) => {
  const server = SERVERS.find(s => s.id === serverId) || SERVERS[0];
  const useHttps = server.protocol === 'https' || server.uploadHost === 'speed.cloudflare.com';
  const UPLOAD_BYTES = 15 * 1024 * 1024;
  const data = Buffer.alloc(UPLOAD_BYTES, 'x');
  let uploadedBytes = 0, uploadedPackets = 0, errors = 0;
  const startTime = Date.now(), speedSamples = [];
  let lastBytes = 0, lastTime = Date.now();

  const interval = setInterval(() => {
    const now = Date.now(), elapsed = (now - startTime) / 1000;
    const mb = uploadedBytes/(1024*1024), mbps = elapsed > 0 ? (mb/elapsed)*8 : 0;
    const ws = (now-lastTime)/1000, wb = uploadedBytes - lastBytes;
    const inst = ws > 0 ? (wb/(1024*1024)/ws)*8 : 0;
    lastBytes = uploadedBytes; lastTime = now;
    speedSamples.push(inst);
    event.sender.send('upload-progress', {
      mb: mb.toFixed(2), mbps: mbps.toFixed(2), instantMbps: inst.toFixed(2),
      elapsed: elapsed.toFixed(1), packets: uploadedPackets, bytes: uploadedBytes, errors,
    });
  }, 300);

  const options = {
    hostname: server.uploadHost, path: server.uploadPath, method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': data.length },
    timeout: 90000,
  };

  const done = (hadError) => {
    clearInterval(interval);
    const elapsed = (Date.now()-startTime)/1000, mb = uploadedBytes/(1024*1024);
    const mbps = elapsed > 0 ? (mb/elapsed)*8 : 0;
    const peakMbps = speedSamples.length ? Math.max(...speedSamples) : 0;
    resolve({ mb: mb.toFixed(2), mbps: mbps.toFixed(2), peakMbps: peakMbps.toFixed(2), elapsed: elapsed.toFixed(1), packets: uploadedPackets, bytes: uploadedBytes, errors: hadError ? ++errors : errors });
  };

  const mod = useHttps ? https : http;
  const req = mod.request(options, (res) => { res.resume(); res.on('end', () => done(false)); res.on('error', () => done(true)); });
  req.on('error', () => done(true));

  let offset = 0; const CHUNK = 32768;
  const writeChunk = () => {
    if (offset >= data.length) { req.end(); return; }
    const slice = data.slice(offset, Math.min(offset + CHUNK, data.length));
    const ok = req.write(slice);
    uploadedBytes += slice.length; uploadedPackets++;
    offset += slice.length;
    if (ok) setImmediate(writeChunk); else req.once('drain', writeChunk);
  };
  writeChunk();
}));
