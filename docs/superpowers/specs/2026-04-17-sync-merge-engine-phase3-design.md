# Phase 3: Sync Merge Engine — Design Spec

## Problem

Phase 1 + 2 shipped per-record audit stamps (`_modifiedAt`, `_modifiedBy`), an in-app audit log, and per-entry revert. But sync is still whole-file: `_checkSyncOnStartup` detects that both sides edited since `lastSync` and shows a "keep local vs remote" prompt that clobbers one side's work entirely. There is no way to merge two divergent backups record by record.

## Goal

Add a fine-grained, per-record merge engine that silently reconciles local and remote backups on every sync using the audit stamps, queues unresolvable conflicts for a Phase 4 resolution UI, and preserves edits on both sides whenever possible.

## Non-goals

- Conflict resolution UI (Phase 4)
- Real-time sync / live merging (this is still pull-on-demand, push-on-save)
- Cross-collection referential integrity repair (e.g. orphaned recipe ingredient rows whose parent ingredient got deleted — merge does not auto-fix)
- Conflict resolution inside a single field's structured value (field-level diff is value-equality only)
- Per-collection `_lastSyncAt` — one global timestamp covers all collections

---

## 1. Architecture

### New file

**`src/sync-engine.js`** — UMD module following the `audit.js` / `activity-view.js` pattern. Exposes `window.SyncEngine`. Pure-function core (Jest-testable); the browser wiring lives in `app.js`.

**Public API:**

```js
SyncEngine.mergeState(localState, remoteState, lastSyncAt, deviceName)
  → { mergedState, conflicts, restoreEntries, stats }

SyncEngine.reconcileConflictQueue(queue, currentState, remoteState)
  → filteredQueue

SyncEngine.checkSchemaVersion(localVersion, remoteVersion)
  → { ok, reason? }

SyncEngine.isMigrationStamp(modifiedBy)
  → boolean
```

### Modified files

- **`src/app.js`** — replace sync flow in `runSyncNow`, `_checkSyncOnStartup`, auto-sync-on-save; remove `_showSyncPrompt` and the "keep local vs remote" modal logic
- **`src/index.html`** — add `<script src="sync-engine.js">` before `app.js`; remove `_showSyncPrompt` modal markup
- **`src/audit.js`** — export a constant `MIGRATION_STAMP = "migration"` used by any future migration code so migrations consistently mark their stamps

### Not modified

- `main.js`, `preload.js` — no new IPCs (pull/push via existing `syncBackupToFolder` / `restoreSyncBackup`)
- `package.json` — no new dependencies

### Conflict queue persistence

Stored in `localStorage` under key `recipeCosting.conflictQueue` as JSON. Loaded into `window._conflictQueue` on app start. Written after every merge. Device-local only — not synced as part of the backup blob.

Queue entry shape:

```js
{
  id: "conflict-<uuid>",
  detectedAt: "2026-04-17T12:34:56.789Z",
  entityType: "ingredient" | "recipe" | "supplier" | "settings" | "recipeIngredient" | "subRecipe",
  entityId: "ing-42",
  entityName: "Cucumber",
  parentId: "recipe-7",              // only for nested entities
  field: "packCost" | null,          // null for whole-record conflicts (delete-vs-edit)
  localValue: 2.50,
  localModifiedAt: "2026-04-17T12:00:00Z",
  localModifiedBy: "laptop",
  remoteValue: 2.75,
  remoteModifiedAt: "2026-04-17T12:30:00Z",
  remoteModifiedBy: "desktop",
  kind: "field-conflict" | "delete-vs-edit" | "edit-vs-delete"
}
```

---

## 2. Merge Algorithm

### Audit log merge (runs first)

```
merged.auditLog = local.auditLog ∪ remote.auditLog
  deduped by entry.id
  sorted by entry.ts ascending
```

The merged log must exist before the record merge begins so that Case 1 (one-sided records) can scan for delete entries.

### Record merge (per collection)

Runs for each of `ingredients`, `recipes`, `suppliers`, plus the `settings` object treated as a single record with id `"settings"`.

For each id present in `local ∪ remote`:

