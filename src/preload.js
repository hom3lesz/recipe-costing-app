/**
 * preload.js — Electron contextBridge
 * Exposes a safe, minimal API to the renderer.
 * nodeIntegration is OFF in the renderer; all Node/IPC access goes through here.
 */
const { contextBridge, ipcRenderer } = require('electron');
const XLSX = require('xlsx');
const QRCode = require('qrcode');

contextBridge.exposeInMainWorld('electronAPI', {

  // ── Data persistence ────────────────────────────────────────
  loadData:    ()      => ipcRenderer.invoke('load-data'),
  saveData:    (d)     => ipcRenderer.invoke('save-data', d),
  getDataPath: ()      => ipcRenderer.invoke('get-data-path'),

  // ── File dialogs ────────────────────────────────────────────
  exportPDF:   (html, defaultName) => ipcRenderer.invoke('export-pdf', { html, defaultName }),
  saveExcel:           (arr, name)    => ipcRenderer.invoke('save-excel', { buffer: arr, defaultName: name }),
  buildAndSaveExcel:   (sheets, name) => ipcRenderer.invoke('build-and-save-excel', { sheets, defaultName: name }),
  openExcel:   ()           => ipcRenderer.invoke('open-excel'),
  openImage:   ()           => ipcRenderer.invoke('open-image'),
  // open-invoice now returns [{base64, mime, name}] — no fs access needed in renderer
  openInvoice: ()           => ipcRenderer.invoke('open-invoice'),

  // ── Auto-updater ────────────────────────────────────────────
  installUpdate:      ()   => ipcRenderer.invoke('install-update'),
  getAppVersion:      ()   => ipcRenderer.invoke('get-app-version'),
  checkForUpdate:     ()   => ipcRenderer.invoke('check-for-update'),
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_, v) => cb(v)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_, v) => cb(v)),

  // ── Secure API key storage (OS-level encryption via safeStorage) ──
  saveApiKey:    (modelId, key) => ipcRenderer.invoke('save-api-key',    { modelId, key }),
  loadApiKey:    (modelId)      => ipcRenderer.invoke('load-api-key',    modelId),
  clearApiKey:   (modelId)      => ipcRenderer.invoke('clear-api-key',   modelId),
  loadAllApiKeys: ()            => ipcRenderer.invoke('load-all-api-keys'),

  // ── AI calls (proxied through main process — no direct API access from renderer) ──
  callAi:      (model, prompt, apiKey, maxTokens) =>
                 ipcRenderer.invoke('call-ai', { model, prompt, apiKey, maxTokens }),
  scanInvoice: (files, prompt, model, apiKey) =>
                 ipcRenderer.invoke('scan-invoice', { files, prompt, model, apiKey }),

  // ── USDA Nutrition lookup ──────────────────────────────────────
  fetchUsdaNutrition: (names, apiKey) =>
    ipcRenderer.invoke('fetch-usda-nutrition', { names, apiKey }),

  // ── Backup management ──────────────────────────────────────────
  listBackups:    ()         => ipcRenderer.invoke('list-backups'),
  restoreBackup:  (filename) => ipcRenderer.invoke('restore-backup', filename),

  // ── QR Code Generation ──────────────────────────────────────────
  generateQR: (text, opts) => QRCode.toDataURL(text, { width: (opts && opts.width) || 256, margin: 1, color: { dark: '#000000', light: '#ffffff' }, errorCorrectionLevel: 'M', ...opts }),

  // ── Cloud Sync / Folder Backup ─────────────────────────────────
  chooseSyncFolder:   ()                               => ipcRenderer.invoke('choose-sync-folder'),
  syncBackupToFolder: (folderPath, data, locationSlug) => ipcRenderer.invoke('sync-backup-to-folder', { folderPath, data, locationSlug }),
  listSyncBackups:    (folderPath, locationSlug)       => ipcRenderer.invoke('list-sync-backups', { folderPath, locationSlug }),
  restoreSyncBackup:  (folderPath, fname, locationSlug) => ipcRenderer.invoke('restore-sync-backup', { folderPath, filename: fname, locationSlug }),
  openFolder:         (folderPath)        => ipcRenderer.invoke('open-folder', folderPath),

  // ── Update error notifications ─────────────────────────────────
  onUpdateError: (cb) => ipcRenderer.on('update-error', (_, msg) => cb(msg)),

  // ── XLSX (runs synchronously in preload — same process as renderer) ──
  // Each function clones arguments/return values through the context bridge.
  // XLSX workbook/worksheet objects are plain-object trees, so structuredClone is safe.
  xlsx: {
    read: (data) => XLSX.read(new Uint8Array(data), { type: 'array' }),

    write: (wb, opts) => Array.from(XLSX.write(wb, opts)),

    // Build an entire workbook in one call to avoid repeated contextBridge round-trips
    // for large exports (O(n) instead of O(n²)).
    // sheets: [{ name: string, rows: any[][], cols?: {wch:number}[] }]
    // Returns a plain number[] (the xlsx buffer).
    buildWorkbook: (sheets) => {
      const wb = XLSX.utils.book_new();
      const usedNames = new Set();
      sheets.forEach(({ name, rows, cols }) => {
        // Ensure sheet name is valid and unique (Excel limit: 31 chars)
        let sName = (name || 'Sheet').replace(/[:\\\/\?\*\[\]]/g, '').slice(0, 31) || 'Sheet';
        let candidate = sName;
        let n = 2;
        while (usedNames.has(candidate)) { candidate = sName.slice(0, 28) + '_' + n++; }
        usedNames.add(candidate);
        const ws = XLSX.utils.aoa_to_sheet(rows);
        if (cols) ws['!cols'] = cols;
        XLSX.utils.book_append_sheet(wb, ws, candidate);
      });
      return Array.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    },

    utils: {
      book_new: () => XLSX.utils.book_new(),

      // Returns the modified workbook so callers can re-assign: wb = book_append_sheet(wb, ws, name)
      book_append_sheet: (wb, ws, name) => {
        XLSX.utils.book_append_sheet(wb, ws, name);
        return wb;
      },

      aoa_to_sheet:   (data, opts) => XLSX.utils.aoa_to_sheet(data, opts),
      sheet_to_json:  (ws,   opts) => XLSX.utils.sheet_to_json(ws, opts),
    },
  },
});
