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
var http = require('http');
var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');
var PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
var projectDir = __dirname ? path.resolve(__dirname, '..') : process.cwd();
var hexPath = path.join(projectDir, 'built', 'binary.hex');
function runBuild(callback) {
    var isWin = process.platform === 'win32';
    var appData = process.env.APPDATA || '';
    var pxtGlobal = isWin && appData ? "\"".concat(appData, "\\npm\\pxt.cmd\"") : 'pxt';
    var candidates = [
        'pxt build',
        "".concat(pxtGlobal, " build"),
        'npx -y pxt build'
    ];
    var tryExec = function (i) {
        if (i >= candidates.length) {
            callback(new Error("PXT CLI not found. Try running 'pxt target microbit' once in this environment."), '', '');
            return;
        }
        var cmd = candidates[i];
        console.log("[BUILD] Running: ".concat(cmd, " (cwd=").concat(projectDir, ")"));
        exec(cmd, { cwd: projectDir, env: process.env }, function (error, stdout, stderr) {
            // If command not found, try next candidate.
            if (error && /not recognized|ENOENT|command not found/i.test(String(error))) {
                console.warn("[BUILD] Command failed, trying next: ".concat(cmd, "\n").concat(String(error)));
                return tryExec(i + 1);
            }
            callback(error, stdout, stderr);
        });
    };
    tryExec(0);
}
function sendJson(res, status, obj) {
    var body = JSON.stringify(obj);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Access-Control-Allow-Origin': '*',
    });
    res.end(body);
}
var server = http.createServer(function (req, res) {
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
    if (req.method === 'POST' && req.url === '/build') {
        var started_1 = Date.now();
        runBuild(function (err, stdout, stderr) {
            if (err) {
                console.error('[BUILD] Failed:', { error: String(err) });
                if (stderr)
                    console.error('[BUILD][stderr]\n' + stderr);
                if (stdout)
                    console.error('[BUILD][stdout]\n' + stdout);
                sendJson(res, 500, {
                    success: false,
                    message: 'Build failed',
                    error: String(err),
                    stderr: stderr,
                    stdout: stdout,
                    durationMs: Date.now() - started_1,
                });
                return;
            }
            fs.stat(hexPath, function (statErr, stats) {
                if (statErr) {
                    console.error('[BUILD] Succeeded but HEX not found at', hexPath);
                    if (stderr)
                        console.error('[BUILD][stderr]\n' + stderr);
                    if (stdout)
                        console.error('[BUILD][stdout]\n' + stdout);
                    sendJson(res, 500, {
                        success: false,
                        message: 'Build completed but HEX not found',
                        hex: hexPath,
                        stderr: stderr,
                        stdout: stdout,
                        durationMs: Date.now() - started_1,
                    });
                    return;
                }
                console.log('[BUILD] Succeeded:', {
                    hex: hexPath,
                    size: stats.size,
                    mtime: stats.mtime,
                    durationMs: Date.now() - started_1,
                });
                sendJson(res, 200, {
                    success: true,
                    message: 'Build succeeded',
                    hex: hexPath,
                    size: stats.size,
                    mtime: stats.mtime,
                    durationMs: Date.now() - started_1,
                });
            });
        });
        return;
    }
    if (req.method === 'GET' && req.url === '/download') {
        fs.stat(hexPath, function (err, stats) {
            if (err || !stats.isFile()) {
                sendJson(res, 404, {
                    success: false,
                    message: 'HEX not found. Build first via POST /build',
                });
                return;
            }
            res.writeHead(200, {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': 'attachment; filename="binary.hex"',
                'Content-Length': stats.size,
                'Access-Control-Allow-Origin': '*',
            });
            var stream = fs.createReadStream(hexPath);
            stream.pipe(res);
            stream.on('error', function () {
                if (!res.headersSent)
                    res.writeHead(500);
                res.end();
            });
        });
        return;
    }
    if (req.method === 'GET' && req.url === '/') {
        sendJson(res, 200, {
            endpoints: {
                build: { method: 'POST', path: '/build' },
                download: { method: 'GET', path: '/download' },
            },
            projectDir: projectDir,
            hexPath: hexPath,
        });
        return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end('Not found');
});
server.listen(PORT, function () {
    console.log("Server listening on http://localhost:".concat(PORT));
    console.log("Project directory: ".concat(projectDir));
});
