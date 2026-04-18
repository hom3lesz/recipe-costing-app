# Phase 4: Conflict Resolver UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users see queued sync conflicts, pick a winner per row or in bulk, and have each resolution logged as a revertible audit entry.

**Architecture:** A new UMD module `src/conflict-resolver.js` holds the pure logic (`applyResolution`, `pruneMissingRecords`, `entityDisplayName`, `formatValueForButton`) plus the DOM layer (`render`, `renderBadge`, `openResolver`, `resolveConflict`, `resolveAll`). `src/audit.js` and `src/activity-view.js` are taught to treat a new `resolve-conflict` op exactly like an `update` (revertible, formatted with a `⚖` icon and before→after diff). `src/app.js` calls `renderBadge()` at the five update sites where the queue can change, and wires the badge click.

**Tech Stack:** Vanilla JS (UMD pattern), Jest for unit tests, existing `showToast` / `showConfirm` / `save` helpers from `app.js`.

**Spec:** `docs/superpowers/specs/2026-04-18-conflict-resolver-phase4-design.md`

---

## File Structure

| File | Role |
| --- | --- |
| `src/conflict-resolver.js` (create) | UMD module with pure resolver functions + DOM layer. Exposes `window.ConflictResolver`. |
| `src/__tests__/conflict-resolver.test.js` (create) | Jest unit tests for the four pure functions. |
| `src/audit.js` (modify) | Extend `revertEntry` so `resolve-conflict` entries revert identically to `update`. |
| `src/__tests__/audit-revert.test.js` (modify) | New test: reverting a `resolve-conflict` entry sets field back to `before`. |
| `src/activity-view.js` (modify) | Recognize `resolve-conflict` in `formatEntry` (⚖ icon, before→after diff, revertible). |
| `src/__tests__/activity-view.test.js` (modify) | New test: `formatEntry` on a `resolve-conflict` entry renders the right icon and diff. |
| `src/index.html` (modify) | Add `<span id="conflict-badge">` in the sync status row; add `<div id="conflict-resolver-modal" class="modal-overlay hidden">` skeleton; `<script src="conflict-resolver.js">` after `activity-view.js`. |
| `src/app.js` (modify) | Call `ConflictResolver.renderBadge()` at five sites; wire the badge click. |

Existing files **not touched**: `src/sync-engine.js`, `main.js`, `src/preload.js`, `package.json`.

---

## Task 1: `audit.js` — make `resolve-conflict` revertible

**Files:**
- Modify: `src/audit.js` (lines 450–458 `canRevert`, lines 506 `revertEntry` update branch, line 584 error message)
- Modify: `src/__tests__/audit-revert.test.js`