```
L = localRecord, R = remoteRecord
T = lastSyncAt  (ISO string; null on first sync)

Case 1: only one side exists
  1a. L exists, R missing:
      Scan merged.auditLog for { op:"delete", entityId:id, entityType:thisCollection }
      deleteEntry = most recent such entry
      If deleteEntry found AND L._modifiedAt > deleteEntry.ts:
        → resurrect: keep L; emit restore entry
          { op:"restore", entityType, entityId, ts:now, by:deviceName,
            notes:"resurrected after conflicting delete", revertedEntryId:deleteEntry.id }
      Else if deleteEntry found AND L._modifiedAt ≤ deleteEntry.ts:
        → accept delete: remove L from merged state (no new audit entry — delete entry is already in merged log)
      Else (no delete entry — record simply hasn't reached remote yet):
        → keep L unchanged
  1b. R exists, L missing: mirror of 1a with sides swapped
      Resurrection case emits restore entry with by:deviceName (the merging device)

Case 2: both sides exist
  If shallowEqual(L, R): → merged = L, no-op

  Else:
    localChanged  = (T === null) || (L._modifiedAt > T)
    remoteChanged = (T === null) || (R._modifiedAt > T)

    Bootstrap sub-case (T === null):
      → LWW: merged = (L._modifiedAt ≥ R._modifiedAt) ? L : R
      → no conflicts queued
      (skip 2a/2b/2c)

    2a. localChanged && !remoteChanged:  → merged = L
    2b. !localChanged && remoteChanged:  → merged = R
    2c. localChanged && remoteChanged:   → field-level diff (below)
    2d. !localChanged && !remoteChanged: → merged = L (identical semantically; defensive)

  Field-level diff (Case 2c):
    merged = shallow clone of L
    For each field f where L[f] !== R[f] (excluding _modifiedAt, _modifiedBy):
      lMig = isMigrationStamp(L._modifiedBy)
      rMig = isMigrationStamp(R._modifiedBy)

      If lMig && !rMig: → merged[f] = R[f]      // real edit beats migration
      Else if rMig && !lMig: → merged[f] = L[f] // real edit beats migration
      Else if lMig && rMig: → merged[f] = (L._modifiedAt ≥ R._modifiedAt) ? L[f] : R[f]
      Else: → queue field-conflict
        { kind:"field-conflict", field:f, localValue:L[f], remoteValue:R[f], ... }
        merged[f] = L[f]   // local wins silently until Phase 4 resolves

    merged._modifiedAt = max(L._modifiedAt, R._modifiedAt)
    merged._modifiedBy = (L._modifiedAt ≥ R._modifiedAt) ? L._modifiedBy : R._modifiedBy

Case 3: neither side exists → skip (shouldn't occur; defensive)
```

### Nested recipe rows

Inside each merged recipe, the `ingredients[]` and `subRecipes[]` arrays are themselves merged one level deep using the same algorithm. The nested-row id key is `ingId` for recipeIngredient and `recipeId` for subRecipe (same as in audit.js). After nested merge completes, the parent recipe's `_modifiedAt` is recomputed as `max(parent._modifiedAt, max(nested._modifiedAt for all nested rows))`.

Conflicts queued for nested rows include `parentId` (the parent recipe id) and `entityType` of `"recipeIngredient"` or `"subRecipe"`.

### Migration stamp immunity

A record's `_modifiedBy` starting with the literal string `"migration"` (e.g. `"migration"`, `"migration:v1.2.3"`) marks it as the product of a schema migration, not a user edit. In field-level diff (Case 2c), a migration stamp loses to any real edit on the same field. If both sides are migration-stamped, LWW on `_modifiedAt` decides. No conflict is queued when a migration stamp is involved.

Migrations MUST stamp records they touch with `_modifiedBy: MIGRATION_STAMP` (from `audit.js`). Without this marker, migrations behave like normal edits and will clobber remote user edits.

### Schema version gate

Backup files include a top-level `_schemaVersion: number` field (incremented only on breaking schema changes — adding a field is not breaking; renaming or removing one is). `checkSchemaVersion(local, remote)` returns:

- Both versions equal or missing → `{ ok: true }`
- Local version ≥ remote version → `{ ok: true }` (newer app can read older data)
- Local version < remote version → `{ ok: false, reason: "Remote device is running a newer app version. Please update this device before syncing." }`

Sync abort behavior: on a version mismatch, `runSyncNow` toasts the reason and returns without merging or pushing. `_checkSyncOnStartup` shows a blocking modal with the same reason.

---

## 3. Sync Flow Integration

### `runSyncNow()` — manual "Sync now" button

```
1. Pull remote backup via restoreSyncBackup (read-only — don't apply yet)
2. checkSchemaVersion → abort with toast if not ok
3. mergeState(local, remote, lastSync, deviceName) → { mergedState, conflicts, restoreEntries }
4. Apply mergedState to live state; append restoreEntries to state.auditLog
5. Save locally (normal save pipeline)
6. queue = reconcileConflictQueue(queue, mergedState, remoteState)
7. queue = queue ∪ conflicts (deduped by id)
8. Persist queue to localStorage
9. Stale-check: re-read remote dataTimestamp; if changed since step 1, skip push
10. Push merged state via syncBackupToFolder; update lastSync in sync settings
11. Toast: "Synced."   or   "Synced. N conflicts pending resolution." if queue non-empty
```

### `_checkSyncOnStartup()` — simplified

