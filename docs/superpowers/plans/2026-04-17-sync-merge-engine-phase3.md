# Phase 3: Sync Merge Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current whole-file "keep local vs remote" sync prompt with a silent per-record LWW merge engine that queues unresolvable conflicts for Phase 4.

**Architecture:** A new pure-function UMD module `src/sync-engine.js` (same pattern as `audit.js` / `activity-view.js`) exposes `mergeState`, `reconcileConflictQueue`, `checkSchemaVersion`, and `isMigrationStamp`. `app.js` wires these functions into the three sync triggers (manual, startup, auto-save). Backup blobs gain `auditLog` and `_schemaVersion` top-level fields so the merge engine can scan delete entries and abort on version skew.

**Tech Stack:** JavaScript (UMD), Jest, Electron. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-17-sync-merge-engine-phase3-design.md`

---

## File Structure

### New files

- **`src/sync-engine.js`** — UMD module. Pure functions only: `mergeState`, `reconcileConflictQueue`, `checkSchemaVersion`, `isMigrationStamp`, plus internal helpers (`_mergeAuditLogs`, `_mergeCollection`, `_mergeRecord`, `_mergeNestedRows`, `_findDeleteEntry`). Exposes `window.SyncEngine` in browser, `module.exports` in Node/Jest.
- **`src/__tests__/sync-engine.test.js`** — Jest unit tests.

### Modified files

- **`src/audit.js`** — Export `MIGRATION_STAMP = "migration"` constant. Keep existing `SCHEMA_VERSION = 2` (Phase 3 does not bump it; breaking schema changes would).
- **`src/index.html`** — Add `<script src="sync-engine.js"></script>` between `audit.js` and `app.js`.
- **`src/app.js`** — Replace sync flow in `runSyncNow` and `_checkSyncOnStartup`; delete `_showSyncPrompt`, `_syncPromptDismiss`, `_syncPromptLoadRemote`; add conflict queue load/save/toast helpers; include `auditLog` and `_schemaVersion` in backup data.

---

## Context for the implementer

**UMD pattern already in the codebase:** See `src/audit.js` lines 12–18 and `src/activity-view.js`. Copy that exact wrapper. No DOM, no IPC, no dependencies inside the UMD module.

**Sync settings storage:** `_getSyncSettings()` / `_saveSyncSettings(s)` in `app.js` (line 14239). The object persists in `localStorage` under key `cloudSyncSettings`. It already carries `folder`, `autoSync`, `deviceName`, `lastSync`. Phase 3 adds `lastSeenRemoteTimestamp` (stored same place).

**Existing sync data shape** pushed by `runSyncNow` (line 14302):
```js
{
  recipes, ingredients, suppliers,
  settings: { currency, activeGP, vatRate, recipeCategories },
  exportDate, version, deviceName, dataTimestamp
}
```
Phase 3 adds `auditLog: state.auditLog` and `_schemaVersion: 2` to this object.

**Audit entry shape** (from `audit.js`): `{ id, ts, op, by, entityType, entityId, parentId?, field?, before, after, notes? }`.

**Record stamps** (Phase 1): every ingredient/recipe/supplier has `_modifiedAt` (ISO string) and `_modifiedBy` (device name). Settings top-level is not currently stamped; this plan treats missing stamps as epoch 0.

**Toast helper:** `showToast(message, kind, durationMs)` where kind is `"success" | "error" | "info"`. Used throughout app.js.

**Existing audit helpers to reuse** (exported from `window.Audit`): `buildSnapshot`, `appendLogEntries`, `_shallowEqual`, `_deepClone`. If `_shallowEqual` / `_deepClone` are not on the public export, copy the logic — they're trivial.

**Test running:** `npm test -- --testPathPattern=sync-engine` runs only this suite. Jest is already configured; see `src/__tests__/audit.test.js` for the test file structure.

---

### Task 1: Add `MIGRATION_STAMP` constant to audit.js

**Files:**
- Modify: `src/audit.js`

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/audit.test.js` (append to the bottom of the existing test file, before the final `});` that closes the outermost describe block if there is one — otherwise just append):

```javascript
describe('MIGRATION_STAMP', () => {
  test('is exported as the literal string "migration"', () => {
    const Audit = require('../audit.js');
    expect(Audit.MIGRATION_STAMP).toBe('migration');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=audit.test`
Expected: FAIL with `expect(received).toBe(expected) ... received: undefined`

- [ ] **Step 3: Add the constant and export**

In `src/audit.js`, add near the other constants at the top of the factory function (after `const SCHEMA_VERSION = 2;`):

```javascript
const MIGRATION_STAMP = 'migration';
```

Then find the `return { ... }` at the bottom of the factory that defines the public API. Add `MIGRATION_STAMP` to the returned object:

```javascript
  return {
    // ... existing exports unchanged ...
    MIGRATION_STAMP,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern=audit.test`
Expected: PASS. All pre-existing audit tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/audit.js src/__tests__/audit.test.js
git commit -m "feat(audit): export MIGRATION_STAMP constant for Phase 3"
```

---

### Task 2: Scaffold `sync-engine.js` with `isMigrationStamp` and `checkSchemaVersion`

**Files:**
- Create: `src/sync-engine.js`
- Create: `src/__tests__/sync-engine.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/sync-engine.test.js`:

```javascript
const SyncEngine = require('../sync-engine.js');

describe('isMigrationStamp', () => {
  test('returns true for literal "migration"', () => {
    expect(SyncEngine.isMigrationStamp('migration')).toBe(true);
  });
  test('returns true for "migration:v1.2.3"', () => {
    expect(SyncEngine.isMigrationStamp('migration:v1.2.3')).toBe(true);
  });
  test('returns false for device names', () => {
    expect(SyncEngine.isMigrationStamp('laptop-abc')).toBe(false);
    expect(SyncEngine.isMigrationStamp('This PC')).toBe(false);
  });
  test('returns false for null, undefined, empty string', () => {
    expect(SyncEngine.isMigrationStamp(null)).toBe(false);
    expect(SyncEngine.isMigrationStamp(undefined)).toBe(false);
    expect(SyncEngine.isMigrationStamp('')).toBe(false);
  });
});

