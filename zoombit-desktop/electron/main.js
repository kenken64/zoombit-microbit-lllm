// Minimal Electron main process to load Angular build and provide sync IPC
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');

let mainWindow;
let serialPort; // current open port
let serialReader; // data listener

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const indexPath = path.join(__dirname, '..', 'dist', 'zoombit-desktop', 'browser', 'index.html');
  mainWindow.loadFile(indexPath);
}

// Optional: suppress Electron security warnings during local dev (do not use in prod)
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// ---- Document folder + images ----
let docFolder = null;

function getDefaultDocFolder() {
  // In dev, electron/main.js sits under electron/, images under ../documents
  const candidate = path.join(__dirname, '..', 'documents');
  try {
    if (fs.existsSync(candidate)) return candidate;
  } catch {}
  return null;
}

ipcMain.handle('choose-doc-folder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (res.canceled || !res.filePaths?.[0]) return { success: false };
  docFolder = res.filePaths[0];
  return { success: true, folder: docFolder };
});

ipcMain.handle('list-doc-images', async () => {
  try {
    if (!docFolder) docFolder = getDefaultDocFolder();
    const folder = docFolder;
    if (!folder) return { success: false, error: 'Documents folder not found' };
    // Only files like ZOOMBIT_page_001.png ... ZOOMBIT_page_116.png
    const re = /^ZOOMBIT_page_(\d{3})\.png$/i;
    const files = fs.readdirSync(folder)
      .filter(name => re.test(name))
      .sort((a, b) => {
        const ma = a.match(re); const mb = b.match(re);
        const na = ma ? parseInt(ma[1], 10) : 0;
        const nb = mb ? parseInt(mb[1], 10) : 0;
        return na - nb;
      });
    const abs = files.map(name => path.join(folder, name));
    return { success: true, files: abs, folder };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

// Helper: download via HTTP(S)
function downloadToFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    const req = client.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(destPath)));
    });
    req.on('error', (err) => reject(err));
  });
}

// Helper: detect MICROBIT drive letter on Windows
function findMicrobitDriveLetter() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  for (const L of letters) {
    const root = `${L}:\\`;
    try {
      if (fs.existsSync(root)) {
        const details = path.join(root, 'DETAILS.TXT');
        const htm = path.join(root, 'MICROBIT.HTM');
        if (fs.existsSync(details) || fs.existsSync(htm)) {
          return L;
        }
      }
    } catch (_) {}
  }
  return null;
}

ipcMain.handle('sync-hex', async () => {
  try {
    const tmp = path.join(os.tmpdir(), `binary-${Date.now()}.hex`);
    await downloadToFile('http://localhost:3000/download', tmp);
    // Log the downloaded HEX file size
    try {
      const sz = fs.statSync(tmp).size;
      console.log(`[DESKTOP][DOWNLOAD] HEX downloaded: ${tmp} (${sz} bytes)`);
    } catch (_) {}

    const drive = findMicrobitDriveLetter();
    if (!drive) throw new Error('MICROBIT drive not found');

    const dest = path.join(`${drive}:\\`, 'binary.hex');
    fs.copyFileSync(tmp, dest);

    let size = 0;
    try { size = fs.statSync(tmp).size; } catch (_) {}
    return { success: true, drive: `${drive}:\\`, dest, size };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

// ---- Serial support ----
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

ipcMain.handle('serial-list', async () => {
  try {
    const ports = await SerialPort.list();
    return ports.map(p => ({ path: p.path, friendlyName: p.friendlyName || p.manufacturer || '', vendorId: p.vendorId, productId: p.productId }));
  } catch (e) {
    return [];
  }
});

ipcMain.handle('serial-open', async (evt, { path: portPath, baudRate = 115200 }) => {
  try {
    if (serialPort && serialPort.isOpen) {
      await new Promise(res => serialPort.close(() => res(null)));
      serialPort = null;
    }
    serialPort = new SerialPort({ path: portPath, baudRate: Number(baudRate) });
    const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));
    serialReader = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('serial-data', String(data));
      }
    };
    parser.on('data', serialReader);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

ipcMain.handle('serial-close', async () => {
  try {
    if (serialPort) {
      if (serialReader) {
        serialPort.off?.('data', serialReader);
        serialReader = null;
      }
      await new Promise(res => serialPort.close(() => res(null)));
      serialPort = null;
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