```
1. If no sync folder configured → skip
2. Pull remote backup
3. If remote not found → skip (first run)
4. checkSchemaVersion → blocking modal "Please update app on this device" if not ok
5. mergeState, apply, save locally
6. Reconcile + append conflicts to queue; persist
7. Toast if conflicts queued
   (No push on startup — next save or manual sync pushes)
```

### Auto-sync on save

```
1. Stale-check: compare remote dataTimestamp to lastSeenRemoteTimestamp
2. If stale → skip push silently (next save or manual sync triggers pull+merge)
3. Else → push as today; update lastSeenRemoteTimestamp
```

### Conflict toast

Reuses existing toast mechanism (same as "Synced successfully"). Message until Phase 4: `"Synced. N conflicts pending — will prompt to resolve in an upcoming update."`. Phase 4 will change this to a clickable toast that opens the resolution modal.

### Deletions

Remove from `app.js`:
- `_showSyncPrompt` function
- Conflict-detection block inside `_checkSyncOnStartup` (the `localDate > lastSync && remoteDate > lastSync` branch that triggers the prompt)
- Related state like `_syncPromptLoadRemote` if not used elsewhere

Remove from `index.html`:
- `_showSyncPrompt` modal markup (the "keep local vs remote" dialog)

---

## 4. Reconcile Conflict Queue

Called on every sync to drop queue entries that no longer represent real divergence:

```
For each entry in queue:
  If entry.kind === "field-conflict":
    Look up local record and remote record by (entityType, entityId, parentId)
    If either side missing → drop (the conflict is now a delete-vs-edit or already resolved)
    If localRecord[field] === remoteRecord[field] → drop (both sides agree now)
    Else → keep

  If entry.kind === "delete-vs-edit" or "edit-vs-delete":
    If both sides now missing OR both sides now present with equal values → drop
    Else → keep
```

This runs before new conflicts from the current merge are appended, so a just-resolved-in-another-session conflict doesn't re-appear.

---

## 5. Testing Strategy

### Unit tests — `src/__tests__/sync-engine.test.js`

**mergeState Case 1:**
- Local-only, no remote delete → kept
- Local-only + remote delete, local newer → resurrected + restore entry emitted
- Local-only + remote delete, delete newer → removed
- Remote-only mirror of the above
- Both deleted → stays deleted

**mergeState Case 2:**
- Identical records → no-op
- Only local changed → keeps local
- Only remote changed → takes remote
- Both changed, different fields → merges both
- Both changed, same field → queues field-conflict, keeps local
- Migration on local, real edit on remote → takes remote
- Both migration → LWW, no conflict
- Bootstrap (lastSync null) identical → no-op
- Bootstrap differ → LWW, no conflict

**mergeState nested recipe rows:**
- Nested ingredient added on one side → included
- Nested ingredient edited both sides same field → field-conflict queued with parentId
- Nested ingredient deleted one side, edited other → resurrected
- Parent `_modifiedAt` updated to max of parent + nested

**mergeState audit log:**
- Dedup by entry.id
- Sort ascending by ts
- Result contains union

**reconcileConflictQueue:**
- Drops entry when both sides now agree on field
- Keeps entry when divergence persists
- Drops entry for entity that no longer exists

**checkSchemaVersion:**
- Equal or both missing → ok
- Local newer → ok
- Local older → not ok with reason

**isMigrationStamp:**
- `"migration"` → true
- `"migration:v1.2.3"` → true
- `"laptop-abc"` → false
- `null` / `undefined` / `""` → false

Target: ~35-40 unit tests.

### Manual tests

- **Two-device field conflict:** edit same ingredient field on both devices, sync → conflict toast; verify queue entry in localStorage
- **Delete-vs-edit:** delete on A, edit same on B, sync B then A → record resurrected with B's value on both
- **Bootstrap:** fresh install, sync with populated remote → all remote records adopted silently, no conflicts
- **Migration immunity:** manually stamp records with `_modifiedBy: "migration"`, edit same record on other device, sync → remote edit wins on the merged side
- **Schema version abort:** bump local `_schemaVersion` to 2 while remote is 1 on another device, sync on the older device → blocking modal, no merge
- **Stale-check push:** start push on A, save on B mid-flight, A's push aborts silently; re-sync picks up B's change
- **Queue reconciliation:** queue a conflict, resolve it externally (edit both sides to same value), sync → queue entry dropped
- **Full regression:** Jest suite + Phase 1/2 flows (edit → save → activity log → revert)

---

## 6. Rollout

Single phase. Ships without the Phase 4 resolution UI — conflicts queue silently and surface only via toast. The queue structure is finalized in this phase so Phase 4 can consume it without schema changes.

Backward compatibility: reading a backup from a Phase 1/2 device (no `_schemaVersion` field) is treated as version 0 / missing — `checkSchemaVersion` returns ok. Merge engine works on records with or without `_modifiedAt` (missing timestamp treated as epoch 0, which means any stamped side wins).

Testing order: unit tests → manual two-device exercise → full regression sweep.
