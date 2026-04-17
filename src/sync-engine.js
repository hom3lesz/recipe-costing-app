/**
 * src/sync-engine.js — Phase 3 merge engine.
 *
 * Loaded two ways:
 *   1. Browser: <script src="sync-engine.js"></script> before app.js loads.
 *      Exposes window.SyncEngine.
 *   2. Jest: require('../sync-engine.js'). Exposes module.exports.
 *
 * Pure module — no DOM, no IPC, no dependencies. Deterministic functions
 * of their inputs. Consumes audit log shape from audit.js but does not
 * require it at runtime.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SyncEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const MIGRATION_STAMP_PREFIX = 'migration';

  function isMigrationStamp(modifiedBy) {
    if (typeof modifiedBy !== 'string' || !modifiedBy) return false;
    return modifiedBy === MIGRATION_STAMP_PREFIX
      || modifiedBy.indexOf(MIGRATION_STAMP_PREFIX + ':') === 0;
  }

  function checkSchemaVersion(localVersion, remoteVersion) {
    const l = (typeof localVersion === 'number') ? localVersion : 0;
    const r = (typeof remoteVersion === 'number') ? remoteVersion : 0;
    if (l >= r) return { ok: true };
    return {
      ok: false,
      reason: 'Remote device is running a newer app version. Please update this device before syncing.'
    };
  }

  function _mergeAuditLogs(localLog, remoteLog) {
    const byId = new Map();
    const add = (arr) => {
      if (!Array.isArray(arr)) return;
      for (const entry of arr) {
        if (!entry || !entry.id) continue;
        if (!byId.has(entry.id)) byId.set(entry.id, entry);
      }
    };
    add(localLog);
    add(remoteLog);
    const merged = Array.from(byId.values());
    merged.sort((a, b) => {
      if (a.ts < b.ts) return -1;
      if (a.ts > b.ts) return 1;
      return 0;
    });
    return merged;
  }

  return {
    isMigrationStamp,
    checkSchemaVersion,
    _mergeAuditLogs,
  };
}));
