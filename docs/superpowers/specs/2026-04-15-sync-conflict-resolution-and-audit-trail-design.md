# Multi-device Sync Conflict Resolution & Audit Trail

**Status:** Design approved — ready for implementation planning
**Date:** 2026-04-15
**Scope:** `src/app.js`, `main.js`, `src/preload.js`, new Settings UI

---

## 1. Problem

The app runs on multiple devices belonging to a single user (work laptop, home desktop, kitchen tablet). Today it syncs via a shared cloud folder, and on startup the user is prompted with a wholesale "newer wins" choice: either the local state or the remote backup replaces the other entirely. Two classes of pain follow:

1. **Lost edits.** If the user edits a record on Device A, forgets to sync, then edits a *different* record on Device B, the whole-file restore loses one set of changes.
2. **No forensics.** When a recipe's cost suddenly jumps, there's no way to answer "what changed, when, on which device?" Only `priceHistory` on ingredients is tracked, and even that is limited.

## 2. Goals

- **Silent merging** of independent edits across devices — no prompts in the common case.
- **Per-record conflict detection** when the same record was genuinely modified on two devices between syncs. User resolves each conflict deliberately; no bulk "take newer" shortcut.
- **Full audit trail** for every create/update/delete on ingredients, recipes, suppliers, and their nested rows (recipe ingredient lines, sub-recipe references, alt-supplier entries). Filterable and drillable from Settings and from each record's modal.
- **Revert** any logged change (with confirmation), turning the log into a time machine.
- **Zero changes to the existing imperative mutation code** in `app.js` (hundreds of `state.ingredients[i].field = value` call sites).
- **Safe migration** of existing data files with no user action required.

## 3. Non-goals

- **Multi-user accountability.** Identity is the device name, not a person. No logins, profiles, or per-user permissions.
- **Real-time / simultaneous editing.** Conflicts are resolved on sync, not while editing. Workflow is sequential or overlapping, never truly simultaneous.
- **Per-field CRDT.** Per-record granularity is sufficient for the workflow; per-field doubles the schema size and complicates everything for a vanishingly rare case that the audit log already mitigates.
- **Operation-log / event-sourced architecture.** Too invasive for a 22k-line imperative codebase.

## 4. Data model

### 4.1 Per-record metadata

Every ingredient, recipe, and supplier gains two optional fields:

```js
{
  id: "ing_abc123",
  name: "Cucumber",
  packCost: 0.90,
  // ...all existing fields unchanged...
  _modifiedAt: "2026-04-15T14:42:11.204Z",  // ISO string, local clock
  _modifiedBy: "Work-Laptop",                // state.sync.deviceName
}
```

Records without these fields (pre-migration data) are treated as if modified at `state.exportDate` by `'Unknown'`.

### 4.2 Top-level audit log

A single append-only array on `state`:

```js
state.auditLog = [
  {
    id: "log_01HX5...",          // ULID, unique for merge dedup
    ts: "2026-04-15T14:42:11.204Z",
    device: "Work-Laptop",
    op: "update",                // create | update | delete | restore | restore-backup | conflict-resolve | bulk-update
    entity: "ingredient",        // ingredient | recipe | supplier | recipeIngredient | subRecipe | state
    entityId: "ing_abc123",
    entityName: "Cucumber",      // denormalised — survives record deletion
    parentId: null,              // for nested entities: the owning recipe id
    field: "packCost",           // omitted for create/delete
    before: 0.85,
    after:  0.90,
  },
  // ...
]
```

**For `op: "delete"`**, the full record JSON is stored in `before` (not just a field), enabling restore-from-log.

**For `op: "create"`**, the full record JSON is stored in `after`.

**For `op: "bulk-update"`** (AI categorise, bulk price update, AI auto-import, etc.), one summary entry with `count`, `notes`, and a nested `changes: [{id, name, field?, before, after}, ...]` array. Keeps the feed compact while preserving forensic detail.

### 4.3 Top-level sync metadata

```js
state.schemaVersion = 2;
state._lastSyncAt  = "2026-04-15T14:00:00Z"; // last successful merge against cloud folder
```

### 4.4 Storage & rotation

- Main data file carries at most ~2000 log entries OR entries newer than 90 days.
- Overflow (older than 90 days OR beyond the soft cap) is moved on save to `audit-archive-YYYY-MM.json` in the Electron userData directory.
- Archives are loaded lazily — only when the Activity view asks for entries older than 90 days.
- Projected size: ~200 bytes per entry × 2000 = ~400 KB added to the main file. Negligible.

### 4.5 Ignored fields

The diff engine hard-ignores fields that change constantly and have no forensic value:
- `_costCache`, `_ingIndexById`, and any other runtime caches
- UI state: `activeRecipeId`, `activeLocationId`, search filters, scroll positions, modal open flags
- `_loadSnapshot`, `_lastSyncAt`, `_lastEditTimestamp`

