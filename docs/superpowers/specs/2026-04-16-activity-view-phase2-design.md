# Phase 2: Activity View — Design Spec

## Problem

Phase 1 silently records every meaningful edit into `state.auditLog` with `_modifiedAt`/`_modifiedBy` stamps, but users have no way to see what changed, when, or by whom. There's also no way to undo a mistake short of restoring an entire backup.

## Goal

Surface the audit log in a browsable, filterable Activity View inside Settings, add per-record History tabs to ingredient/recipe/supplier modals, and provide single-entry revert with confirmation.

## Non-goals

- Sync/merge logic (Phase 3)
- Conflict resolution UI (Phase 4)
- Export/download of audit logs
- Bulk revert (multiple entries at once)
- Undo for reverts (revert the restore entry instead)
- Real-time live feed updates (refreshes on navigation and after revert)

---

## 1. Activity Log Panel (Settings)

### Layout

Full-width panel inside the Settings view with two columns:

**Left sidebar — Filter controls:**
- **Entity toggles:** Ingredients / Recipes / Suppliers (multi-select pill buttons, default all selected)
- **Operation toggles:** Create / Update / Delete (multi-select pill buttons, default all selected)
- **Date range dropdown:** Today / Last 7 days / Last 30 days / All time (default: Last 7 days)
- **Search box:** Free text filter on `entityName` (debounced, case-insensitive)

**Right column — Feed:**
- Header row showing the total count of entries matching current filters
- Chronological feed, newest first. Each entry displays:
  - Relative timestamp (e.g. "2 min ago", "yesterday") + device name
  - Operation description: "Updated **Cucumber** packCost" / "Created supplier **Brakes**" / "Deleted ingredient **Old Beef**"
  - For `update` entries: `before → after` values with strikethrough (red) / new value (green)
  - Revert button (↩) on `update` and `delete` entries only. Not shown on `create` or `bulk-update` entries.
- **"Load older" button** at the bottom of the feed — appends the next batch of entries (pagination by 50)
- **"Archives" dropdown** — lists available archived months (via `electronAPI.listAuditArchives()`). Selecting a month loads that archive via `electronAPI.loadAuditArchive(ym)` and appends entries to the feed, filtered by the current filter state.

### Data Flow

1. When the user navigates to Settings, `ActivityView.render()` is called.
2. It reads `state.auditLog` (the live, in-memory log) and renders the first 50 entries matching the default filters.
3. Filter changes re-render the feed from the same in-memory data.
4. "Load older" paginates through the in-memory log.
5. "Archives" fetches from disk via IPC and merges into a local display array (not into `state.auditLog`).

---

## 2. Per-Record History Tab

### Location

A new **"History" tab** in the ingredient, recipe, and supplier edit modals, alongside existing tabs (Details, Nutrition, etc.).

### Content

- All audit log entries where `entityId` matches the current record, newest first.
- Same entry format as the main Activity Log: timestamp, device, field, before → after, revert button.
- For recipes: nested changes (`recipeIngredient` and `subRecipe` creates/updates/deletes where `parentId` matches the recipe id) are included in the feed.
- **"Load older from archives" button** — if the user wants older history, fetches archived months via IPC and filters by `entityId`.
- **"Created on [date]" badge** at the bottom if a `create` entry exists for this record.

### Data Flow

1. When the user clicks the History tab, `ActivityView.renderHistoryTab(entityType, entityId)` is called.
2. It filters `state.auditLog` for entries matching `entityId` (or `parentId` for nested recipe entries).
3. Archive loading is on-demand via the button.

---

## 3. Revert Mechanics

### Revertible Operations

| Operation | Revertible? | Action |
|-----------|-------------|--------|
| `update` | Yes | Set field back to `before` value |
| `delete` | Yes | Re-create record from `before` snapshot |
| `create` | No | No revert button shown |
| `bulk-update` | No | No revert button shown (too complex) |
| `restore` | No | No revert button shown (revert the original entry instead) |

### Revert Flow

1. User clicks ↩ Revert on an entry.
2. **Smart confirmation modal** appears:
   - Entity name + field being reverted
   - Visual diff: current value (strikethrough) → reverted value (green)
   - **Staleness check:** Compare the field's current live value against the entry's `after` value. If they differ, show a warning: *"⚠ This field has been changed since this log entry. Current value is [X]. Reverting will overwrite it with [Y]."*
