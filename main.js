const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

// ─── Dev auto-reload (electron-reload) ────────────────────────
// Watches src/ and main.js; reloads renderer on src changes,
// restarts the whole process on main.js changes.
// Skipped automatically in packaged builds.
if (!app.isPackaged) {
  try {
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, 'node_modules', '.bin', 'electron.cmd'),
      hardResetMethod: 'exit',
      forceHardReset: false,
      watched: [
        path.join(__dirname, 'main.js'),
        path.join(__dirname, 'src'),
      ],
    });
  } catch (e) { /* electron-reload not installed */ }
}

// ─── Auto-updater ─────────────────────────────────────────────
// Only runs in packaged app — skip in dev (electron .)
let autoUpdater = null;
try {
  const { autoUpdater: au } = require('electron-updater');
  autoUpdater = au;
  autoUpdater.autoDownload = true;         // download silently in background
  autoUpdater.autoInstallOnAppQuit = true; // install when user quits
} catch(e) { /* electron-updater not available in dev */ }

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,            // required so preload.js can require('xlsx') and Node built-ins
      preload: path.join(__dirname, 'src', 'preload.js'),
    },
    titleBarStyle: 'default',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    title: 'Recipe Costing'
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();

  // Check for updates after app starts (only in packaged builds)
  if (autoUpdater && app.isPackaged) {
    autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('update-available', info.version);
    });
    autoUpdater.on('update-downloaded', (info) => {
      mainWindow?.webContents.send('update-downloaded', info.version);
    });
    autoUpdater.on('error', (e) => {
      // Swallow "no published release" errors silently — only log to console
      console.error('[updater]', e.message || e);
    });
    setTimeout(() => {
      // Use checkForUpdates (not checkForUpdatesAndNotify) so electron-updater
      // doesn't show its own native notification dialogs — we handle UI ourselves
      autoUpdater.checkForUpdates().catch(() => {});
    }, 3000); // wait 3s after launch
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── Data encryption helpers ──────────────────────────────────────────────────
// A random 32-byte AES-GCM key is generated on first run and stored via safeStorage
// (OS-level encryption: Windows DPAPI, macOS Keychain). The data file on disk is
// therefore always encrypted, not readable without the OS user's credentials.
const crypto = require('crypto');
const getDataPath  = () => path.join(app.getPath('userData'), 'recipe-data.enc');
const getDataKeyPath = () => path.join(app.getPath('userData'), 'data.key');

function getOrCreateDataKey() {
  const kp = getDataKeyPath();
  if (fs.existsSync(kp)) {
    const stored = fs.readFileSync(kp);
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(stored);
      } catch (e) {
        // DPAPI can fail on Azure AD accounts after token/credential changes.
        // Fall back to treating the raw bytes as a hex key (handles cases where
        // the key was originally stored without DPAPI, e.g. isEncryptionAvailable
        // was false at creation time).
        console.warn('[getOrCreateDataKey] safeStorage.decryptString failed, trying raw fallback:', e.message);
        const raw = stored.toString('hex');
        if (raw.length === 64) return raw; // valid 32-byte hex key
        throw e; // re-throw if it doesn't look like a raw key
      }
    }
    return stored.toString('hex');
  }
  // First run — generate a new 32-byte key
  const rawKey = crypto.randomBytes(32).toString('hex');
  const toStore = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(rawKey) : Buffer.from(rawKey);
  fs.writeFileSync(kp, toStore);
  return rawKey;
}

function encryptData(jsonStr) {
  const keyHex = getOrCreateDataKey();
  const key    = Buffer.from(keyHex, 'hex');
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc    = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  // Layout: 12-byte IV | 16-byte auth tag | ciphertext
  return Buffer.concat([iv, tag, enc]);
}

function decryptData(buf) {
  const keyHex = getOrCreateDataKey();
  const key    = Buffer.from(keyHex, 'hex');
  const iv     = buf.slice(0, 12);
  const tag    = buf.slice(12, 28);
  const enc    = buf.slice(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc) + decipher.final('utf8');
}

