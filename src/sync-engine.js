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

  const TOP_COLLECTIONS = [
    { key: 'ingredients', entityType: 'ingredient' },
    { key: 'recipes',     entityType: 'recipe' },
    { key: 'suppliers',   entityType: 'supplier' },
  ];

  function _deepClone(v) {
    // JSON round-trip is sufficient — audit/records are JSON-serializable.
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }

  function _shallowEqual(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (a[k] !== b[k]) return false;
    }
    return true;
  }

  function _uuid() {
    // Non-cryptographic, adequate for audit ids.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function _findDeleteEntry(auditLog, entityType, entityId) {
    if (!Array.isArray(auditLog)) return null;
    let latest = null;
    for (const e of auditLog) {
      if (!e || e.op !== 'delete') continue;
      if (e.entityType !== entityType || e.entityId !== entityId) continue;
      if (!latest || e.ts > latest.ts) latest = e;
    }
    return latest;
  }

  function _modAt(record) {
    return (record && record._modifiedAt) ? record._modifiedAt : '';
  }

  function _mergeRecordCase2(L, R, lastSyncAt, deviceName, conflicts, entityType, parentId) {
    // Returns the merged record.
    if (_shallowEqual(L, R)) return _deepClone(L);

    const lMod = _modAt(L);
    const rMod = _modAt(R);

    // Bootstrap: treat null lastSyncAt as "no basis for change detection" → LWW.
    if (lastSyncAt === null || lastSyncAt === undefined) {
      return _deepClone(lMod >= rMod ? L : R);
    }

    const localChanged  = lMod  > lastSyncAt;
    const remoteChanged = rMod > lastSyncAt;

    if (localChanged && !remoteChanged) return _deepClone(L);
    if (!localChanged && remoteChanged) return _deepClone(R);
    if (!localChanged && !remoteChanged) return _deepClone(L); // defensive

    // Both changed — Task 6 handles field-level diff. For now, LWW fallback.
    return _deepClone(lMod >= rMod ? L : R);
  }

  function _mergeCollection(
    localArr, remoteArr, entityType, mergedAuditLog, deviceName,
    restoreEntries, lastSyncAt, conflicts
  ) {
    // Build lookup maps by id.
    const localById = new Map();
    const remoteById = new Map();
    for (const r of (localArr || [])) if (r && r.id) localById.set(r.id, r);
    for (const r of (remoteArr || [])) if (r && r.id) remoteById.set(r.id, r);

    const mergedById = new Map();
    const allIds = new Set([...localById.keys(), ...remoteById.keys()]);

    for (const id of allIds) {
      const L = localById.get(id);
      const R = remoteById.get(id);

      if (L && !R) {
        // Case 1a: local-only.
        const del = _findDeleteEntry(mergedAuditLog, entityType, id);
        if (del) {
          if (_modAt(L) > del.ts) {
            // Resurrect.
            mergedById.set(id, _deepClone(L));
            restoreEntries.push({
              id: _uuid(),
              ts: new Date().toISOString(),
              op: 'restore',
              by: deviceName,
              entityType,
              entityId: id,
              notes: 'resurrected after conflicting delete',
              revertedEntryId: del.id,
            });
          } else {
            // Accept delete — drop from merged.
          }
        } else {
          mergedById.set(id, _deepClone(L));
        }
      } else if (!L && R) {
        // Case 1b: remote-only, mirror.
        const del = _findDeleteEntry(mergedAuditLog, entityType, id);
        if (del) {
          if (_modAt(R) > del.ts) {
            mergedById.set(id, _deepClone(R));
            restoreEntries.push({
              id: _uuid(),
              ts: new Date().toISOString(),
              op: 'restore',
              by: deviceName,
              entityType,
              entityId: id,
              notes: 'resurrected after conflicting delete',
              revertedEntryId: del.id,
            });
          }
        } else {
          mergedById.set(id, _deepClone(R));
        }
      } else if (L && R) {
        mergedById.set(id, _mergeRecordCase2(
          L, R, lastSyncAt, deviceName, conflicts, entityType, null
        ));
      }
    }

    return Array.from(mergedById.values());
  }

  function mergeState(localState, remoteState, lastSyncAt, deviceName) {
    const mergedState = {};
    const conflicts = [];
    const restoreEntries = [];
    const stats = { merged: 0, conflicts: 0, restored: 0 };

    // 1. Merge audit logs first so Case 1 can scan delete entries.
    const mergedAuditLog = _mergeAuditLogs(
      localState.auditLog,
      remoteState.auditLog
    );
    mergedState.auditLog = mergedAuditLog;

    // 2. Merge each top-level collection.
    for (const col of TOP_COLLECTIONS) {
      mergedState[col.key] = _mergeCollection(
        localState[col.key],
        remoteState[col.key],
        col.entityType,
        mergedAuditLog,
        deviceName,
        restoreEntries,
        lastSyncAt,
        conflicts
      );
    }

    // 3. Merge settings as a single record with synthetic id.
    const localSettings = localState.settings || {};
    const remoteSettings = remoteState.settings || {};
    mergedState.settings = _mergeRecordCase2(
      localSettings, remoteSettings, lastSyncAt, deviceName, conflicts,
      'settings', null
    );

    stats.restored = restoreEntries.length;
    stats.conflicts = conflicts.length;

    return { mergedState, conflicts, restoreEntries, stats };
  }

  return {
    isMigrationStamp,
    checkSchemaVersion,
    _mergeAuditLogs,
    mergeState,
  };
}));
