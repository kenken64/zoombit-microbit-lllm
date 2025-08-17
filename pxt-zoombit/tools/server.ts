/*
Minimal HTTP server (TypeScript) exposing endpoints to build and download the HEX.

Endpoints:
- POST /build     -> runs `pxt build` in this project (zoombit extension) and returns JSON
- GET  /download  -> downloads the latest built/binary.hex

Usage:
  1) Ensure PXT target is installed for micro:bit:
       pxt target microbit
  2) From repo root (pxt-zoombit), compile the server:
       npx tsc -p tools
  3) Run the server:
       node tools/dist/server.js
  4) Build via HTTP:
       curl -X POST http://localhost:3000/build
  5) Download HEX:
       curl -o binary.hex http://localhost:3000/download
*/

// Declare Node globals to avoid needing @types/node
declare var require: any;
declare var process: any;
declare var __dirname: string;

const http = require('http');
const exec = require('child_process').exec;
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

function findProjectRoot(startDir: string): string {
  try {
    let dir = startDir;
    const maxUp = 6;
    for (let i = 0; i < maxUp; i++) {
      const pj = path.join(dir, 'pxt.json');
      if (fs.existsSync(pj)) return dir;
      const up = path.dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  } catch {}
  // Fallback: tools/dist -> tools -> pxt-zoombit
  return path.resolve(startDir, '..', '..');
}

const projectDir = findProjectRoot(__dirname);
const builtDir = path.join(projectDir, 'built');
const defaultHexPath = path.join(builtDir, 'binary.hex');

function runBuild(callback: (error: any, stdout: string, stderr: string) => void) {
  const isWin = process.platform === 'win32';
  const appData = process.env.APPDATA || '';
  const pxtGlobal = isWin && appData ? `"${appData}\\npm\\pxt.cmd"` : 'pxt';
  const candidates = [
    'pxt build',
    `${pxtGlobal} build`,
    'npx -y pxt build'
  ];

  const tryExec = (i: number) => {
    if (i >= candidates.length) {
      callback(new Error("PXT CLI not found. Try running 'pxt target microbit' once in this environment."), '', '');
      return;
    }
    const cmd = candidates[i];
    console.log(`[BUILD] Running: ${cmd} (cwd=${projectDir})`);
    exec(cmd, { cwd: projectDir, env: process.env }, (error: any, stdout: string, stderr: string) => {
      // If command not found, try next candidate.
      if (error && /not recognized|ENOENT|command not found/i.test(String(error))) {
        console.warn(`[BUILD] Command failed, trying next: ${cmd}\n${String(error)}`);
        return tryExec(i + 1);
      }
      callback(error, stdout, stderr);
    });
  };

  tryExec(0);
}

function listBuiltDir(): string[] {
  try {
    return fs.readdirSync(builtDir).map((n: string) => n);
  } catch { return []; }
}

function findLatestHex(): { path: string, size: number } | null {
  try {
    const files = fs.readdirSync(builtDir)
      .filter((n: string) => n.toLowerCase().endsWith('.hex'))
      .map((n: string) => {
        const p = path.join(builtDir, n);
        const st = fs.statSync(p);
        return { p, mtime: st.mtimeMs, size: st.size };
      })
      .sort((a, b) => b.mtime - a.mtime);
    if (files.length > 0) return { path: files[0].p, size: files[0].size };
    return null;
  } catch { return null; }
}

function sendJson(res: any, status: number, obj: any) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readProjectTs(): { code: string, files: { name: string, size: number }[] } | null {
  try {
    const pjPath = path.join(projectDir, 'pxt.json');
    if (!fs.existsSync(pjPath)) return null;
    const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
    const names: string[] = ([] as string[])
      .concat(pj.files || [])
      .concat(pj.testFiles || [])
      .concat(pj.additionalFiles || [])
      .filter((n: string) => /\.ts$/i.test(n) && !/\.d\.ts$/i.test(n));
    const seen = new Set<string>();
    const parts: string[] = [];
    const files: { name: string, size: number }[] = [];
    for (const n of names) {
      if (seen.has(n)) continue;
      seen.add(n);
      const p = path.join(projectDir, n);
      if (!fs.existsSync(p)) continue;
      const txt = fs.readFileSync(p, 'utf8');
      files.push({ name: n, size: Buffer.byteLength(txt) });
      parts.push(`// file: ${n}\n` + txt + '\n');
    }
    if (!parts.length) return null;
    return { code: parts.join('\n'), files };
  } catch {
    return null;
  }
}

// Simple in-memory SSE clients list
const sseClients: any[] = [];

function sseHeaders() {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  } as any;
}