## 5. Write path — diff at save time

### 5.1 Load snapshot

Immediately after `loadData()` parses the file, build an in-memory snapshot of tracked fields:

```js
_loadSnapshot = {
  ingredients: new Map(),  // id -> flat clone of tracked fields
  recipes:     new Map(),
  suppliers:   new Map(),
}
```

Only tracked fields are cloned. For nested structures (recipe ingredient rows, sub-recipes, alt-suppliers), the snapshot stores the arrays by value so the diff can compare element-by-element on id.

### 5.2 Diff on save

`save()` is already debounced, which naturally batches rapid successive edits. Inside `save()`, before writing to disk:

1. Walk `state.ingredients` vs `_loadSnapshot.ingredients`:
   - Id in both, any tracked field differs → one `update` entry per changed field.
   - Id in state but not snapshot → one `create` entry.
   - Id in snapshot but not state → one `delete` entry with full record in `before`.
2. Repeat for recipes (including nested `ingredients[]` rows and `subRecipes[]`) and suppliers.
3. Stamp `_modifiedAt = now`, `_modifiedBy = device` on every changed top-level record.
4. Append all new log entries to `state.auditLog`.
5. Rotate old entries into archive files if cap/age exceeded.
6. Refresh `_loadSnapshot` to match the just-saved state.
7. Write to disk as today.

### 5.3 Edge cases

| Scenario | Behaviour |
|---|---|
| Undo before save | Snapshot unchanged → no log entry ever written. Silent. |
| Undo after save | Undo is a mutation → next save emits an `update` entry with before/after swapped. |
| Rename (id unchanged, name changed) | Regular field update. |
| Bulk operations | Wrapper that calls a special `logBulkOperation()` helper — still one save, one aggregate entry instead of N individual diffs. The diff engine skips already-logged bulk-affected records via a per-save `_skipDiff` set. |
| Clock skew between devices | Single-user, LWW is fine. Local clock is trusted. |

### 5.4 Performance

- Walk cost is O(records × tracked-fields). For a library of ~5000 ingredients/recipes combined with ~20 tracked fields each, this is ~100k comparisons per save — sub-millisecond in V8.
- Log rotation check is O(n) over log length, bounded at 2000.
- If scale ever exceeds this, a dirty-flag Set populated by a thin `mutate()` helper becomes the escape hatch — no architectural change.

## 6. Merge algorithm

### 6.1 When it runs

- Startup (existing `_checkSyncOnStartup` hook)
- After a successful `syncBackupToFolder` push
- Manual "Sync now" button in Settings

### 6.2 Algorithm

```
for each collection (ingredients, recipes, suppliers):
  localMap  = indexById(state[collection])
  remoteMap = indexById(remote[collection])

  for each id in union(localMap, remoteMap):
    local  = localMap[id]
    remote = remoteMap[id]

    if only local:
      keep local  // new here, will push on next sync
    elif only remote:
      // create locally
      emit audit entry { op: "create", via-sync: true }
      take remote
    else:
      if local._modifiedAt === remote._modifiedAt: skip (identical)
      localModifiedSince  = local._modifiedAt  > state._lastSyncAt
      remoteModifiedSince = remote._modifiedAt > state._lastSyncAt
      if localModifiedSince && remoteModifiedSince:
        → CONFLICT, queue for user review
      else:
        // silent LWW — at most one side changed since last sync
        take the side with the later _modifiedAt

  // Delete-vs-edit specifically:
  for each id only in localMap (or only in remoteMap):
    if the missing side has a delete entry in its audit log AND
       the present side has an _modifiedAt newer than that delete:
      // edit wins — keep the edited record, drop the delete
      emit audit entry { op: "restore", notes: "resurrected after conflicting delete" }

// Audit log merge:
merged = dedup(local.auditLog ++ remote.auditLog, by id).sortBy(ts)
state.auditLog = merged
```

### 6.3 Conflict UI

Blocking modal, dismissable only by resolving every queued conflict:

```
⚠ 3 records were edited on both devices since last sync

┌─────────────────────────────────────────────────────────────┐
│ Ingredient · Cucumber                                        │
│                                                              │
│              Work-Laptop              Home-Desktop           │
│              Tue 14:42                Tue 15:08              │
│   packCost   £0.90                    £0.95                  │
│   yieldPct   100                      92                     │
│                                                              │
│   [ Keep Work-Laptop ]  [ Keep Home-Desktop ]  [ Merge ▾ ]   │
└─────────────────────────────────────────────────────────────┘
```