The existing `revertEntry` for `update` sets `record[field] = entry.before`, stamps `_modifiedAt`/`_modifiedBy`, and appends a `restore` entry. A `resolve-conflict` entry has the same shape (`entityId`, `field`, `before`, `after`, optional `parentId`), so we route it through the identical code path.

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/audit-revert.test.js`:

```javascript
describe('revertEntry on resolve-conflict entries', () => {
  test('reverts a top-level resolve-conflict like an update', () => {
    var state = {
      ingredients: [{ id: 'a', name: 'Cucumber', packCost: 2.75, _modifiedAt: '2026-04-18T10:00:00Z', _modifiedBy: 'This device' }],
      recipes: [],
      suppliers: [],
      auditLog: [],
    };
    var entry = {
      id: 'log-1',
      ts: '2026-04-18T10:00:00Z',
      device: 'This device',
      op: 'resolve-conflict',
      entity: 'ingredient',
      entityId: 'a',
      entityName: 'Cucumber',
      field: 'packCost',
      before: 2.5,
      after: 2.75,
      conflictId: 'conflict-xyz',
    };
    var result = Audit.revertEntry(state, entry, 'This device');
    expect(result.success).toBe(true);
    expect(state.ingredients[0].packCost).toBe(2.5);
    expect(result.restoreEntry.op).toBe('restore');
    expect(result.restoreEntry.before).toBe(2.75);
    expect(result.restoreEntry.after).toBe(2.5);
    expect(result.restoreEntry.revertedEntryId).toBe('log-1');
  });

  test('reverts a nested recipeIngredient resolve-conflict', () => {
    var state = {
      ingredients: [{ id: 'ing1', name: 'Pecorino' }],
      recipes: [{
        id: 'r1', name: 'Carbonara',
        ingredients: [{ ingId: 'ing1', qty: 300 }],
      }],
      suppliers: [],
      auditLog: [],
    };
    var entry = {
      id: 'log-2', ts: '2026-04-18T10:00:00Z', device: 'This device',
      op: 'resolve-conflict', entity: 'recipeIngredient',
      entityId: 'ing1', entityName: 'Pecorino', parentId: 'r1',
      field: 'qty', before: 200, after: 300, conflictId: 'c1',
    };
    var result = Audit.revertEntry(state, entry, 'This device');
    expect(result.success).toBe(true);
    expect(state.recipes[0].ingredients[0].qty).toBe(200);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --testPathPattern=audit-revert`
Expected: FAIL — `resolve-conflict` hits the fall-through branch and returns `{ success: false, error: 'Only update and delete entries can be reverted.' }`.

- [ ] **Step 3: Broaden the update branch**

In `src/audit.js`, change line 506:

```javascript
if (entry.op === 'update') {
```

to:

```javascript
if (entry.op === 'update' || entry.op === 'resolve-conflict') {
```

And update the fall-through error at line 584:

```javascript
return { success: false, error: 'Only update and delete entries can be reverted.' };
```

to:

```javascript
return { success: false, error: 'Only update, resolve-conflict, and delete entries can be reverted.' };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --testPathPattern=audit-revert`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all 163 previous tests + 2 new = 165 passing.

- [ ] **Step 6: Commit**

```bash
git add src/audit.js src/__tests__/audit-revert.test.js
git commit -m "feat(audit): revertEntry treats resolve-conflict like update"
```

---

## Task 2: `activity-view.js` — format and allow revert on `resolve-conflict`

**Files:**
- Modify: `src/activity-view.js` (line 90 `canRevert`, around line 98–118 the `if/else` chain in `formatEntry`, around line 339 inside `showRevertConfirm`, around line 361 `confirmBtn.textContent`)
- Modify: `src/__tests__/activity-view.test.js`

The formatter uses an `if/else if` chain on `entry.op`. We add an `else if (entry.op === 'resolve-conflict')` branch that renders `⚖ Resolved conflict on <entity> <field>` with the existing before→after diff, and extend `canRevert` to include it. Revert confirmation dialog handling also needs the new op.

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/activity-view.test.js`:

```javascript
describe('formatEntry on resolve-conflict', () => {
  test('renders the ⚖ icon, label, and before→after diff', () => {
    var entry = {
      id: 'log-1', ts: '2026-04-18T10:00:00Z', device: 'This device',
      op: 'resolve-conflict', entity: 'ingredient',
      entityId: 'a', entityName: 'Cucumber',
      field: 'packCost', before: 2.5, after: 2.75,
      conflictId: 'c1',
    };
    var html = ActivityView.formatEntry(entry, 'This device');
    expect(html).toContain('⚖');
    expect(html).toContain('Resolved conflict');
    expect(html).toContain('Cucumber');
    expect(html).toContain('packCost');
    expect(html).toContain('2.5');
    expect(html).toContain('2.75');
    // Revertible: revert button present
    expect(html).toMatch(/data-revert-id="log-1"/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --testPathPattern=activity-view`
Expected: FAIL — output contains the op string verbatim and no ⚖ icon, revert button absent.

- [ ] **Step 3: Extend `canRevert`**

In `src/activity-view.js`, change line 90:

```javascript
var canRevert = (entry.op === 'update' || entry.op === 'delete');
```

to:

```javascript
var canRevert = (entry.op === 'update' || entry.op === 'delete' || entry.op === 'resolve-conflict');
```

- [ ] **Step 4: Add the `resolve-conflict` branch in the `if/else` chain**

Find the chain starting at line 96 (`if (entry.op === 'create') { … } else if (entry.op === 'update') { … } else if (entry.op === 'delete') { … } else if (entry.op === 'restore') { … } else if (entry.op === 'bulk-update') { … }`).

Insert a new branch after `restore` and before `bulk-update`:

```javascript
    } else if (entry.op === 'resolve-conflict') {
      desc = '⚖ Resolved conflict on ' + entityLabel + ' <b>' + _escHtml(name) + '</b> ' + _escHtml(entry.field);
      diffHtml = '<span style="color:var(--red);text-decoration:line-through">' + _escHtml(_fmtVal(entry.before)) + '</span>' +
                 ' → <span style="color:var(--green)">' + _escHtml(_fmtVal(entry.after)) + '</span>';
```

Match the existing indentation and the shape of the `update` branch for `diffHtml`. If the `update` branch uses different variable names (`fmtVal` vs `_fmtVal`, etc.), copy them verbatim from that branch — the key requirement is that `diffHtml` is populated with the same strikethrough-red → green-after treatment.

- [ ] **Step 5: Extend the revert-confirm dialog branch**

Around line 339 in `showRevertConfirm`, find `if (entry.op === 'update') { … } else if (entry.op === 'delete') { … }`. Change the `update` condition to:

```javascript
if (entry.op === 'update' || entry.op === 'resolve-conflict') {
```

No other change needed in that block — the rest treats the entry as a field-level revert, which is exactly right.

Around line 361:

```javascript
confirmBtn.textContent = entry.op === 'delete' ? 'Restore' : 'Revert';
```

Leave unchanged — `resolve-conflict` correctly falls into the "Revert" default.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- --testPathPattern=activity-view`
Expected: PASS.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: 165 + 1 = 166 passing.

- [ ] **Step 8: Commit**

```bash
git add src/activity-view.js src/__tests__/activity-view.test.js
git commit -m "feat(activity-view): format and revert resolve-conflict entries"
```

---

## Task 3: Scaffold `conflict-resolver.js` UMD module + `pruneMissingRecords`

**Files:**
- Create: `src/conflict-resolver.js`
- Create: `src/__tests__/conflict-resolver.test.js`

Start the module with the UMD boilerplate and the first pure function: `pruneMissingRecords(queue, state)` — returns a new queue with entries whose record can't be found removed.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/conflict-resolver.test.js`:

```javascript
const ConflictResolver = require('../conflict-resolver.js');

function mkConflict(over) {
  return Object.assign({
    id: 'c1',
    kind: 'field-conflict',
    entityType: 'ingredient',
    entityId: 'a',
    field: 'packCost',
    localValue: 2.5,
    remoteValue: 2.75,
    localModifiedAt: '2026-04-18T09:00:00Z',
    localModifiedBy: 'This device',
    remoteModifiedAt: '2026-04-18T10:00:00Z',
    remoteModifiedBy: 'Kitchen-Mac',
    ts: '2026-04-18T10:00:00Z',
  }, over || {});
}

function mkState(over) {
  return Object.assign({
    ingredients: [], recipes: [], suppliers: [],
    currency: '£', activeGP: 70, vatRate: 20, recipeCategories: [],
    auditLog: [],
  }, over || {});
}

describe('pruneMissingRecords', () => {
  test('keeps entries whose top-level ingredient still exists', () => {
    var queue = [mkConflict()];
    var state = mkState({ ingredients: [{ id: 'a', name: 'Cucumber', packCost: 2.5 }] });
    expect(ConflictResolver.pruneMissingRecords(queue, state)).toHaveLength(1);
  });

  test('drops entries whose top-level record is gone', () => {
    var queue = [mkConflict()];
    var state = mkState();
    expect(ConflictResolver.pruneMissingRecords(queue, state)).toHaveLength(0);
  });

  test('drops nested entry when parent recipe is missing', () => {
    var queue = [mkConflict({ entityType: 'recipeIngredient', entityId: 'ing1', parentId: 'r1', field: 'qty' })];
    var state = mkState();
    expect(ConflictResolver.pruneMissingRecords(queue, state)).toHaveLength(0);
  });

  test('drops nested entry when parent exists but nested row is gone', () => {
    var queue = [mkConflict({ entityType: 'recipeIngredient', entityId: 'ing1', parentId: 'r1', field: 'qty' })];
    var state = mkState({ recipes: [{ id: 'r1', name: 'Carbonara', ingredients: [] }] });
    expect(ConflictResolver.pruneMissingRecords(queue, state)).toHaveLength(0);
  });

  test('keeps nested entry when parent and nested row both exist', () => {
    var queue = [mkConflict({ entityType: 'recipeIngredient', entityId: 'ing1', parentId: 'r1', field: 'qty' })];
    var state = mkState({ recipes: [{ id: 'r1', name: 'Carbonara', ingredients: [{ ingId: 'ing1', qty: 200 }] }] });
    expect(ConflictResolver.pruneMissingRecords(queue, state)).toHaveLength(1);
  });

  test('keeps settings entries unconditionally', () => {
    var queue = [mkConflict({ entityType: 'settings', entityId: 'vatRate', field: 'vatRate' })];
    expect(ConflictResolver.pruneMissingRecords(queue, mkState())).toHaveLength(1);
  });

  test('empty or non-array input returns []', () => {
    expect(ConflictResolver.pruneMissingRecords([], mkState())).toEqual([]);
    expect(ConflictResolver.pruneMissingRecords(null, mkState())).toEqual([]);
    expect(ConflictResolver.pruneMissingRecords(undefined, mkState())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --testPathPattern=conflict-resolver`
Expected: FAIL — `Cannot find module '../conflict-resolver.js'`.

- [ ] **Step 3: Create the module**

Create `src/conflict-resolver.js`:

```javascript
/**
 * src/conflict-resolver.js — Conflict Resolver UI (Phase 4).
 *
 * Loaded two ways:
 *   1. Browser: <script src="conflict-resolver.js"></script> after activity-view.js.
 *      Exposes window.ConflictResolver.
 *   2. Jest: require('../conflict-resolver.js'). Exposes module.exports.
 *
 * Pure functions (pruneMissingRecords, applyResolution, entityDisplayName,
 * formatValueForButton) have no DOM dependencies and are fully testable.
 * Rendering functions use the DOM and are tested manually.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ConflictResolver = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  function _findRecord(state, entityType, entityId, parentId) {
    if (entityType === 'settings') return state || null;
    var colKey = {
      ingredient: 'ingredients',
      recipe: 'recipes',
      supplier: 'suppliers',
    }[entityType];
    if (colKey) {
      return (state[colKey] || []).find(function (r) { return r && r.id === entityId; }) || null;
    }
    if (entityType === 'recipeIngredient' || entityType === 'subRecipe') {
      var parent = (state.recipes || []).find(function (r) { return r && r.id === parentId; });
      if (!parent) return null;
      var arrKey = entityType === 'recipeIngredient' ? 'ingredients' : 'subRecipes';
      var idKey = entityType === 'recipeIngredient' ? 'ingId' : 'recipeId';
      return (parent[arrKey] || []).find(function (r) { return r && r[idKey] === entityId; }) || null;
    }
    return null;
  }

  function pruneMissingRecords(queue, state) {
    if (!Array.isArray(queue) || queue.length === 0) return [];
    return queue.filter(function (c) {
      if (c.entityType === 'settings') return true; // settings always present
      return _findRecord(state, c.entityType, c.entityId, c.parentId) !== null;
    });
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    pruneMissingRecords: pruneMissingRecords,
    _findRecord: _findRecord,
  };
}));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --testPathPattern=conflict-resolver`
Expected: PASS — 7 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/conflict-resolver.js src/__tests__/conflict-resolver.test.js
git commit -m "feat(conflict-resolver): scaffold UMD module + pruneMissingRecords"
```

---

## Task 4: `applyResolution` pure function

**Files:**
- Modify: `src/conflict-resolver.js`
- Modify: `src/__tests__/conflict-resolver.test.js`

The mutating core: given a state object, a conflict, a winner (`'local'` | `'remote'`), and a device name, write the winning value into the target record, stamp `_modifiedAt`/`_modifiedBy`, bump parent `_modifiedAt` for nested, and return the audit entry to log. On missing record, return `{ error: 'missing' }` with no mutation.

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/conflict-resolver.test.js`:

```javascript
describe('applyResolution', () => {
  test('local winner writes localValue and stamps the record', () => {
    var state = mkState({ ingredients: [{ id: 'a', name: 'Cucumber', packCost: 2.5 }] });
    var conflict = mkConflict();
    var result = ConflictResolver.applyResolution(state, conflict, 'local', 'This device');
    expect(result.error).toBeUndefined();
    expect(state.ingredients[0].packCost).toBe(2.5);
    expect(state.ingredients[0]._modifiedBy).toBe('This device');
    expect(typeof state.ingredients[0]._modifiedAt).toBe('string');
    expect(result.auditEntry.op).toBe('resolve-conflict');
    expect(result.auditEntry.before).toBe(2.75); // losing value
    expect(result.auditEntry.after).toBe(2.5);   // winning value
    expect(result.auditEntry.conflictId).toBe('c1');
    expect(result.auditEntry.entity).toBe('ingredient');
    expect(result.auditEntry.entityId).toBe('a');
    expect(result.auditEntry.field).toBe('packCost');
    expect(result.auditEntry.entityName).toBe('Cucumber');
  });

  test('remote winner writes remoteValue', () => {
    var state = mkState({ ingredients: [{ id: 'a', name: 'Cucumber', packCost: 2.5 }] });
    var result = ConflictResolver.applyResolution(state, mkConflict(), 'remote', 'This device');
    expect(state.ingredients[0].packCost).toBe(2.75);
    expect(result.auditEntry.before).toBe(2.5);
    expect(result.auditEntry.after).toBe(2.75);
  });

  test('nested recipeIngredient: writes to row and bumps parent _modifiedAt', () => {
    var state = mkState({
      recipes: [{
        id: 'r1', name: 'Carbonara', _modifiedAt: '2026-04-01T00:00:00Z',
        ingredients: [{ ingId: 'ing1', qty: 200 }],
      }],
      ingredients: [{ id: 'ing1', name: 'Pecorino' }],
    });
    var conflict = mkConflict({
      entityType: 'recipeIngredient', entityId: 'ing1', parentId: 'r1',
      field: 'qty', localValue: 200, remoteValue: 300,
    });
    var result = ConflictResolver.applyResolution(state, conflict, 'remote', 'This device');
    expect(state.recipes[0].ingredients[0].qty).toBe(300);
    expect(state.recipes[0]._modifiedAt).not.toBe('2026-04-01T00:00:00Z');
    expect(result.auditEntry.entity).toBe('recipeIngredient');
    expect(result.auditEntry.parentId).toBe('r1');
    expect(result.auditEntry.entityName).toBe('Pecorino');
  });

  test('nested subRecipe: writes to row via recipeId lookup', () => {
    var state = mkState({
      recipes: [
        { id: 'r1', name: 'Parent', subRecipes: [{ recipeId: 'r2', portions: 1 }] },
        { id: 'r2', name: 'Sub' },
      ],
    });
    var conflict = mkConflict({
      entityType: 'subRecipe', entityId: 'r2', parentId: 'r1',
      field: 'portions', localValue: 1, remoteValue: 2,
    });
    var result = ConflictResolver.applyResolution(state, conflict, 'remote', 'This device');
    expect(state.recipes[0].subRecipes[0].portions).toBe(2);
    expect(result.auditEntry.entityName).toBe('Sub');
  });

  test('settings conflict: writes to top-level state field', () => {
    var state = mkState({ vatRate: 20 });
    var conflict = mkConflict({
      entityType: 'settings', entityId: 'vatRate', field: 'vatRate',
      localValue: 20, remoteValue: 5,
    });
    var result = ConflictResolver.applyResolution(state, conflict, 'remote', 'This device');
    expect(state.vatRate).toBe(5);
    expect(result.auditEntry.entity).toBe('settings');
  });

  test('missing top-level record returns { error: "missing" } without mutation', () => {
    var state = mkState();
    var before = JSON.stringify(state);
    var result = ConflictResolver.applyResolution(state, mkConflict(), 'local', 'This device');
    expect(result.error).toBe('missing');
    expect(result.auditEntry).toBeUndefined();
    expect(JSON.stringify(state)).toBe(before);
  });

  test('missing parent recipe returns { error: "missing" }', () => {
    var state = mkState();
    var conflict = mkConflict({ entityType: 'recipeIngredient', entityId: 'ing1', parentId: 'r1', field: 'qty' });
    expect(ConflictResolver.applyResolution(state, conflict, 'local', 'D').error).toBe('missing');
  });

  test('missing nested row returns { error: "missing" }', () => {
    var state = mkState({ recipes: [{ id: 'r1', name: 'R', ingredients: [] }] });
    var conflict = mkConflict({ entityType: 'recipeIngredient', entityId: 'ing1', parentId: 'r1', field: 'qty' });
    expect(ConflictResolver.applyResolution(state, conflict, 'local', 'D').error).toBe('missing');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --testPathPattern=conflict-resolver`
Expected: FAIL — `applyResolution is not a function`.

- [ ] **Step 3: Implement `applyResolution`**

In `src/conflict-resolver.js`, add this function before the `return { … }` block:

```javascript
  function _deepClone(v) {
    if (v === null || typeof v !== 'object') return v;
    return JSON.parse(JSON.stringify(v));
  }

  function _uuid() {
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function _entityNameFor(state, conflict) {
    if (conflict.entityType === 'settings') return 'Settings';
    if (conflict.entityType === 'ingredient') {
      var ing = (state.ingredients || []).find(function (r) { return r && r.id === conflict.entityId; });
      return (ing && ing.name) || conflict.entityId;
    }
    if (conflict.entityType === 'recipe') {
      var rec = (state.recipes || []).find(function (r) { return r && r.id === conflict.entityId; });
      return (rec && rec.name) || conflict.entityId;
    }
    if (conflict.entityType === 'supplier') {
      var sup = (state.suppliers || []).find(function (r) { return r && r.id === conflict.entityId; });
      return (sup && sup.name) || conflict.entityId;
    }
    if (conflict.entityType === 'recipeIngredient') {
      var linked = (state.ingredients || []).find(function (r) { return r && r.id === conflict.entityId; });
      return (linked && linked.name) || conflict.entityId;
    }
    if (conflict.entityType === 'subRecipe') {
      var linkedR = (state.recipes || []).find(function (r) { return r && r.id === conflict.entityId; });
      return (linkedR && linkedR.name) || conflict.entityId;
    }
    return conflict.entityId;
  }

  function applyResolution(state, conflict, winner, deviceName) {
    var nowIso = new Date().toISOString();
    var winningValue = winner === 'local' ? conflict.localValue : conflict.remoteValue;
    var losingValue  = winner === 'local' ? conflict.remoteValue : conflict.localValue;
    var device = deviceName || 'Unknown';

    // Settings
    if (conflict.entityType === 'settings') {
      state[conflict.field] = _deepClone(winningValue);
      return {
        record: state,
        auditEntry: {
          id: _uuid(),
          ts: nowIso,
          device: device,
          op: 'resolve-conflict',
          entity: 'settings',
          entityId: conflict.entityId,
          entityName: 'Settings',
          field: conflict.field,
          before: _deepClone(losingValue),
          after: _deepClone(winningValue),
          conflictId: conflict.id,
        },
      };
    }

    // Top-level collection
    var colKey = {
      ingredient: 'ingredients',
      recipe: 'recipes',
      supplier: 'suppliers',
    }[conflict.entityType];
    if (colKey) {
      var list = state[colKey] || [];
      var record = list.find(function (r) { return r && r.id === conflict.entityId; });
      if (!record) return { error: 'missing' };
      record[conflict.field] = _deepClone(winningValue);
      record._modifiedAt = nowIso;
      record._modifiedBy = device;
      return {
        record: record,
        auditEntry: {
          id: _uuid(),
          ts: nowIso,
          device: device,
          op: 'resolve-conflict',
          entity: conflict.entityType,
          entityId: conflict.entityId,
          entityName: _entityNameFor(state, conflict),
          field: conflict.field,
          before: _deepClone(losingValue),
          after: _deepClone(winningValue),
          conflictId: conflict.id,
        },
      };
    }

    // Nested
    if (conflict.entityType === 'recipeIngredient' || conflict.entityType === 'subRecipe') {
      var parent = (state.recipes || []).find(function (r) { return r && r.id === conflict.parentId; });
      if (!parent) return { error: 'missing' };
      var arrKey = conflict.entityType === 'recipeIngredient' ? 'ingredients' : 'subRecipes';
      var idKey  = conflict.entityType === 'recipeIngredient' ? 'ingId' : 'recipeId';
      var rows = parent[arrKey] || [];
      var row = rows.find(function (r) { return r && r[idKey] === conflict.entityId; });
      if (!row) return { error: 'missing' };
      row[conflict.field] = _deepClone(winningValue);
      parent._modifiedAt = nowIso;
      parent._modifiedBy = device;
      return {
        record: row,
        auditEntry: {
          id: _uuid(),
          ts: nowIso,
          device: device,
          op: 'resolve-conflict',
          entity: conflict.entityType,
          entityId: conflict.entityId,
          entityName: _entityNameFor(state, conflict),
          parentId: conflict.parentId,
          field: conflict.field,
          before: _deepClone(losingValue),
          after: _deepClone(winningValue),
          conflictId: conflict.id,
        },
      };
    }

    return { error: 'missing' };
  }
```

Add `applyResolution` to the exports:

```javascript
  return {
    pruneMissingRecords: pruneMissingRecords,
    applyResolution: applyResolution,
    _findRecord: _findRecord,
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --testPathPattern=conflict-resolver`
Expected: PASS — 7 prune tests + 8 applyResolution tests = 15 in this suite.

- [ ] **Step 5: Commit**

```bash
git add src/conflict-resolver.js src/__tests__/conflict-resolver.test.js
git commit -m "feat(conflict-resolver): applyResolution for top-level + nested + settings"
```

---

## Task 5: Display helpers — `entityDisplayName` and `formatValueForButton`

**Files:**
- Modify: `src/conflict-resolver.js`
- Modify: `src/__tests__/conflict-resolver.test.js`

`entityDisplayName(state, conflict)` builds the row label (`Pasta Carbonara › pecorino qty`, `Settings · vatRate`, etc.). `formatValueForButton(v)` converts a value to the short string shown on each "Keep X" button.

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/conflict-resolver.test.js`:

```javascript
describe('entityDisplayName', () => {
  test('top-level ingredient', () => {
    var state = mkState({ ingredients: [{ id: 'a', name: 'Cucumber' }] });
    expect(ConflictResolver.entityDisplayName(state, mkConflict())).toBe('Cucumber · packCost');
  });

  test('top-level supplier', () => {
    var state = mkState({ suppliers: [{ id: 's1', name: 'Brakes' }] });
    var c = mkConflict({ entityType: 'supplier', entityId: 's1', field: 'contactPhone' });
    expect(ConflictResolver.entityDisplayName(state, c)).toBe('Brakes · contactPhone');
  });

  test('nested recipeIngredient', () => {
    var state = mkState({
      recipes: [{ id: 'r1', name: 'Carbonara', ingredients: [{ ingId: 'ing1', qty: 200 }] }],
      ingredients: [{ id: 'ing1', name: 'Pecorino' }],
    });
    var c = mkConflict({ entityType: 'recipeIngredient', entityId: 'ing1', parentId: 'r1', field: 'qty' });
    expect(ConflictResolver.entityDisplayName(state, c)).toBe('Carbonara › Pecorino qty');
  });

  test('nested subRecipe', () => {
    var state = mkState({
      recipes: [
        { id: 'r1', name: 'Parent', subRecipes: [{ recipeId: 'r2', portions: 1 }] },
        { id: 'r2', name: 'Sub' },
      ],
    });
    var c = mkConflict({ entityType: 'subRecipe', entityId: 'r2', parentId: 'r1', field: 'portions' });
    expect(ConflictResolver.entityDisplayName(state, c)).toBe('Parent › Sub portions');
  });

  test('fallback to id when parent missing', () => {
    var state = mkState();
    var c = mkConflict({ entityType: 'recipeIngredient', entityId: 'ing1', parentId: 'r1', field: 'qty' });
    expect(ConflictResolver.entityDisplayName(state, c)).toBe('r1 › ing1 qty');
  });

  test('fallback to id when linked ingredient missing', () => {
    var state = mkState({
      recipes: [{ id: 'r1', name: 'Carbonara', ingredients: [{ ingId: 'ing1', qty: 200 }] }],
    });
    var c = mkConflict({ entityType: 'recipeIngredient', entityId: 'ing1', parentId: 'r1', field: 'qty' });
    expect(ConflictResolver.entityDisplayName(state, c)).toBe('Carbonara › ing1 qty');
  });

  test('settings', () => {
    var c = mkConflict({ entityType: 'settings', entityId: 'vatRate', field: 'vatRate' });
    expect(ConflictResolver.entityDisplayName(mkState(), c)).toBe('Settings · vatRate');
  });
});

describe('formatValueForButton', () => {
  test('short string is quoted', () => {
    expect(ConflictResolver.formatValueForButton('hello')).toBe('"hello"');
  });
  test('long string is truncated with ellipsis', () => {
    var s = 'x'.repeat(60);
    var out = ConflictResolver.formatValueForButton(s);
    expect(out.length).toBeLessThanOrEqual(43); // 2 quotes + 40 chars + … ≈ 43
    expect(out).toContain('…');
  });
  test('number', () => {
    expect(ConflictResolver.formatValueForButton(2.5)).toBe('2.5');
  });
  test('boolean', () => {
    expect(ConflictResolver.formatValueForButton(true)).toBe('Yes');
    expect(ConflictResolver.formatValueForButton(false)).toBe('No');
  });
  test('array', () => {
    expect(ConflictResolver.formatValueForButton([1, 2, 3])).toBe('[3 items]');
  });
  test('object', () => {
    expect(ConflictResolver.formatValueForButton({ a: 1 })).toBe('{object}');
  });
  test('null, undefined, empty string', () => {
    expect(ConflictResolver.formatValueForButton(null)).toBe('(empty)');
    expect(ConflictResolver.formatValueForButton(undefined)).toBe('(empty)');
    expect(ConflictResolver.formatValueForButton('')).toBe('(empty)');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --testPathPattern=conflict-resolver`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Implement both helpers**

In `src/conflict-resolver.js`, add before the `return { … }` block:

```javascript
  function entityDisplayName(state, conflict) {
    var et = conflict.entityType;
    if (et === 'settings') return 'Settings · ' + conflict.field;

    if (et === 'ingredient' || et === 'recipe' || et === 'supplier') {
      var colKey = { ingredient: 'ingredients', recipe: 'recipes', supplier: 'suppliers' }[et];
      var rec = (state[colKey] || []).find(function (r) { return r && r.id === conflict.entityId; });
      return ((rec && rec.name) || conflict.entityId) + ' · ' + conflict.field;
    }

    if (et === 'recipeIngredient' || et === 'subRecipe') {
      var parent = (state.recipes || []).find(function (r) { return r && r.id === conflict.parentId; });
      var parentName = (parent && parent.name) || conflict.parentId;
      var linkedList = et === 'recipeIngredient' ? state.ingredients : state.recipes;
      var linked = (linkedList || []).find(function (r) { return r && r.id === conflict.entityId; });
      var linkedName = (linked && linked.name) || conflict.entityId;
      return parentName + ' › ' + linkedName + ' ' + conflict.field;
    }

    return conflict.entityId + ' · ' + conflict.field;
  }

  function formatValueForButton(v) {
    if (v === null || v === undefined || v === '') return '(empty)';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') {
      if (v.length > 40) return '"' + v.slice(0, 40) + '…';
      return '"' + v + '"';
    }
    if (Array.isArray(v)) return '[' + v.length + ' items]';
    if (typeof v === 'object') return '{object}';
    return String(v);
  }
```

Update exports:

```javascript
  return {
    pruneMissingRecords: pruneMissingRecords,
    applyResolution: applyResolution,
    entityDisplayName: entityDisplayName,
    formatValueForButton: formatValueForButton,
    _findRecord: _findRecord,
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --testPathPattern=conflict-resolver`
Expected: PASS — 15 prior + 7 entityDisplayName + 7 formatValueForButton = 29 in this suite.

- [ ] **Step 5: Commit**

```bash
git add src/conflict-resolver.js src/__tests__/conflict-resolver.test.js
git commit -m "feat(conflict-resolver): entityDisplayName + formatValueForButton helpers"
```

---

## Task 6: HTML skeleton — badge, modal, script tag

**Files:**
- Modify: `src/index.html`

Add the badge inline with the sync status area, add the resolver modal skeleton at the bottom of the file next to the other modals, and load the script after `activity-view.js`.

- [ ] **Step 1: Add the badge**

In `src/index.html`, find the sync-status div (line 686 — `<div id="sync-status" …>`). Immediately after the closing `</div>` of `sync-status`, insert:

```html
          <div id="conflict-badge" class="hidden" style="font-size:12px;margin-bottom:10px;display:inline-flex;align-items:center;gap:6px;background:var(--red);color:white;padding:4px 10px;border-radius:12px;cursor:pointer" onclick="ConflictResolver.openResolver()" title="Resolve sync conflicts">
            <span>⚠</span><span id="conflict-badge-count">0</span><span>conflict(s) pending</span>
          </div>
```

Note: `class="hidden"` (not `modal-overlay hidden`) — this is inline in a panel, not a modal. The `hidden` utility class sets `display:none` in the existing stylesheet.

- [ ] **Step 2: Add the resolver modal**

Find the other modals near the bottom of the file. After `<div id="revert-confirm-modal" class="modal-overlay hidden" …>` and its closing `</div>`, insert a new block:

```html
<div id="conflict-resolver-modal" class="modal-overlay hidden" style="z-index:1001">
  <div class="modal" style="max-width:720px;width:90%">
    <div class="modal-header">
      <h3 id="conflict-resolver-title">Pending Conflicts</h3>
      <button class="modal-close" onclick="ConflictResolver.closeResolver()">✕</button>
    </div>
    <div class="modal-body" style="padding:0">
      <div style="display:flex;gap:8px;padding:12px 16px;border-bottom:1px solid var(--border)">
        <button class="btn-secondary btn-sm" onclick="ConflictResolver.resolveAll('local')">Keep all local</button>
        <button class="btn-secondary btn-sm" onclick="ConflictResolver.resolveAll('remote')">Keep all remote</button>
      </div>
      <div id="conflict-resolver-list" style="max-height:60vh;overflow-y:auto"></div>
    </div>
  </div>
</div>
```

If `modal-header` / `modal-close` / `modal` / `modal-body` classes are not present in the existing stylesheet used by other modals (e.g. `revert-confirm-modal`), inspect that modal's markup around line 1027 and copy its exact structural classes instead. The requirement: the modal opens/closes by toggling the `hidden` class on `#conflict-resolver-modal`.

- [ ] **Step 3: Add the script tag**

Find the existing block (introduced in Phase 3):

```html
<script src="audit.js"></script>
<script src="activity-view.js"></script>
<script src="sync-engine.js"></script>
<script src="app.js"></script>
```

Insert `conflict-resolver.js` after `sync-engine.js`:

```html
<script src="audit.js"></script>
<script src="activity-view.js"></script>
<script src="sync-engine.js"></script>
<script src="conflict-resolver.js"></script>
<script src="app.js"></script>
```

- [ ] **Step 4: Verify the test suite still passes**

Run: `npm test`
Expected: no change in test count — 166 (after Tasks 1–2) + 29 (conflict-resolver) = 195 passing. (HTML changes don't affect Jest.)

- [ ] **Step 5: Commit**

```bash
git add src/index.html
git commit -m "feat(conflict-resolver): add badge, modal skeleton, script tag"
```

---

## Task 7: DOM rendering — `renderBadge`, `render`, `openResolver`, `closeResolver`

**Files:**
- Modify: `src/conflict-resolver.js`

No unit tests — DOM rendering is exercised manually (same convention as Phase 2 Activity View). The functions read from `window._conflictQueue` and `window.state`, and manipulate `#conflict-badge`, `#conflict-badge-count`, `#conflict-resolver-modal`, and `#conflict-resolver-list`.

- [ ] **Step 1: Add the DOM functions**

In `src/conflict-resolver.js`, before the `return { … }` block, add:

```javascript
  function _escHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function _relativeTime(ts) {
    if (typeof window !== 'undefined' && window.ActivityView && window.ActivityView.relativeTime) {
      return window.ActivityView.relativeTime(ts);
    }
    return ts || '';
  }

  function _deviceLabel(name, currentDevice) {
    if (!name) return 'Unknown device';
    if (name === currentDevice) return 'This device';
    return name;
  }

  function formatRow(conflict, state, currentDevice) {
    var label = entityDisplayName(state, conflict);
    var localBtn = formatValueForButton(conflict.localValue);
    var remoteBtn = formatValueForButton(conflict.remoteValue);
    var localDev = _deviceLabel(conflict.localModifiedBy, currentDevice);
    var remoteDev = _deviceLabel(conflict.remoteModifiedBy, currentDevice);
    var localWhen = _relativeTime(conflict.localModifiedAt);
    var remoteWhen = _relativeTime(conflict.remoteModifiedAt);

    var localTitle = typeof conflict.localValue === 'string' ? _escHtml(conflict.localValue) : _escHtml(JSON.stringify(conflict.localValue));
    var remoteTitle = typeof conflict.remoteValue === 'string' ? _escHtml(conflict.remoteValue) : _escHtml(JSON.stringify(conflict.remoteValue));

    return (
      '<div class="conflict-row" data-conflict-id="' + _escHtml(conflict.id) + '" ' +
      'style="padding:12px 16px;border-bottom:1px solid var(--border)">' +
        '<div style="font-weight:600;margin-bottom:4px">' + _escHtml(label) + '</div>' +
        '<div style="display:flex;gap:24px;font-size:11px;color:var(--text-muted);margin-bottom:8px">' +
          '<div style="flex:1">' + _escHtml(localDev) + ' · ' + _escHtml(localWhen) + '</div>' +
          '<div style="flex:1">' + _escHtml(remoteDev) + ' · ' + _escHtml(remoteWhen) + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn-secondary btn-sm" style="flex:1;text-align:left" ' +
            'title="' + localTitle + '" ' +
            'onclick="ConflictResolver.resolveConflict(\'' + _escHtml(conflict.id) + '\',\'local\')">' +
            'Keep ' + _escHtml(localBtn) +
          '</button>' +
          '<button class="btn-secondary btn-sm" style="flex:1;text-align:left" ' +
            'title="' + remoteTitle + '" ' +
            'onclick="ConflictResolver.resolveConflict(\'' + _escHtml(conflict.id) + '\',\'remote\')">' +
            'Keep ' + _escHtml(remoteBtn) +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function renderBadge() {
    if (typeof document === 'undefined') return;
    var badge = document.getElementById('conflict-badge');
    if (!badge) return;
    var queue = (typeof window !== 'undefined' && window._conflictQueue) || [];
    var count = queue.length;
    var countEl = document.getElementById('conflict-badge-count');
    if (countEl) countEl.textContent = String(count);
    if (count > 0) badge.classList.remove('hidden');
    else badge.classList.add('hidden');
  }

  function render() {
    if (typeof document === 'undefined') return;
    var list = document.getElementById('conflict-resolver-list');
    if (!list) return;
    var state = (typeof window !== 'undefined' && window.state) || {};
    var queue = (typeof window !== 'undefined' && window._conflictQueue) || [];
    var currentDevice = (typeof window !== 'undefined' && window._getDeviceName && window._getDeviceName()) || '';

    var title = document.getElementById('conflict-resolver-title');
    if (title) title.textContent = 'Pending Conflicts (' + queue.length + ')';

    if (queue.length === 0) {
      list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted)">No conflicts pending ✓</div>';
      return;
    }
    list.innerHTML = queue.map(function (c) { return formatRow(c, state, currentDevice); }).join('');
  }

  function openResolver() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    var queue = window._conflictQueue || [];
    var state = window.state || {};
    var pruned = pruneMissingRecords(queue, state);
    if (pruned.length !== queue.length && window._saveConflictQueue) {
      window._saveConflictQueue(pruned);
    }
    var modal = document.getElementById('conflict-resolver-modal');
    if (modal) modal.classList.remove('hidden');
    render();
    renderBadge();
  }

  function closeResolver() {
    if (typeof document === 'undefined') return;
    var modal = document.getElementById('conflict-resolver-modal');
    if (modal) modal.classList.add('hidden');
  }
```

Update exports:

```javascript
  return {
    pruneMissingRecords: pruneMissingRecords,
    applyResolution: applyResolution,
    entityDisplayName: entityDisplayName,
    formatValueForButton: formatValueForButton,
    formatRow: formatRow,
    renderBadge: renderBadge,
    render: render,
    openResolver: openResolver,
    closeResolver: closeResolver,
    _findRecord: _findRecord,
  };
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: still 195 passing (DOM functions don't have new tests; existing tests unaffected).

- [ ] **Step 3: Commit**

```bash
git add src/conflict-resolver.js
git commit -m "feat(conflict-resolver): DOM render (badge, modal, row)"
```

---

## Task 8: `resolveConflict` (per-row wiring)

**Files:**
- Modify: `src/conflict-resolver.js`

Adds the per-row resolution flow: lookup conflict, call `applyResolution`, handle missing, append audit entry, drop from queue, `save()`, re-render, close-if-empty.

- [ ] **Step 1: Add `resolveConflict`**

In `src/conflict-resolver.js`, before the `return { … }` block:

```javascript
  async function resolveConflict(conflictId, winner) {
    if (typeof window === 'undefined') return;
    var queue = (window._conflictQueue || []).slice();
    var idx = queue.findIndex(function (c) { return c && c.id === conflictId; });
    if (idx === -1) { render(); renderBadge(); return; }
    var conflict = queue[idx];

    var state = window.state;
    var deviceName = (window._getDeviceName && window._getDeviceName()) || 'Unknown';

    var result = applyResolution(state, conflict, winner, deviceName);
    if (result.error === 'missing') {
      queue.splice(idx, 1);
      if (window._saveConflictQueue) window._saveConflictQueue(queue);
      if (window.showToast) window.showToast('Record no longer exists — removed from queue', 'info', 3000);
      render(); renderBadge();
      return;
    }

    if (window.Audit && window.Audit.appendLogEntries) {
      window.Audit.appendLogEntries(state, [result.auditEntry]);
    } else if (state && Array.isArray(state.auditLog)) {
      state.auditLog.push(result.auditEntry);
    }

    queue.splice(idx, 1);
    if (window._saveConflictQueue) window._saveConflictQueue(queue);

    try {
      if (window.refreshAuditSnapshot) window.refreshAuditSnapshot();
      if (window.save) await window.save();
      if (window.refreshAuditSnapshot) window.refreshAuditSnapshot();
    } catch (e) {
      console.error('[ConflictResolver] save failed', e);
    }

    render(); renderBadge();

    if (queue.length === 0) {
      if (window.showToast) window.showToast('✓ All conflicts resolved', 'success', 2000);
      setTimeout(closeResolver, 800);
    }
  }
```

Update exports to add `resolveConflict: resolveConflict,`.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: 195 passing (no new tests; existing unaffected).

- [ ] **Step 3: Commit**

```bash
git add src/conflict-resolver.js
git commit -m "feat(conflict-resolver): resolveConflict per-row wiring"
```

---

## Task 9: `resolveAll` (bulk wiring)

**Files:**
- Modify: `src/conflict-resolver.js`

Bulk flow: confirm via `window.showConfirm`, iterate the queue calling `applyResolution`, collect audit entries, count skipped, clear queue, single `save()`, toast, close modal.

- [ ] **Step 1: Add `resolveAll`**

In `src/conflict-resolver.js`, before the `return { … }` block:

```javascript
  async function resolveAll(winner) {
    if (typeof window === 'undefined') return;
    var queue = (window._conflictQueue || []).slice();
    if (queue.length === 0) { render(); renderBadge(); return; }

    var label = winner === 'local' ? 'this device' : 'remote devices';
    if (window.showConfirm) {
      var ok = await window.showConfirm(
        'Resolve ' + queue.length + ' conflicts',
        'Keep all values from ' + label + '? This will overwrite ' + queue.length + ' record(s).'
      );
      if (!ok) return;
    }

    var state = window.state;
    var deviceName = (window._getDeviceName && window._getDeviceName()) || 'Unknown';
    var applied = 0;
    var skipped = 0;
    var auditEntries = [];

    for (var i = 0; i < queue.length; i++) {
      var r = applyResolution(state, queue[i], winner, deviceName);
      if (r.error === 'missing') { skipped++; continue; }
      auditEntries.push(r.auditEntry);
      applied++;
    }

    if (auditEntries.length) {
      if (window.Audit && window.Audit.appendLogEntries) {
        window.Audit.appendLogEntries(state, auditEntries);
      } else if (state && Array.isArray(state.auditLog)) {
        for (var j = 0; j < auditEntries.length; j++) state.auditLog.push(auditEntries[j]);
      }
    }

    if (window._saveConflictQueue) window._saveConflictQueue([]);

    try {
      if (window.refreshAuditSnapshot) window.refreshAuditSnapshot();
      if (window.save) await window.save();
      if (window.refreshAuditSnapshot) window.refreshAuditSnapshot();
    } catch (e) {
      console.error('[ConflictResolver] save failed', e);
    }

    render(); renderBadge();

    var msg = 'Resolved ' + applied + ' conflict' + (applied === 1 ? '' : 's');
    if (skipped) msg += ' · ' + skipped + ' skipped (records deleted)';
    if (window.showToast) window.showToast(msg, 'success', 3000);
    setTimeout(closeResolver, 800);
  }
```

Update exports to add `resolveAll: resolveAll,`.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: 195 passing.

- [ ] **Step 3: Commit**

```bash
git add src/conflict-resolver.js
git commit -m "feat(conflict-resolver): resolveAll bulk wiring"
```

---

## Task 10: `app.js` wiring — renderBadge at five sites, expose `window.save` / `window._saveConflictQueue`

**Files:**
- Modify: `src/app.js`

`ConflictResolver` depends on `window.save`, `window.showToast`, `window.showConfirm`, `window._saveConflictQueue`, `window._getDeviceName`, `window.refreshAuditSnapshot`, `window.state`, `window._conflictQueue`. Verify or expose each, and call `ConflictResolver.renderBadge()` at the five update sites.

- [ ] **Step 1: Expose `save`, `showToast`, `showConfirm`, `_getDeviceName` on `window`**

In `src/app.js`, locate where these functions are defined. Each is currently a top-level `function` declaration in a script-tag context, so they are globally reachable — but access via `window.X` depends on how the file is wrapped. Use Grep:

```
Grep: ^\s*window\.(save|showToast|showConfirm|_getDeviceName|refreshAuditSnapshot)\s*=
```

If zero matches, insert a single block near the bottom of `app.js` (after all function declarations, near where `_loadConflictQueue()` is called during boot):

```javascript
// ─── Expose helpers needed by conflict-resolver.js ────────────────────────
window.save = save;
window.showToast = showToast;
window.showConfirm = showConfirm;
window._getDeviceName = _getDeviceName;
window._saveConflictQueue = _saveConflictQueue;
window.refreshAuditSnapshot = (typeof refreshAuditSnapshot === 'function') ? refreshAuditSnapshot : null;
```

If some are already on `window`, only add the missing ones.

- [ ] **Step 2: Call `renderBadge()` at app boot**

Find the boot code — Grep for `_loadConflictQueue();`. Immediately after that call, add:

```javascript
    if (window.ConflictResolver && window.ConflictResolver.renderBadge) {
      window.ConflictResolver.renderBadge();
    }
```

- [ ] **Step 3: Call `renderBadge()` at the end of `runSyncNow`**

Find `_saveConflictQueue(reconciled);` inside `runSyncNow` (the line that persists the reconciled queue after merging). Directly after it, add:

```javascript
      if (window.ConflictResolver && window.ConflictResolver.renderBadge) {
        window.ConflictResolver.renderBadge();
      }
```

Also add the same block at the end of `runSyncNow`'s `try` body, just before the final `_renderSyncUI();` call, to catch the toast-or-conflict branch. (If `_saveConflictQueue(reconciled)` already runs on every merge path, the second call may be redundant — harmless, but a single call after the full flow is clearer. If you prefer one call, put it right before `_renderSyncUI();` only.)

- [ ] **Step 4: Call `renderBadge()` at the end of `_checkSyncOnStartup`**

Find `_checkSyncOnStartup`'s final lines — the block that ends with `if (reconciled.length) _conflictSummaryToast(reconciled.length);`. Directly after that line, add:

```javascript
    if (window.ConflictResolver && window.ConflictResolver.renderBadge) {
      window.ConflictResolver.renderBadge();
    }
```

- [ ] **Step 5: Call `renderBadge()` when Settings view is rendered**

Grep for the function that renders the Settings view — likely `_renderSyncUI()` or a broader `renderSettings()`. The objective: every time the Settings view becomes visible, `renderBadge()` runs (covers the case of closing the resolver and returning to Settings).

If `_renderSyncUI()` exists, at the end of its body add:

```javascript
  if (window.ConflictResolver && window.ConflictResolver.renderBadge) {
    window.ConflictResolver.renderBadge();
  }
```

If no obvious single Settings-render function exists, instead add the call inside the view-switching code that shows the Settings section (Grep for `activity-log-panel` or `settings-view` to find the handler). One call in the right place beats three duplicates in slightly-wrong places.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: 195 passing (no test changes; this is glue).

- [ ] **Step 7: Commit**

```bash
git add src/app.js
git commit -m "feat(conflict-resolver): wire badge updates + expose helpers on window"
```

---

## Task 11: Final regression sweep + manual exercise

**Files:** none modified — verification only.

- [ ] **Step 1: Run the full Jest suite**

Run: `npm test`
Expected: 195 tests passing across 7 suites (`audit`, `audit-migration`, `audit-revert`, `activity-view`, `costing`, `sync-engine`, `conflict-resolver`).

- [ ] **Step 2: Manual exercise checklist**

Launch: `npm start`.

- [ ] **Badge appears when queue non-empty.** Create a field-conflict on two devices (edit same ingredient field, sync both). Toast shows "N conflicts pending". Badge `⚠ 1 conflict(s) pending` appears in Settings next to Sync Now.
- [ ] **Badge hidden when queue empty.** After resolution, badge disappears. On fresh boot with empty queue, badge is hidden.
- [ ] **Click badge opens modal.** Modal shows title "Pending Conflicts (N)", bulk bar with two buttons, one row per conflict, each with entity label, device/time pair, two "Keep X" buttons.
- [ ] **Row data is correct.** Local side says "This device" and the correct relative time; remote side shows the other device's name; value buttons show the two competing values.
- [ ] **Per-row Keep local / Keep remote applies.** Click a button → row disappears; the ingredient's value in the library matches the chosen side; Activity View shows a new `⚖ Resolved conflict on …` entry with before→after diff; badge count decrements.
- [ ] **Revert the resolve-conflict entry.** In Activity View, click the revert button on the `resolve-conflict` entry → field returns to the losing value; a `restore` entry is logged.
- [ ] **Bulk "Keep all remote" with confirmation.** Queue three conflicts, click `Keep all remote` → confirmation dialog appears → confirm → three rows clear, a single toast `Resolved 3 conflicts` appears, three `resolve-conflict` audit entries logged; badge clears; modal auto-closes.
- [ ] **Stale-prune on open.** Manually queue a conflict referencing a nonexistent ingredient id (via DevTools: `window._conflictQueue.push({ id: 'stale', kind: 'field-conflict', entityType: 'ingredient', entityId: 'DOES-NOT-EXIST', field: 'packCost', localValue: 1, remoteValue: 2 })` + `window._saveConflictQueue(window._conflictQueue)`). Close and re-click the badge → the stale entry does not appear in the list; badge count reflects the prune.
- [ ] **Empty state.** With an empty queue, call `ConflictResolver.openResolver()` manually in DevTools → modal shows "No conflicts pending ✓" and closes itself.
- [ ] **Phase 1/2/3 regression.** Edit → save → Activity View shows the update → revert it → it restores. Trigger a sync → auto-sync still pushes. Phase 3's two-device checklist from `docs/superpowers/plans/2026-04-17-sync-merge-engine-phase3.md` §Task 14 Step 2 still passes.

- [ ] **Step 3: Commit the completion marker**

```bash
git commit --allow-empty -m "chore: Phase 4 conflict resolver UI complete"
```

---

## Summary

After all tasks:
- `src/conflict-resolver.js` — UMD module with `pruneMissingRecords`, `applyResolution`, `entityDisplayName`, `formatValueForButton`, plus DOM layer (`render`, `renderBadge`, `openResolver`, `closeResolver`, `resolveConflict`, `resolveAll`, `formatRow`)
- `src/__tests__/conflict-resolver.test.js` — 29 unit tests covering every pure-function branch
- `src/audit.js` + `src/activity-view.js` — `resolve-conflict` op is revertible and formatted with `⚖` icon + before→after diff
- `src/index.html` — badge inline with Sync status, resolver modal at the bottom, script tag wired in
- `src/app.js` — `renderBadge()` runs on boot and after every queue-changing action; badge click opens the resolver
- ~195 total tests passing; conflict queue stays device-local (`localStorage`)