3. User clicks "Revert" to confirm (or "Cancel" to abort).
4. Revert executes:
   - **Update revert:** `record[field] = entry.before`. Trigger `save()`.
   - **Delete revert:** Push `entry.before` (the full record snapshot) back into the appropriate collection array. Set `_modifiedAt` to now, `_modifiedBy` to current device. Trigger `save()`.
5. A new audit log entry is created with `op: "restore"` recording the revert action.
6. The feed / history tab re-renders to reflect the new state.

### Edge Cases

- **Record no longer exists** (reverting an `update` on a deleted record): Show "This record no longer exists" and disable the revert button.
- **Delete revert preserves original `id`:** The re-created record keeps its original `id` from the `before` snapshot so that references (e.g. recipe ingredient rows pointing to an `ingId`) remain valid.
- **Delete revert for recipes:** Re-creates the recipe including its `ingredients` and `subRecipes` arrays from the snapshot.
- **Nested entry revert** (`recipeIngredient` / `subRecipe` updates): Finds the parent recipe by `parentId`, then finds the nested row by `entityId` (`ingId` or `recipeId`), and sets the field back. If the parent recipe or nested row no longer exists, show "This record no longer exists."

---

## 4. Architecture

### New Files

- **`src/activity-view.js`** — UMD module (same pattern as `audit.js`). Exposes `window.ActivityView`. Contains:
  - `render()` — renders the full Activity Log panel in Settings
  - `renderHistoryTab(entityType, entityId)` — renders the History tab content in a modal
  - `applyFilters(entries, filters)` — pure function to filter entries by entity/op/date/search
  - `formatEntry(entry)` — returns HTML string for a single feed entry
  - `showRevertConfirm(entry)` — shows the smart confirmation modal
  - `executeRevert(entry)` — calls `Audit.revertEntry()` then triggers save + re-render
  - Internal filter state, pagination state, archive cache

- **`src/__tests__/audit-revert.test.js`** — Unit tests for `Audit.revertEntry()`:
  - Update revert sets field to `before` value
  - Delete revert re-creates record in collection
  - Staleness detection: `checkStaleness(state, entry)` returns `{ stale, currentValue, revertValue }`
  - Edge case: record no longer exists
  - Edge case: nested row revert
  - Revert creates a `restore` log entry

### Modified Files

- **`src/audit.js`** — Add exported functions:
  - `revertEntry(state, logEntry, deviceName)` — executes the revert mutation, returns `{ success, error?, restoreEntry }`
  - `checkStaleness(state, logEntry)` — returns `{ stale: boolean, currentValue, revertValue }` for the confirmation dialog

- **`src/index.html`** — Add:
  - Activity Log panel HTML skeleton in the Settings section
  - `<script src="activity-view.js">` tag (after `audit.js`, before `app.js`)
  - History tab markup in ingredient modal, recipe modal, and supplier modal

- **`src/app.js`** — Minimal glue only:
  - Call `ActivityView.render()` when Settings view is shown
  - Call `ActivityView.renderHistoryTab(type, id)` when a modal's History tab is activated
  - No rendering logic in `app.js` — all UI lives in `activity-view.js`

### Not Modified

- `main.js` — No new IPC handlers needed (archive IPCs already exist from Phase 1)
- `src/preload.js` — Already has archive IPC exposure from Phase 1
- `package.json` — No new dependencies

---

## 5. UI Styling

Follow existing app conventions:
- Dark mode aware (uses CSS variables: `var(--bg)`, `var(--text)`, `var(--accent)`, etc.)
- Filter pills use the same `.btn-secondary.btn-sm` pattern as existing toolbar buttons
- Feed entries use the same card/list styling as ingredient library rows
- Revert confirmation reuses the existing `showConfirm()` modal pattern in app.js
- Relative timestamps formatted as: "just now", "2 min ago", "1 hour ago", "yesterday", "12 Apr"

---

## 6. Rollout

Single phase — all of the above ships together. The Activity Log panel, History tabs, and revert functionality are tightly coupled (shared rendering code, shared revert logic) so splitting them would create unnecessary intermediate states.

Testing strategy:
- Unit tests for `revertEntry` and `checkStaleness` in `audit.js` (pure functions, testable in Jest)
- Manual testing for all UI rendering (no DOM test framework)
- Regression sweep: run full Jest suite + manual exercise of edit/save/revert cycle
