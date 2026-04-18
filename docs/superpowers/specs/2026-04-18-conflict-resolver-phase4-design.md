# Phase 4: Conflict Resolver UI — Design Spec

## Problem

Phase 3 queues unresolvable field-level conflicts into `localStorage.recipeCosting.conflictQueue` and announces them with a toast ("N conflicts pending — will prompt to resolve in an upcoming update"). Users currently have no way to actually see or resolve those conflicts — the queue silently accumulates until reconciliation happens to match its entries.

## Goal

Surface queued conflicts in a discoverable, scannable picker; let the user pick a winner per conflict or in bulk; apply the resolution as a first-class audit-logged edit so it appears in Activity View and is revertible.

## Non-goals

- Syncing the conflict queue across devices (stays device-local, matching Phase 3)
- Three-way merge / custom value entry (only the two queued sides are offered)
- Resolving `delete-vs-edit` conflicts (Phase 3 silently resurrects; these never enter the queue)
- Automatic conflict resolution heuristics (user always picks)
- Surfacing migration-stamp conflicts (Phase 3 drops these silently too)

---

## 1. Entry Point — Badge

A small red pill badge renders inline with the sync status area at the top of the Settings view. It reads `⚠ N` when the queue has entries, and is hidden when empty.

**Live updates.** `ConflictResolver.renderBadge()` runs:
- On app boot, just after `_loadConflictQueue()`
- At the end of `runSyncNow` (after `_saveConflictQueue`)
- At the end of `_checkSyncOnStartup`
- After each individual or bulk resolve action
- Whenever the Settings view is re-rendered

**Click.** Opens the Conflict Resolver modal.

**Stale pruning on open.** Before rendering the list, drop any queue entries whose referenced record no longer exists in local state (covers the "conflict queued, then the record was later deleted" edge case). This is a lightweight local-only check — a dedicated helper in `conflict-resolver.js` (see §4), not `SyncEngine.reconcileConflictQueue` (which requires a remote-state comparison and would spuriously drop everything if passed the same state twice). Save the pruned queue and re-render the badge.

---

## 2. Resolver Modal

Full-screen overlay, same styling as existing modals. Header shows `Pending Conflicts (N)` and a close button.

**Bulk bar:** Two buttons — `Keep all local` and `Keep all remote`. Each opens a confirmation modal before applying.

**List:** One row per queued `field-conflict`, rendered in queue order (newest last — matches how conflicts are appended during merge). Each row shows:

```
{entity label}
{local device} · {local relative time}        {remote device} · {remote relative time}
[ Keep {local value} ]                        [ Keep {remote value} ]
```

**Entity label by entityType:**
- `ingredient` / `recipe` / `supplier` → `{record.name} · {field}`
- `recipeIngredient` → `{parentRecipe.name} › {linkedIngredient.name} {field}`
- `subRecipe` → `{parentRecipe.name} › {linkedSubRecipe.name} {field}`
- `settings` → `Settings · {field}`

If any linked record can't be resolved, fall back to the raw id.

**Value rendering on buttons:**
- Strings → quoted; truncate >40 chars with `…`; `title=` holds the full string
- Numbers → as-is
- Booleans → `Yes` / `No`
- Arrays / objects → `[3 items]` / `{object}`; `title=` holds the JSON
- `null` / `undefined` / `""` → `(empty)`

**Device label:** matches Phase 2 — `_modifiedBy === _getDeviceName()` renders as `This device`; otherwise the raw name. Relative time uses the same formatter already used by Activity View.

**Empty state:** If the modal opens (or the last row is resolved) with no remaining entries, show `No conflicts pending ✓` and auto-close after ~800 ms.

---

## 3. Resolution Mechanics

### Per-row: `resolveConflict(conflictId, winner)`