// ─── Data persistence ─────────────────────────────────────────────────────────
ipcMain.handle('load-data', () => {
  const p = getDataPath();
  if (fs.existsSync(p)) {
    try {
      const raw = fs.readFileSync(p);
      // Detect legacy plaintext JSON (starts with '{') and migrate transparently
      if (raw[0] === 0x7b /* '{' */) {
        const parsed = JSON.parse(raw.toString('utf8'));
        // Re-save encrypted immediately
        fs.writeFileSync(p, encryptData(JSON.stringify(parsed)));
        return parsed;
      }
      return JSON.parse(decryptData(raw));
    } catch (e) {
      console.error('[load-data] decrypt failed:', e.message);
      // Before giving up, check for plaintext fallback files left from migration
      const fallbackPaths = [
        path.join(app.getPath('userData'), 'recipe-data.json.migrated'),
        path.join(app.getPath('userData'), 'recipe-data.json.old'),
        path.join(app.getPath('userData'), 'recipe-data.json'),
      ];
      for (const fp of fallbackPaths) {
        if (fs.existsSync(fp)) {
          try {
            const parsed = JSON.parse(fs.readFileSync(fp, 'utf8'));
            console.log('[load-data] recovered from plaintext fallback:', fp);
            return { ...parsed, _recoveredFrom: fp, _decryptError: e.message };
          } catch (_) {}
        }
      }
      return { _loadError: 'DECRYPT_FAILED', message: e.message };
    }
  }
  // Check for legacy unencrypted file path
  const legacyPath = path.join(app.getPath('userData'), 'recipe-data.json');
  if (fs.existsSync(legacyPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
      fs.writeFileSync(p, encryptData(JSON.stringify(parsed)));
      fs.renameSync(legacyPath, legacyPath + '.migrated'); // keep as fallback
      return parsed;
    } catch (e) { return null; }
  }
  return null;
});

const getBackupDir = () => path.join(app.getPath('userData'), 'backups');

ipcMain.handle('save-data', (_, data) => {
  // Basic schema guard — must be a plain object
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    console.error('[save-data] rejected invalid data type:', typeof data);
    throw new Error('Invalid data payload');
  }

  const p = getDataPath();

  // Keep a rolling backup of the last save before overwriting
  if (fs.existsSync(p)) {
    const backupDir = getBackupDir();
    try {
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      fs.copyFileSync(p, path.join(backupDir, 'recipe-data-' + stamp + '.enc'));
    } catch (e) {
      console.error('[save-data] backup copy failed:', e.code, e.message);
    }
    try {
      const backups = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('recipe-data-') && (f.endsWith('.enc') || f.endsWith('.json')))
        .sort();
      while (backups.length > 5) {
        fs.unlinkSync(path.join(backupDir, backups.shift()));
      }
    } catch (e) {
      console.error('[save-data] backup rotation failed:', e.code, e.message);
    }
  }

  fs.writeFileSync(p, encryptData(JSON.stringify(data)));
  return true;
});

// Expose backup folder path so user can find it
ipcMain.handle('get-data-path', () => {
  return { dataPath: getDataPath(), backupDir: getBackupDir() };
});

// List available backups (newest first)
ipcMain.handle('list-backups', () => {
  const backupDir = getBackupDir();
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir)
    .filter(f => f.startsWith('recipe-data-') && (f.endsWith('.enc') || f.endsWith('.json')))
    .sort()
    .reverse()
    .map(f => {
      const stat = fs.statSync(path.join(backupDir, f));
      return { name: f, size: stat.size, mtime: stat.mtime.toISOString() };
    });
});

// Restore a specific backup by filename — overwrites current data
ipcMain.handle('restore-backup', (_, filename) => {
  // Validate filename — no path traversal, must match expected pattern
  if (!/^recipe-data-[\d\-T]+\.(enc|json)$/.test(filename)) {
    throw new Error('Invalid backup filename');
  }
  const backupDir = getBackupDir();
  const src = path.join(backupDir, filename);
  if (!fs.existsSync(src)) throw new Error('Backup not found');

  // Back up current data before restoring
  const current = getDataPath();
  if (fs.existsSync(current)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    try {
      fs.copyFileSync(current, path.join(backupDir, 'recipe-data-pre-restore-' + stamp + '.enc'));
    } catch(e) { /* non-fatal */ }
  }

  fs.copyFileSync(src, current);
  return true;
});