- **Keep X / Keep Y** — take that side's record wholesale.
- **Merge ▾** — expands a per-field picker; defaults to the newer value per field.
- **No** "Take newer for all" bulk button. Every conflict requires a deliberate decision.
- After resolution, a `conflict-resolve` audit entry is appended recording the decision (local/remote/merged) and the resolved values.

### 6.4 Bootstrap

The first run after upgrade has `_lastSyncAt = null`. The merge treats this as "nothing has been modified since last sync on either side", so silent LWW wins every comparison and no conflicts can fire. Safe first sync.

## 7. Activity view (Settings → Activity)

### 7.1 Placement

New card in the existing Settings screen, below the sync/backup section. Not a top-level sidebar item.

### 7.2 Feed

Reverse-chronological scrolling list, grouped by day:

```
━━━ Today ━━━
  14:42  Work-Laptop   Cucumber price         £0.85 → £0.90
  14:41  Work-Laptop   Bolognese              added "beef stock"
  11:03  Home-Desktop  Supplier "Brakes"      phone updated
  09:15  Home-Desktop  Bolognese              portions 6 → 8
━━━ Yesterday ━━━
  ...
```

Each row is clickable → opens the record (or a read-only historical-data panel if the record was deleted, populated from the log's `before` field).

### 7.3 Filters

- **Entity:** All · Ingredients · Recipes · Suppliers
- **Device:** All · `<distinct devices observed>`
- **Op:** All · Create · Update · Delete · Restore · Conflict-resolve · Bulk-update
- **Date range:** Today · 7d · 30d · 90d · Custom (Custom triggers archive load)
- **Free text search** against entity name, field name, device name

### 7.4 Summary card

Top of the Activity view shows a passive food-cost radar:

> 📊 **Last 7 days:** 14 price updates · 3 new ingredients · 2 recipes edited · 0 conflicts resolved

Each chip is a one-click filter shortcut.

### 7.5 Per-record history tab

Every ingredient/recipe/supplier modal gains a small **📜 History** tab next to Details, filtered to that one record. Chronological git-log-style view. This is the "why does Bolognese cost £4.20 now?" lookup.

### 7.6 Revert

Each log entry has a `↶ Revert this change` button. Clicking it shows a confirmation dialog:

> Revert packCost from £0.90 back to £0.85?
> This creates a new audit entry and does not delete the current one.
> [ Cancel ] [ Revert ]

Revert semantics:
- **Field update** → set the field back to the `before` value; creates a new `op: "restore"` entry with the now-current value as `before` and the historical value as `after`.
- **Delete** → resurrect the full record from the entry's `before` payload.
- **Create** → delete the record (itself logged).
- **Bulk-update** → expand into individual reverts applied atomically; creates a matching bulk `restore` entry.
- Reverts can themselves be reverted — the log is the time machine.

## 8. Migration

### 8.1 On load

```js
if (!state.schemaVersion || state.schemaVersion < 2) {
  const migrationTs = state.exportDate || new Date().toISOString();
  const migrationBy = state.sync?.deviceName || 'Unknown';
  for each collection in (ingredients, recipes, suppliers):
    for each record:
      record._modifiedAt ||= migrationTs;
      record._modifiedBy ||= migrationBy;
  state.auditLog ||= [];
  state._lastSyncAt = null;
  state.schemaVersion = 2;
  save(); // commit the migration
  showToast("✓ Activity tracking enabled. Changes from now on will be logged.");
}
```

### 8.2 Restore from pre-v2 backup

Restore runs the same upgrade path. The backup becomes v2 the moment it loads. A single `op: "restore-backup"` entry is appended recording that a restore happened, and the backup's own audit log (if any) is merged in using the same dedup-by-id rules as Section 6.

### 8.3 Backwards-compat read

Older clients that open a v2 file silently ignore unknown fields. Nothing breaks. They will, however, not emit audit entries for their own edits — which will be detected as "modified on the newer client with no log context" on next merge and handled as a standard LWW.

## 9. Public API changes

### 9.1 `src/preload.js`

No new IPC. The audit log is renderer-local state.

### 9.2 `main.js`

No changes to existing handlers. The sync push/pull handlers (`sync-backup-to-folder`, `restore-sync-backup`) already transport the whole state object, which will now include `auditLog`. A single new helper file path is used for the archive:

```
userData/
  audit-archive-2026-01.json
  audit-archive-2026-02.json
  ...
```

New IPC `load-audit-archive(month)` returns the parsed archive for a given YYYY-MM on demand.

### 9.3 `src/app.js` — new modules

- `audit/diff.js` — pure function `computeDiff(snapshot, state, device) → {entries, stampedRecordIds}`
- `audit/merge.js` — pure function `mergeStates(local, remote) → {merged, conflicts}`
- `audit/log.js` — append, rotate, archive helpers
- `audit/revert.js` — apply-revert logic per op type
- `audit/ui.js` — render Activity view, conflict modal, per-record History tab

Each module is independently unit-testable and kept under ~400 lines.

## 10. Testing

### 10.1 Unit tests (`src/__tests__/`)

- **`diff.test.js`** — fixtures covering: no-change, single field update, multiple field updates, create, delete, rename, nested recipe ingredient add/remove/reorder, bulk-op skip list honoured.
- **`merge.test.js`** — fixtures covering: only-local, only-remote, both-identical, LWW-local-wins, LWW-remote-wins, genuine conflict, delete-vs-edit (edit wins), audit-log dedup.
- **`revert.test.js`** — revert field update, revert delete (resurrection from `before`), revert create, revert-of-revert idempotence.
- **`migration.test.js`** — pre-v2 file → v2 file, records stamped, log initialised, no data loss.

### 10.2 Integration test

File-based two-device simulation: write side A to tempdir, copy to "shared folder" tempdir, read on side B, verify merged state and conflict list. Covers the full round-trip through the actual sync IPCs.

### 10.3 Manual UAT checklist

A checklist committed to `docs/superpowers/uat/sync-audit-uat.md` that a human can walk through before each release touching this area:

1. Edit ingredient price on Device A, sync, edit a different field on Device B, sync → silent merge, both changes present, two audit entries.
2. Edit same ingredient's same field on both devices without syncing → conflict modal, resolve, verify audit entry.
3. Delete ingredient on A, edit the same ingredient on B → edit wins, record present, restore entry logged.
4. Revert a price change → price restored, new entry present.
5. Bulk update 10 prices → single bulk entry, expandable detail.
6. Scroll Activity view past 90 days → archive file loads, older entries appear.

## 11. Phasing

Implementation fits cleanly into four independent phases that can each be reviewed and merged separately:

1. **Foundation** — schema v2 migration, `_modifiedAt/_modifiedBy` backfill, `auditLog` initialisation, load snapshot, diff-at-save, bulk-op summary wrapper. No UI. At this point every save silently produces log entries but nothing surfaces them.
2. **Activity view** — Settings card, feed, filters, per-record History tab, revert with confirmation. Read-only view of what phase 1 produces.
3. **Merge engine** — per-record LWW, `_lastSyncAt` tracking, conflict queue, delete-vs-edit handling. Invoked from the existing sync hooks; silent merging only.
4. **Conflict UI** — blocking modal, per-record review, conflict-resolve audit entries. Enables the full flow end-to-end.

Each phase is independently valuable and testable.

## 12. Risks & open questions

- **Clock skew** on a truly skewed device could cause a weird ordering in the log feed but never data loss (LWW is monotonic with respect to whatever clock the writer used). Acceptable for single-user.
- **Nested recipe ingredient reordering** — do we log order changes? **Decision: yes**, as a single `{op: "update", field: "ingredientOrder", before: [ids], after: [ids]}` entry. Low noise, high usefulness.
- **Very large bulk imports** (1000+ AI-imported ingredients) — the bulk-update entry's `changes[]` array could bloat. **Decision: cap nested changes array at 500 entries**; beyond that, store only the ids and a `truncated: true` flag, with full detail recoverable from the backup history.
- **Migration of already-synced folders** — if multiple devices upgrade at different times, the first v2 device's migration stamps all records with the same `_modifiedAt`. When the second device upgrades, it will detect its local state as "different from the v2 synced file" and its own migration will stamp its records with its own migration time. These two migration timestamps will be different, and a conflict could fire for every record on the next sync. **Mitigation:** a special `migration` op flag on the first sync after upgrade — records whose only change is the migration stamp are never treated as conflicts, silent LWW always wins.

---

## Decisions locked in

| # | Area | Decision |
|---|---|---|
| 1 | Identity | Device name only (single-user, multi-device) |
| 2 | Tracked fields | `_modifiedAt` + `_modifiedBy` on every ingredient, recipe, supplier |
| 3 | Audit log scope | Line-item granularity, 90-day retention + archive |
| 4 | Write path | Diff at save time against load snapshot; zero changes to existing imperative code |
| 5 | Merge strategy | Per-record LWW, conflict only when both sides edited since last sync |
| 6 | Delete-vs-edit | Edit wins, record resurrected, logged as `restore` |
| 7 | Conflict UI | Blocking modal, per-record review required, NO bulk shortcut |
| 8 | Activity view placement | Inside Settings (not top-level sidebar) |
| 9 | Revert | Requires confirmation dialog |
| 10 | Migration | Schema v2 auto-backfill on first load, one-off toast |
| 11 | Bulk ops | Single summary entry with nested changes[], cap at 500 |
| 12 | Phasing | 4 phases: foundation → Activity view → merge engine → conflict UI |