1. Find the conflict in the queue by id. If missing, re-render and return.
2. Look up the target record via the same strategy Phase 3 uses (`sync-engine.js`'s `_findRecord` logic — top-level collections by id; `recipeIngredient` / `subRecipe` by parent id + entity-specific id key). If the record is gone, drop the conflict entry with a toast "Record no longer exists — removed from queue" and re-render.
3. Write the winning value: `record[field] = winner === 'local' ? entry.localValue : entry.remoteValue`.
4. Stamp: `record._modifiedAt = new Date().toISOString()`; `record._modifiedBy = _getDeviceName()`. For nested rows, bump the parent recipe's `_modifiedAt` to the same timestamp.
5. Append an audit entry:
   ```js
   {
     id: <uuid>,
     op: 'resolve-conflict',
     entityType: entry.entityType,
     entityId: entry.entityId,
     parentId: entry.parentId || undefined,
     field: entry.field,
     before: <losing value>,
     after: <winning value>,
     _modifiedAt: stamp,
     _modifiedBy: deviceName,
     conflictId: entry.id
   }
   ```
6. Drop the conflict: `_saveConflictQueue(queue.filter(c => c.id !== conflictId))`.
7. `await save()` → `renderBadge()` → re-render the list.
8. If the queue is now empty, show a `✓ All conflicts resolved` toast and auto-close the modal.

### Bulk: `resolveAll(winner)`

1. `showConfirm("Keep all {this device | remote device} values? This will overwrite N records.")`. Cancel → no-op.
2. Iterate the current queue. For each entry run steps 2–5 from the per-row flow. Entries with missing records are dropped silently; track the skip count.
3. One `_saveConflictQueue([])` to clear. One `await save()` at the end.
4. Toast: `Resolved N conflicts` (or `Resolved N conflicts · M skipped (records deleted)` when any were missing). Close the modal.

### Concurrent-sync safety

`_autoSyncToCloud` is debounced (30 s) and stale-checked; a sync that fires during step 7 reads `state.auditLog` and field values that already reflect the resolution, so it pushes the correct state. `_saveConflictQueue` runs before `save()` triggers auto-sync, so the queue removal is durable even if the subsequent push fails.

### `resolve-conflict` op in audit.js

- Added to the known-ops allowlist.
- Activity View renders it with a `⚖` icon and the label `Resolved conflict on {entity} {field}`, same `before → after` strikethrough/green diff as `update`.
- **Revertible** — treated like `update`: revert sets the field back to `before`, logs a `restore` entry. Revert does *not* re-queue the conflict; a subsequent sync where remote still disagrees will produce a fresh queue entry.

---

## 4. Architecture

### New file

**`src/conflict-resolver.js`** — UMD module exposing `window.ConflictResolver`:

- `render()` — renders the resolver modal content
- `renderBadge()` — updates the badge DOM from `window._conflictQueue`
- `openResolver()` — stale-prune + show modal + render
- `pruneMissingRecords(queue, state)` — pure helper; returns queue with entries whose record lookup in `state` fails removed
- `closeResolver()` — hide modal
- `resolveConflict(conflictId, winner)` — per-row apply (calls `applyResolution` then persistence)
- `resolveAll(winner)` — bulk apply after confirmation
- `applyResolution(state, conflict, winner, deviceName)` — **pure function** returning `{ record, auditEntry }` or `{ error: 'missing' }`. Extracted for unit testing; does not touch DOM or persistence.
- `entityDisplayName(state, conflict)` — label string
- `formatValueForButton(v)` — button label string

### Modified files

- **`src/index.html`** — add badge element (hidden by default) inline with the sync status block in the Settings view, add the resolver modal skeleton at the bottom, add `<script src="conflict-resolver.js">` after `activity-view.js` and before `app.js`.
- **`src/app.js`** — wire badge click to `ConflictResolver.openResolver()`; call `ConflictResolver.renderBadge()` at the five update sites listed in §1.
- **`src/audit.js`** — recognize `'resolve-conflict'` in the ops list, route it through the same formatting/revert paths as `update`.

### Not modified

- `src/sync-engine.js` — already produces the queue shape and exposes `reconcileConflictQueue`.
- `main.js` / `preload.js` / `package.json` — no new IPC, no new dependencies.

---

## 5. Testing Strategy

### Unit tests (`src/__tests__/conflict-resolver.test.js`)

DOM-free, same pattern as `audit-revert.test.js`:

1. **`applyResolution`**
   - Local winner writes `localValue`; remote winner writes `remoteValue`
   - Stamps `_modifiedAt` / `_modifiedBy` on the record
   - Returns an audit entry with `op: 'resolve-conflict'`, correct `before` (losing) / `after` (winning), and `conflictId` referencing the original
   - Nested `recipeIngredient` conflict: writes to the correct row within the parent; bumps parent `_modifiedAt`
   - Nested `subRecipe` conflict: same, but on `subRecipes` via `recipeId`
   - Missing record: returns `{ error: 'missing' }`, no mutation to state

2. **`entityDisplayName`**
   - Top-level ingredient / recipe / supplier
   - Nested `recipeIngredient` with valid parent and linked ingredient
   - Nested `subRecipe` with valid parent and linked sub-recipe
   - Fallback to id when parent missing
   - Fallback to id when linked record missing
   - `settings` → `Settings · {field}`

3. **`formatValueForButton`**
   - Strings: quoted, under-40 unchanged, over-40 truncated with `…`
   - Numbers and booleans
   - Arrays → `[N items]`; objects → `{object}`
   - `null`, `undefined`, `""` → `(empty)`

4. **`pruneMissingRecords`**
   - Entry whose top-level record still exists → kept
   - Entry whose top-level record is gone → dropped
   - Nested entry whose parent recipe is gone → dropped
   - Nested entry whose parent exists but whose nested row is gone → dropped
   - Empty / non-array input → returns `[]`

5. **Bulk resolve through `applyResolution`**
   - Given a 3-entry queue where one references a deleted record, looping `applyResolution` yields 2 successes and 1 `missing`.

### Manual exercise

Added to the Phase 3 two-device checklist:

- [ ] Queue a field-conflict (edit same field on both devices, sync both) → badge appears with count `1`.
- [ ] Click the badge → resolver opens, one row with correct entity label, device names, relative times, value buttons.
- [ ] Click `Keep local` → row disappears; Activity View shows a new `⚖ Resolved conflict on Cucumber packCost` entry; badge clears; record value in the library is local.
- [ ] Revert the `resolve-conflict` entry from Activity View → field returns to the losing value; a `restore` entry is logged.
- [ ] Queue three conflicts, click `Keep all remote`, confirm → three rows clear, a single `Resolved 3 conflicts` toast appears, three `resolve-conflict` audit entries exist.
- [ ] Open the resolver with an entry referencing a deleted record → that row is pruned before render; badge count drops accordingly.

**Regression target after Phase 4:** ~175 tests (163 current + ~12 new).

---

## 6. Rollout

Single phase — badge, modal, resolution logic, and audit wiring ship together. Splitting them would leave the badge visible without a way to act on it, or the resolver buildable only via DevTools — both strictly worse than the current state.

Testing gate: Jest suite green (~175 tests), then manual two-device exercise through the checklist in §5.
