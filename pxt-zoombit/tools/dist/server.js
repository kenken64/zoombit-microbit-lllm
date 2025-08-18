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
const http = require('http');
const https = require('https');
const exec = require('child_process').exec;
const spawn = require('child_process').spawn;
const fs = require('fs');
const path = require('path');
let logger = console;
// Load environment variables from .env if present
try {
    const dotenv = require('dotenv');
    // Attempt to load from repo root and from pxt-zoombit folder
    const repoRootEnv = path.resolve(__dirname, '..', '..', '.env');
    const pxtEnv = path.resolve(__dirname, '..', '.env');
    if (fs.existsSync(repoRootEnv))
        dotenv.config({ path: repoRootEnv });
    if (fs.existsSync(pxtEnv))
        dotenv.config({ path: pxtEnv });
}
catch ( /* dotenv optional */_a) { /* dotenv optional */ }
// Initialize logging (pino if available; fallback to console)
try {
    const pino = require('pino');
    const pretty = process.env.LOG_PRETTY === '1' || process.env.LOG_PRETTY === 'true';
    const level = process.env.LOG_LEVEL || 'info';
    if (pretty) {
        const pinoPretty = require('pino-pretty')({ translateTime: 'SYS:standard', colorize: true });
        logger = pino({ level }, pinoPretty);
    }
    else {
        logger = pino({ level });
    }
}
catch ( /* keep console */_b) { /* keep console */ }
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
function findProjectRoot(startDir) {
    try {
        let dir = startDir;
        const maxUp = 6;
        for (let i = 0; i < maxUp; i++) {
            const pj = path.join(dir, 'pxt.json');
            if (fs.existsSync(pj))
                return dir;
            const up = path.dirname(dir);
            if (up === dir)
                break;
            dir = up;
        }
    }
    catch (_a) { }
    // Fallback: tools/dist -> tools -> pxt-zoombit
    return path.resolve(startDir, '..', '..');
}
const projectDir = findProjectRoot(__dirname);
const builtDir = path.join(projectDir, 'built');
const defaultHexPath = path.join(builtDir, 'binary.hex');
function runBuild(callback) {
    const isWin = process.platform === 'win32';
    const appData = process.env.APPDATA || '';
    const pxtGlobal = isWin && appData ? `"${appData}\\npm\\pxt.cmd"` : 'pxt';
    const candidates = [
        'pxt build',
        `${pxtGlobal} build`,
        'npx -y pxt build'
    ];
    const tryExec = (i) => {
        if (i >= candidates.length) {
            callback(new Error("PXT CLI not found. Try running 'pxt target microbit' once in this environment."), '', '');
            return;
        }
        const cmd = candidates[i];
        logger.info(`[BUILD] Running: ${cmd} (cwd=${projectDir})`);
        exec(cmd, { cwd: projectDir, env: process.env }, (error, stdout, stderr) => {
            // If command not found, try next candidate.
            if (error && /not recognized|ENOENT|command not found/i.test(String(error))) {
                logger.warn(`[BUILD] Command failed, trying next: ${cmd}\n${String(error)}`);
                return tryExec(i + 1);
            }
            callback(error, stdout, stderr);
        });
    };
    tryExec(0);
}
function listBuiltDir() {
    try {
        return fs.readdirSync(builtDir).map((n) => n);
    }
    catch (_a) {
        return [];
    }
}
function findLatestHex() {
    try {
        const files = fs.readdirSync(builtDir)
            .filter((n) => n.toLowerCase().endsWith('.hex'))
            .map((n) => {
            const p = path.join(builtDir, n);
            const st = fs.statSync(p);
            return { p, mtime: st.mtimeMs, size: st.size };
        })
            .sort((a, b) => b.mtime - a.mtime);
        if (files.length > 0)
            return { path: files[0].p, size: files[0].size };
        return null;
    }
    catch (_a) {
        return null;
    }
}
// Make the newest HEX the canonical built/binary.hex and remove older HEX files.
function normalizeHexOutputs() {
    try {
        const latest = findLatestHex();
        if (!latest)
            return null;
        // Delete all other .hex files first (except the latest)
        const entries = fs.readdirSync(builtDir).filter((n) => n.toLowerCase().endsWith('.hex'));
        for (const name of entries) {
            const p = path.join(builtDir, name);
            if (path.resolve(p) !== path.resolve(latest.path)) {
                try {
                    fs.unlinkSync(p);
                }
                catch (_a) { }
            }
        }
        // Rename latest to defaultHexPath if different
        if (path.resolve(latest.path) !== path.resolve(defaultHexPath)) {
            try {
                fs.renameSync(latest.path, defaultHexPath);
            }
            catch ( /* fallback: copy */_b) { /* fallback: copy */
                try {
                    fs.copyFileSync(latest.path, defaultHexPath);
                    fs.unlinkSync(latest.path);
                }
                catch (_c) { }
            }
        }
        const st = fs.statSync(defaultHexPath);
        return { path: defaultHexPath, size: st.size };
    }
    catch (_d) {
        return null;
    }
}
function sendJson(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Access-Control-Allow-Origin': '*',
    });
    res.end(body);
}
function readProjectTs() {
    try {
        const pjPath = path.join(projectDir, 'pxt.json');
        if (!fs.existsSync(pjPath))
            return null;
        const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
        const names = []
            .concat(pj.files || [])
            .concat(pj.testFiles || [])
            .concat(pj.additionalFiles || [])
            .filter((n) => /\.ts$/i.test(n) && !/\.d\.ts$/i.test(n));
        const seen = new Set();
        const parts = [];
        const files = [];
        for (const n of names) {
            if (seen.has(n))
                continue;
            seen.add(n);
            const p = path.join(projectDir, n);
            if (!fs.existsSync(p))
                continue;
            const txt = fs.readFileSync(p, 'utf8');
            files.push({ name: n, size: Buffer.byteLength(txt) });
            parts.push(`// file: ${n}\n` + txt + '\n');
        }
        if (!parts.length)
            return null;
        return { code: parts.join('\n'), files };
    }
    catch (_a) {
        return null;
    }
}
// Simple in-memory SSE clients list
const sseClients = [];
function sseHeaders() {
    return {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
    };
}
function sseBroadcast(event, data) {
    const payload = `event: ${event}\n` +
        `data: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients.slice()) {
        try {
            client.write(payload);
        }
        catch ( /* ignore */_a) { /* ignore */ }
    }
}
function ensureDirSync(dir) {
    try {
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
    }
    catch (_a) { }
}
function writeDebugLogSync(baseDir, filePrefix, content) {
    try {
        ensureDirSync(baseDir);
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const p = path.join(baseDir, `${filePrefix}-${ts}.log`);
        fs.writeFileSync(p, content, 'utf8');
        return p;
    }
    catch (_a) {
        return null;
    }
}
const server = http.createServer((req, res) => {
    var _a;
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
            try {
                res.write(': ping\n\n');
            }
            catch (_a) { }
        }, 15000);
        req.on('close', () => {
            clearInterval(iv);
            const idx = sseClients.indexOf(res);
            if (idx >= 0)
                sseClients.splice(idx, 1);
        });
        return;
    }
    if (req.method === 'POST' && req.url === '/build') {
        // Build now supports optional AI generation when body contains ai-related fields.
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
            let payload = {};
            try {
                payload = body ? JSON.parse(body) : {};
            }
            catch (_a) {
                payload = {};
            }
            const hasAiKeys = payload && (payload.ai === true ||
                typeof payload.prompt === 'string' ||
                typeof payload.query === 'string' ||
                typeof payload.code === 'string' ||
                typeof payload.overwriteMain === 'boolean' ||
                typeof payload.outFile === 'string');
            // Debug: print hasAiKeys and payload keys when debug flag is set
            try {
                const debugFlag = !!(payload && (payload.debug || process.env.AI_DEBUG));
                if (debugFlag) {
                    const keys = Object.keys(payload || {});
                    logger.debug(`[BUILD] hasAiKeys=${hasAiKeys} payloadKeys=${keys.join(',')}`);
                    sseBroadcast('ai-debug', { phase: 'hasAiKeys', hasAiKeys, keys });
                }
            }
            catch ( /* ignore */_b) { /* ignore */ }
            if (hasAiKeys) {
                await handleAiBuild(payload, res);
                return;
            }
            const started = Date.now();
            runBuild(async (err, stdout, stderr) => {
                if (err) {
                    logger.error('[BUILD] Failed: ' + String(err));
                    try {
                        if (err && err.stack)
                            logger.error('[BUILD][stack]\n' + String(err.stack));
                    }
                    catch (_a) { }
                    if (stderr)
                        logger.error('[BUILD][stderr]\n' + stderr);
                    if (stdout)
                        logger.error('[BUILD][stdout]\n' + stdout);
                    // Optional auto-fix for plain builds when explicitly requested or via env AI_AUTOFIX
                    const wantAutoFix = !!(payload && payload.autoFix) || /^(1|true)$/i.test(String(process.env.AI_AUTOFIX || ''));
                    const hasKey = !!(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || process.env.OPENAI_TOKEN);
                    if (wantAutoFix && hasKey) {
                        try {
                            sseBroadcast('ai-debug', { phase: 'autofix-start', from: 'build', reason: 'pxt-failed' });
                            const target = selectEditableFile();
                            const codeTxt = target ? safeReadText(path.join(projectDir, target)) : null;
                            if (target && codeTxt) {
                                const fixed = await callOpenAIForFix({
                                    code: codeTxt,
                                    filename: target,
                                    errors: String(stderr || stdout || err),
                                    model: (process.env.OPENAI_MODEL || process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini'),
                                });
                                if (fixed && fixed.trim()) {
                                    const finalCode = await maybeFormatTs(fixed);
                                    fs.writeFileSync(path.join(projectDir, target), finalCode, 'utf8');
                                    // Ensure file is in pxt.json
                                    ensureFileInPxt(target);
                                    // Rebuild once
                                    return runBuild((err2, stdout2, stderr2) => {
                                        if (err2) {
                                            const payloadOut = { success: false, message: 'Build failed (after auto-fix attempt)', error: String(err2), stderr: stderr2, stdout: stdout2, autoFixTried: true, target, durationMs: Date.now() - started };
                                            sendJson(res, 500, payloadOut);
                                            sseBroadcast('build-failed', payloadOut);
                                        }
                                        else {
                                            fs.stat(defaultHexPath, (statErr, stats) => {
                                                if (statErr) {
                                                    const latest = findLatestHex();
                                                    if (!latest) {
                                                        const payloadOut = { success: false, message: 'Build succeeded but HEX not found (after auto-fix)', expected: defaultHexPath, builtDir, builtListing: listBuiltDir(), autoFixTried: true, target, stderr: stderr2, stdout: stdout2, durationMs: Date.now() - started };
                                                        return sendJson(res, 500, payloadOut);
                                                    }
                                                    try {
                                                        logger.info(`[BUILD] HEX ready (after auto-fix): ${latest.path} (${latest.size} bytes)`);
                                                    }
                                                    catch (_a) { }
                                                    const payloadOut = { success: true, message: 'Build succeeded (after auto-fix)', hex: latest.path, size: latest.size, autoFixTried: true, target, durationMs: Date.now() - started };
                                                    sendJson(res, 200, payloadOut);
                                                    sseBroadcast('build-succeeded', payloadOut);
                                                    return;
                                                }
                                                try {
                                                    logger.info(`[BUILD] HEX ready (after auto-fix): ${defaultHexPath} (${stats.size} bytes)`);
                                                }
                                                catch (_b) { }
                                                const payloadOut = { success: true, message: 'Build succeeded (after auto-fix)', hex: defaultHexPath, size: stats.size, mtime: stats.mtime, autoFixTried: true, target, durationMs: Date.now() - started };
                                                sendJson(res, 200, payloadOut);
                                                sseBroadcast('build-succeeded', payloadOut);
                                            });
                                        }
                                    });
                                }
                            }
                        }
                        catch (e) {
                            // fall through to failure
                            sseBroadcast('ai-debug', { phase: 'autofix-error', error: String(e) });
                        }
                    }
                    const payloadOut = { success: false, message: 'Build failed', error: String(err), stack: (err && err.stack) ? String(err.stack) : undefined, stderr, stdout, durationMs: Date.now() - started };
                    sendJson(res, 500, payloadOut);
                    // notify listeners
                    sseBroadcast('build-failed', payloadOut);
                    return;
                }
                fs.stat(defaultHexPath, (statErr, stats) => {
                    if (statErr) {
                        // Try fallback: find any latest .hex inside built/
                        const latest = findLatestHex();
                        if (!latest) {
                            logger.error('[BUILD] Succeeded but HEX not found at ' + defaultHexPath + ' and no .hex in built/. Built dir listing: ' + JSON.stringify(listBuiltDir()));
                            if (stderr)
                                logger.error('[BUILD][stderr]\n' + stderr);
                            if (stdout)
                                logger.error('[BUILD][stdout]\n' + stdout);
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
                        // Normalize outputs so built/binary.hex is the canonical fresh HEX
                        const norm = normalizeHexOutputs() || { path: latest.path, size: latest.size };
                        logger.info('[BUILD] Succeeded (normalized hex): ' + norm.path);
                        try {
                            logger.info(`[BUILD] HEX ready: ${norm.path} (${norm.size} bytes)`);
                        }
                        catch (_a) { }
                        const payloadOut = { success: true, message: 'Build succeeded', hex: norm.path, size: norm.size, durationMs: Date.now() - started };
                        sendJson(res, 200, payloadOut);
                        sseBroadcast('build-succeeded', payloadOut);
                        return;
                    }
                    // Default hex present; normalize to ensure it's the only HEX
                    const norm = normalizeHexOutputs() || { path: defaultHexPath, size: stats.size };
                    const payloadOut = {
                        success: true,
                        message: 'Build succeeded',
                        hex: norm.path,
                        size: norm.size,
                        mtime: stats.mtime,
                        durationMs: Date.now() - started,
                    };
                    try {
                        logger.info(`[BUILD] HEX ready: ${norm.path} (${norm.size} bytes)`);
                    }
                    catch (_b) { }
                    logger.info(payloadOut);
                    sendJson(res, 200, payloadOut);
                    sseBroadcast('build-succeeded', payloadOut);
                });
            });
        });
        return;
    }
    if (req.method === 'POST' && req.url === '/ai-build') {
        // Back-compat endpoint; delegates to the same AI build handler used by /build when AI params are present.
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
            let payload = {};
            try {
                payload = body ? JSON.parse(body) : {};
            }
            catch (_a) {
                payload = {};
            }
            await handleAiBuild(payload, res);
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
        try {
            const ip = ((_a = req.socket) === null || _a === void 0 ? void 0 : _a.remoteAddress) || 'unknown';
            const ua = String((req.headers || {})['user-agent'] || '');
            logger.info(`[DOWNLOAD] HEX requested by ${ip} ua="${ua}": ${latest.path} (${latest.size} bytes)`);
        }
        catch (_b) { }
        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': 'attachment; filename="binary.hex"',
            'Content-Length': latest.size,
            'Access-Control-Allow-Origin': '*',
        });
        const stream = fs.createReadStream(latest.path);
        stream.pipe(res);
        stream.on('error', () => {
            if (!res.headersSent)
                res.writeHead(500);
            res.end();
        });
        return;
    }
    if (req.method === 'GET' && req.url === '/code') {
        const data = readProjectTs();
        if (!data) {
            sendJson(res, 404, { success: false, message: 'No TypeScript sources found via pxt.json', projectDir });
        }
        else {
            sendJson(res, 200, { success: true, code: data.code, files: data.files });
        }
        return;
    }
    if (req.method === 'GET' && req.url === '/') {
        sendJson(res, 200, {
            endpoints: {
                build: { method: 'POST', path: '/build' },
                aiBuild: { method: 'POST', path: '/ai-build' },
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
    logger.info(`Server listening on http://localhost:${PORT}`);
    logger.info(`Project directory: ${projectDir}`);
});
// ===== Helpers: MCP, OpenAI, pxt.json =====
async function handleAiBuild(payload, res) {
    const started = Date.now();
    try {
        const userPrompt = payload.prompt || '';
        // Use the user's prompt as the default MCP search query so we fetch relevant examples
        const query = payload.query || userPrompt || '';
        const strict = payload.strict === true || shouldStrict(userPrompt);
        const noExamples = payload.noExamples === true; // always call MCP unless explicitly disabled
        const debug = !!(payload.debug || process.env.AI_DEBUG);
        // Default to overwriting main.ts unless explicitly disabled
        const overwriteMain = (payload.overwriteMain !== false);
        const outFile = payload.outFile || (overwriteMain ? 'main.ts' : 'ai.generated.ts');
        const model = payload.model || (process.env.OPENAI_MODEL || process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini');
        const temperature = typeof payload.temperature === 'number' ? payload.temperature : (strict ? 0 : 0.2);
        const repoRoot = path.resolve(projectDir, '..');
        const mcpDir = path.join(repoRoot, 'mcp-codes-server');
        // If raw TypeScript is provided, use it directly; else try rule-based or OpenAI
        let aiCode = (typeof payload.code === 'string' && payload.code.trim()) ? String(payload.code) : tryRuleBasedGenerate(userPrompt);
        const hasOpenAIKey = !!(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || process.env.OPENAI_TOKEN);
        // If no AI key and no rule-based code available, gracefully fall back to a plain build
        if (!aiCode && !hasOpenAIKey) {
            const note = 'AI disabled (no OPENAI_API_KEY). Performing plain build of current sources.';
            try {
                logger.warn('[AI-BUILD] ' + note);
            }
            catch (_a) { }
            sseBroadcast('ai-debug', { phase: 'ai-disabled', reason: 'no-api-key' });
            const plainStarted = Date.now();
            runBuild((err, stdout, stderr) => {
                if (err) {
                    try {
                        if (err && err.stack)
                            logger.error('[BUILD][ai-disabled][stack]\n' + String(err.stack));
                    }
                    catch (_a) { }
                    const resp = { success: false, message: 'Build failed (AI disabled)', error: String(err), stack: (err && err.stack) ? String(err.stack) : undefined, stderr, stdout, durationMs: Date.now() - plainStarted };
                    sendJson(res, 500, resp);
                    sseBroadcast('ai-build-failed', resp);
                    return;
                }
                fs.stat(defaultHexPath, (statErr, stats) => {
                    if (statErr) {
                        const latest = findLatestHex();
                        if (!latest) {
                            const resp = { success: false, message: 'Build completed but HEX not found (AI disabled)', expected: defaultHexPath, builtDir, builtListing: listBuiltDir(), stderr, stdout, durationMs: Date.now() - plainStarted };
                            sendJson(res, 500, resp);
                            sseBroadcast('ai-build-failed', resp);
                            return;
                        }
                        const norm = normalizeHexOutputs() || { path: latest.path, size: latest.size };
                        try {
                            logger.info(`[AI-BUILD] HEX ready (ai-disabled): ${norm.path} (${norm.size} bytes)`);
                        }
                        catch (_a) { }
                        const resp = { success: true, message: note, hex: norm.path, size: norm.size, durationMs: Date.now() - plainStarted, aiDisabled: true };
                        sendJson(res, 200, resp);
                        sseBroadcast('ai-build-succeeded', resp);
                        return;
                    }
                    const norm = normalizeHexOutputs() || { path: defaultHexPath, size: stats.size };
                    try {
                        logger.info(`[AI-BUILD] HEX ready (ai-disabled): ${norm.path} (${norm.size} bytes)`);
                    }
                    catch (_b) { }
                    const resp = { success: true, message: note, hex: norm.path, size: norm.size, mtime: stats.mtime, durationMs: Date.now() - plainStarted, aiDisabled: true };
                    sendJson(res, 200, resp);
                    sseBroadcast('ai-build-succeeded', resp);
                });
            });
            return;
        }
        let examples = undefined;
        let mcpDebug = undefined;
        let openaiRawAny = undefined;
        if (!aiCode) {
            let mcpResult = undefined;
            if (noExamples) {
                if (debug) {
                    logger.debug('[DEBUG][MCP] Skipped due to noExamples flag');
                    sseBroadcast('ai-debug', { phase: 'mcp', skipped: true, reason: 'noExamples flag' });
                }
            }
            else {
                mcpResult = await mcpQueryExamples(mcpDir, repoRoot, query, debug);
            }
            if (mcpResult) {
                examples = { sections: mcpResult.sections, raw: mcpResult.raw };
                if (debug)
                    mcpDebug = mcpResult._debug;
            }
            const prompt = buildAIPrompt(examples, userPrompt, strict);
            let aiResp1 = null;
            try {
                aiResp1 = await callOpenAIWithRaw(prompt, model, temperature, debug);
                aiCode = aiResp1.code;
            }
            catch (err) {
                // If OpenAI call fails, gracefully fall back to a plain build of current sources
                if (debug) {
                    try {
                        logger.warn('[AI-BUILD] OpenAI request failed; falling back to plain build: ' + String(err));
                    }
                    catch (_b) { }
                }
                sseBroadcast('ai-debug', { phase: 'ai-fallback', reason: 'openai-failed' });
                const note = 'AI unavailable. Performing plain build of current sources.';
                const plainStarted = Date.now();
                runBuild((err2, stdout, stderr) => {
                    if (err2) {
                        try {
                            if (err2 && err2.stack)
                                logger.error('[BUILD][ai-fallback][stack]\n' + String(err2.stack));
                        }
                        catch (_a) { }
                        const resp = { success: false, message: 'Build failed (AI unavailable)', error: String(err2), stack: (err2 && err2.stack) ? String(err2.stack) : undefined, stderr, stdout, durationMs: Date.now() - plainStarted };
                        sendJson(res, 500, resp);
                        sseBroadcast('ai-build-failed', resp);
                        return;
                    }
                    fs.stat(defaultHexPath, (statErr, stats) => {
                        if (statErr) {
                            const latest = findLatestHex();
                            if (!latest) {
                                const resp = { success: false, message: 'Build completed but HEX not found (AI unavailable)', expected: defaultHexPath, builtDir, builtListing: listBuiltDir(), stderr, stdout, durationMs: Date.now() - plainStarted };
                                sendJson(res, 500, resp);
                                sseBroadcast('ai-build-failed', resp);
                                return;
                            }
                            try {
                                logger.info(`[AI-BUILD] HEX ready (ai-fallback): ${latest.path} (${latest.size} bytes)`);
                            }
                            catch (_a) { }
                            const resp = { success: true, message: note, hex: latest.path, size: latest.size, durationMs: Date.now() - plainStarted, aiDisabled: true };
                            sendJson(res, 200, resp);
                            sseBroadcast('ai-build-succeeded', resp);
                            return;
                        }
                        try {
                            logger.info(`[AI-BUILD] HEX ready (ai-fallback): ${defaultHexPath} (${stats.size} bytes)`);
                        }
                        catch (_b) { }
                        const resp = { success: true, message: note, hex: defaultHexPath, size: stats.size, mtime: stats.mtime, durationMs: Date.now() - plainStarted, aiDisabled: true };
                        sendJson(res, 200, resp);
                        sseBroadcast('ai-build-succeeded', resp);
                    });
                });
                return;
            }
            let openaiRaw = aiResp1.raw;
            openaiRawAny = openaiRaw;
            // One retry with stronger constraints if strict and extra constructs were included
            if (strict && aiCode && containsDisallowedForStrict(aiCode)) {
                const retryPrompt = buildAIPrompt(undefined, userPrompt, true, 'Your previous attempt included disallowed constructs (event handlers, forever loops, sensors). Regenerate a minimal program with only the exact actions requested.');
                const aiResp2 = await callOpenAIWithRaw(retryPrompt, model, 0, debug);
                aiCode = aiResp2.code;
                if (debug)
                    openaiRaw = aiResp2.raw;
                openaiRawAny = openaiRaw;
            }
            if (debug) {
                logger.debug('[DEBUG][AI] Prompt used:\n' + prompt);
                if (openaiRaw) {
                    try {
                        logger.debug('[DEBUG][OpenAI] Response:' + JSON.stringify(openaiRaw).slice(0, 4000));
                    }
                    catch (_c) {
                        logger.debug('[DEBUG][OpenAI] Response (non-JSON)');
                    }
                }
                sseBroadcast('ai-debug', { phase: 'prompt', prompt });
                if (mcpDebug)
                    sseBroadcast('ai-debug', { phase: 'mcp', stdout: (mcpDebug.stdout || '').slice(0, 2000), stderr: (mcpDebug.stderr || '').slice(0, 2000) });
                if (openaiRaw)
                    sseBroadcast('ai-debug', { phase: 'openai', status: aiResp1.status, snippet: JSON.stringify(openaiRaw).slice(0, 1000) });
                const logsDir = path.join(projectDir, 'tools', 'logs');
                const logTxt = [
                    '=== AI Build Debug ===',
                    `Model: ${model}`,
                    `Strict: ${strict}`,
                    `Prompt:\n${prompt}`,
                    mcpDebug ? `\n--- MCP stdout ---\n${(mcpDebug.stdout || '').slice(0, 8000)}` : '',
                    mcpDebug ? `\n--- MCP stderr ---\n${(mcpDebug.stderr || '').slice(0, 4000)}` : '',
                    `\n--- OpenAI raw (truncated) ---\n${(() => { try {
                        return JSON.stringify(openaiRawAny).slice(0, 8000);
                    }
                    catch (_a) {
                        return String(openaiRawAny).slice(0, 8000);
                    } })()}`,
                    `\n--- Generated Code ---\n${aiCode}`
                ].join('\n');
                const f = writeDebugLogSync(logsDir, 'ai-build', logTxt);
                if (f)
                    logger.debug('[DEBUG][AI] Wrote debug log: ' + f);
            }
        }
        if (!aiCode || !aiCode.trim()) {
            const note = 'AI returned empty code. Performing plain build of current sources.';
            try {
                logger.warn('[AI-BUILD] ' + note);
            }
            catch (_d) { }
            sseBroadcast('ai-debug', { phase: 'ai-fallback', reason: 'empty-code' });
            const plainStarted = Date.now();
            runBuild((err2, stdout, stderr) => {
                if (err2) {
                    try {
                        if (err2 && err2.stack)
                            logger.error('[BUILD][ai-empty][stack]\n' + String(err2.stack));
                    }
                    catch (_a) { }
                    const resp = { success: false, message: 'Build failed (AI empty code)', error: String(err2), stack: (err2 && err2.stack) ? String(err2.stack) : undefined, stderr, stdout, durationMs: Date.now() - plainStarted };
                    sendJson(res, 500, resp);
                    sseBroadcast('ai-build-failed', resp);
                    return;
                }
                fs.stat(defaultHexPath, (statErr, stats) => {
                    if (statErr) {
                        const latest = findLatestHex();
                        if (!latest) {
                            const resp = { success: false, message: 'Build completed but HEX not found (AI empty code)', expected: defaultHexPath, builtDir, builtListing: listBuiltDir(), stderr, stdout, durationMs: Date.now() - plainStarted };
                            sendJson(res, 500, resp);
                            sseBroadcast('ai-build-failed', resp);
                            return;
                        }
                        const resp = { success: true, message: note, hex: latest.path, size: latest.size, durationMs: Date.now() - plainStarted, aiDisabled: true };
                        sendJson(res, 200, resp);
                        sseBroadcast('ai-build-succeeded', resp);
                        return;
                    }
                    const resp = { success: true, message: note, hex: defaultHexPath, size: stats.size, mtime: stats.mtime, durationMs: Date.now() - plainStarted, aiDisabled: true };
                    sendJson(res, 200, resp);
                    sseBroadcast('ai-build-succeeded', resp);
                });
            });
            return;
        }
        // Normalize Zoombit API usage (e.g., headlights) before formatting
        try {
            aiCode = normalizeZoombitHeadlight(aiCode, userPrompt);
        }
        catch ( /* best-effort */_e) { /* best-effort */ }
        // Optionally format the TypeScript for prettier terminal output and file contents
        const shouldFormat = !/^0|false$/i.test(String(process.env.AI_FORMAT_TS || '').trim());
        let formattedAiCode = aiCode;
        if (shouldFormat) {
            try {
                const prettier = require('prettier');
                formattedAiCode = await prettier.format(aiCode, { parser: 'typescript', singleQuote: true, trailingComma: 'all' });
            }
            catch (_f) {
                // prettier not installed; keep original
            }
        }
        // Print the generated (optionally formatted) TypeScript to the terminal for easy inspection
        try {
            const codeToShow = formattedAiCode || aiCode;
            logger.info('\n[AI] Generated TypeScript (preview):\n' + String(codeToShow));
            sseBroadcast('ai-debug', { phase: 'ai-code', snippet: String(codeToShow).slice(0, 2000) });
        }
        catch ( /* ignore */_g) { /* ignore */ }
        const outPath = path.join(projectDir, outFile);
        const originalMainPath = path.join(projectDir, 'main.ts');
        if (overwriteMain && fs.existsSync(originalMainPath)) {
            const backup = path.join(projectDir, 'main.ai.backup.ts');
            try {
                if (!fs.existsSync(backup))
                    fs.copyFileSync(originalMainPath, backup);
            }
            catch (_h) { }
        }
        fs.writeFileSync(outPath, formattedAiCode, 'utf8');
        // Keep only one program file listed to avoid duplicate declarations when compiling
        try {
            const pjPath = path.join(projectDir, 'pxt.json');
            const pj = readJsonFile(pjPath) || {};
            const files = Array.isArray(pj.files) ? pj.files : [];
            const cleaned = files.filter((n) => n !== 'ai.generated.ts' && n !== 'main.ts');
            // Always keep README.md and other non-program files; we rebuilt the list above
            if (overwriteMain) {
                cleaned.push('main.ts');
            }
            else {
                cleaned.push('ai.generated.ts');
            }
            pj.files = cleaned;
            writeJsonFile(pjPath, pj);
        }
        catch ( /* ignore */_j) { /* ignore */ }
        // Ensure PXT compiles the AI output as the main program by pointing testFiles to it
        ensureTestFilesTo(outFile);
        runBuild(async (err, stdout, stderr) => {
            if (err) {
                // Attempt auto-fix if enabled and we have an API key
                const wantAutoFix = (payload && payload.autoFix === true) || /^(1|true)$/i.test(String(process.env.AI_AUTOFIX || ''));
                const hasKey = !!(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || process.env.OPENAI_TOKEN);
                if (wantAutoFix && hasKey) {
                    try {
                        sseBroadcast('ai-debug', { phase: 'autofix-start', from: 'ai-build', reason: 'pxt-failed' });
                        const currentCode = safeReadText(outPath) || formattedAiCode;
                        const fixed = await callOpenAIForFix({ code: currentCode, filename: outFile, errors: String(stderr || stdout || err), model });
                        if (fixed && fixed.trim()) {
                            const finalCode = await maybeFormatTs(fixed);
                            fs.writeFileSync(outPath, finalCode, 'utf8');
                            ensureFileInPxt(outFile);
                            return runBuild((err2, stdout2, stderr2) => {
                                if (err2) {
                                    try {
                                        if (err2 && err2.stack)
                                            logger.error('[AI-BUILD][autofix][stack]\n' + String(err2.stack));
                                    }
                                    catch (_a) { }
                                    const resp = { success: false, message: 'AI build failed (after auto-fix attempt)', error: String(err2), stack: (err2 && err2.stack) ? String(err2.stack) : undefined, stderr: stderr2, stdout: stdout2, outFile, outPath, aiCode: finalCode, autoFixTried: true, durationMs: Date.now() - started };
                                    if (debug)
                                        resp.debug = { prompt: userPrompt, strict, mcp: mcpDebug };
                                    sendJson(res, 500, resp);
                                    sseBroadcast('ai-build-failed', resp);
                                }
                                else {
                                    fs.stat(defaultHexPath, (statErr, stats) => {
                                        if (statErr) {
                                            const latest = findLatestHex();
                                            if (!latest) {
                                                const resp = { success: false, message: 'AI build completed but HEX not found (after auto-fix)', expected: defaultHexPath, builtDir, builtListing: listBuiltDir(), stderr: stderr2, stdout: stdout2, outFile, outPath, aiCode: finalCode, autoFixTried: true, durationMs: Date.now() - started };
                                                if (debug)
                                                    resp.debug = { prompt: userPrompt, strict, mcp: mcpDebug };
                                                sendJson(res, 500, resp);
                                                return;
                                            }
                                            const norm = normalizeHexOutputs() || { path: latest.path, size: latest.size };
                                            try {
                                                logger.info(`[AI-BUILD] HEX ready (after auto-fix): ${norm.path} (${norm.size} bytes)`);
                                            }
                                            catch (_a) { }
                                            const resp = { success: true, message: 'AI build succeeded (after auto-fix)', hex: norm.path, size: norm.size, outFile, outPath, aiCode: finalCode, autoFixTried: true, durationMs: Date.now() - started };
                                            if (debug)
                                                resp.debug = { prompt: userPrompt, strict, mcp: mcpDebug };
                                            sendJson(res, 200, resp);
                                            sseBroadcast('ai-build-succeeded', resp);
                                            return;
                                        }
                                        const norm = normalizeHexOutputs() || { path: defaultHexPath, size: stats.size };
                                        try {
                                            logger.info(`[AI-BUILD] HEX ready (after auto-fix): ${norm.path} (${norm.size} bytes)`);
                                        }
                                        catch (_b) { }
                                        const resp = { success: true, message: 'AI build succeeded (after auto-fix)', hex: norm.path, size: norm.size, mtime: stats.mtime, outFile, outPath, aiCode: finalCode, autoFixTried: true, durationMs: Date.now() - started };
                                        if (debug)
                                            resp.debug = { prompt: userPrompt, strict, mcp: mcpDebug };
                                        sendJson(res, 200, resp);
                                        sseBroadcast('ai-build-succeeded', resp);
                                    });
                                }
                            });
                        }
                    }
                    catch (e) {
                        sseBroadcast('ai-debug', { phase: 'autofix-error', error: String(e) });
                    }
                }
                try {
                    if (err && err.stack)
                        logger.error('[AI-BUILD][stack]\n' + String(err.stack));
                }
                catch (_a) { }
                const resp = { success: false, message: 'AI build failed', error: String(err), stack: (err && err.stack) ? String(err.stack) : undefined, stderr, stdout, outFile, outPath, aiCode: formattedAiCode, durationMs: Date.now() - started };
                if (debug)
                    resp.debug = { prompt: userPrompt, strict, mcp: mcpDebug };
                sendJson(res, 500, resp);
                sseBroadcast('ai-build-failed', resp);
                return;
            }
            fs.stat(defaultHexPath, (statErr, stats) => {
                if (statErr) {
                    const latest = findLatestHex();
                    if (!latest) {
                        const resp = { success: false, message: 'AI build completed but HEX not found', expected: defaultHexPath, builtDir, builtListing: listBuiltDir(), stderr, stdout, outFile, outPath, aiCode: formattedAiCode, durationMs: Date.now() - started };
                        if (debug)
                            resp.debug = { prompt: userPrompt, strict, mcp: mcpDebug };
                        sendJson(res, 500, resp);
                        return;
                    }
                    const norm = normalizeHexOutputs() || { path: latest.path, size: latest.size };
                    try {
                        logger.info(`[AI-BUILD] HEX ready: ${norm.path} (${norm.size} bytes)`);
                    }
                    catch (_a) { }
                    const resp = { success: true, message: 'AI build succeeded', hex: norm.path, size: norm.size, outFile, outPath, aiCode: formattedAiCode, durationMs: Date.now() - started };
                    if (debug)
                        resp.debug = { prompt: userPrompt, strict, mcp: mcpDebug };
                    sendJson(res, 200, resp);
                    sseBroadcast('ai-build-succeeded', resp);
                    return;
                }
                const norm = normalizeHexOutputs() || { path: defaultHexPath, size: stats.size };
                try {
                    logger.info(`[AI-BUILD] HEX ready: ${norm.path} (${norm.size} bytes)`);
                }
                catch (_b) { }
                const resp = { success: true, message: 'AI build succeeded', hex: norm.path, size: norm.size, mtime: stats.mtime, outFile, outPath, aiCode: formattedAiCode, durationMs: Date.now() - started };
                if (debug)
                    resp.debug = { prompt: userPrompt, strict, mcp: mcpDebug };
                sendJson(res, 200, resp);
                sseBroadcast('ai-build-succeeded', resp);
            });
        });
    }
    catch (e) {
        try {
            if (e && e.stack)
                logger.error('[AI-BUILD][top][stack]\n' + String(e.stack));
        }
        catch (_k) { }
        sendJson(res, 500, { success: false, message: 'AI build error', error: String(e), stack: (e && e.stack) ? String(e.stack) : undefined, durationMs: Date.now() - started });
    }
}
function readJsonFile(p) {
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    catch (_a) {
        return null;
    }
}
function writeJsonFile(p, obj) {
    fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}
function ensureFileInPxt(rel) {
    const pjPath = path.join(projectDir, 'pxt.json');
    const pj = readJsonFile(pjPath) || {};
    const files = pj.files || [];
    if (!files.includes(rel)) {
        files.push(rel);
        pj.files = files;
        writeJsonFile(pjPath, pj);
    }
}
// For PXT extension builds, the main program is compiled from testFiles.
// To ensure the AI-generated code is what runs on the device, point testFiles to the AI output file.
function ensureTestFilesTo(rel) {
    try {
        const pjPath = path.join(projectDir, 'pxt.json');
        const pj = readJsonFile(pjPath) || {};
        const tf = Array.isArray(pj.testFiles) ? pj.testFiles : [];
        // If already the only test file, skip writes.
        if (tf.length === 1 && tf[0] === rel)
            return;
        pj.testFiles = [rel];
        writeJsonFile(pjPath, pj);
        try {
            logger.info(`[PXT] testFiles set to [${rel}]`);
        }
        catch (_a) { }
    }
    catch (_b) { }
}
function mcpQueryExamples(mcpDir, repoRoot, query, debug) {
    return new Promise((resolve) => {
        // Spawn MCP server: python -m mcp_codes_server.server
        const venvPy = process.platform === 'win32'
            ? path.join(mcpDir, '.venv', 'Scripts', 'python.exe')
            : path.join(mcpDir, '.venv', 'bin', 'python');
        const candidates = [];
        if (fs.existsSync(venvPy))
            candidates.push(venvPy);
        if (process.env.PYTHON_EXE)
            candidates.push(process.env.PYTHON_EXE);
        candidates.push('python', 'py');
        const trySpawn = (i) => {
            if (i >= candidates.length)
                return resolve({});
            const py = candidates[i];
            let proc;
            try {
                const envVars = {
                    ...process.env,
                    CODES_MD_PATH: path.join(repoRoot, 'codes.md'),
                    // Help Python find the src/ package in dev if not installed yet
                    PYTHONPATH: ((process.env.PYTHONPATH || '') + (process.env.PYTHONPATH ? path.delimiter : '') + path.join(mcpDir, 'src')),
                };
                proc = spawn(py, ['-m', 'mcp_codes_server.server'], { cwd: mcpDir, env: envVars, stdio: ['pipe', 'pipe', 'pipe'] });
                if (debug) {
                    logger.debug(`[DEBUG][MCP] Using Python: ${py}`);
                    sseBroadcast('ai-debug', { phase: 'mcp-python', python: py });
                }
            }
            catch (_a) {
                return trySpawn(i + 1);
            }
            let out = '';
            let err = '';
            proc.stdout.on('data', (d) => { out += d.toString(); });
            proc.stderr.on('data', (d) => { err += d.toString(); });
            const send = (obj) => {
                try {
                    proc.stdin.write(JSON.stringify(obj) + '\n');
                }
                catch (_a) { }
            };
            // Prefer search results when query present; else list sections and get_all (truncated)
            if (query && String(query).trim()) {
                send({ method: 'search', params: { query: String(query), context_lines: 1 } });
            }
            else {
                send({ method: 'list_sections' });
            }
            const timeout = setTimeout(() => {
                try {
                    proc.kill();
                }
                catch (_a) { }
                if (debug) {
                    logger.warn('[DEBUG][MCP] Timeout. stderr: ' + ((err === null || err === void 0 ? void 0 : err.slice(0, 2000)) || ''));
                }
                if (query)
                    resolve({ _debug: { stdout: out, stderr: err, timeout: true } });
                else
                    resolve({ _debug: { stdout: out, stderr: err, timeout: true } });
            }, 8000);
            proc.stdout.once('data', () => {
                clearTimeout(timeout);
                let firstResp = null;
                try {
                    firstResp = JSON.parse(out.split('\n').filter((l) => l.trim()).shift() || '{}');
                }
                catch (_a) { }
                if (debug) {
                    logger.debug('[DEBUG][MCP] stdout: ' + ((out === null || out === void 0 ? void 0 : out.slice(0, 4000)) || ''));
                    if (err)
                        logger.warn('[DEBUG][MCP] stderr: ' + ((err === null || err === void 0 ? void 0 : err.slice(0, 2000)) || ''));
                }
                if (firstResp && firstResp.result) {
                    if (Array.isArray(firstResp.result)) {
                        resolve({ sections: firstResp.result, _debug: { stdout: out, stderr: err, parsed: firstResp } });
                    }
                    else {
                        resolve({ raw: String(firstResp.result), _debug: { stdout: out, stderr: err, parsed: firstResp } });
                    }
                }
                else {
                    resolve({ _debug: { stdout: out, stderr: err } });
                }
                try {
                    proc.kill();
                }
                catch (_b) { }
            });
        };
        trySpawn(0);
    });
}
function buildAIPrompt(examples, userPrompt, strict, extraNote) {
    const header = 'You are a MakeCode (PXT) micro:bit TypeScript assistant for the Zoombit robot. Generate a single self-contained TypeScript program compatible with this PXT project. Output only TypeScript (no markdown). Avoid external dependencies. Prefer Zoombit APIs for hardware control: use zoombit.setHeadlight(...) for headlights and zoombit.move/turn/brake for motors; use basic.showString() for text display. Avoid raw pin writes unless explicitly requested.';
    let constraints = '';
    if (strict) {
        constraints = [
            '// Constraints:',
            '// - Implement exactly what is asked; no extra features or handlers.',
            '// - Do NOT use input.onButtonPressed, basic.forever, sensors (ultrasonic/line/light), music, or RGBs unless explicitly requested.',
            '// - Prefer direct commands at top-level (setup code that runs once).',
            '// - For headlights, use zoombit.setHeadlight(HeadlightChannel.All, zoombit.digitalStatePicker(DigitalIoState.On|Off)). Avoid pins.digitalWritePin() unless specifically asked to control GPIO.',
            '// - After completing the action(s), stop the motors with zoombit.brake() if using motors.',
        ].join('\n');
    }
    let context = '';
    if (!strict && examples) {
        if (examples.raw)
            context += `\n\n/* Examples (raw) */\n${trimTo(examples.raw, 2000)}`;
        if (examples.sections && examples.sections.length)
            context += `\n\n/* Sections in codes.md */\n${examples.sections.slice(0, 20).join('\n')}`;
    }
    const ask = userPrompt && userPrompt.trim() ? userPrompt.trim() : 'Generate a simple Zoombit demo using buttons and movement (minimal).';
    const extra = extraNote ? `\n// Note: ${extraNote}` : '';
    return `${header}\n${constraints}${context}\n\n// Task:\n// ${ask}${extra}\n`;
}
function trimTo(s, maxLen) {
    if (!s)
        return s;
    if (s.length <= maxLen)
        return s;
    return s.slice(0, maxLen) + '\n/* ...truncated... */';
}
function shouldStrict(prompt) {
    const p = (prompt || '').toLowerCase();
    if (!p)
        return false;
    const len = p.split(/\s+/).filter(Boolean).length;
    const mentionsExtras = /(button|forever|ultrasonic|sensor|line|rgb|led|music|tone|radio|rekabit)/.test(p);
    const hasDuration = /(\b\d+\s*(ms|milliseconds|sec|secs|second|seconds)\b)/.test(p);
    const simpleAction = /(move|go|drive)\s+(forward|backward|back)/.test(p) || /turn\s+(left|right)/.test(p);
    return !mentionsExtras && (len <= 16) && (hasDuration || simpleAction);
}
function containsDisallowedForStrict(code) {
    // Disallow heavy constructs in strict mode but allow Zoombit APIs and headlights usage
    const bad = /(input\.onButtonPressed|ultrasonic|readUltrasonic|line|music\.|rekabit|ws2812|radio\.)/i;
    return bad.test(code || '');
}
function tryRuleBasedGenerate(prompt) {
    if (!prompt)
        return null;
    const p = prompt.trim().toLowerCase();
    // Simple headlight control: turn on/off lights using Zoombit API
    if (/\b(headlight|head\s*light|light\s*up\s*led|turn\s*on\s*led|turn\s*off\s*led)\b/.test(p)) {
        const turnOn = /\b(on|turn\s*on|light\s*up)\b/.test(p) && !/\b(off|turn\s*off)\b/.test(p);
        const state = turnOn ? 'DigitalIoState.On' : 'DigitalIoState.Off';
        return [
            `// Auto-generated headlight control for: ${prompt.trim()}`,
            `zoombit.setHeadlight(HeadlightChannel.All, zoombit.digitalStatePicker(${state}))`
        ].join('\n');
    }
    // Match e.g., "make the robot move forward for 1 sec", "move backward for 500 ms"
    const m = p.match(/\b(move|go|drive)\s+(forward|back|backward)\s+for\s+(\d+)\s*(ms|milliseconds|sec|secs|second|seconds)\b/);
    if (!m)
        return null;
    const dirWord = m[2];
    const n = parseInt(m[3], 10);
    const unit = m[4];
    if (!isFinite(n) || n <= 0)
        return null;
    const ms = /ms|millisecond/.test(unit) ? n : n * 1000;
    const dir = /back/.test(dirWord) ? 'MotorDirection.Backward' : 'MotorDirection.Forward';
    const lines = [
        `// Auto-generated minimal program for: ${prompt.trim()}`,
        `zoombit.move(${dir}, 120)`,
        `basic.pause(${ms})`,
        `zoombit.brake()`
    ];
    return lines.join('\n');
}
function callOpenAIWithRaw(prompt, model, temperature, debug) {
    return new Promise((resolve, reject) => {
        const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || process.env.OPENAI_TOKEN;
        if (!apiKey)
            return reject(new Error('OPENAI_API_KEY not set'));
        const baseUrl = (process.env.OPENAI_BASE_URL || '').trim() || 'https://api.openai.com';
        const chatPath = (process.env.OPENAI_CHAT_PATH || '/v1/chat/completions');
        const data = JSON.stringify({
            model,
            messages: [
                { role: 'system', content: 'You are a helpful Microsoft MakeCode (PXT) micro:bit code generator for the Zoombit robot. Assume the hardware has: 2 DC motors, 1 ultrasonic sensor, 1 line sensor, 2 RGB LEDs, 2 single-color LEDs, and a light sensor. Generate concise, self-contained TypeScript for this project only.' },
                { role: 'user', content: prompt }
            ],
            temperature,
        });
        const opts = {
            hostname: new URL(baseUrl).hostname,
            protocol: new URL(baseUrl).protocol,
            port: new URL(baseUrl).port || (new URL(baseUrl).protocol === 'https:' ? 443 : 80),
            path: chatPath,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(data),
            },
        };
        const requester = (opts.protocol === 'http:' ? require('http') : require('https'));
        const req = requester.request(opts, (resp) => {
            let buf = '';
            resp.on('data', (d) => { buf += d.toString(); });
            resp.on('end', () => {
                var _a;
                try {
                    const j = JSON.parse(buf);
                    const content = ((_a = (((j || {}).choices || [])[0] || {}).message) === null || _a === void 0 ? void 0 : _a.content) || '';
                    const cleaned = stripCodeFences(String(content || ''));
                    if (debug) {
                        try {
                            logger.debug('[DEBUG][OpenAI] Status: ' + resp.statusCode + ' Body: ' + buf.slice(0, 4000));
                        }
                        catch (_b) { }
                    }
                    resolve({ code: cleaned, raw: j, status: resp.statusCode });
                }
                catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', (e) => reject(e));
        req.write(data);
        req.end();
    });
}
function stripCodeFences(s) {
    if (!s)
        return s;
    // Remove ```typescript ... ``` or ``` ... ``` fences
    const fence = /```[a-zA-Z]*\n([\s\S]*?)\n```/m;
    const m = s.match(fence);
    if (m && m[1])
        return m[1];
    return s;
}
// Normalize common mistakes with Zoombit headlights API usage
function normalizeZoombitHeadlight(src, prompt) {
    if (!src)
        return src;
    const wantsOn = /\b(on|turn\s*on|light\s*up|enable)\b/i.test(prompt || '') && !/\b(off|turn\s*off|disable)\b/i.test(prompt || '');
    const wantsOff = /\b(off|turn\s*off|disable)\b/i.test(prompt || '') && !wantsOn;
    const state = wantsOff ? 'DigitalIoState.Off' : 'DigitalIoState.On';
    // Replace incorrect single-arg or wrong-arg setHeadlight calls with canonical form
    src = src.replace(/zoombit\.setHeadlight\s*\(([^)]*)\)/g, (m, args) => {
        const a = String(args || '');
        if (/HeadlightChannel\./.test(a) && /digitalStatePicker\s*\(/.test(a))
            return m; // already correct
        return `zoombit.setHeadlight(HeadlightChannel.All, zoombit.digitalStatePicker(${state}))`;
    });
    // If raw pin writes are used to simulate headlights, prefer Zoombit API (best-effort heuristic)
    if (/pins\.digitalWritePin\s*\(/.test(src) && !/zoombit\.setHeadlight\s*\(/.test(src)) {
        src = src + `\n\n// Normalize to Zoombit headlight API\nzoombit.setHeadlight(HeadlightChannel.All, zoombit.digitalStatePicker(${state}))\n`;
    }
    return src;
}
// Ensure a setup()/loop() scaffold with basic.forever(() => loop())
// (setup()/loop() scaffolding removed by request)
// ====== Auto-fix helpers ======
function safeReadText(p) {
    try {
        return fs.readFileSync(p, 'utf8');
    }
    catch (_a) {
        return null;
    }
}
async function maybeFormatTs(src) {
    try {
        const prettier = require('prettier');
        return await prettier.format(src, { parser: 'typescript', singleQuote: true, trailingComma: 'all' });
    }
    catch (_a) {
        return src;
    }
}
function selectEditableFile() {
    const pjPath = path.join(projectDir, 'pxt.json');
    const pj = readJsonFile(pjPath) || {};
    const files = pj.files || [];
    if (files.includes('ai.generated.ts'))
        return 'ai.generated.ts';
    if (files.includes('main.ts'))
        return 'main.ts';
    const ts = (files || []).find((n) => /\.ts$/i.test(n));
    return ts || null;
}
function callOpenAIForFix(args) {
    const { code, filename, errors, model } = args;
    return new Promise((resolve, reject) => {
        const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || process.env.OPENAI_TOKEN;
        if (!apiKey)
            return reject(new Error('OPENAI_API_KEY not set'));
        const baseUrl = (process.env.OPENAI_BASE_URL || '').trim() || 'https://api.openai.com';
        const chatPath = (process.env.OPENAI_CHAT_PATH || '/v1/chat/completions');
        const system = 'You are a MakeCode (PXT) micro:bit TypeScript repair assistant for the Zoombit project. Produce a single corrected TypeScript file that compiles. Output only TypeScript code.';
        const user = [
            `File: ${filename}`,
            'Current code:',
            '```typescript',
            code,
            '```',
            '',
            'PXT build errors/stderr:',
            '```',
            String(errors || '').slice(0, 4000),
            '```',
            '',
            'Please return a fixed version of the file only, no markdown fences.'
        ].join('\n');
        const data = JSON.stringify({
            model,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user }
            ],
            temperature: 0,
        });
        const url = new URL(baseUrl);
        const opts = {
            hostname: url.hostname,
            protocol: url.protocol,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: chatPath,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(data),
            },
        };
        const requester = (opts.protocol === 'http:' ? require('http') : require('https'));
        const req = requester.request(opts, (resp) => {
            let buf = '';
            resp.on('data', (d) => { buf += d.toString(); });
            resp.on('end', () => {
                var _a;
                try {
                    const j = JSON.parse(buf);
                    const content = ((_a = (((j || {}).choices || [])[0] || {}).message) === null || _a === void 0 ? void 0 : _a.content) || '';
                    resolve(stripCodeFences(String(content || '')));
                }
                catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', (e) => reject(e));
        req.write(data);
        req.end();
    });
}