// ─── Cloud Sync / Folder Backup ──────────────────────────────
ipcMain.handle('choose-sync-folder', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Cloud Sync Folder (Google Drive, Dropbox, OneDrive, or any folder)',
    properties: ['openDirectory']
  });
  if (canceled || !filePaths.length) return null;
  return filePaths[0];
});

// Sanitize a location label into a safe folder name.
function _sanitizeLocationSlug(slug) {
  if (!slug) return '';
  return String(slug)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')  // strip illegal path chars
    .replace(/\s+/g, '-')
    .replace(/\.+$/g, '')                    // trailing dots (Windows)
    .slice(0, 80);
}

// Resolve the target folder for a given base folder + optional location slug.
// If a slug is provided, the backup is placed in folderPath/<slug>/ which is
// created on demand. Callers that don't pass a slug keep the legacy behavior.
function _resolveSyncTarget(folderPath, locationSlug) {
  if (!folderPath || !fs.existsSync(folderPath)) return null;
  const safeSlug = _sanitizeLocationSlug(locationSlug);
  if (!safeSlug) return folderPath;
  const sub = path.join(folderPath, safeSlug);
  if (!fs.existsSync(sub)) fs.mkdirSync(sub, { recursive: true });
  return sub;
}

ipcMain.handle('sync-backup-to-folder', async (_, { folderPath, data, locationSlug }) => {
  try {
    const targetFolder = _resolveSyncTarget(folderPath, locationSlug);
    if (!targetFolder) return { error: 'Sync folder not found' };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = 'recipe-costing-backup-' + stamp + '.json';
    const dest = path.join(targetFolder, filename);
    fs.writeFileSync(dest, JSON.stringify(data, null, 2), 'utf8');

    // Keep only last 10 sync backups in the target (per-location) folder
    const allBackups = fs.readdirSync(targetFolder)
      .filter(f => f.startsWith('recipe-costing-backup-') && f.endsWith('.json'))
      .sort()
      .reverse();
    if (allBackups.length > 10) {
      allBackups.slice(10).forEach(f => {
        try { fs.unlinkSync(path.join(targetFolder, f)); } catch(e) {}
      });
    }
    return { ok: true, path: dest, filename, folder: targetFolder };
  } catch(e) {
    return { error: e.message };
  }
});

ipcMain.handle('list-sync-backups', async (_, arg) => {
  try {
    // Backwards-compat: older renderer passed the folderPath string directly.
    const folderPath = typeof arg === 'string' ? arg : (arg && arg.folderPath);
    const locationSlug = typeof arg === 'object' && arg ? arg.locationSlug : '';
    const targetFolder = _resolveSyncTarget(folderPath, locationSlug);
    if (!targetFolder) return [];
    return fs.readdirSync(targetFolder)
      .filter(f => f.startsWith('recipe-costing-backup-') && f.endsWith('.json'))
      .sort()
      .reverse()
      .map(f => {
        const stat = fs.statSync(path.join(targetFolder, f));
        return { name: f, size: stat.size, mtime: stat.mtime.toISOString() };
      });
  } catch(e) { return []; }
});

ipcMain.handle('restore-sync-backup', async (_, { folderPath, filename, locationSlug }) => {
  try {
    if (!/^recipe-costing-backup-[\d\-T]+\.json$/.test(filename)) throw new Error('Invalid filename');
    const targetFolder = _resolveSyncTarget(folderPath, locationSlug) || folderPath;
    const src = path.join(targetFolder, filename);
    if (!fs.existsSync(src)) throw new Error('Backup not found');
    const raw = fs.readFileSync(src, 'utf8');
    return { data: JSON.parse(raw) };
  } catch(e) {
    return { error: e.message };
  }
});

// ─── Audit trail archives ─────────────────────────────────────────────────
// Each archive file holds one YYYY-MM worth of rotated audit log entries.
// Live log stays in the main data file; archives are written lazily when
// rotation spills entries out.