function sseBroadcast(event: string, data: any) {
  const payload = `event: ${event}\n` +
    `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients.slice()) {
    try { client.write(payload); } catch { /* ignore */ }
  }
}

const server = http.createServer((req: any, res: any) => {
  // Basic CORS/preflight for POST
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/events') {
    res.writeHead(200, sseHeaders());
    res.write(': connected\n\n');
    sseClients.push(res);
    // Keep-alive ping
    const iv = setInterval(() => {
      try { res.write(': ping\n\n'); } catch {}
    }, 15000);
    req.on('close', () => {
      clearInterval(iv as any);
      const idx = sseClients.indexOf(res);
      if (idx >= 0) sseClients.splice(idx, 1);
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/build') {
    const started = Date.now();
    runBuild((err, stdout, stderr) => {
      if (err) {
        console.error('[BUILD] Failed:', { error: String(err) });
        if (stderr) console.error('[BUILD][stderr]\n' + stderr);
        if (stdout) console.error('[BUILD][stdout]\n' + stdout);
        const payload = { success: false, message: 'Build failed', error: String(err), stderr, stdout, durationMs: Date.now() - started };
        sendJson(res, 500, payload);
        // notify listeners
        sseBroadcast('build-failed', payload);
        return;
      }
      fs.stat(defaultHexPath, (statErr: any, stats: any) => {
        if (statErr) {
          // Try fallback: find any latest .hex inside built/
          const latest = findLatestHex();
          if (!latest) {
            console.error('[BUILD] Succeeded but HEX not found at', defaultHexPath, 'and no .hex in built/. Built dir listing:', listBuiltDir());
            if (stderr) console.error('[BUILD][stderr]\n' + stderr);
            if (stdout) console.error('[BUILD][stdout]\n' + stdout);
            sendJson(res, 500, {
              success: false,
              message: 'Build completed but HEX not found',
              expected: defaultHexPath,
              builtDir,
              builtListing: listBuiltDir(),
              stderr,
              stdout,
              durationMs: Date.now() - started,
            });
            return;
          }
          console.log('[BUILD] Succeeded (fallback hex):', latest.path);
          const payload = { success: true, message: 'Build succeeded', hex: latest.path, size: latest.size, durationMs: Date.now() - started };
          sendJson(res, 200, payload);
          // notify listeners
          sseBroadcast('build-succeeded', payload);
          return;
        }
        const payload = {
          success: true,
          message: 'Build succeeded',
          hex: defaultHexPath,
          size: stats.size,
          mtime: stats.mtime,
          durationMs: Date.now() - started,
        };
        console.log('[BUILD] Succeeded:', payload);
        sendJson(res, 200, payload);
        // notify listeners
        sseBroadcast('build-succeeded', payload);
      });
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/download') {
    // Prefer default path, else fallback to latest .hex in built
    const latest = fs.existsSync(defaultHexPath)
      ? { path: defaultHexPath, size: fs.statSync(defaultHexPath).size }
      : findLatestHex();
    if (!latest) {
      sendJson(res, 404, {
        success: false,
        message: 'HEX not found. Build first via POST /build',
        expected: defaultHexPath,
        builtDir,
        builtListing: listBuiltDir(),
      });
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="binary.hex"',
      'Content-Length': latest.size,
      'Access-Control-Allow-Origin': '*',
    });
    const stream = fs.createReadStream(latest.path);
    stream.pipe(res);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/code') {
    const data = readProjectTs();
    if (!data) {
      sendJson(res, 404, { success: false, message: 'No TypeScript sources found via pxt.json', projectDir });
    } else {
      sendJson(res, 200, { success: true, code: data.code, files: data.files });
    }
    return;
  }

  if (req.method === 'GET' && req.url === '/') {
    sendJson(res, 200, {
      endpoints: {
        build: { method: 'POST', path: '/build' },
        download: { method: 'GET', path: '/download' },
        code: { method: 'GET', path: '/code' },
      },
      projectDir,
      builtDir,
      defaultHexPath,
      builtListing: listBuiltDir(),
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Project directory: ${projectDir}`);
});