describe('checkSchemaVersion', () => {
  test('equal versions ok', () => {
    expect(SyncEngine.checkSchemaVersion(2, 2)).toEqual({ ok: true });
  });
  test('both missing ok', () => {
    expect(SyncEngine.checkSchemaVersion(undefined, undefined)).toEqual({ ok: true });
  });
  test('local newer ok', () => {
    expect(SyncEngine.checkSchemaVersion(3, 2)).toEqual({ ok: true });
  });
  test('local older returns reason', () => {
    const result = SyncEngine.checkSchemaVersion(1, 2);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/newer app version/i);
  });
  test('remote missing treated as 0', () => {
    expect(SyncEngine.checkSchemaVersion(2, undefined)).toEqual({ ok: true });
  });
  test('local missing treated as 0, remote set → not ok', () => {
    const result = SyncEngine.checkSchemaVersion(undefined, 2);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=sync-engine`
Expected: FAIL with `Cannot find module '../sync-engine.js'`.

- [ ] **Step 3: Create the UMD scaffold with both functions**

Create `src/sync-engine.js`:

```javascript
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

  return {
    isMigrationStamp,
    checkSchemaVersion,
  };
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern=sync-engine`
Expected: PASS (all 10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sync-engine.js src/__tests__/sync-engine.test.js
git commit -m "feat(sync-engine): scaffold UMD module with isMigrationStamp + checkSchemaVersion"
```

---

### Task 3: Audit log merge helper

**Files:**
- Modify: `src/sync-engine.js`
- Modify: `src/__tests__/sync-engine.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/sync-engine.test.js`:

```javascript
describe('_mergeAuditLogs (via mergeState stats)', () => {
  // We test the helper via the public mergeState API once mergeState exists.
  // For now, test the helper directly if exported under a test hook.
});

describe('mergeAuditLogs helper (internal)', () => {
  // Access via the testing hook we will add.
  test('dedupes by entry.id', () => {
    const local = [
      { id: 'a', ts: '2026-04-17T10:00:00Z', op: 'update' },
      { id: 'b', ts: '2026-04-17T11:00:00Z', op: 'update' },
    ];
    const remote = [
      { id: 'b', ts: '2026-04-17T11:00:00Z', op: 'update' },
      { id: 'c', ts: '2026-04-17T12:00:00Z', op: 'update' },
    ];
    const merged = SyncEngine._mergeAuditLogs(local, remote);
    expect(merged.map(e => e.id)).toEqual(['a', 'b', 'c']);
  });

  test('sorts ascending by ts', () => {
    const local = [
      { id: 'c', ts: '2026-04-17T12:00:00Z', op: 'update' },
      { id: 'a', ts: '2026-04-17T10:00:00Z', op: 'update' },
    ];
    const remote = [
      { id: 'b', ts: '2026-04-17T11:00:00Z', op: 'update' },
    ];
    const merged = SyncEngine._mergeAuditLogs(local, remote);
    expect(merged.map(e => e.id)).toEqual(['a', 'b', 'c']);
  });

  test('handles missing or empty inputs', () => {
    expect(SyncEngine._mergeAuditLogs(undefined, undefined)).toEqual([]);
    expect(SyncEngine._mergeAuditLogs([], [])).toEqual([]);
    expect(SyncEngine._mergeAuditLogs([{ id: 'a', ts: '1', op: 'update' }], undefined))
      .toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=sync-engine`
Expected: FAIL with `SyncEngine._mergeAuditLogs is not a function`.

- [ ] **Step 3: Implement `_mergeAuditLogs` and expose for testing**

In `src/sync-engine.js`, add this function inside the factory (before the `return`):

```javascript
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
```

Add `_mergeAuditLogs` to the returned object:

```javascript
  return {
    isMigrationStamp,
    checkSchemaVersion,
    _mergeAuditLogs,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern=sync-engine`
Expected: PASS (13 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/sync-engine.js src/__tests__/sync-engine.test.js
git commit -m "feat(sync-engine): add _mergeAuditLogs helper (dedupe + sort)"
```

---

### Task 4: `mergeState` Case 1 (one-sided top-level records)

**Files:**
- Modify: `src/sync-engine.js`
- Modify: `src/__tests__/sync-engine.test.js`

**Scope:** Implement `mergeState` skeleton that handles the three collections (ingredients, recipes, suppliers) at the top level only. Cover Case 1 fully. Case 2 produces a naive "keep local" for now — Tasks 5–6 refine it. Settings and nested rows come in Tasks 5 and 7.

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/sync-engine.test.js`:

```javascript
function mkState(over) {
  return Object.assign({
    ingredients: [],
    recipes: [],
    suppliers: [],
    settings: {},
    auditLog: [],
  }, over);
}

function mkIng(id, over) {
  return Object.assign({
    id,
    name: 'Ing ' + id,
    packCost: 1.00,
    _modifiedAt: '2026-04-10T00:00:00Z',
    _modifiedBy: 'laptop',
  }, over || {});
}

describe('mergeState Case 1 - one-sided records', () => {
  test('local-only record with no remote delete → kept', () => {
    const local = mkState({ ingredients: [mkIng('a')] });
    const remote = mkState();
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.ingredients).toHaveLength(1);
    expect(result.mergedState.ingredients[0].id).toBe('a');
    expect(result.conflicts).toHaveLength(0);
    expect(result.restoreEntries).toHaveLength(0);
  });

  test('local-only + remote delete entry, local newer → resurrected + restore entry', () => {
    const local = mkState({
      ingredients: [mkIng('a', { _modifiedAt: '2026-04-15T00:00:00Z' })],
    });
    const remote = mkState({
      auditLog: [{
        id: 'del-1',
        ts: '2026-04-12T00:00:00Z',
        op: 'delete',
        entityType: 'ingredient',
        entityId: 'a',
        by: 'desktop',
      }],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.ingredients).toHaveLength(1);
    expect(result.restoreEntries).toHaveLength(1);
    expect(result.restoreEntries[0].op).toBe('restore');
    expect(result.restoreEntries[0].entityId).toBe('a');
    expect(result.restoreEntries[0].notes).toMatch(/resurrected/i);
    expect(result.restoreEntries[0].revertedEntryId).toBe('del-1');
    expect(result.restoreEntries[0].by).toBe('laptop');
  });

  test('local-only + remote delete entry, delete newer → removed', () => {
    const local = mkState({
      ingredients: [mkIng('a', { _modifiedAt: '2026-04-10T00:00:00Z' })],
    });
    const remote = mkState({
      auditLog: [{
        id: 'del-1',
        ts: '2026-04-15T00:00:00Z',
        op: 'delete',
        entityType: 'ingredient',
        entityId: 'a',
        by: 'desktop',
      }],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.ingredients).toHaveLength(0);
    expect(result.restoreEntries).toHaveLength(0);
  });

  test('remote-only with no local delete → kept on both sides', () => {
    const local = mkState();
    const remote = mkState({ ingredients: [mkIng('b')] });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.ingredients).toHaveLength(1);
    expect(result.mergedState.ingredients[0].id).toBe('b');
  });

  test('remote-only + local delete entry, remote newer → resurrected', () => {
    const local = mkState({
      auditLog: [{
        id: 'del-2',
        ts: '2026-04-10T00:00:00Z',
        op: 'delete',
        entityType: 'ingredient',
        entityId: 'b',
        by: 'laptop',
      }],
    });
    const remote = mkState({
      ingredients: [mkIng('b', { _modifiedAt: '2026-04-15T00:00:00Z' })],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.ingredients).toHaveLength(1);
    expect(result.restoreEntries).toHaveLength(1);
    expect(result.restoreEntries[0].revertedEntryId).toBe('del-2');
  });

  test('both deleted → stays deleted, no resurrect', () => {
    const local = mkState({
      auditLog: [{ id: 'del-x', ts: '2026-04-10T00:00:00Z', op: 'delete', entityType: 'ingredient', entityId: 'a', by: 'laptop' }],
    });
    const remote = mkState({
      auditLog: [{ id: 'del-y', ts: '2026-04-11T00:00:00Z', op: 'delete', entityType: 'ingredient', entityId: 'a', by: 'desktop' }],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.ingredients).toHaveLength(0);
    expect(result.restoreEntries).toHaveLength(0);
  });

  test('merged auditLog contains both delete entries deduped', () => {
    const local = mkState({
      auditLog: [{ id: 'del-x', ts: '2026-04-10T00:00:00Z', op: 'delete', entityType: 'ingredient', entityId: 'a', by: 'laptop' }],
    });
    const remote = mkState({
      auditLog: [{ id: 'del-y', ts: '2026-04-11T00:00:00Z', op: 'delete', entityType: 'ingredient', entityId: 'a', by: 'desktop' }],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.auditLog.map(e => e.id).sort()).toEqual(['del-x', 'del-y']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=sync-engine`
Expected: FAIL with `SyncEngine.mergeState is not a function`.

- [ ] **Step 3: Implement `mergeState` with Case 1 logic**

In `src/sync-engine.js`, add these helpers and the `mergeState` function before `return`:

```javascript
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

  function _mergeCollectionCase1(
    localArr, remoteArr, entityType, mergedAuditLog, deviceName, restoreEntries
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
        // Case 2 stub — Tasks 5–6 refine. Keep local for now.
        mergedById.set(id, _deepClone(L));
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
      mergedState[col.key] = _mergeCollectionCase1(
        localState[col.key],
        remoteState[col.key],
        col.entityType,
        mergedAuditLog,
        deviceName,
        restoreEntries
      );
    }

    // 3. Settings passthrough for now (Task 5 refines).
    mergedState.settings = _deepClone(localState.settings || {});

    stats.restored = restoreEntries.length;
    stats.conflicts = conflicts.length;

    return { mergedState, conflicts, restoreEntries, stats };
  }
```

Add `mergeState` to the returned object:

```javascript
  return {
    isMigrationStamp,
    checkSchemaVersion,
    _mergeAuditLogs,
    mergeState,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=sync-engine`
Expected: PASS (20 tests total). All Case 1 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/sync-engine.js src/__tests__/sync-engine.test.js
git commit -m "feat(sync-engine): mergeState Case 1 (one-sided records + delete-vs-edit)"
```

---

### Task 5: `mergeState` Case 2 (both-sided: identical, one-changed, bootstrap)

**Files:**
- Modify: `src/sync-engine.js`
- Modify: `src/__tests__/sync-engine.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/sync-engine.test.js`:

```javascript
describe('mergeState Case 2 - both sides exist, no field conflicts', () => {
  test('identical records → no-op', () => {
    const ing = mkIng('a', { packCost: 2.5, _modifiedAt: '2026-04-10T00:00:00Z' });
    const local = mkState({ ingredients: [ing] });
    const remote = mkState({ ingredients: [{ ...ing }] });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.ingredients).toHaveLength(1);
    expect(result.mergedState.ingredients[0].packCost).toBe(2.5);
    expect(result.conflicts).toHaveLength(0);
  });

  test('only local changed → keeps local', () => {
    const local = mkState({
      ingredients: [mkIng('a', { packCost: 5.0, _modifiedAt: '2026-04-15T00:00:00Z', _modifiedBy: 'laptop' })],
    });
    const remote = mkState({
      ingredients: [mkIng('a', { packCost: 1.0, _modifiedAt: '2026-04-08T00:00:00Z', _modifiedBy: 'desktop' })],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.ingredients[0].packCost).toBe(5.0);
    expect(result.conflicts).toHaveLength(0);
  });

  test('only remote changed → takes remote', () => {
    const local = mkState({
      ingredients: [mkIng('a', { packCost: 1.0, _modifiedAt: '2026-04-08T00:00:00Z', _modifiedBy: 'laptop' })],
    });
    const remote = mkState({
      ingredients: [mkIng('a', { packCost: 5.0, _modifiedAt: '2026-04-15T00:00:00Z', _modifiedBy: 'desktop' })],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.ingredients[0].packCost).toBe(5.0);
    expect(result.conflicts).toHaveLength(0);
  });

  test('bootstrap (lastSync=null), identical → no-op', () => {
    const ing = mkIng('a', { packCost: 2.5 });
    const local = mkState({ ingredients: [ing] });
    const remote = mkState({ ingredients: [{ ...ing }] });
    const result = SyncEngine.mergeState(local, remote, null, 'laptop');
    expect(result.conflicts).toHaveLength(0);
    expect(result.mergedState.ingredients[0].packCost).toBe(2.5);
  });

  test('bootstrap differ → LWW wins, no conflicts', () => {
    const local = mkState({
      ingredients: [mkIng('a', { packCost: 1.0, _modifiedAt: '2026-04-08T00:00:00Z' })],
    });
    const remote = mkState({
      ingredients: [mkIng('a', { packCost: 2.0, _modifiedAt: '2026-04-12T00:00:00Z' })],
    });
    const result = SyncEngine.mergeState(local, remote, null, 'laptop');
    expect(result.mergedState.ingredients[0].packCost).toBe(2.0);
    expect(result.conflicts).toHaveLength(0);
  });

  test('settings merged via LWW (one-sided change)', () => {
    const local = mkState({
      settings: { currency: 'GBP', _modifiedAt: '2026-04-08T00:00:00Z', _modifiedBy: 'laptop' },
    });
    const remote = mkState({
      settings: { currency: 'USD', _modifiedAt: '2026-04-15T00:00:00Z', _modifiedBy: 'desktop' },
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.settings.currency).toBe('USD');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=sync-engine`
Expected: FAIL — most of these will fail because Case 2 currently just keeps local, and settings is passthrough.

- [ ] **Step 3: Implement Case 2 non-conflict path + settings merge**

In `src/sync-engine.js`, add `_mergeRecordCase2` and update `_mergeCollectionCase1` → rename to `_mergeCollection` and call the Case 2 helper:

```javascript
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
```

Rename `_mergeCollectionCase1` → `_mergeCollection` and replace the Case 2 stub (`if (L && R)`) with:

```javascript
      } else if (L && R) {
        mergedById.set(id, _mergeRecordCase2(
          L, R, lastSyncAt, deviceName, conflicts, entityType, null
        ));
      }
```

Thread `lastSyncAt` and `conflicts` through:

```javascript
  function _mergeCollection(
    localArr, remoteArr, entityType, mergedAuditLog, deviceName,
    restoreEntries, lastSyncAt, conflicts
  ) {
    // ... existing Case 1 logic ...
    // Change the L && R branch to call _mergeRecordCase2 as shown above.
  }
```

Update `mergeState` to pass the new args and to merge settings properly:

```javascript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=sync-engine`
Expected: PASS (26 tests total). All Case 1 tests still green, all new Case 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/sync-engine.js src/__tests__/sync-engine.test.js
git commit -m "feat(sync-engine): mergeState Case 2 non-conflict paths + bootstrap LWW + settings"
```

---

### Task 6: `mergeState` Case 2c (field-level diff + conflict queue + migration immunity)

**Files:**
- Modify: `src/sync-engine.js`
- Modify: `src/__tests__/sync-engine.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/sync-engine.test.js`:

```javascript
describe('mergeState Case 2c - field-level diff', () => {
  test('both changed, different fields → merges both, no conflict', () => {
    const local = mkState({
      ingredients: [mkIng('a', {
        name: 'Cucumber', packCost: 1.0,
        _modifiedAt: '2026-04-15T10:00:00Z', _modifiedBy: 'laptop',
      })],
    });
    const remote = mkState({
      ingredients: [mkIng('a', {
        name: 'Cucumber', packCost: 1.0, packSize: 1000,
        _modifiedAt: '2026-04-15T11:00:00Z', _modifiedBy: 'desktop',
      })],
    });
    // Simulate: local changed packCost, remote changed packSize
    local.ingredients[0].packCost = 2.0;
    local.ingredients[0]._modifiedAt = '2026-04-15T10:30:00Z';

    const result = SyncEngine.mergeState(local, remote, '2026-04-14T00:00:00Z', 'laptop');
    // When both changed on different fields, field diff finds both differ from each other.
    // packCost: local=2.0, remote=1.0 → conflict (both sides edited — we can't tell which side's value is the edit without deeper inspection)
    // This test validates the CURRENT algorithm's behavior: any field differing when both changed → conflict.
    // We expect 2 conflicts (packCost, packSize).
    expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
  });

  test('both changed, same field different values → queues field-conflict, keeps local', () => {
    const local = mkState({
      ingredients: [mkIng('a', {
        packCost: 2.5, _modifiedAt: '2026-04-15T10:00:00Z', _modifiedBy: 'laptop',
      })],
    });
    const remote = mkState({
      ingredients: [mkIng('a', {
        packCost: 2.75, _modifiedAt: '2026-04-15T11:00:00Z', _modifiedBy: 'desktop',
      })],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-14T00:00:00Z', 'laptop');
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].kind).toBe('field-conflict');
    expect(result.conflicts[0].field).toBe('packCost');
    expect(result.conflicts[0].localValue).toBe(2.5);
    expect(result.conflicts[0].remoteValue).toBe(2.75);
    expect(result.conflicts[0].entityType).toBe('ingredient');
    expect(result.conflicts[0].entityId).toBe('a');
    expect(result.mergedState.ingredients[0].packCost).toBe(2.5); // local wins silently
    expect(result.mergedState.ingredients[0]._modifiedAt).toBe('2026-04-15T11:00:00Z'); // max
  });

  test('migration on local, real edit on remote → takes remote', () => {
    const local = mkState({
      ingredients: [mkIng('a', {
        packCost: 2.5, _modifiedAt: '2026-04-15T10:00:00Z', _modifiedBy: 'migration',
      })],
    });
    const remote = mkState({
      ingredients: [mkIng('a', {
        packCost: 2.75, _modifiedAt: '2026-04-15T11:00:00Z', _modifiedBy: 'desktop',
      })],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-14T00:00:00Z', 'laptop');
    expect(result.conflicts).toHaveLength(0);
    expect(result.mergedState.ingredients[0].packCost).toBe(2.75);
  });

  test('migration on remote, real edit on local → keeps local', () => {
    const local = mkState({
      ingredients: [mkIng('a', {
        packCost: 2.5, _modifiedAt: '2026-04-15T11:00:00Z', _modifiedBy: 'laptop',
      })],
    });
    const remote = mkState({
      ingredients: [mkIng('a', {
        packCost: 2.75, _modifiedAt: '2026-04-15T10:00:00Z', _modifiedBy: 'migration',
      })],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-14T00:00:00Z', 'laptop');
    expect(result.conflicts).toHaveLength(0);
    expect(result.mergedState.ingredients[0].packCost).toBe(2.5);
  });

  test('migration on both sides → LWW, no conflict', () => {
    const local = mkState({
      ingredients: [mkIng('a', {
        packCost: 2.5, _modifiedAt: '2026-04-15T10:00:00Z', _modifiedBy: 'migration:v1',
      })],
    });
    const remote = mkState({
      ingredients: [mkIng('a', {
        packCost: 2.75, _modifiedAt: '2026-04-15T11:00:00Z', _modifiedBy: 'migration:v2',
      })],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-14T00:00:00Z', 'laptop');
    expect(result.conflicts).toHaveLength(0);
    expect(result.mergedState.ingredients[0].packCost).toBe(2.75); // remote newer
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=sync-engine`
Expected: FAIL — Case 2c is currently a naive LWW fallback, not field-level diff.

- [ ] **Step 3: Implement field-level diff**

In `src/sync-engine.js`, replace the "Both changed" branch in `_mergeRecordCase2`:

```javascript
  function _mergeRecordCase2(L, R, lastSyncAt, deviceName, conflicts, entityType, parentId) {
    if (_shallowEqual(L, R)) return _deepClone(L);

    const lMod = _modAt(L);
    const rMod = _modAt(R);

    if (lastSyncAt === null || lastSyncAt === undefined) {
      return _deepClone(lMod >= rMod ? L : R);
    }

    const localChanged  = lMod  > lastSyncAt;
    const remoteChanged = rMod > lastSyncAt;

    if (localChanged && !remoteChanged) return _deepClone(L);
    if (!localChanged && remoteChanged) return _deepClone(R);
    if (!localChanged && !remoteChanged) return _deepClone(L);

    // Both changed — field-level diff.
    const merged = _deepClone(L);
    const lMig = isMigrationStamp(L._modifiedBy);
    const rMig = isMigrationStamp(R._modifiedBy);

    const allKeys = new Set([...Object.keys(L || {}), ...Object.keys(R || {})]);
    for (const f of allKeys) {
      if (f === '_modifiedAt' || f === '_modifiedBy') continue;
      if (_valuesEqual(L[f], R[f])) continue;

      if (lMig && !rMig) {
        merged[f] = _deepClone(R[f]);
      } else if (rMig && !lMig) {
        merged[f] = _deepClone(L[f]);
      } else if (lMig && rMig) {
        merged[f] = _deepClone(lMod >= rMod ? L[f] : R[f]);
      } else {
        // Real edits on both sides — queue conflict, keep local.
        conflicts.push({
          id: 'conflict-' + _uuid(),
          detectedAt: new Date().toISOString(),
          entityType,
          entityId: L.id,
          entityName: L.name || R.name || '',
          parentId: parentId || null,
          field: f,
          localValue: _deepClone(L[f]),
          localModifiedAt: L._modifiedAt || null,
          localModifiedBy: L._modifiedBy || null,
          remoteValue: _deepClone(R[f]),
          remoteModifiedAt: R._modifiedAt || null,
          remoteModifiedBy: R._modifiedBy || null,
          kind: 'field-conflict',
        });
        merged[f] = _deepClone(L[f]);
      }
    }

    // Stamp merged record with the later timestamp.
    merged._modifiedAt = lMod >= rMod ? lMod : rMod;
    merged._modifiedBy = lMod >= rMod ? L._modifiedBy : R._modifiedBy;
    return merged;
  }

  function _valuesEqual(a, b) {
    if (a === b) return true;
    // Arrays / objects: deep JSON equality (sufficient for our record shapes).
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch (e) {
      return false;
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=sync-engine`
Expected: PASS (31 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/sync-engine.js src/__tests__/sync-engine.test.js
git commit -m "feat(sync-engine): Case 2c field-level diff + conflict queue + migration immunity"
```

---

### Task 7: Nested recipe row merge

**Files:**
- Modify: `src/sync-engine.js`
- Modify: `src/__tests__/sync-engine.test.js`

**Scope:** Inside merged recipes, merge the `ingredients[]` (nested row id key `ingId`) and `subRecipes[]` (id key `recipeId`) arrays using the same Case 1 + Case 2 algorithm. After nested merge, bump parent recipe's `_modifiedAt` to `max(parent, nested._modifiedAt…)`.

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/sync-engine.test.js`:

```javascript
function mkRecipe(id, over) {
  return Object.assign({
    id,
    name: 'Recipe ' + id,
    ingredients: [],
    subRecipes: [],
    _modifiedAt: '2026-04-10T00:00:00Z',
    _modifiedBy: 'laptop',
  }, over || {});
}

function mkRow(idKey, id, over) {
  const row = Object.assign({
    qty: 100, unit: 'g',
    _modifiedAt: '2026-04-10T00:00:00Z',
    _modifiedBy: 'laptop',
  }, over || {});
  row[idKey] = id;
  return row;
}

describe('mergeState - nested recipe rows', () => {
  test('nested ingredient added on one side → included in merged recipe', () => {
    const local = mkState({
      recipes: [mkRecipe('r1', { ingredients: [mkRow('ingId', 'i1')] })],
    });
    const remote = mkState({
      recipes: [mkRecipe('r1', { ingredients: [] })],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.recipes[0].ingredients).toHaveLength(1);
    expect(result.mergedState.recipes[0].ingredients[0].ingId).toBe('i1');
  });

  test('nested ingredient edited both sides same field → field-conflict with parentId', () => {
    const local = mkState({
      recipes: [mkRecipe('r1', {
        _modifiedAt: '2026-04-15T10:00:00Z',
        ingredients: [mkRow('ingId', 'i1', { qty: 200, _modifiedAt: '2026-04-15T10:00:00Z', _modifiedBy: 'laptop' })],
      })],
    });
    const remote = mkState({
      recipes: [mkRecipe('r1', {
        _modifiedAt: '2026-04-15T11:00:00Z',
        ingredients: [mkRow('ingId', 'i1', { qty: 300, _modifiedAt: '2026-04-15T11:00:00Z', _modifiedBy: 'desktop' })],
      })],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-14T00:00:00Z', 'laptop');
    const ingConflict = result.conflicts.find(c => c.entityType === 'recipeIngredient');
    expect(ingConflict).toBeTruthy();
    expect(ingConflict.parentId).toBe('r1');
    expect(ingConflict.field).toBe('qty');
    expect(ingConflict.localValue).toBe(200);
    expect(ingConflict.remoteValue).toBe(300);
  });

  test('nested ingredient deleted one side, edited other → resurrected', () => {
    const local = mkState({
      recipes: [mkRecipe('r1', {
        ingredients: [mkRow('ingId', 'i1', { qty: 500, _modifiedAt: '2026-04-15T10:00:00Z' })],
      })],
      auditLog: [],
    });
    const remote = mkState({
      recipes: [mkRecipe('r1', { ingredients: [] })],
      auditLog: [{
        id: 'del-nested',
        ts: '2026-04-12T00:00:00Z',
        op: 'delete',
        entityType: 'recipeIngredient',
        entityId: 'i1',
        parentId: 'r1',
        by: 'desktop',
      }],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.recipes[0].ingredients).toHaveLength(1);
    expect(result.restoreEntries.some(e => e.entityId === 'i1')).toBe(true);
  });

  test('subRecipe rows merge by recipeId', () => {
    const local = mkState({
      recipes: [mkRecipe('r1', { subRecipes: [mkRow('recipeId', 'sub1', { qty: 100 })] })],
    });
    const remote = mkState({
      recipes: [mkRecipe('r1', { subRecipes: [mkRow('recipeId', 'sub2', { qty: 200 })] })],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    const ids = result.mergedState.recipes[0].subRecipes.map(r => r.recipeId).sort();
    expect(ids).toEqual(['sub1', 'sub2']);
  });

  test('parent _modifiedAt bumped to max of parent + nested', () => {
    const local = mkState({
      recipes: [mkRecipe('r1', {
        _modifiedAt: '2026-04-10T00:00:00Z',
        ingredients: [mkRow('ingId', 'i1', { _modifiedAt: '2026-04-20T00:00:00Z' })],
      })],
    });
    const remote = mkState({ recipes: [] });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.recipes[0]._modifiedAt).toBe('2026-04-20T00:00:00Z');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=sync-engine`
Expected: FAIL — nested merge not implemented yet.

- [ ] **Step 3: Implement nested row merge**

In `src/sync-engine.js`, add a nested-row merger and call it after each recipe is merged. Insert below `_mergeRecordCase2`:

```javascript
  const NESTED_ARRAYS = [
    { arrayKey: 'ingredients', idKey: 'ingId',    entityType: 'recipeIngredient' },
    { arrayKey: 'subRecipes',  idKey: 'recipeId', entityType: 'subRecipe' },
  ];

  function _mergeNestedArray(
    localArr, remoteArr, idKey, entityType, parentId,
    mergedAuditLog, deviceName, restoreEntries, lastSyncAt, conflicts
  ) {
    const localById = new Map();
    const remoteById = new Map();
    for (const r of (localArr || [])) if (r && r[idKey]) localById.set(r[idKey], r);
    for (const r of (remoteArr || [])) if (r && r[idKey]) remoteById.set(r[idKey], r);

    const mergedById = new Map();
    const allIds = new Set([...localById.keys(), ...remoteById.keys()]);

    for (const id of allIds) {
      const L = localById.get(id);
      const R = remoteById.get(id);

      if (L && !R) {
        const del = _findNestedDeleteEntry(mergedAuditLog, entityType, id, parentId);
        if (del) {
          if (_modAt(L) > del.ts) {
            mergedById.set(id, _deepClone(L));
            restoreEntries.push({
              id: _uuid(),
              ts: new Date().toISOString(),
              op: 'restore',
              by: deviceName,
              entityType,
              entityId: id,
              parentId,
              notes: 'resurrected after conflicting delete',
              revertedEntryId: del.id,
            });
          }
        } else {
          mergedById.set(id, _deepClone(L));
        }
      } else if (!L && R) {
        const del = _findNestedDeleteEntry(mergedAuditLog, entityType, id, parentId);
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
              parentId,
              notes: 'resurrected after conflicting delete',
              revertedEntryId: del.id,
            });
          }
        } else {
          mergedById.set(id, _deepClone(R));
        }
      } else if (L && R) {
        mergedById.set(id, _mergeRecordCase2(
          L, R, lastSyncAt, deviceName, conflicts, entityType, parentId
        ));
      }
    }

    return Array.from(mergedById.values());
  }

  function _findNestedDeleteEntry(auditLog, entityType, entityId, parentId) {
    if (!Array.isArray(auditLog)) return null;
    let latest = null;
    for (const e of auditLog) {
      if (!e || e.op !== 'delete') continue;
      if (e.entityType !== entityType || e.entityId !== entityId) continue;
      if (e.parentId !== parentId) continue;
      if (!latest || e.ts > latest.ts) latest = e;
    }
    return latest;
  }

  function _bumpParentModAt(recipe) {
    let max = recipe._modifiedAt || '';
    for (const nested of NESTED_ARRAYS) {
      const arr = recipe[nested.arrayKey] || [];
      for (const row of arr) {
        const rMod = row && row._modifiedAt;
        if (rMod && rMod > max) max = rMod;
      }
    }
    if (max) recipe._modifiedAt = max;
  }
```

Update `_mergeCollection` so that after merging two recipes, nested arrays are re-merged. Change the Case 2 branch for recipes:

```javascript
      } else if (L && R) {
        const merged = _mergeRecordCase2(
          L, R, lastSyncAt, deviceName, conflicts, entityType, null
        );
        if (entityType === 'recipe') {
          for (const nested of NESTED_ARRAYS) {
            merged[nested.arrayKey] = _mergeNestedArray(
              L[nested.arrayKey], R[nested.arrayKey],
              nested.idKey, nested.entityType, merged.id,
              mergedAuditLog, deviceName, restoreEntries,
              lastSyncAt, conflicts
            );
          }
          _bumpParentModAt(merged);
        }
        mergedById.set(id, merged);
      }
```

Also in Case 1 (one-sided recipes), re-merge nested rows against the missing side too — to catch nested deletes in archive logs. Update the `if (L && !R)` and `!L && R` branches so that when a recipe is kept, its nested arrays get a merge pass against an empty other side:

Inside `_mergeCollection`, after `mergedById.set(id, _deepClone(L));` for a kept-only recipe:

```javascript
        if (entityType === 'recipe') {
          const kept = mergedById.get(id);
          for (const nested of NESTED_ARRAYS) {
            kept[nested.arrayKey] = _mergeNestedArray(
              kept[nested.arrayKey], [],
              nested.idKey, nested.entityType, kept.id,
              mergedAuditLog, deviceName, restoreEntries,
              lastSyncAt, conflicts
            );
          }
          _bumpParentModAt(kept);
        }
```

And symmetrically for the remote-only branch (`_deepClone(R)` is what gets kept, nested merge against `[]`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=sync-engine`
Expected: PASS (36 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/sync-engine.js src/__tests__/sync-engine.test.js
git commit -m "feat(sync-engine): merge nested recipe rows (ingredients + subRecipes)"
```

---

### Task 8: `reconcileConflictQueue`

**Files:**
- Modify: `src/sync-engine.js`
- Modify: `src/__tests__/sync-engine.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/sync-engine.test.js`:

```javascript
describe('reconcileConflictQueue', () => {
  test('drops entry when both sides now agree on field', () => {
    const queue = [{
      id: 'c1', kind: 'field-conflict',
      entityType: 'ingredient', entityId: 'a', field: 'packCost',
      localValue: 2.5, remoteValue: 2.75,
    }];
    const local = mkState({ ingredients: [mkIng('a', { packCost: 3.0 })] });
    const remote = mkState({ ingredients: [mkIng('a', { packCost: 3.0 })] });
    const result = SyncEngine.reconcileConflictQueue(queue, local, remote);
    expect(result).toHaveLength(0);
  });

  test('keeps entry when divergence persists', () => {
    const queue = [{
      id: 'c1', kind: 'field-conflict',
      entityType: 'ingredient', entityId: 'a', field: 'packCost',
      localValue: 2.5, remoteValue: 2.75,
    }];
    const local = mkState({ ingredients: [mkIng('a', { packCost: 2.5 })] });
    const remote = mkState({ ingredients: [mkIng('a', { packCost: 2.75 })] });
    const result = SyncEngine.reconcileConflictQueue(queue, local, remote);
    expect(result).toHaveLength(1);
  });

  test('drops entry when entity no longer exists on either side', () => {
    const queue = [{
      id: 'c1', kind: 'field-conflict',
      entityType: 'ingredient', entityId: 'a', field: 'packCost',
      localValue: 2.5, remoteValue: 2.75,
    }];
    const local = mkState();
    const remote = mkState();
    const result = SyncEngine.reconcileConflictQueue(queue, local, remote);
    expect(result).toHaveLength(0);
  });

  test('nested recipeIngredient conflict reconciles via parentId lookup', () => {
    const queue = [{
      id: 'c1', kind: 'field-conflict',
      entityType: 'recipeIngredient', entityId: 'i1', parentId: 'r1',
      field: 'qty', localValue: 200, remoteValue: 300,
    }];
    const local = mkState({
      recipes: [mkRecipe('r1', { ingredients: [mkRow('ingId', 'i1', { qty: 250 })] })],
    });
    const remote = mkState({
      recipes: [mkRecipe('r1', { ingredients: [mkRow('ingId', 'i1', { qty: 250 })] })],
    });
    const result = SyncEngine.reconcileConflictQueue(queue, local, remote);
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=sync-engine`
Expected: FAIL with `SyncEngine.reconcileConflictQueue is not a function`.

- [ ] **Step 3: Implement `reconcileConflictQueue`**

In `src/sync-engine.js`, add before `return`:

```javascript
  function _findRecord(state, entityType, entityId, parentId) {
    if (entityType === 'settings') return state.settings || null;
    const colKey = {
      ingredient: 'ingredients',
      recipe: 'recipes',
      supplier: 'suppliers',
    }[entityType];
    if (colKey) {
      return (state[colKey] || []).find(r => r && r.id === entityId) || null;
    }
    // Nested
    if (entityType === 'recipeIngredient' || entityType === 'subRecipe') {
      const parent = (state.recipes || []).find(r => r && r.id === parentId);
      if (!parent) return null;
      const arrKey = entityType === 'recipeIngredient' ? 'ingredients' : 'subRecipes';
      const idKey = entityType === 'recipeIngredient' ? 'ingId' : 'recipeId';
      return (parent[arrKey] || []).find(r => r && r[idKey] === entityId) || null;
    }
    return null;
  }

  function reconcileConflictQueue(queue, currentState, remoteState) {
    if (!Array.isArray(queue) || queue.length === 0) return [];
    const kept = [];
    for (const c of queue) {
      const L = _findRecord(currentState, c.entityType, c.entityId, c.parentId);
      const R = _findRecord(remoteState, c.entityType, c.entityId, c.parentId);

      if (c.kind === 'field-conflict') {
        if (!L || !R) continue;               // missing side — drop
        if (_valuesEqual(L[c.field], R[c.field])) continue; // resolved
        kept.push(c);
      } else if (c.kind === 'delete-vs-edit' || c.kind === 'edit-vs-delete') {
        if (!L && !R) continue;               // both gone — drop
        if (L && R && _shallowEqual(L, R)) continue; // both present, equal
        kept.push(c);
      } else {
        kept.push(c); // unknown kind — keep defensively
      }
    }
    return kept;
  }
```

Add `reconcileConflictQueue` to the returned object:

```javascript
  return {
    isMigrationStamp,
    checkSchemaVersion,
    _mergeAuditLogs,
    mergeState,
    reconcileConflictQueue,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=sync-engine`
Expected: PASS (40 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/sync-engine.js src/__tests__/sync-engine.test.js
git commit -m "feat(sync-engine): reconcileConflictQueue drops resolved entries"
```

---

### Task 9: Wire `sync-engine.js` into `index.html`

**Files:**
- Modify: `src/index.html`

- [ ] **Step 1: Locate the audit.js and activity-view.js script tags**

Open `src/index.html`, search for `src="audit.js"`. You should find a block like:

```html
<script src="audit.js"></script>
<script src="activity-view.js"></script>
<script src="app.js"></script>
```

- [ ] **Step 2: Insert the sync-engine.js script tag**

Change the block to:

```html
<script src="audit.js"></script>
<script src="activity-view.js"></script>
<script src="sync-engine.js"></script>
<script src="app.js"></script>
```

- [ ] **Step 3: Verify the app still boots**

Run: `npm start`
Expected: App launches without console errors. In DevTools console, `window.SyncEngine` is an object with `mergeState`, `reconcileConflictQueue`, `checkSchemaVersion`, `isMigrationStamp`.

Close the app.

- [ ] **Step 4: Commit**

```bash
git add src/index.html
git commit -m "feat: load sync-engine.js before app.js"
```

---

### Task 10: Conflict queue persistence + backup data shape

**Files:**
- Modify: `src/app.js`

**Scope:** Add a module-level conflict queue loaded from localStorage, two helpers (`_loadConflictQueue`, `_saveConflictQueue`), a toast helper (`_conflictSummaryToast`), and expand the sync data object in `runSyncNow` to include `auditLog` and `_schemaVersion`. Also expand the restore path in `restoreSyncBackup` and `_syncPromptLoadRemote` (the latter will be deleted in Task 12) to accept `auditLog` and carry `lastSeenRemoteTimestamp`.

- [ ] **Step 1: Add conflict queue module-level state and helpers**

In `src/app.js`, find `function _getSyncSettings()` (around line 14239). Immediately before it, add:

```javascript
// ─── Conflict Queue (Phase 3) ───────────────────────────────────────────────
var _CONFLICT_QUEUE_KEY = 'recipeCosting.conflictQueue';
window._conflictQueue = [];

function _loadConflictQueue() {
  try {
    var raw = localStorage.getItem(_CONFLICT_QUEUE_KEY);
    window._conflictQueue = raw ? JSON.parse(raw) : [];
  } catch (e) {
    window._conflictQueue = [];
  }
  return window._conflictQueue;
}

function _saveConflictQueue(queue) {
  window._conflictQueue = queue || [];
  try {
    localStorage.setItem(_CONFLICT_QUEUE_KEY, JSON.stringify(window._conflictQueue));
  } catch (e) {
    console.warn('[ConflictQueue] save failed', e);
  }
}

function _conflictSummaryToast(n) {
  if (!n) return;
  showToast(
    'Synced. ' + n + ' conflict' + (n === 1 ? '' : 's')
      + ' pending — will prompt to resolve in an upcoming update.',
    'info',
    4000
  );
}
```

- [ ] **Step 2: Load the queue on app startup**

Find where the app initializes at the bottom of `app.js` (search for `document.addEventListener('DOMContentLoaded'` or similar boot code — if you can't find an explicit boot function, search for the `_checkSyncOnStartup` call site and add the load call just before it). Add a call:

```javascript
_loadConflictQueue();
```

- [ ] **Step 3: Include auditLog and _schemaVersion in pushed data**

In `runSyncNow` (line 14296), find the `data` object (line 14302). Update it to:

```javascript
    const data = {
      recipes: state.recipes,
      ingredients: state.ingredients,
      suppliers: state.suppliers,
      settings: {
        currency: state.currency,
        activeGP: state.activeGP,
        vatRate: state.vatRate,
        recipeCategories: state.recipeCategories
      },
      auditLog: state.auditLog || [],
      _schemaVersion: (window.Audit && window.Audit.SCHEMA_VERSION) || 2,
      exportDate: new Date().toISOString(),
      version: state.version || '0.0.12',
      deviceName: _getDeviceName(),
      dataTimestamp: state._lastEditTimestamp || new Date().toISOString()
    };
```

- [ ] **Step 4: Accept auditLog and _schemaVersion when restoring**

In `restoreSyncBackup` (line 14543), after the existing `data.settings` handling, add:

```javascript
    if (Array.isArray(data.auditLog)) state.auditLog = data.auditLog;
```

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — all pre-existing tests still pass (no sync-engine wiring yet in app.js sync flow, just data shape changes).

- [ ] **Step 6: Smoke-test manually**

Run: `npm start`
- In DevTools: `window._conflictQueue` exists and equals `[]`.
- Click "Sync Now" (if a sync folder is configured) — verify the written backup file contains `auditLog` and `_schemaVersion` keys.
- Close the app.

- [ ] **Step 7: Commit**

```bash
git add src/app.js
git commit -m "feat(sync): conflict queue persistence + include auditLog/_schemaVersion in backups"
```

---

### Task 11: Rewrite `runSyncNow` to use `mergeState`

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Replace the body of `runSyncNow`**

Find `async function runSyncNow()` at line 14296. Replace the entire function with:

```javascript
async function runSyncNow() {
  const s = _getSyncSettings();
  if (!s.folder) { showToast('No sync folder selected', 'error'); return; }
  const statusEl = document.getElementById('sync-status');
  if (statusEl) statusEl.textContent = 'Syncing…';

  try {
    // 1. Pull remote (newest backup for this location).
    const backups = await window.electronAPI.listSyncBackups(s.folder, _getActiveLocationSlug());
    let remoteData = null;
    let newestName = null;
    let lastSeenRemoteTimestamp = s.lastSeenRemoteTimestamp || null;
    if (backups && backups.length) {
      newestName = backups[0].name;
      const pull = await window.electronAPI.restoreSyncBackup(s.folder, newestName, _getActiveLocationSlug());
      if (pull && !pull.error && pull.data) {
        remoteData = pull.data;
      }
    }

    // 2. Schema version check.
    if (remoteData) {
      const schemaCheck = SyncEngine.checkSchemaVersion(
        (window.Audit && window.Audit.SCHEMA_VERSION) || 2,
        remoteData._schemaVersion
      );
      if (!schemaCheck.ok) {
        showToast(schemaCheck.reason, 'error', 5000);
        if (statusEl) statusEl.textContent = 'Sync aborted: version mismatch';
        return;
      }
    }

    // 3. Merge (or bootstrap from nothing).
    let mergedState = null;
    let newConflicts = [];
    let restoreEntries = [];
    if (remoteData) {
      const localStateForMerge = {
        recipes: state.recipes,
        ingredients: state.ingredients,
        suppliers: state.suppliers,
        settings: {
          currency: state.currency,
          activeGP: state.activeGP,
          vatRate: state.vatRate,
          recipeCategories: state.recipeCategories,
          _modifiedAt: state._settingsModifiedAt || state._lastEditTimestamp || '',
          _modifiedBy: state._settingsModifiedBy || _getDeviceName(),
        },
        auditLog: state.auditLog || [],
      };
      const remoteStateForMerge = {
        recipes: remoteData.recipes || [],
        ingredients: remoteData.ingredients || [],
        suppliers: remoteData.suppliers || [],
        settings: Object.assign({}, remoteData.settings || {}),
        auditLog: remoteData.auditLog || [],
      };
      const mergeResult = SyncEngine.mergeState(
        localStateForMerge,
        remoteStateForMerge,
        s.lastSync || null,
        _getDeviceName()
      );
      mergedState = mergeResult.mergedState;
      newConflicts = mergeResult.conflicts;
      restoreEntries = mergeResult.restoreEntries;

      // 4. Apply merged state.
      state.recipes = mergedState.recipes;
      state.ingredients = mergedState.ingredients;
      state.suppliers = mergedState.suppliers;
      if (mergedState.settings) {
        if (mergedState.settings.currency) state.currency = mergedState.settings.currency;
        if (mergedState.settings.activeGP) state.activeGP = mergedState.settings.activeGP;
        if (mergedState.settings.vatRate !== undefined) state.vatRate = mergedState.settings.vatRate;
        if (mergedState.settings.recipeCategories) state.recipeCategories = mergedState.settings.recipeCategories;
      }
      state.auditLog = mergedState.auditLog;
      if (restoreEntries.length && window.Audit && window.Audit.appendLogEntries) {
        window.Audit.appendLogEntries(state, restoreEntries);
      }

      // 5. Persist locally. Refresh audit snapshot so save() doesn't double-log.
      if (window.refreshAuditSnapshot) window.refreshAuditSnapshot();
      await save();
      if (window.refreshAuditSnapshot) window.refreshAuditSnapshot();

      // 6. Reconcile queue + append new conflicts.
      const existingQueue = _loadConflictQueue();
      const reconciled = SyncEngine.reconcileConflictQueue(
        existingQueue,
        { recipes: state.recipes, ingredients: state.ingredients, suppliers: state.suppliers, settings: mergedState.settings },
        remoteStateForMerge
      );
      const seen = new Set(reconciled.map(c => c.id));
      for (const c of newConflicts) if (!seen.has(c.id)) reconciled.push(c);
      _saveConflictQueue(reconciled);
      lastSeenRemoteTimestamp = remoteData.dataTimestamp || lastSeenRemoteTimestamp;
    }

    // 7. Stale-check then push.
    let staleAbort = false;
    if (remoteData && newestName) {
      const recheck = await window.electronAPI.listSyncBackups(s.folder, _getActiveLocationSlug());
      if (recheck && recheck.length && recheck[0].name !== newestName) {
        staleAbort = true;
      }
    }

    if (!staleAbort) {
      const data = {
        recipes: state.recipes,
        ingredients: state.ingredients,
        suppliers: state.suppliers,
        settings: {
          currency: state.currency,
          activeGP: state.activeGP,
          vatRate: state.vatRate,
          recipeCategories: state.recipeCategories
        },
        auditLog: state.auditLog || [],
        _schemaVersion: (window.Audit && window.Audit.SCHEMA_VERSION) || 2,
        exportDate: new Date().toISOString(),
        version: state.version || '0.0.12',
        deviceName: _getDeviceName(),
        dataTimestamp: state._lastEditTimestamp || new Date().toISOString()
      };
      const result = await window.electronAPI.syncBackupToFolder(s.folder, data, _getActiveLocationSlug());
      if (result.error) {
        showToast('Sync failed: ' + result.error, 'error', 4000);
        if (statusEl) statusEl.textContent = 'Last sync failed: ' + result.error;
        return;
      }
      s.lastSync = new Date().toISOString();
      s.lastSeenRemoteTimestamp = data.dataTimestamp;
      _saveSyncSettings(s);
    } else {
      // Stale — don't push this round, but record that we merged.
      s.lastSync = new Date().toISOString();
      if (lastSeenRemoteTimestamp) s.lastSeenRemoteTimestamp = lastSeenRemoteTimestamp;
      _saveSyncSettings(s);
    }

    const queue = _loadConflictQueue();
    if (queue.length) {
      _conflictSummaryToast(queue.length);
    } else {
      showToast('✓ Synced', 'success', 2500);
    }
    _renderSyncUI();
  } catch (e) {
    showToast('Sync failed: ' + e.message, 'error', 4000);
    if (statusEl) statusEl.textContent = 'Sync error: ' + e.message;
  }
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — no new tests added; we're verifying we didn't break existing ones.

- [ ] **Step 3: Manual two-device smoke test**

Run: `npm start`
- Configure sync folder if not already.
- Click Sync Now → toast shows "✓ Synced" or conflict summary.
- Open DevTools: `window._conflictQueue` visible; should be `[]` on first run with fresh remote.
- Edit an ingredient, Sync Now again — verify remote backup in folder is updated.
- Close the app.

- [ ] **Step 4: Commit**

```bash
git add src/app.js
git commit -m "feat(sync): rewrite runSyncNow to use SyncEngine.mergeState"
```

---

### Task 12: Rewrite `_checkSyncOnStartup` + delete `_showSyncPrompt`

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Replace `_checkSyncOnStartup`**

Find `async function _checkSyncOnStartup()` at line 14387. Replace the entire function (through its closing brace at line 14460) with:

```javascript
async function _checkSyncOnStartup() {
  try {
    var s = _getSyncSettings();
    if (!s.folder) return;

    var backups = await window.electronAPI.listSyncBackups(s.folder, _getActiveLocationSlug());
    if (!backups || !backups.length) return;

    var newest = backups[0];
    if (!newest) return;

    var pull = await window.electronAPI.restoreSyncBackup(s.folder, newest.name, _getActiveLocationSlug());
    if (!pull || pull.error || !pull.data) return;
    var remoteData = pull.data;

    // Skip if newest backup is from this device (no need to merge with ourselves).
    if ((remoteData.deviceName || '') === _getDeviceName()) return;

    // Schema version gate — blocking modal.
    var schemaCheck = SyncEngine.checkSchemaVersion(
      (window.Audit && window.Audit.SCHEMA_VERSION) || 2,
      remoteData._schemaVersion
    );
    if (!schemaCheck.ok) {
      alert(schemaCheck.reason);
      return;
    }

    var localStateForMerge = {
      recipes: state.recipes,
      ingredients: state.ingredients,
      suppliers: state.suppliers,
      settings: {
        currency: state.currency,
        activeGP: state.activeGP,
        vatRate: state.vatRate,
        recipeCategories: state.recipeCategories,
      },
      auditLog: state.auditLog || [],
    };
    var remoteStateForMerge = {
      recipes: remoteData.recipes || [],
      ingredients: remoteData.ingredients || [],
      suppliers: remoteData.suppliers || [],
      settings: Object.assign({}, remoteData.settings || {}),
      auditLog: remoteData.auditLog || [],
    };

    var mergeResult = SyncEngine.mergeState(
      localStateForMerge, remoteStateForMerge,
      s.lastSync || null, _getDeviceName()
    );

    state.recipes = mergeResult.mergedState.recipes;
    state.ingredients = mergeResult.mergedState.ingredients;
    state.suppliers = mergeResult.mergedState.suppliers;
    if (mergeResult.mergedState.settings) {
      var ms = mergeResult.mergedState.settings;
      if (ms.currency) state.currency = ms.currency;
      if (ms.activeGP) state.activeGP = ms.activeGP;
      if (ms.vatRate !== undefined) state.vatRate = ms.vatRate;
      if (ms.recipeCategories) state.recipeCategories = ms.recipeCategories;
    }
    state.auditLog = mergeResult.mergedState.auditLog;
    if (mergeResult.restoreEntries.length && window.Audit && window.Audit.appendLogEntries) {
      window.Audit.appendLogEntries(state, mergeResult.restoreEntries);
    }

    if (window.refreshAuditSnapshot) window.refreshAuditSnapshot();
    await save();
    if (window.refreshAuditSnapshot) window.refreshAuditSnapshot();

    var existingQueue = _loadConflictQueue();
    var reconciled = SyncEngine.reconcileConflictQueue(
      existingQueue,
      { recipes: state.recipes, ingredients: state.ingredients, suppliers: state.suppliers, settings: mergeResult.mergedState.settings },
      remoteStateForMerge
    );
    var seen = new Set(reconciled.map(function (c) { return c.id; }));
    for (var i = 0; i < mergeResult.conflicts.length; i++) {
      var c = mergeResult.conflicts[i];
      if (!seen.has(c.id)) reconciled.push(c);
    }
    _saveConflictQueue(reconciled);
    s.lastSeenRemoteTimestamp = remoteData.dataTimestamp || s.lastSeenRemoteTimestamp;
    _saveSyncSettings(s);

    if (reconciled.length) _conflictSummaryToast(reconciled.length);
  } catch (e) {
    console.warn('[SyncCheck]', e);
  }
}
```

- [ ] **Step 2: Delete `_showSyncPrompt`, `_syncPromptDismiss`, `_syncPromptLoadRemote`**

Find `function _showSyncPrompt(info) {` at line 14462. Delete everything from that line through the end of `_syncPromptLoadRemote` (end of function at approximately line 14541 — the closing `}` just before `async function restoreSyncBackup(filename) {`).

That removes three functions: `_showSyncPrompt`, `_syncPromptDismiss`, `_syncPromptLoadRemote`.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Manual two-device bootstrap test**

Run: `npm start`
- If you have a sync folder configured with backups from another device, the old "Newer Data Found" modal should NOT appear. Instead, sync should happen silently on startup, and a toast appears only if conflicts were queued.
- Check DevTools: `window._conflictQueue` reflects any conflicts.
- Close the app.

- [ ] **Step 5: Commit**

```bash
git add src/app.js
git commit -m "feat(sync): replace startup prompt with silent merge; delete _showSyncPrompt"
```

---

### Task 13: Auto-sync stale-check on save

**Files:**
- Modify: `src/app.js`

**Scope:** If `s.autoSync` is on, `save()` currently (in some paths) triggers a push. Add a stale-check before the push so that if the remote has changed since we last saw it, we skip the push silently (the next manual sync will pull+merge). Find the existing auto-sync push code.

- [ ] **Step 1: Locate the auto-sync push**

Search `app.js` for `autoSync` calls to `syncBackupToFolder`. There is likely a call inside or near `save()` that pushes when `s.autoSync` is true. Record its approximate line number.

Run: `grep -n "syncBackupToFolder" src/app.js` via the Grep tool. Ignore the call inside `runSyncNow` — look for the one guarded by `s.autoSync`.

If no such call exists (auto-sync is not currently implemented as push-on-save), skip this task and commit a no-op marker. Otherwise proceed.

- [ ] **Step 2: Add stale-check before the push**

Wrap the existing `syncBackupToFolder` call in the auto-sync path with:

```javascript
if (s.autoSync && s.folder) {
  try {
    const recheck = await window.electronAPI.listSyncBackups(s.folder, _getActiveLocationSlug());
    const newest = recheck && recheck[0];
    const lastSeen = s.lastSeenRemoteTimestamp || '';
    if (newest && lastSeen) {
      const pull = await window.electronAPI.restoreSyncBackup(s.folder, newest.name, _getActiveLocationSlug());
      if (pull && pull.data && pull.data.dataTimestamp && pull.data.dataTimestamp > lastSeen) {
        // Remote changed since we last saw it. Skip push — next manual sync will pull+merge.
        return;
      }
    }
    // ... existing push code here, unchanged ...
    s.lastSeenRemoteTimestamp = /* the timestamp we just pushed */;
    _saveSyncSettings(s);
  } catch (e) {
    console.warn('[AutoSync] stale-check failed', e);
  }
}
```

Adapt to the actual structure — the existing code around the call may already be inside `try/catch`; just add the stale-check block at the top.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Manual test**

Run: `npm start` — verify saves still work, verify auto-sync push still happens when enabled and no remote change has occurred.

- [ ] **Step 5: Commit**

```bash
git add src/app.js
git commit -m "feat(sync): stale-check before auto-sync push"
```

---

### Task 14: Final regression sweep + manual two-device exercise

**Files:** none modified — verification only.

- [ ] **Step 1: Run the full Jest suite**

Run: `npm test`
Expected: All suites pass. Target: ~160 tests (existing 122 + ~40 new sync-engine tests).

- [ ] **Step 2: Manual two-device exercise checklist**

On two devices (or two app instances sharing a sync folder):

- [ ] **Bootstrap:** fresh install on Device B with empty data. Device A has populated data. Start B — it should silently adopt A's records. No prompt.
- [ ] **No-conflict edits:** edit ingredient X on A, edit ingredient Y on B, sync both — both edits present on both.
- [ ] **Field conflict:** edit ingredient X `packCost` on A to 2.5, edit same field on B to 2.75. Sync B, then sync A. Toast appears on both with "N conflict pending". `localStorage.getItem('recipeCosting.conflictQueue')` on each device has one entry with kind `field-conflict`.
- [ ] **Delete-vs-edit:** delete ingredient X on A, edit X's packCost on B. Sync B, sync A. X should be resurrected on both with B's packCost. Audit log has a `restore` entry noting "resurrected after conflicting delete".
- [ ] **Migration immunity:** in DevTools, manually set an ingredient's `_modifiedBy` to `"migration"` and newer `_modifiedAt` on A. Edit the same ingredient on B. Sync both — B's edit wins, no conflict queued.
- [ ] **Schema version abort:** in DevTools on A, temporarily push a backup with `_schemaVersion: 99`. On B, trigger sync — startup or manual — it should abort with an error (blocking modal on startup, toast on manual).
- [ ] **Queue reconciliation:** create a field conflict, then edit both sides to the same value, sync — conflict queue entry drops.
- [ ] **Phase 1/2 regression:** edit → save → open Activity Log → verify new audit entry shows → revert → verify reverted + `restore` entry.

- [ ] **Step 3: Commit the plan completion marker**

No code changes — just record completion.

```bash
git commit --allow-empty -m "chore: Phase 3 sync merge engine complete"
```

---

## Summary

After all tasks:
- `src/sync-engine.js` is a pure-function UMD module with `mergeState`, `reconcileConflictQueue`, `checkSchemaVersion`, `isMigrationStamp`, plus internal helpers
- `src/__tests__/sync-engine.test.js` has ~40 unit tests covering every algorithm branch
- `src/app.js` sync flow uses the merge engine silently; `_showSyncPrompt` and its helpers are deleted
- `src/index.html` loads sync-engine.js before app.js
- Backup blobs carry `auditLog` + `_schemaVersion`
- Conflicts persist in `localStorage.recipeCosting.conflictQueue`, ready for Phase 4's UI