function _auditArchivePath(ym) {
  // ym like "2026-04"; validate strictly to avoid path traversal
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  const dir = path.join(app.getPath('userData'), 'audit-archives');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'audit-archive-' + ym + '.json');
}

ipcMain.handle('list-audit-archives', async () => {
  try {
    const dir = path.join(app.getPath('userData'), 'audit-archives');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(function (f) { return /^audit-archive-\d{4}-\d{2}\.json$/.test(f); })
      .map(function (f) { return f.replace(/^audit-archive-|\.json$/g, ''); })
      .sort()
      .reverse();
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('load-audit-archive', async (_, ym) => {
  try {
    const p = _auditArchivePath(ym);
    if (!p || !fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('save-audit-archive', async (_, { ym, entries }) => {
  try {
    const p = _auditArchivePath(ym);
    if (!p) return { error: 'Invalid archive key: ' + ym };
    // Append to any existing archive for the same month, deduped by entry id
    let existing = [];
    if (fs.existsSync(p)) {
      try {
        existing = JSON.parse(fs.readFileSync(p, 'utf8')) || [];
      } catch (e) { existing = []; }
    }
    const seen = new Set(existing.map(function (e) { return e.id; }));
    const toAdd = (entries || []).filter(function (e) { return e && e.id && !seen.has(e.id); });
    const merged = existing.concat(toAdd);
    fs.writeFileSync(p, JSON.stringify(merged));
    return { ok: true, added: toAdd.length };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('open-folder', (_, folderPath) => {
  if (folderPath && fs.existsSync(folderPath)) shell.openPath(folderPath);
});

// Open file dialog and return raw xlsx buffer as base64
ipcMain.handle('open-excel', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Ingredients from Excel',
    filters: [
      { name: 'Excel Files', extensions: ['xlsx', 'xls', 'csv'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  if (canceled || !filePaths.length) return null;
  const buffer = fs.readFileSync(filePaths[0]);
  return { base64: buffer.toString('base64'), name: path.basename(filePaths[0]) };
});

ipcMain.handle('save-excel', async (_, { buffer, defaultName, filters }) => {
  const ext = (defaultName || '').split('.').pop().toLowerCase();
  const defaultFilters = ext === 'json'
    ? [{ name: 'JSON Backup', extensions: ['json'] }]
    : [{ name: 'Excel', extensions: ['xlsx'] }];
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: ext === 'json' ? 'Save Backup' : 'Save Excel File',
    defaultPath: defaultName || 'export.xlsx',
    filters: filters || defaultFilters,
  });
  if (canceled || !filePath) return false;
  fs.writeFileSync(filePath, Buffer.from(buffer));
  if (ext !== 'json') shell.openPath(filePath);
  return true;
});

// Build an entire xlsx workbook in the main process and show a save dialog.
// sheets: [{ name: string, rows: any[][], cols?: {wch:number}[] }]
ipcMain.handle('build-and-save-excel', async (_, { sheets, defaultName }) => {
  try {
    const wb = XLSX.utils.book_new();
    const usedNames = new Set();
    sheets.forEach(({ name, rows, cols }) => {
      let sName = (name || 'Sheet').replace(/[:\\\/\?\*\[\]]/g, '').slice(0, 31) || 'Sheet';
      let candidate = sName;
      let n = 2;
      while (usedNames.has(candidate)) { candidate = sName.slice(0, 28) + '_' + n++; }
      usedNames.add(candidate);
      const ws = XLSX.utils.aoa_to_sheet(rows);
      if (cols) ws['!cols'] = cols;
      XLSX.utils.book_append_sheet(wb, ws, candidate);
    });
    const buf = Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Excel File',
      defaultPath: defaultName || 'export.xlsx',
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
    });
    if (canceled || !filePath) return false;
    fs.writeFileSync(filePath, buf);
    shell.openPath(filePath);
    return true;
  } catch (e) {
    console.error('[build-and-save-excel]', e);
    return { error: e.message };
  }
});

ipcMain.handle('export-pdf', async (_, arg) => {
  // Accept either a bare html string (legacy) or { html, defaultName } (current)
  const htmlContent = typeof arg === 'string' ? arg : (arg && arg.html) || '';
  const rawName = (arg && arg.defaultName) || 'recipe-cost-sheet.pdf';
  const defaultName = /\.pdf$/i.test(rawName) ? rawName : rawName + '.pdf';
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save PDF',
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (!filePath) return false;

  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
  await new Promise(r => setTimeout(r, 800));
  const pdfBuffer = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
  fs.writeFileSync(filePath, pdfBuffer);
  win.close();
  shell.openPath(filePath);
  return true;
});

// Open image file and return base64
ipcMain.handle('open-image', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Recipe Photo',
    filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','webp','gif'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths.length) return null;
  const buffer = fs.readFileSync(filePaths[0]);
  const ext = path.extname(filePaths[0]).slice(1).toLowerCase();
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  return { dataUrl: `data:${mime};base64,${buffer.toString('base64')}` };
});

// Open invoice — supports multiple files (multi-page invoices)
// Reads file data in main process and returns [{base64, mime, name}] — renderer needs no fs access
ipcMain.handle('open-invoice', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Invoice Images or PDF (select multiple for multi-page)',
    filters: [
      { name: 'Images & PDF', extensions: ['jpg','jpeg','png','pdf'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile', 'multiSelections']
  });
  if (canceled || !filePaths.length) return null;
  return filePaths.map(fp => {
    const ext = path.extname(fp).slice(1).toLowerCase();
    const mime = ext === 'pdf' ? 'application/pdf' : (ext === 'jpg' ? 'image/jpeg' : `image/${ext}`);
    const base64 = fs.readFileSync(fp).toString('base64');
    return { base64, mime, name: path.basename(fp) };
  });
});

// ─── Shared HTTPS helper ──────────────────────────────────────────────────────
const https = require('https');
const http = require('http');

function httpPost(hostname, port, urlPath, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(body);
    const req = http.request({
      hostname, port, path: urlPath, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length }
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, json: JSON.parse(data) }); }
        catch(e) { reject(new Error('Bad JSON from Ollama: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

function httpGet(hostname, port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname, port, path: urlPath, method: 'GET',
      headers: { 'Accept': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, json: JSON.parse(data) }); }
        catch(e) { reject(new Error('Bad JSON from Ollama: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}
function httpsPost(hostname, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname, path: urlPath, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers }
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Bad JSON from API: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// GET helper for USDA FoodData Central (and any future REST APIs)
function httpsGet(hostname, urlPath) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname, path: urlPath, method: 'GET',
      headers: { 'Accept': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Bad JSON from USDA: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const AI_MODEL_WHITELIST = new Set(['claude', 'gemini-flash', 'gemini-flash-lite', 'gemini']);

// Text-only AI call — routes Claude and Gemini through main process (no CORS workaround needed)
ipcMain.handle('call-ai', async (_, { model, prompt, apiKey, maxTokens }) => {
  if (!AI_MODEL_WHITELIST.has(model)) throw new Error('Invalid model: ' + model);
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) throw new Error('No API key provided.');
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Empty prompt.');
  const tokens = Math.min(Math.max(parseInt(maxTokens) || 1000, 1), 16000);

  if (model === 'gemini-flash' || model === 'gemini-flash-lite' || model === 'gemini') {
    const geminiModel = model === 'gemini-flash-lite' ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash';
    let data;
    for (let attempt = 0; attempt < 3; attempt++) {
      data = await httpsPost(
        'generativelanguage.googleapis.com',
        '/v1beta/models/' + geminiModel + ':generateContent?key=' + encodeURIComponent(cleanKey),
        {},
        JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      );
      if (data.error && data.error.code === 429 && attempt < 2) {
        const delay = parseFloat((data.error.message || '').match(/retry in ([\d.]+)s/i)?.[1] || '5');
        await new Promise(r => setTimeout(r, Math.ceil(delay) * 1000));
        continue;
      }
      break;
    }
    if (data.error) throw new Error(data.error.message || 'Gemini API error');
    return (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  } else {
    const data = await httpsPost(
      'api.anthropic.com', '/v1/messages',
      { 'x-api-key': cleanKey, 'anthropic-version': '2024-06-01' },
      JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: tokens,
        messages: [{ role: 'user', content: prompt }] })
    );
    if (data.error) throw new Error(data.error.message || 'Claude API error');
    return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  }
});

// ─── Ollama local AI ──────────────────────────────────────────────────────────
ipcMain.handle('call-ollama', async (_, { modelName, prompt, maxTokens }) => {
  if (!modelName || typeof modelName !== 'string' || !modelName.trim())
    throw new Error('No Ollama model name provided.');
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Empty prompt.');
  const tokens = maxTokens ? Math.min(Math.max(parseInt(maxTokens) || 1000, 1), 32000) : undefined;
  const body = JSON.stringify({
    model: modelName.trim(),
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    think: false,  // disable Qwen3 thinking tokens (ignored by other models)
    ...(tokens ? { options: { num_predict: tokens } } : {}),
  });
  const result = await httpPost('127.0.0.1', 11434, '/api/chat', body);
  if (!result.ok) throw new Error("Ollama not reachable — make sure it's running (ollama serve).");
  return result.json.message?.content || '';
});

ipcMain.handle('test-ollama', async () => {
  const result = await httpGet('127.0.0.1', 11434, '/api/tags');
  if (!result.ok) throw new Error('Ollama returned non-200 status.');
  return result.json; // { models: [{name: "...", ...}, ...] }
});

// Scan invoice — accepts pre-loaded base64 files from renderer (no fs access in renderer)
ipcMain.handle('scan-invoice', async (_, { files, prompt, model, apiKey }) => {
  if (!AI_MODEL_WHITELIST.has(model)) throw new Error('Invalid model: ' + model);
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) throw new Error('No API key provided. Go to Settings to add your key.');
  if (!Array.isArray(files) || !files.length) throw new Error('No files provided.');
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Empty prompt.');
  // Validate each file entry
  for (const f of files) {
    if (typeof f.base64 !== 'string' || !f.base64) throw new Error('Invalid file data.');
    if (!['image/jpeg','image/png','image/gif','image/webp','application/pdf'].includes(f.mime))
      throw new Error('Unsupported file type: ' + f.mime);
  }

  console.log('[scan-invoice] model:', model, 'files:', files.length);

  if (model === 'gemini-flash' || model === 'gemini-flash-lite' || model === 'gemini') {
    const parts = files.map(f => ({ inlineData: { mimeType: f.mime, data: f.base64 } }));
    parts.push({ text: prompt });
    let data;
    for (let attempt = 0; attempt < 3; attempt++) {
      const geminiModel = model === 'gemini-flash-lite' ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash';
      data = await httpsPost(
        'generativelanguage.googleapis.com',
        '/v1beta/models/' + geminiModel + ':generateContent?key=' + encodeURIComponent(cleanKey),
        {},
        JSON.stringify({ contents: [{ parts }] })
      );
      if (data.error && data.error.code === 429 && attempt < 2) {
        const delay = parseFloat((data.error.message || '').match(/retry in ([\d.]+)s/i)?.[1] || '5');
        await new Promise(r => setTimeout(r, Math.ceil(delay) * 1000));
        continue;
      }
      break;
    }
    if (data.error) throw new Error(data.error.message || 'Gemini API error');
    const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    return { content: [{ type: 'text', text: JSON.stringify(parsed) }] };

  } else {
    const contentBlocks = files.map(f =>
      f.mime === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: f.mime, data: f.base64 } }
        : { type: 'image',    source: { type: 'base64', media_type: f.mime, data: f.base64 } }
    );
    const data = await httpsPost(
      'api.anthropic.com', '/v1/messages',
      { 'x-api-key': cleanKey, 'anthropic-version': '2024-06-01' },
      JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 8000,
        messages: [{ role: 'user', content: [...contentBlocks, { type: 'text', text: prompt }] }] })
    );
    if (data.error) throw new Error(data.error.message || 'Claude API error');
    return data;
  }
});

// ─── USDA Nutrition lookup ────────────────────────────
ipcMain.handle('fetch-usda-nutrition', async (_, { names, apiKey }) => {
  if (!Array.isArray(names) || !names.length) throw new Error('No names provided.');
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) throw new Error('No USDA API key provided.');

  // Map USDA nutrient names → our keys + conversion factors
  const NUTR_MAP = {
    'Energy':                        { key: 'kcal',    factor: 1         },
    'Protein':                       { key: 'protein', factor: 1         },
    'Total lipid (fat)':             { key: 'fat',     factor: 1         },
    'Carbohydrate, by difference':   { key: 'carbs',   factor: 1         },
    'Fiber, total dietary':          { key: 'fibre',   factor: 1         },
    'Sodium, Na':                    { key: 'salt',    factor: 2.5/1000  }, // mg sodium → g salt
  };

  const results = {};
  // Process 5 at a time concurrently
  const BATCH = 5;
  for (let i = 0; i < names.length; i += BATCH) {
    const batch = names.slice(i, i + BATCH);
    await Promise.all(batch.map(async (name) => {
      try {
        const q = '/fdc/v1/foods/search?query=' + encodeURIComponent(name) +
                  '&api_key=' + encodeURIComponent(cleanKey) +
                  '&dataType=Foundation,SR%20Legacy&pageSize=3';
        const data = await httpsGet('api.nal.usda.gov', q);
        const foods = data.foods || [];
        if (!foods.length) { results[name] = null; return; }
        const food = foods[0];
        const nutr = { kcal: 0, protein: 0, fat: 0, carbs: 0, fibre: 0, salt: 0,
                       source: 'usda', foodName: food.description || name };
        (food.foodNutrients || []).forEach(n => {
          const m = NUTR_MAP[n.nutrientName];
          if (m) nutr[m.key] = Math.round((n.value || 0) * m.factor * 10) / 10;
        });
        results[name] = nutr;
      } catch (e) {
        results[name] = null;
      }
    }));
  }
  return results;
});

// ─── Update IPC ───────────────────────────────────────────────
ipcMain.handle('install-update', () => {
  if (autoUpdater) autoUpdater.quitAndInstall();
});
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('check-for-update', async () => {
  if (!autoUpdater || !app.isPackaged) return 'dev';
  try {
    await autoUpdater.checkForUpdates();
    return 'checking';
  } catch (e) {
    console.error('[check-for-update]', e.message);
    return 'error';
  }
});

// ─── Secure API key storage (OS-level encryption via safeStorage) ─────────────
const getKeyDir  = () => path.join(app.getPath('userData'), 'keys');
const getKeyPath = (modelId) =>
  path.join(getKeyDir(), modelId.replace(/[^a-zA-Z0-9_-]/g, '') + '.key');

ipcMain.handle('save-api-key', (_, { modelId, key }) => {
  try {
    const dir = getKeyDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(key)
      : Buffer.from(key, 'utf8'); // fallback on systems without OS keychain
    fs.writeFileSync(getKeyPath(modelId), data);
    return true;
  } catch (e) { console.error('[save-api-key]', e.message); return false; }
});

ipcMain.handle('load-api-key', (_, modelId) => {
  try {
    const p = getKeyPath(modelId);
    if (!fs.existsSync(p)) return '';
    const data = fs.readFileSync(p);
    return safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(data)
      : data.toString('utf8');
  } catch (e) { return ''; }
});

ipcMain.handle('clear-api-key', (_, modelId) => {
  try {
    const p = getKeyPath(modelId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return true;
  } catch (e) { return false; }
});

// Load all known model keys at once — used to populate the in-memory cache at startup
ipcMain.handle('load-all-api-keys', async () => {
  const models = ['claude', 'gemini-flash', 'gemini-flash-lite', 'usda'];
  const result = {};
  for (const m of models) {
    try {
      const p = getKeyPath(m);
      if (!fs.existsSync(p)) { result[m] = ''; continue; }
      const data = fs.readFileSync(p);
      result[m] = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(data)
        : data.toString('utf8');
    } catch (e) { result[m] = ''; }
  }
  return result;
});
