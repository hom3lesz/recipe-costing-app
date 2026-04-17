# Activity View Phase 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the audit log in a browsable, filterable Activity View panel inside Settings, add per-record History tabs to ingredient/recipe/supplier modals, and provide single-entry revert with smart confirmation.

**Architecture:** A new `src/activity-view.js` UMD module (same pattern as `audit.js`) exposes `window.ActivityView`. It contains all Activity Log rendering, History tab rendering, filter logic, and revert UI orchestration. Two new pure functions (`checkStaleness`, `revertEntry`) are added to `src/audit.js` since they mutate state and belong alongside the existing audit engine. `src/index.html` gets the Activity Log panel skeleton in Settings, tab bars in ingredient/supplier modals, a dedicated revert confirmation modal, and the new script tag. `src/app.js` gets minimal glue calls only.

**Tech Stack:** Vanilla JS (no bundler), Electron, Jest for tests. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-16-activity-view-phase2-design.md`

---

## File Structure

**Created:**
- `src/activity-view.js` — UMD module exposing `window.ActivityView` in browser, `module.exports` in Node. Contains: `applyFilters`, `formatEntry`, `relativeTime`, `render`, `renderHistoryTab`, `showRevertConfirm`, `executeRevert`.
- `src/__tests__/audit-revert.test.js` — Unit tests for `Audit.checkStaleness` and `Audit.revertEntry`.

**Modified:**
- `src/audit.js` — Add exported functions `checkStaleness(state, logEntry)` and `revertEntry(state, logEntry, deviceName)`.
- `src/index.html` — Add Activity Log panel in Settings (before About card), tab bars in ingredient/supplier modals, revert confirmation modal, `<script src="activity-view.js">` tag.
- `src/app.js` — Call `ActivityView.render()` in `renderSettingsPage()`, call `ActivityView.renderHistoryTab()` from modal openers, add tab switching logic.

**Not modified:** `main.js`, `src/preload.js`, `package.json` (archive IPCs already exist from Phase 1).

---

## Task 1: `checkStaleness` in audit.js (TDD)

**Files:**
- Create: `src/__tests__/audit-revert.test.js`
- Modify: `src/audit.js`

- [ ] **Step 1: Write the failing tests for checkStaleness**

Create `src/__tests__/audit-revert.test.js`:

```javascript
const Audit = require('../audit.js');

describe('checkStaleness', () => {
  test('returns not stale when current value matches entry.after for update', () => {
    const state = {
      ingredients: [{ id: 'ing1', name: 'Cucumber', packCost: 0.90 }],
      recipes: [],
      suppliers: [],
    };
    const entry = {
      id: 'log_1', op: 'update', entity: 'ingredient',
      entityId: 'ing1', field: 'packCost', before: 0.85, after: 0.90,
    };
    const result = Audit.checkStaleness(state, entry);
    expect(result.stale).toBe(false);
    expect(result.currentValue).toBe(0.90);
    expect(result.revertValue).toBe(0.85);
  });

  test('returns stale when current value differs from entry.after', () => {
    const state = {
      ingredients: [{ id: 'ing1', name: 'Cucumber', packCost: 1.20 }],
      recipes: [],
      suppliers: [],
    };
    const entry = {
      id: 'log_1', op: 'update', entity: 'ingredient',
      entityId: 'ing1', field: 'packCost', before: 0.85, after: 0.90,
    };
    const result = Audit.checkStaleness(state, entry);
    expect(result.stale).toBe(true);
    expect(result.currentValue).toBe(1.20);
    expect(result.revertValue).toBe(0.85);
  });

  test('returns recordMissing when record no longer exists', () => {
    const state = {
      ingredients: [],
      recipes: [],
      suppliers: [],
    };
    const entry = {
      id: 'log_1', op: 'update', entity: 'ingredient',
      entityId: 'ing1', field: 'packCost', before: 0.85, after: 0.90,
    };
    const result = Audit.checkStaleness(state, entry);
    expect(result.recordMissing).toBe(true);
  });

  test('handles delete entry — recordMissing is true (record is gone)', () => {
    const state = {
      ingredients: [],
      recipes: [],
      suppliers: [],
    };
    const entry = {
      id: 'log_1', op: 'delete', entity: 'ingredient',
      entityId: 'ing1', before: { name: 'Old Beef', packCost: 12 },
    };
    const result = Audit.checkStaleness(state, entry);
    expect(result.recordMissing).toBe(true);
    expect(result.stale).toBe(false);
    expect(result.revertValue).toEqual({ name: 'Old Beef', packCost: 12 });
  });

  test('handles delete entry — record re-appeared (stale)', () => {
    const state = {
      ingredients: [{ id: 'ing1', name: 'Old Beef', packCost: 15 }],
      recipes: [],
      suppliers: [],
    };
    const entry = {
      id: 'log_1', op: 'delete', entity: 'ingredient',
      entityId: 'ing1', before: { name: 'Old Beef', packCost: 12 },
    };
    const result = Audit.checkStaleness(state, entry);
    expect(result.recordMissing).toBe(false);
    expect(result.stale).toBe(true);
  });

  test('handles nested recipeIngredient update via parentId', () => {
    const state = {
      ingredients: [],
      recipes: [{
        id: 'rec1', name: 'Salad',
        ingredients: [{ ingId: 'ing1', qty: 5, recipeUnit: 'each' }],
        subRecipes: [],
      }],
      suppliers: [],
    };
    const entry = {
      id: 'log_1', op: 'update', entity: 'recipeIngredient',
      entityId: 'ing1', parentId: 'rec1',
      field: 'qty', before: 2, after: 5,
    };
    const result = Audit.checkStaleness(state, entry);
    expect(result.stale).toBe(false);
    expect(result.currentValue).toBe(5);
    expect(result.revertValue).toBe(2);
  });

  test('nested row — parent recipe missing', () => {
    const state = {
      ingredients: [],
      recipes: [],
      suppliers: [],
    };
    const entry = {
      id: 'log_1', op: 'update', entity: 'recipeIngredient',
      entityId: 'ing1', parentId: 'rec1',
      field: 'qty', before: 2, after: 5,
    };
    const result = Audit.checkStaleness(state, entry);
    expect(result.recordMissing).toBe(true);
  });

  test('nested row — row missing from parent recipe', () => {
    const state = {
      ingredients: [],
      recipes: [{
        id: 'rec1', name: 'Salad',
        ingredients: [],
        subRecipes: [],
      }],
      suppliers: [],
    };
    const entry = {
      id: 'log_1', op: 'update', entity: 'recipeIngredient',
      entityId: 'ing1', parentId: 'rec1',
      field: 'qty', before: 2, after: 5,
    };
    const result = Audit.checkStaleness(state, entry);
    expect(result.recordMissing).toBe(true);
  });

  test('checks supplier staleness correctly', () => {
    const state = {
      ingredients: [],
      recipes: [],
      suppliers: [{ id: 'sup1', name: 'Brakes', email: 'new@b.c' }],
    };
    const entry = {
      id: 'log_1', op: 'update', entity: 'supplier',
      entityId: 'sup1', field: 'email', before: 'old@b.c', after: 'a@b.c',
    };
    const result = Audit.checkStaleness(state, entry);
    expect(result.stale).toBe(true);
    expect(result.currentValue).toBe('new@b.c');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/audit-revert.test.js -t "checkStaleness"`
Expected: FAIL with `Audit.checkStaleness is not a function`

- [ ] **Step 3: Implement checkStaleness in audit.js**

In `src/audit.js`, add before the `return` block (above `// ─── Public API`):

```javascript
  // ─── Staleness check (Phase 2) ────────────────────────────────────────────
  function _collectionForEntity(entity) {
    if (entity === 'ingredient') return 'ingredients';
    if (entity === 'recipe') return 'recipes';
    if (entity === 'supplier') return 'suppliers';
    if (entity === 'recipeIngredient') return 'recipes';
    if (entity === 'subRecipe') return 'recipes';
    return null;
  }

  function _idKeyForNestedEntity(entity) {
    if (entity === 'recipeIngredient') return 'ingId';
    if (entity === 'subRecipe') return 'recipeId';
    return null;
  }

  function _nestedArrayKey(entity) {
    if (entity === 'recipeIngredient') return 'ingredients';
    if (entity === 'subRecipe') return 'subRecipes';
    return null;
  }

  function checkStaleness(state, entry) {
    var isNested = entry.entity === 'recipeIngredient' || entry.entity === 'subRecipe';

    if (entry.op === 'delete') {
      // For delete entries, check if record still doesn't exist (expected)
      var collection = _collectionForEntity(entry.entity);
      if (!collection) return { recordMissing: true, stale: false, revertValue: entry.before };

      if (isNested) {
        var parentRec = (state.recipes || []).find(function (r) { return r && r.id === entry.parentId; });
        if (!parentRec) return { recordMissing: true, stale: false, revertValue: entry.before };
        var arrKey = _nestedArrayKey(entry.entity);
        var idKey = _idKeyForNestedEntity(entry.entity);
        var rows = parentRec[arrKey] || [];
        var row = rows.find(function (r) { return r && r[idKey] === entry.entityId; });
        if (row) return { recordMissing: false, stale: true, revertValue: entry.before };
        return { recordMissing: true, stale: false, revertValue: entry.before };
      }

      var list = state[collection] || [];
      var existing = list.find(function (r) { return r && r.id === entry.entityId; });
      if (existing) return { recordMissing: false, stale: true, revertValue: entry.before };
      return { recordMissing: true, stale: false, revertValue: entry.before };
    }

    // update entries
    if (isNested) {
      var parentRec2 = (state.recipes || []).find(function (r) { return r && r.id === entry.parentId; });
      if (!parentRec2) return { recordMissing: true };
      var arrKey2 = _nestedArrayKey(entry.entity);
      var idKey2 = _idKeyForNestedEntity(entry.entity);
      var rows2 = parentRec2[arrKey2] || [];
      var row2 = rows2.find(function (r) { return r && r[idKey2] === entry.entityId; });
      if (!row2) return { recordMissing: true };
      var currentVal = row2[entry.field];
      return {
        stale: !_shallowEqual(currentVal, entry.after),
        currentValue: currentVal,
        revertValue: entry.before,
      };
    }

    var collection2 = _collectionForEntity(entry.entity);
    if (!collection2) return { recordMissing: true };
    var list2 = state[collection2] || [];
    var record = list2.find(function (r) { return r && r.id === entry.entityId; });
    if (!record) return { recordMissing: true };
    var curVal = record[entry.field];
    return {
      stale: !_shallowEqual(curVal, entry.after),
      currentValue: curVal,
      revertValue: entry.before,
    };
  }
```

Add `checkStaleness` to the `return` block:

```javascript
  return {
    // ... existing exports ...
    checkStaleness,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/audit-revert.test.js -t "checkStaleness"`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/audit.js src/__tests__/audit-revert.test.js
git commit -m "Add checkStaleness to audit.js with full test coverage"
```

---

## Task 2: `revertEntry` in audit.js (TDD)

**Files:**
- Modify: `src/__tests__/audit-revert.test.js`
- Modify: `src/audit.js`

- [ ] **Step 1: Write the failing tests for revertEntry**

Append to `src/__tests__/audit-revert.test.js`:

```javascript
describe('revertEntry', () => {
  test('update revert sets field back to before value', () => {
    const state = {
      ingredients: [{ id: 'ing1', name: 'Cucumber', packCost: 0.90 }],
      recipes: [],
      suppliers: [],
      auditLog: [],
    };
    const entry = {
      id: 'log_1', ts: '2026-04-15T10:00:00Z', op: 'update', entity: 'ingredient',
      entityId: 'ing1', entityName: 'Cucumber',
      field: 'packCost', before: 0.85, after: 0.90,
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.success).toBe(true);
    expect(state.ingredients[0].packCost).toBe(0.85);
  });

  test('update revert creates a restore log entry', () => {
    const state = {
      ingredients: [{ id: 'ing1', name: 'Cucumber', packCost: 0.90 }],
      recipes: [],
      suppliers: [],
      auditLog: [],
    };
    const entry = {
      id: 'log_1', ts: '2026-04-15T10:00:00Z', op: 'update', entity: 'ingredient',
      entityId: 'ing1', entityName: 'Cucumber',
      field: 'packCost', before: 0.85, after: 0.90,
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.restoreEntry).toBeDefined();
    expect(result.restoreEntry.op).toBe('restore');
    expect(result.restoreEntry.entity).toBe('ingredient');
    expect(result.restoreEntry.entityId).toBe('ing1');
    expect(result.restoreEntry.field).toBe('packCost');
    expect(result.restoreEntry.before).toBe(0.90);
    expect(result.restoreEntry.after).toBe(0.85);
    // restore entry should be appended to auditLog
    expect(state.auditLog.length).toBe(1);
    expect(state.auditLog[0].op).toBe('restore');
  });

  test('delete revert re-creates record in collection', () => {
    const state = {
      ingredients: [],
      recipes: [],
      suppliers: [],
      auditLog: [],
    };
    const entry = {
      id: 'log_1', ts: '2026-04-15T10:00:00Z', op: 'delete', entity: 'ingredient',
      entityId: 'ing1', entityName: 'Old Beef',
      before: { name: 'Old Beef', packCost: 12, packSize: 1000, unit: 'g', yieldPct: 92 },
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.success).toBe(true);
    expect(state.ingredients.length).toBe(1);
    expect(state.ingredients[0].id).toBe('ing1');
    expect(state.ingredients[0].name).toBe('Old Beef');
    expect(state.ingredients[0].packCost).toBe(12);
    expect(state.ingredients[0]._modifiedAt).toBeDefined();
    expect(state.ingredients[0]._modifiedBy).toBe('TestPC');
  });

  test('delete revert creates a restore log entry', () => {
    const state = {
      ingredients: [],
      recipes: [],
      suppliers: [],
      auditLog: [],
    };
    const entry = {
      id: 'log_1', ts: '2026-04-15T10:00:00Z', op: 'delete', entity: 'ingredient',
      entityId: 'ing1', entityName: 'Old Beef',
      before: { name: 'Old Beef', packCost: 12 },
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.restoreEntry.op).toBe('restore');
    expect(result.restoreEntry.entity).toBe('ingredient');
    expect(result.restoreEntry.after).toEqual(expect.objectContaining({ name: 'Old Beef' }));
    expect(state.auditLog.length).toBe(1);
  });

  test('delete revert for recipe re-creates with nested arrays', () => {
    const state = {
      ingredients: [],
      recipes: [],
      suppliers: [],
      auditLog: [],
    };
    const entry = {
      id: 'log_1', ts: '2026-04-15T10:00:00Z', op: 'delete', entity: 'recipe',
      entityId: 'rec1', entityName: 'Salad',
      before: {
        name: 'Salad', category: 'Starters', portions: 4,
        ingredients: [{ ingId: 'ing1', qty: 2 }],
        subRecipes: [],
      },
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.success).toBe(true);
    expect(state.recipes.length).toBe(1);
    expect(state.recipes[0].id).toBe('rec1');
    expect(state.recipes[0].ingredients).toEqual([{ ingId: 'ing1', qty: 2 }]);
  });

  test('nested recipeIngredient update revert', () => {
    const state = {
      ingredients: [],
      recipes: [{
        id: 'rec1', name: 'Salad',
        ingredients: [{ ingId: 'ing1', qty: 5, recipeUnit: 'each' }],
        subRecipes: [],
      }],
      suppliers: [],
      auditLog: [],
    };
    const entry = {
      id: 'log_1', ts: '2026-04-15T10:00:00Z', op: 'update',
      entity: 'recipeIngredient', entityId: 'ing1', parentId: 'rec1',
      entityName: 'Salad', field: 'qty', before: 2, after: 5,
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.success).toBe(true);
    expect(state.recipes[0].ingredients[0].qty).toBe(2);
  });

  test('nested subRecipe update revert', () => {
    const state = {
      ingredients: [],
      recipes: [{
        id: 'rec1', name: 'Main',
        ingredients: [],
        subRecipes: [{ recipeId: 'rec2', qty: 3, recipeUnit: 'portions' }],
      }],
      suppliers: [],
      auditLog: [],
    };
    const entry = {
      id: 'log_1', ts: '2026-04-15T10:00:00Z', op: 'update',
      entity: 'subRecipe', entityId: 'rec2', parentId: 'rec1',
      entityName: 'Main', field: 'qty', before: 1, after: 3,
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.success).toBe(true);
    expect(state.recipes[0].subRecipes[0].qty).toBe(1);
  });

  test('returns error when record not found (update)', () => {
    const state = {
      ingredients: [],
      recipes: [],
      suppliers: [],
      auditLog: [],
    };
    const entry = {
      id: 'log_1', op: 'update', entity: 'ingredient',
      entityId: 'ing1', entityName: 'Ghost',
      field: 'packCost', before: 0.85, after: 0.90,
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no longer exists/i);
  });

  test('returns error when nested parent not found', () => {
    const state = {
      ingredients: [],
      recipes: [],
      suppliers: [],
      auditLog: [],
    };
    const entry = {
      id: 'log_1', op: 'update', entity: 'recipeIngredient',
      entityId: 'ing1', parentId: 'rec1', entityName: 'Salad',
      field: 'qty', before: 2, after: 5,
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no longer exists/i);
  });

  test('returns error when nested row not found in parent', () => {
    const state = {
      ingredients: [],
      recipes: [{ id: 'rec1', name: 'Salad', ingredients: [], subRecipes: [] }],
      suppliers: [],
      auditLog: [],
    };
    const entry = {
      id: 'log_1', op: 'update', entity: 'recipeIngredient',
      entityId: 'ing1', parentId: 'rec1', entityName: 'Salad',
      field: 'qty', before: 2, after: 5,
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no longer exists/i);
  });

  test('supplier update revert works', () => {
    const state = {
      ingredients: [],
      recipes: [],
      suppliers: [{ id: 'sup1', name: 'Brakes', email: 'a@b.c' }],
      auditLog: [],
    };
    const entry = {
      id: 'log_1', ts: '2026-04-15T10:00:00Z', op: 'update', entity: 'supplier',
      entityId: 'sup1', entityName: 'Brakes',
      field: 'email', before: 'old@b.c', after: 'a@b.c',
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.success).toBe(true);
    expect(state.suppliers[0].email).toBe('old@b.c');
  });

  test('supplier delete revert re-creates supplier', () => {
    const state = {
      ingredients: [],
      recipes: [],
      suppliers: [],
      auditLog: [],
    };
    const entry = {
      id: 'log_1', ts: '2026-04-15T10:00:00Z', op: 'delete', entity: 'supplier',
      entityId: 'sup1', entityName: 'OldSup',
      before: { name: 'OldSup', email: 'x@y.z', phone: '999' },
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.success).toBe(true);
    expect(state.suppliers.length).toBe(1);
    expect(state.suppliers[0].id).toBe('sup1');
    expect(state.suppliers[0].name).toBe('OldSup');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/audit-revert.test.js -t "revertEntry"`
Expected: FAIL with `Audit.revertEntry is not a function`

- [ ] **Step 3: Implement revertEntry in audit.js**

In `src/audit.js`, add after `checkStaleness` and before the `return` block:

```javascript
  // ─── Revert entry (Phase 2) ───────────────────────────────────────────────
  function revertEntry(state, entry, deviceName) {
    var isNested = entry.entity === 'recipeIngredient' || entry.entity === 'subRecipe';
    var collection = _collectionForEntity(entry.entity);
    var nowIso = new Date().toISOString();

    if (entry.op === 'update') {
      if (isNested) {
        var parentRec = (state.recipes || []).find(function (r) { return r && r.id === entry.parentId; });
        if (!parentRec) return { success: false, error: 'This record no longer exists (parent recipe missing).' };
        var arrKey = _nestedArrayKey(entry.entity);
        var idKey = _idKeyForNestedEntity(entry.entity);
        var rows = parentRec[arrKey] || [];
        var row = rows.find(function (r) { return r && r[idKey] === entry.entityId; });
        if (!row) return { success: false, error: 'This record no longer exists (nested row missing).' };
        var prevVal = row[entry.field];
        row[entry.field] = _deepClone(entry.before);
        var restoreEntry = {
          id: newLogId(),
          ts: nowIso,
          device: deviceName || 'Unknown',
          op: 'restore',
          entity: entry.entity,
          entityId: entry.entityId,
          entityName: entry.entityName,
          parentId: entry.parentId,
          field: entry.field,
          before: _deepClone(prevVal),
          after: _deepClone(entry.before),
          revertedEntryId: entry.id,
        };
        appendLogEntries(state, [restoreEntry]);
        return { success: true, restoreEntry: restoreEntry };
      }

      // Top-level update revert
      var list = state[collection] || [];
      var record = list.find(function (r) { return r && r.id === entry.entityId; });
      if (!record) return { success: false, error: 'This record no longer exists.' };
      var prevVal2 = record[entry.field];
      record[entry.field] = _deepClone(entry.before);
      record._modifiedAt = nowIso;
      record._modifiedBy = deviceName || 'Unknown';
      var restoreEntry2 = {
        id: newLogId(),
        ts: nowIso,
        device: deviceName || 'Unknown',
        op: 'restore',
        entity: entry.entity,
        entityId: entry.entityId,
        entityName: entry.entityName,
        field: entry.field,
        before: _deepClone(prevVal2),
        after: _deepClone(entry.before),
        revertedEntryId: entry.id,
      };
      appendLogEntries(state, [restoreEntry2]);
      return { success: true, restoreEntry: restoreEntry2 };
    }

    if (entry.op === 'delete') {
      // Re-create record from the before snapshot
      var snapshot = _deepClone(entry.before);
      snapshot.id = entry.entityId;
      snapshot._modifiedAt = nowIso;
      snapshot._modifiedBy = deviceName || 'Unknown';
      if (!state[collection]) state[collection] = [];
      state[collection].push(snapshot);
      var restoreEntry3 = {
        id: newLogId(),
        ts: nowIso,
        device: deviceName || 'Unknown',
        op: 'restore',
        entity: entry.entity,
        entityId: entry.entityId,
        entityName: entry.entityName,
        before: null,
        after: _deepClone(snapshot),
        revertedEntryId: entry.id,
      };
      appendLogEntries(state, [restoreEntry3]);
      return { success: true, restoreEntry: restoreEntry3 };
    }

    return { success: false, error: 'Only update and delete entries can be reverted.' };
  }
```

Add `revertEntry` to the `return` block:

```javascript
  return {
    // ... existing exports ...
    checkStaleness,
    revertEntry,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/audit-revert.test.js`
Expected: PASS (all checkStaleness + revertEntry tests)

- [ ] **Step 5: Run existing audit tests to confirm no regression**

Run: `npx jest src/__tests__/audit.test.js src/__tests__/audit-migration.test.js`
Expected: PASS (33 + 5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/audit.js src/__tests__/audit-revert.test.js
git commit -m "Add revertEntry to audit.js with restore log creation and nested row support"
```

---

## Task 3: `applyFilters` + `formatEntry` + `relativeTime` in activity-view.js (TDD)

**Files:**
- Create: `src/activity-view.js`
- Create: `src/__tests__/activity-view.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/activity-view.test.js`:

```javascript
const ActivityView = require('../activity-view.js');

describe('relativeTime', () => {
  test('returns "just now" for timestamps less than 60 seconds ago', () => {
    const ts = new Date(Date.now() - 30000).toISOString();
    expect(ActivityView.relativeTime(ts)).toBe('just now');
  });

  test('returns "X min ago" for timestamps less than 60 minutes ago', () => {
    const ts = new Date(Date.now() - 5 * 60000).toISOString();
    expect(ActivityView.relativeTime(ts)).toBe('5 min ago');
  });

  test('returns "1 min ago" not "1 min ago" for singular', () => {
    const ts = new Date(Date.now() - 90000).toISOString();
    expect(ActivityView.relativeTime(ts)).toBe('1 min ago');
  });

  test('returns "X hours ago" for timestamps less than 24 hours ago', () => {
    const ts = new Date(Date.now() - 3 * 3600000).toISOString();
    expect(ActivityView.relativeTime(ts)).toBe('3 hours ago');
  });

  test('returns "1 hour ago" for singular', () => {
    const ts = new Date(Date.now() - 3700000).toISOString();
    expect(ActivityView.relativeTime(ts)).toBe('1 hour ago');
  });

  test('returns "yesterday" for timestamps 24-48 hours ago', () => {
    const ts = new Date(Date.now() - 30 * 3600000).toISOString();
    expect(ActivityView.relativeTime(ts)).toBe('yesterday');
  });

  test('returns formatted date for older timestamps', () => {
    const ts = '2026-01-15T10:00:00Z';
    const result = ActivityView.relativeTime(ts);
    expect(result).toMatch(/15 Jan/);
  });
});

describe('applyFilters', () => {
  const entries = [
    { id: 'l1', ts: '2026-04-16T10:00:00Z', op: 'create', entity: 'ingredient', entityId: 'i1', entityName: 'Cucumber' },
    { id: 'l2', ts: '2026-04-16T09:00:00Z', op: 'update', entity: 'recipe', entityId: 'r1', entityName: 'Salad', field: 'name', before: 'Sld', after: 'Salad' },
    { id: 'l3', ts: '2026-04-15T08:00:00Z', op: 'delete', entity: 'supplier', entityId: 's1', entityName: 'OldSup' },
    { id: 'l4', ts: '2026-04-10T07:00:00Z', op: 'update', entity: 'ingredient', entityId: 'i2', entityName: 'Beef', field: 'packCost', before: 10, after: 12 },
    { id: 'l5', ts: '2026-04-16T11:00:00Z', op: 'bulk-update', entity: 'ingredient', entityId: null, entityName: 'Price update' },
    { id: 'l6', ts: '2026-04-16T10:30:00Z', op: 'restore', entity: 'ingredient', entityId: 'i1', entityName: 'Cucumber' },
  ];

  test('filters by entity type', () => {
    const result = ActivityView.applyFilters(entries, { entities: ['ingredient'] });
    expect(result.every(function (e) { return e.entity === 'ingredient'; })).toBe(true);
  });

  test('filters by multiple entity types', () => {
    const result = ActivityView.applyFilters(entries, { entities: ['ingredient', 'recipe'] });
    expect(result.every(function (e) { return e.entity === 'ingredient' || e.entity === 'recipe'; })).toBe(true);
  });

  test('filters by operation type', () => {
    const result = ActivityView.applyFilters(entries, { ops: ['update'] });
    expect(result.every(function (e) { return e.op === 'update'; })).toBe(true);
    expect(result.length).toBe(2);
  });

  test('filters by search text (case insensitive)', () => {
    const result = ActivityView.applyFilters(entries, { search: 'cucumber' });
    expect(result.every(function (e) { return e.entityName.toLowerCase().includes('cucumber'); })).toBe(true);
  });

  test('filters by date range (days)', () => {
    // Mock "now" as 2026-04-16T12:00:00Z
    const result = ActivityView.applyFilters(entries, {
      dateRange: 1,
      _now: new Date('2026-04-16T12:00:00Z').getTime(),
    });
    // Only entries from today (16th)
    expect(result.length).toBe(4);
  });

  test('combined filters stack', () => {
    const result = ActivityView.applyFilters(entries, {
      entities: ['ingredient'],
      ops: ['update'],
    });
    expect(result.length).toBe(1);
    expect(result[0].entityName).toBe('Beef');
  });

  test('returns all entries when no filters specified', () => {
    const result = ActivityView.applyFilters(entries, {});
    expect(result.length).toBe(entries.length);
  });

  test('includes nested entity types with their parent entity filter', () => {
    const withNested = entries.concat([
      { id: 'l7', ts: '2026-04-16T10:00:00Z', op: 'update', entity: 'recipeIngredient', entityId: 'i1', parentId: 'r1', entityName: 'Salad', field: 'qty', before: 1, after: 2 },
    ]);
    const result = ActivityView.applyFilters(withNested, { entities: ['recipe'] });
    expect(result.some(function (e) { return e.entity === 'recipeIngredient'; })).toBe(true);
  });
});

describe('formatEntry', () => {
  test('formats create entry', () => {
    const html = ActivityView.formatEntry({
      id: 'l1', ts: new Date().toISOString(), device: 'PC1',
      op: 'create', entity: 'ingredient', entityId: 'i1', entityName: 'Cucumber',
      after: { name: 'Cucumber', packCost: 1 },
    });
    expect(html).toContain('Created');
    expect(html).toContain('Cucumber');
    expect(html).not.toContain('revert-btn');
  });

  test('formats update entry with before/after and revert button', () => {
    const html = ActivityView.formatEntry({
      id: 'l1', ts: new Date().toISOString(), device: 'PC1',
      op: 'update', entity: 'ingredient', entityId: 'i1', entityName: 'Cucumber',
      field: 'packCost', before: 0.85, after: 0.90,
    });
    expect(html).toContain('Updated');
    expect(html).toContain('packCost');
    expect(html).toContain('0.85');
    expect(html).toContain('0.90');
    expect(html).toContain('revert-btn');
  });

  test('formats delete entry with revert button', () => {
    const html = ActivityView.formatEntry({
      id: 'l1', ts: new Date().toISOString(), device: 'PC1',
      op: 'delete', entity: 'ingredient', entityId: 'i1', entityName: 'Old Beef',
      before: { name: 'Old Beef', packCost: 12 },
    });
    expect(html).toContain('Deleted');
    expect(html).toContain('Old Beef');
    expect(html).toContain('revert-btn');
  });

  test('formats restore entry without revert button', () => {
    const html = ActivityView.formatEntry({
      id: 'l1', ts: new Date().toISOString(), device: 'PC1',
      op: 'restore', entity: 'ingredient', entityId: 'i1', entityName: 'Cucumber',
      field: 'packCost', before: 0.90, after: 0.85,
    });
    expect(html).toContain('Restored');
    expect(html).not.toContain('revert-btn');
  });

  test('formats bulk-update entry without revert button', () => {
    const html = ActivityView.formatEntry({
      id: 'l1', ts: new Date().toISOString(), device: 'PC1',
      op: 'bulk-update', entity: 'ingredient', entityId: null, entityName: 'Price update',
      count: 15,
    });
    expect(html).toContain('Bulk');
    expect(html).not.toContain('revert-btn');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/activity-view.test.js`
Expected: FAIL with `Cannot find module '../activity-view.js'`

- [ ] **Step 3: Create activity-view.js with UMD wrapper and pure functions**

Create `src/activity-view.js`:

```javascript
/**
 * src/activity-view.js — Activity View UI (Phase 2).
 *
 * Loaded two ways:
 *   1. Browser: <script src="activity-view.js"></script> after audit.js.
 *      Exposes window.ActivityView.
 *   2. Jest: require('../activity-view.js'). Exposes module.exports.
 *
 * Pure utility functions (relativeTime, applyFilters, formatEntry) have no
 * DOM or IPC dependencies and are fully testable. Rendering functions use
 * the DOM and are tested manually.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ActivityView = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // ─── Relative time formatting ─────────────────────────────────────────────
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function relativeTime(ts) {
    var now = Date.now();
    var then = new Date(ts).getTime();
    var diffSec = Math.floor((now - then) / 1000);
    if (diffSec < 60) return 'just now';
    var diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return diffMin + ' min ago';
    var diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return diffHr === 1 ? '1 hour ago' : diffHr + ' hours ago';
    if (diffHr < 48) return 'yesterday';
    var d = new Date(ts);
    return d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  // ─── Entity filter helpers ────────────────────────────────────────────────
  var NESTED_ENTITY_MAP = {
    recipe: ['recipeIngredient', 'subRecipe'],
  };

  function _entityMatchesFilter(entity, entityFilters) {
    if (!entityFilters || entityFilters.length === 0) return true;
    if (entityFilters.indexOf(entity) !== -1) return true;
    // Include nested entities when their parent type is selected
    for (var i = 0; i < entityFilters.length; i++) {
      var nested = NESTED_ENTITY_MAP[entityFilters[i]];
      if (nested && nested.indexOf(entity) !== -1) return true;
    }
    return false;
  }

  // ─── Filter engine ────────────────────────────────────────────────────────
  function applyFilters(entries, filters) {
    if (!entries) return [];
    var entities = filters.entities || null;
    var ops = filters.ops || null;
    var search = (filters.search || '').toLowerCase();
    var dateRange = filters.dateRange || null; // number of days
    var now = filters._now || Date.now();
    var cutoff = dateRange ? now - dateRange * 86400000 : 0;

    return entries.filter(function (e) {
      if (entities && !_entityMatchesFilter(e.entity, entities)) return false;
      if (ops && ops.indexOf(e.op) === -1) return false;
      if (search && (e.entityName || '').toLowerCase().indexOf(search) === -1) return false;
      if (cutoff && new Date(e.ts).getTime() < cutoff) return false;
      return true;
    });
  }

  // ─── Format a single entry as HTML ────────────────────────────────────────
  function _escHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _formatValue(v) {
    if (v === null || v === undefined) return '<em>empty</em>';
    if (typeof v === 'object') return _escHtml(JSON.stringify(v));
    return _escHtml(String(v));
  }

  function formatEntry(entry) {
    var time = relativeTime(entry.ts);
    var device = _escHtml(entry.device || '');
    var name = '<strong>' + _escHtml(entry.entityName) + '</strong>';
    var entityLabel = _escHtml(entry.entity);
    var canRevert = (entry.op === 'update' || entry.op === 'delete');
    var revertBtn = canRevert
      ? ' <button class="btn-secondary btn-sm revert-btn" data-entry-id="' + _escHtml(entry.id) + '" title="Revert this change" style="font-size:11px;padding:2px 8px;margin-left:8px">↩ Revert</button>'
      : '';

    var desc = '';
    if (entry.op === 'create') {
      desc = 'Created ' + entityLabel + ' ' + name;
    } else if (entry.op === 'update') {
      desc = 'Updated ' + name + ' <span style="color:var(--text-muted)">' + _escHtml(entry.field) + '</span>'
        + '<div style="margin-top:4px;font-size:12px">'
        + '<span style="text-decoration:line-through;color:var(--red)">' + _formatValue(entry.before) + '</span>'
        + ' &rarr; '
        + '<span style="color:var(--green)">' + _formatValue(entry.after) + '</span>'
        + '</div>';
    } else if (entry.op === 'delete') {
      desc = 'Deleted ' + entityLabel + ' ' + name;
    } else if (entry.op === 'restore') {
      desc = 'Restored ' + entityLabel + ' ' + name;
      if (entry.field) {
        desc += ' <span style="color:var(--text-muted)">' + _escHtml(entry.field) + '</span>';
      }
    } else if (entry.op === 'bulk-update') {
      desc = 'Bulk updated ' + entityLabel + ' — ' + name;
      if (entry.count) desc += ' <span style="color:var(--text-muted)">(' + entry.count + ' changes)</span>';
    } else {
      desc = _escHtml(entry.op) + ' ' + entityLabel + ' ' + name;
    }

    return '<div class="activity-entry" data-entry-id="' + _escHtml(entry.id) + '" style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:10px">'
      + '<div style="flex:1;min-width:0">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">'
      + '<span style="font-size:11px;color:var(--text-muted)">' + _escHtml(time) + '</span>'
      + (device ? '<span style="font-size:10px;color:var(--text-muted);opacity:0.7">· ' + device + '</span>' : '')
      + '</div>'
      + '<div style="font-size:13px;line-height:1.5">' + desc + '</div>'
      + '</div>'
      + '<div style="flex-shrink:0">' + revertBtn + '</div>'
      + '</div>';
  }

  // ─── Internal state (browser only) ────────────────────────────────────────
  var _filterState = {
    entities: ['ingredient', 'recipe', 'supplier'],
    ops: ['create', 'update', 'delete'],
    dateRange: 7,
    search: '',
  };
  var _page = 0;
  var _pageSize = 50;
  var _archiveEntries = [];
  var _cachedFiltered = [];

  // ─── Render (browser only — not tested in Jest) ───────────────────────────
  function render() {
    var container = typeof document !== 'undefined' ? document.getElementById('activity-log-panel') : null;
    if (!container) return;
    if (typeof state === 'undefined' || !state.auditLog) return;

    // Reset pagination
    _page = 0;
    _archiveEntries = [];
    _reRender();
  }

  function _reRender() {
    var container = document.getElementById('activity-log-feed');
    var countEl = document.getElementById('activity-log-count');
    if (!container) return;

    var allEntries = (state.auditLog || []).concat(_archiveEntries);
    // Sort newest first
    allEntries.sort(function (a, b) { return (b.ts || '').localeCompare(a.ts || ''); });

    _cachedFiltered = applyFilters(allEntries, _filterState);

    if (countEl) countEl.textContent = _cachedFiltered.length + ' entries';

    var endIdx = (_page + 1) * _pageSize;
    var visible = _cachedFiltered.slice(0, endIdx);
    var hasMore = endIdx < _cachedFiltered.length;

    var html = '';
    for (var i = 0; i < visible.length; i++) {
      html += formatEntry(visible[i]);
    }
    if (!html) {
      html = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">No activity entries match the current filters.</div>';
    }
    if (hasMore) {
      html += '<div style="padding:12px;text-align:center"><button class="btn-secondary btn-sm" id="activity-load-older">Load older (' + (_cachedFiltered.length - endIdx) + ' more)</button></div>';
    }
    container.innerHTML = html;

    // Attach event listeners
    _attachFeedListeners();
  }

  function _attachFeedListeners() {
    // Load older button
    var loadOlder = document.getElementById('activity-load-older');
    if (loadOlder) {
      loadOlder.onclick = function () {
        _page++;
        _reRender();
      };
    }
    // Revert buttons
    var revertBtns = document.querySelectorAll('#activity-log-feed .revert-btn');
    for (var i = 0; i < revertBtns.length; i++) {
      revertBtns[i].onclick = function () {
        var entryId = this.getAttribute('data-entry-id');
        _handleRevert(entryId);
      };
    }
  }

  function _handleRevert(entryId) {
    var allEntries = (state.auditLog || []).concat(_archiveEntries);
    var entry = null;
    for (var i = 0; i < allEntries.length; i++) {
      if (allEntries[i].id === entryId) { entry = allEntries[i]; break; }
    }
    if (!entry) return;
    showRevertConfirm(entry);
  }

  // ─── Filter UI handlers (browser only) ────────────────────────────────────
  function _initFilterListeners() {
    // Entity toggles
    var entityBtns = document.querySelectorAll('.activity-entity-toggle');
    for (var i = 0; i < entityBtns.length; i++) {
      entityBtns[i].onclick = function () {
        var val = this.getAttribute('data-entity');
        var idx = _filterState.entities.indexOf(val);
        if (idx === -1) {
          _filterState.entities.push(val);
          this.classList.add('active');
        } else {
          _filterState.entities.splice(idx, 1);
          this.classList.remove('active');
        }
        _page = 0;
        _reRender();
      };
    }
    // Op toggles
    var opBtns = document.querySelectorAll('.activity-op-toggle');
    for (var i = 0; i < opBtns.length; i++) {
      opBtns[i].onclick = function () {
        var val = this.getAttribute('data-op');
        var idx = _filterState.ops.indexOf(val);
        if (idx === -1) {
          _filterState.ops.push(val);
          this.classList.add('active');
        } else {
          _filterState.ops.splice(idx, 1);
          this.classList.remove('active');
        }
        _page = 0;
        _reRender();
      };
    }
    // Date range dropdown
    var dateSelect = document.getElementById('activity-date-range');
    if (dateSelect) {
      dateSelect.onchange = function () {
        var val = this.value;
        _filterState.dateRange = val === 'all' ? null : parseInt(val, 10);
        _page = 0;
        _reRender();
      };
    }
    // Search box
    var searchBox = document.getElementById('activity-search');
    var searchTimer = null;
    if (searchBox) {
      searchBox.oninput = function () {
        clearTimeout(searchTimer);
        var self = this;
        searchTimer = setTimeout(function () {
          _filterState.search = self.value;
          _page = 0;
          _reRender();
        }, 300);
      };
    }
    // Archives dropdown
    var archiveSelect = document.getElementById('activity-archives');
    if (archiveSelect && typeof electronAPI !== 'undefined' && electronAPI.listAuditArchives) {
      electronAPI.listAuditArchives().then(function (months) {
        archiveSelect.innerHTML = '<option value="">Archives...</option>';
        (months || []).forEach(function (ym) {
          archiveSelect.innerHTML += '<option value="' + _escHtml(ym) + '">' + _escHtml(ym) + '</option>';
        });
      }).catch(function () {});
      archiveSelect.onchange = function () {
        var ym = this.value;
        if (!ym) return;
        this.value = '';
        if (typeof electronAPI !== 'undefined' && electronAPI.loadAuditArchive) {
          electronAPI.loadAuditArchive(ym).then(function (entries) {
            if (Array.isArray(entries)) {
              for (var i = 0; i < entries.length; i++) {
                // Deduplicate by id
                var exists = false;
                for (var j = 0; j < _archiveEntries.length; j++) {
                  if (_archiveEntries[j].id === entries[i].id) { exists = true; break; }
                }
                if (!exists) _archiveEntries.push(entries[i]);
              }
              _page = 0;
              _reRender();
            }
          }).catch(function () {});
        }
      };
    }
  }

  // ─── Revert confirmation modal (browser only) ─────────────────────────────
  function showRevertConfirm(entry) {
    if (typeof document === 'undefined') return;
    if (typeof Audit === 'undefined') return;

    var staleness = Audit.checkStaleness(state, entry);

    var modal = document.getElementById('revert-confirm-modal');
    var titleEl = document.getElementById('revert-confirm-title');
    var bodyEl = document.getElementById('revert-confirm-body');
    var confirmBtn = document.getElementById('revert-confirm-btn');
    var cancelBtn = document.getElementById('revert-cancel-btn');
    if (!modal || !bodyEl) return;

    if (staleness.recordMissing) {
      titleEl.textContent = 'Cannot Revert';
      bodyEl.innerHTML = '<div style="padding:8px 0;color:var(--text-secondary)">'
        + 'This record no longer exists. The revert cannot be applied.'
        + '</div>';
      confirmBtn.style.display = 'none';
      cancelBtn.textContent = 'Close';
      modal.classList.remove('hidden');
      cancelBtn.onclick = function () { modal.classList.add('hidden'); };
      return;
    }

    var entityLabel = _escHtml(entry.entityName);
    var html = '';

    if (entry.op === 'update') {
      titleEl.textContent = 'Revert Update';
      html += '<div style="font-size:13px;margin-bottom:12px">Revert <strong>' + entityLabel + '</strong> field <code>' + _escHtml(entry.field) + '</code>:</div>';
      html += '<div style="padding:10px 14px;background:var(--bg-card2);border:1px solid var(--border);border-radius:6px;margin-bottom:12px">'
        + '<div style="margin-bottom:6px"><span style="text-decoration:line-through;color:var(--red)">' + _formatValue(staleness.currentValue) + '</span></div>'
        + '<div>&rarr; <span style="color:var(--green);font-weight:600">' + _formatValue(staleness.revertValue) + '</span></div>'
        + '</div>';
    } else if (entry.op === 'delete') {
      titleEl.textContent = 'Restore Deleted Record';
      html += '<div style="font-size:13px;margin-bottom:12px">Re-create <strong>' + entityLabel + '</strong> from the saved snapshot.</div>';
    }

    if (staleness.stale) {
      html += '<div style="padding:10px 14px;background:rgba(255,180,0,0.1);border:1px solid rgba(255,180,0,0.3);border-radius:6px;margin-bottom:12px;font-size:12px">'
        + '<strong style="color:var(--orange)">&#9888; Warning:</strong> This field has been changed since this log entry. '
        + 'Current value is <strong>' + _formatValue(staleness.currentValue) + '</strong>. '
        + 'Reverting will overwrite it with <strong>' + _formatValue(staleness.revertValue) + '</strong>.'
        + '</div>';
    }

    bodyEl.innerHTML = html;
    confirmBtn.style.display = '';
    confirmBtn.textContent = entry.op === 'delete' ? 'Restore' : 'Revert';
    cancelBtn.textContent = 'Cancel';
    modal.classList.remove('hidden');

    confirmBtn.onclick = function () {
      modal.classList.add('hidden');
      executeRevert(entry);
    };
    cancelBtn.onclick = function () {
      modal.classList.add('hidden');
    };
  }

  // ─── Execute revert (browser only) ────────────────────────────────────────
  function executeRevert(entry) {
    if (typeof Audit === 'undefined' || typeof state === 'undefined') return;
    var deviceName = (state.sync && state.sync.deviceName) || 'This PC';
    var result = Audit.revertEntry(state, entry, deviceName);
    if (result.success) {
      // Refresh snapshot so the next save() diff does not re-log the revert
      if (typeof _loadSnapshot !== 'undefined' && window.Audit) {
        _loadSnapshot = window.Audit.buildSnapshot(state);
      }
      // Trigger save
      if (typeof save === 'function') save();
      // Re-render wherever we are
      _reRender();
      // If a history tab is open, refresh it too
      if (_historyState.entityId) {
        renderHistoryTab(_historyState.entityType, _historyState.entityId);
      }
      // Show toast
      if (typeof showToast === 'function') {
        showToast('Reverted successfully', 'success', 3000);
      }
    } else {
      if (typeof showToast === 'function') {
        showToast(result.error || 'Revert failed', 'error', 5000);
      }
    }
  }

  // ─── History tab ──────────────────────────────────────────────────────────
  var _historyState = { entityType: null, entityId: null, page: 0, archiveEntries: [] };

  function renderHistoryTab(entityType, entityId) {
    _historyState = { entityType: entityType, entityId: entityId, page: 0, archiveEntries: [] };
    _reRenderHistory();
  }

  function _reRenderHistory() {
    var entityType = _historyState.entityType;
    var entityId = _historyState.entityId;
    if (!entityType || !entityId) return;

    // Determine correct container based on entity type
    var containerId = 'history-' + entityType + '-feed';
    var container = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
    // Fallback to generic history feed
    if (!container) container = typeof document !== 'undefined' ? document.getElementById('history-feed') : null;
    if (!container) return;

    var allEntries = (state.auditLog || []).concat(_historyState.archiveEntries);
    // Filter by entityId or parentId (for recipe nested entries)
    var filtered = allEntries.filter(function (e) {
      if (e.entityId === entityId) return true;
      if (entityType === 'recipe' && e.parentId === entityId) return true;
      return false;
    });
    // Sort newest first
    filtered.sort(function (a, b) { return (b.ts || '').localeCompare(a.ts || ''); });

    var endIdx = (_historyState.page + 1) * _pageSize;
    var visible = filtered.slice(0, endIdx);
    var hasMore = endIdx < filtered.length;

    var html = '';
    for (var i = 0; i < visible.length; i++) {
      html += formatEntry(visible[i]);
    }

    // "Created on" badge
    var createEntry = null;
    for (var j = allEntries.length - 1; j >= 0; j--) {
      if (allEntries[j].entityId === entityId && allEntries[j].op === 'create') {
        createEntry = allEntries[j];
        break;
      }
    }

    if (!html) {
      html = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px">No history entries found.</div>';
    }
    if (hasMore) {
      html += '<div style="padding:10px;text-align:center"><button class="btn-secondary btn-sm" id="history-load-older">Load older (' + (filtered.length - endIdx) + ' more)</button></div>';
    }
    // Archive load button
    html += '<div style="padding:10px;text-align:center"><button class="btn-secondary btn-sm" id="history-load-archive" style="font-size:11px;opacity:0.7">Load older from archives</button></div>';

    if (createEntry) {
      var createdDate = new Date(createEntry.ts);
      var dateStr = createdDate.getDate() + ' ' + MONTHS[createdDate.getMonth()] + ' ' + createdDate.getFullYear();
      html += '<div style="padding:8px 14px;text-align:center;font-size:11px;color:var(--text-muted);border-top:1px solid var(--border)">'
        + '<span style="background:var(--bg-card2);border:1px solid var(--border);padding:3px 10px;border-radius:10px">Created on ' + _escHtml(dateStr) + '</span>'
        + '</div>';
    }

    container.innerHTML = html;

    // Attach listeners
    var loadOlder = document.getElementById('history-load-older');
    if (loadOlder) {
      loadOlder.onclick = function () {
        _historyState.page++;
        _reRenderHistory();
      };
    }
    var loadArchive = document.getElementById('history-load-archive');
    if (loadArchive) {
      loadArchive.onclick = function () {
        if (typeof electronAPI === 'undefined' || !electronAPI.listAuditArchives) return;
        electronAPI.listAuditArchives().then(function (months) {
          if (!months || !months.length) {
            if (typeof showToast === 'function') showToast('No archives available', 'info', 2000);
            return;
          }
          // Load all archives for completeness
          var loaded = 0;
          months.forEach(function (ym) {
            electronAPI.loadAuditArchive(ym).then(function (entries) {
              if (Array.isArray(entries)) {
                for (var i = 0; i < entries.length; i++) {
                  var exists = false;
                  for (var j = 0; j < _historyState.archiveEntries.length; j++) {
                    if (_historyState.archiveEntries[j].id === entries[i].id) { exists = true; break; }
                  }
                  if (!exists) _historyState.archiveEntries.push(entries[i]);
                }
              }
              loaded++;
              if (loaded === months.length) _reRenderHistory();
            }).catch(function () { loaded++; });
          });
        }).catch(function () {});
      };
    }
    // Revert buttons in history
    var revertBtns = container.querySelectorAll('.revert-btn');
    for (var k = 0; k < revertBtns.length; k++) {
      revertBtns[k].onclick = function () {
        var entryId = this.getAttribute('data-entry-id');
        var allE = (state.auditLog || []).concat(_historyState.archiveEntries);
        var entry = null;
        for (var m = 0; m < allE.length; m++) {
          if (allE[m].id === entryId) { entry = allE[m]; break; }
        }
        if (entry) showRevertConfirm(entry);
      };
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    relativeTime: relativeTime,
    applyFilters: applyFilters,
    formatEntry: formatEntry,
    render: render,
    renderHistoryTab: renderHistoryTab,
    showRevertConfirm: showRevertConfirm,
    executeRevert: executeRevert,
    _initFilterListeners: _initFilterListeners,
  };
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/activity-view.test.js`
Expected: PASS (all relativeTime + applyFilters + formatEntry tests)

- [ ] **Step 5: Commit**

```bash
git add src/activity-view.js src/__tests__/activity-view.test.js
git commit -m "Scaffold activity-view.js UMD module with applyFilters, formatEntry, and relativeTime"
```

---

## Task 4: Activity Log panel HTML in index.html

**Files:**
- Modify: `src/index.html`

- [ ] **Step 1: Widen Settings container**

In `src/index.html`, change the Settings container from `max-width:760px` to `max-width:960px`.

Find (line 474):
```html
      <div style="padding:24px 28px 40px;max-width:760px;display:flex;flex-direction:column;gap:20px">
```

Replace with:
```html
      <div style="padding:24px 28px 40px;max-width:960px;display:flex;flex-direction:column;gap:20px">
```

- [ ] **Step 2: Add Activity Log panel HTML before the About card**

Insert BEFORE the `<!-- About / Updates -->` comment (line 758):

```html
      <!-- Activity Log -->
      <div class="card" id="activity-log-panel">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;margin-bottom:18px">📋 Activity Log</div>
        <div style="display:flex;gap:16px;min-height:300px">
          <!-- Left sidebar: filters -->
          <div style="width:200px;flex-shrink:0;display:flex;flex-direction:column;gap:14px">
            <!-- Entity toggles -->
            <div>
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;font-weight:600">Show</div>
              <div style="display:flex;flex-wrap:wrap;gap:4px">
                <button class="btn-secondary btn-sm activity-entity-toggle active" data-entity="ingredient" style="font-size:11px;padding:3px 8px">Ingredients</button>
                <button class="btn-secondary btn-sm activity-entity-toggle active" data-entity="recipe" style="font-size:11px;padding:3px 8px">Recipes</button>
                <button class="btn-secondary btn-sm activity-entity-toggle active" data-entity="supplier" style="font-size:11px;padding:3px 8px">Suppliers</button>
              </div>
            </div>
            <!-- Operation toggles -->
            <div>
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;font-weight:600">Operations</div>
              <div style="display:flex;flex-wrap:wrap;gap:4px">
                <button class="btn-secondary btn-sm activity-op-toggle active" data-op="create" style="font-size:11px;padding:3px 8px">Create</button>
                <button class="btn-secondary btn-sm activity-op-toggle active" data-op="update" style="font-size:11px;padding:3px 8px">Update</button>
                <button class="btn-secondary btn-sm activity-op-toggle active" data-op="delete" style="font-size:11px;padding:3px 8px">Delete</button>
              </div>
            </div>
            <!-- Date range -->
            <div>
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;font-weight:600">Date range</div>
              <select id="activity-date-range" style="width:100%;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:12px;padding:5px 8px;border-radius:5px;outline:none">
                <option value="1">Today</option>
                <option value="7" selected>Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="all">All time</option>
              </select>
            </div>
            <!-- Search -->
            <div>
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;font-weight:600">Search</div>
              <input type="text" id="activity-search" placeholder="Filter by name..." style="width:100%;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:12px;padding:5px 8px;border-radius:5px;outline:none;box-sizing:border-box">
            </div>
            <!-- Archives -->
            <div>
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;font-weight:600">Archives</div>
              <select id="activity-archives" style="width:100%;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:12px;padding:5px 8px;border-radius:5px;outline:none">
                <option value="">Archives...</option>
              </select>
            </div>
          </div>
          <!-- Right column: feed -->
          <div style="flex:1;min-width:0;display:flex;flex-direction:column">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-bottom:1px solid var(--border)">
              <span id="activity-log-count" style="font-size:12px;color:var(--text-muted)">0 entries</span>
            </div>
            <div id="activity-log-feed" style="flex:1;overflow-y:auto;max-height:400px"></div>
          </div>
        </div>
      </div>
```

- [ ] **Step 3: Add activity-view.js script tag**

Find (line ~2568):
```html
<script src="audit.js"></script>
<script src="app.js"></script>
```

Replace with:
```html
<script src="audit.js"></script>
<script src="activity-view.js"></script>
<script src="app.js"></script>
```

- [ ] **Step 4: Commit**

```bash
git add src/index.html
git commit -m "Add Activity Log panel HTML skeleton and activity-view.js script tag to Settings"
```

---

## Task 5: Activity Log panel rendering in activity-view.js

**Files:**
- Modify: `src/activity-view.js` (already has render/filter logic from Task 3)

This task is already implemented in the activity-view.js scaffold from Task 3. The `render()` function reads `state.auditLog`, applies default filters, renders the first 50 entries, and `_initFilterListeners()` wires up filter change handlers, pagination, and archives. No additional code changes needed beyond Task 3.

- [ ] **Step 1: Verify render works by manual inspection**

1. Open the app in Electron
2. Navigate to Settings
3. Confirm the Activity Log panel appears with the filter sidebar and feed area
4. Confirm entries from `state.auditLog` appear in the feed (if any exist)
5. Confirm filter toggles update the feed
6. Confirm "Load older" pagination works

- [ ] **Step 2: Commit (no-op — already committed in Task 3)**

No commit needed; Task 3 already includes all rendering code.

---

## Task 6: Wire Activity Log into app.js

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Call ActivityView.render() in renderSettingsPage()**

In `src/app.js`, find the `renderSettingsPage()` function (line 14487). At the end of the function body (after the USDA key block), add:

Find the end of `renderSettingsPage()`. After the last block in that function, add before its closing brace:

```javascript
  // Activity Log panel
  if (typeof ActivityView !== 'undefined' && ActivityView.render) {
    ActivityView.render();
    ActivityView._initFilterListeners();
  }
```

Specifically, find the line that looks like the end of the USDA key status block. After:
```javascript
  if (usdaStatusSettingsEl) {
```

...and the rest of that block completes, add the ActivityView.render() call. The safest place is right before the closing `}` of `renderSettingsPage()`.

- [ ] **Step 2: Verify by opening Settings and confirming the Activity Log populates**

- [ ] **Step 3: Commit**

```bash
git add src/app.js
git commit -m "Wire ActivityView.render() into renderSettingsPage() for Activity Log panel"
```

---

## Task 7: History tab HTML in modals (index.html)

**Files:**
- Modify: `src/index.html`

- [ ] **Step 1: Add tab bar and history container to ingredient modal**

The ingredient modal currently has no tab system. We need to add a tab bar inside the modal-body and wrap the existing form content in a tab panel.

Find the ingredient modal body opening (line 783):
```html
    <div class="modal-body">
```

Replace it with a tab bar + tab panels wrapper. The existing form content goes inside the "Details" tab panel, and a new empty "History" tab panel is added:

```html
    <div class="modal-body" style="padding:0">
      <!-- Tab bar -->
      <div id="ing-modal-tabs" style="display:flex;border-bottom:1px solid var(--border);padding:0 16px;background:var(--bg-card2)">
        <button class="ing-tab-btn active" data-tab="ing-tab-details" onclick="switchIngTab('ing-tab-details')" style="padding:10px 16px;font-size:12px;font-weight:600;border:none;background:none;color:var(--text-primary);cursor:pointer;border-bottom:2px solid var(--accent);margin-bottom:-1px">Details</button>
        <button class="ing-tab-btn" data-tab="ing-tab-history" onclick="switchIngTab('ing-tab-history')" style="padding:10px 16px;font-size:12px;font-weight:600;border:none;background:none;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px">History</button>
      </div>
      <!-- Details tab -->
      <div id="ing-tab-details" style="padding:16px 20px">
```

Then, find the end of the ingredient modal form content — right before the modal-footer (line 938):
```html
    </div>
    <div class="modal-footer">
```

Insert closing div for the details tab + the history tab panel:
```html
      </div><!-- /ing-tab-details -->
      <!-- History tab -->
      <div id="ing-tab-history" style="display:none;padding:16px 20px;max-height:400px;overflow-y:auto">
        <div id="history-ingredient-feed" style="min-height:100px"></div>
      </div>
    </div><!-- /modal-body -->
    <div class="modal-footer">
```

Note: The original `</div>` that closed `.modal-body` before `modal-footer` is now removed and replaced by this new structure.

- [ ] **Step 2: Add history container to supplier modal**

Similarly, the supplier modal has no tabs. Add a tab bar.

Find the supplier modal body (line 1067):
```html
    <div class="modal-body">
      <div class="form-grid">
```

Replace with:
```html
    <div class="modal-body" style="padding:0">
      <!-- Tab bar -->
      <div id="sup-modal-tabs" style="display:flex;border-bottom:1px solid var(--border);padding:0 16px;background:var(--bg-card2)">
        <button class="sup-tab-btn active" data-tab="sup-tab-details" onclick="switchSupTab('sup-tab-details')" style="padding:10px 16px;font-size:12px;font-weight:600;border:none;background:none;color:var(--text-primary);cursor:pointer;border-bottom:2px solid var(--accent);margin-bottom:-1px">Details</button>
        <button class="sup-tab-btn" data-tab="sup-tab-history" onclick="switchSupTab('sup-tab-history')" style="padding:10px 16px;font-size:12px;font-weight:600;border:none;background:none;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px">History</button>
      </div>
      <!-- Details tab -->
      <div id="sup-tab-details" style="padding:16px 20px">
      <div class="form-grid">
```

Then find the end of the supplier form content. The notes textarea ends, then `</div>` for modal-body, then modal-footer (line 1079-1080):
```html
      </div>
    </div>
    <div class="modal-footer">
```

Replace with:
```html
      </div>
      </div><!-- /sup-tab-details -->
      <!-- History tab -->
      <div id="sup-tab-history" style="display:none;padding:16px 20px;max-height:400px;overflow-y:auto">
        <div id="history-supplier-feed" style="min-height:100px"></div>
      </div>
    </div><!-- /modal-body -->
    <div class="modal-footer">
```

- [ ] **Step 3: Add revert confirmation modal**

Add a dedicated revert confirmation modal after the existing `confirm-modal` (after line 955):

```html
<!-- Revert Confirm Modal -->
<div id="revert-confirm-modal" class="modal-overlay hidden" style="z-index:1001">
  <div class="modal modal-sm" style="max-width:440px">
    <div class="modal-header"><h2 id="revert-confirm-title">Revert Change</h2></div>
    <div class="modal-body" id="revert-confirm-body"></div>
    <div class="modal-footer">
      <button class="btn-secondary" id="revert-cancel-btn">Cancel</button>
      <button class="btn-primary" id="revert-confirm-btn" style="background:var(--orange)">Revert</button>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add src/index.html
git commit -m "Add tab bars to ingredient/supplier modals and revert confirmation modal"
```

---

## Task 8: History tab rendering in activity-view.js

**Files:**
- Modify: `src/activity-view.js` (already has renderHistoryTab from Task 3)

The `renderHistoryTab(entityType, entityId)` function was already implemented in Task 3. It filters the log by `entityId` (and `parentId` for recipes), supports archive loading on-demand, and shows the "Created on" badge. No additional code changes needed.

- [ ] **Step 1: Verify history tab works by manual inspection**

1. Open an ingredient modal, click the "History" tab
2. Confirm entries for that ingredient appear
3. Open a recipe, check that nested recipeIngredient/subRecipe entries show up
4. Confirm "Created on" badge appears if a create entry exists

- [ ] **Step 2: Commit (no-op — already committed in Task 3)**

No commit needed; Task 3 already includes all history tab rendering code.

---

## Task 9: Wire History tabs into app.js

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Add tab switching functions**

Add after the `closeConfirm()` function (~line 11633) in `src/app.js`:

```javascript
// ─── Ingredient Modal Tab Switching ─────────────────────────────────
function switchIngTab(tabId) {
  var tabs = ['ing-tab-details', 'ing-tab-history'];
  tabs.forEach(function (t) {
    var panel = document.getElementById(t);
    var btn = document.querySelector('.ing-tab-btn[data-tab="' + t + '"]');
    if (panel) panel.style.display = t === tabId ? '' : 'none';
    if (btn) {
      btn.classList.toggle('active', t === tabId);
      btn.style.color = t === tabId ? 'var(--text-primary)' : 'var(--text-muted)';
      btn.style.borderBottomColor = t === tabId ? 'var(--accent)' : 'transparent';
    }
  });
  if (tabId === 'ing-tab-history' && editingIngredientId && typeof ActivityView !== 'undefined') {
    ActivityView.renderHistoryTab('ingredient', editingIngredientId);
  }
}

// ─── Supplier Modal Tab Switching ───────────────────────────────────
function switchSupTab(tabId) {
  var tabs = ['sup-tab-details', 'sup-tab-history'];
  tabs.forEach(function (t) {
    var panel = document.getElementById(t);
    var btn = document.querySelector('.sup-tab-btn[data-tab="' + t + '"]');
    if (panel) panel.style.display = t === tabId ? '' : 'none';
    if (btn) {
      btn.classList.toggle('active', t === tabId);
      btn.style.color = t === tabId ? 'var(--text-primary)' : 'var(--text-muted)';
      btn.style.borderBottomColor = t === tabId ? 'var(--accent)' : 'transparent';
    }
  });
  if (tabId === 'sup-tab-history' && typeof ActivityView !== 'undefined') {
    var supId = document.getElementById('supplier-modal').dataset.editId;
    if (supId) ActivityView.renderHistoryTab('supplier', supId);
  }
}
```

- [ ] **Step 2: Reset ingredient modal tabs when opening**

In `openIngredientModal()` (line 8678), add at the very beginning of the function body (after `editingIngredientId = id;`):

```javascript
  // Reset to Details tab
  switchIngTab('ing-tab-details');
```

- [ ] **Step 3: Store supplier ID on modal open and reset tab**

In `openSupplierModal()` (line 13502), add at the beginning:

```javascript
  // Store editing supplier ID for history tab
  document.getElementById('supplier-modal').dataset.editId = id || '';
  // Reset to Details tab
  switchSupTab('sup-tab-details');
```

- [ ] **Step 4: Add recipe history button in renderRecipeEditor**

In `renderRecipeEditor()` (line 5712), find the "More" dropdown menu items. After the last `<div class="rh-more-item"` for "Allergen sheet", add a history entry:

Find:
```javascript
              <div class="rh-more-item" onclick="printAllergenSheet();closeRecipeMoreMenu('${recipe.id}')">⚠️ Allergen sheet</div>
```

Add after it:
```javascript
              <div class="rh-more-item" onclick="toggleRecipeHistory('${recipe.id}');closeRecipeMoreMenu('${recipe.id}')">🕒 Edit history</div>
```

Then add the history panel to the recipe editor. After the `editor.innerHTML = \`...\`` template string completes (find where the template ends and `editor.innerHTML` assignment closes), add right after:

```javascript
  // Append recipe history panel (hidden by default)
  var histPanel = document.getElementById('recipe-history-panel');
  if (!histPanel) {
    histPanel = document.createElement('div');
    histPanel.id = 'recipe-history-panel';
    histPanel.style.cssText = 'display:none;border-top:2px solid var(--border);padding:16px;max-height:350px;overflow-y:auto';
    histPanel.innerHTML = '<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;margin-bottom:12px">📋 Edit History</div><div id="history-recipe-feed"></div>';
    editor.appendChild(histPanel);
  } else {
    editor.appendChild(histPanel);
  }
```

Add the `toggleRecipeHistory` function after the tab switching functions:

```javascript
function toggleRecipeHistory(recipeId) {
  var panel = document.getElementById('recipe-history-panel');
  if (!panel) return;
  if (panel.style.display === 'none') {
    panel.style.display = '';
    if (typeof ActivityView !== 'undefined') {
      ActivityView.renderHistoryTab('recipe', recipeId);
    }
  } else {
    panel.style.display = 'none';
  }
}
```

- [ ] **Step 5: Verify tabs and history buttons work**

1. Open an ingredient modal while editing — confirm Details tab active, History tab clickable
2. Click History — confirm entries load
3. Open a supplier modal — confirm same tab behavior
4. Open a recipe, click More > Edit history — confirm history panel toggles

- [ ] **Step 6: Commit**

```bash
git add src/app.js
git commit -m "Wire History tabs into ingredient/supplier modals and recipe editor"
```

---

## Task 10: Revert confirmation modal logic

**Files:**
- Already implemented in `src/activity-view.js` (Task 3) and `src/index.html` (Task 7)

The `showRevertConfirm(entry)` function in activity-view.js already:
1. Calls `Audit.checkStaleness()` to detect staleness
2. Shows the revert-confirm-modal with visual diff
3. Displays staleness warning when current value differs from entry's after
4. Handles record-missing case by disabling the Revert button
5. On confirm, calls `executeRevert(entry)` which calls `Audit.revertEntry()`, refreshes the snapshot, triggers `save()`, and re-renders

The revert-confirm-modal HTML was added in Task 7 Step 3.

- [ ] **Step 1: Verify revert flow end-to-end**

1. Make an edit to an ingredient (e.g. change packCost)
2. Navigate to Settings > Activity Log
3. Find the update entry, click "Revert"
4. Confirm the revert confirmation modal appears with correct before/after values
5. Click "Revert" — confirm the field reverts, a toast appears, and a "restore" entry appears in the feed
6. Delete an ingredient, then find the delete entry, click "Revert"
7. Confirm the ingredient is re-created

- [ ] **Step 2: Test staleness warning**

1. Change an ingredient's packCost from 1.00 to 2.00 (creates update entry)
2. Change it again from 2.00 to 3.00
3. Find the first update entry (1.00 -> 2.00) and click Revert
4. Confirm the staleness warning appears: "Current value is 3.00. Reverting will overwrite it with 1.00."

- [ ] **Step 3: Test record-missing case**

1. Delete an ingredient
2. Find a previous update entry for that ingredient and click Revert
3. Confirm the modal says "This record no longer exists" with only a Close button

- [ ] **Step 4: Commit (no-op — logic already committed in Tasks 3 and 7)**

No commit needed.

---

## Task 11: Final regression sweep

**Files:** None (verification only)

- [ ] **Step 1: Run full Jest suite**

```bash
npx jest --verbose
```

Expected: ALL tests pass (33 audit + 5 migration + 43 costing + new checkStaleness + revertEntry + activity-view tests).

- [ ] **Step 2: Manual verification checklist**

Run through each item:

- [ ] Open Settings — Activity Log panel visible with filter sidebar
- [ ] Entity toggle buttons filter the feed correctly
- [ ] Operation toggle buttons filter the feed correctly
- [ ] Date range dropdown filters correctly
- [ ] Search box filters by entity name
- [ ] "Load older" pagination works
- [ ] Archives dropdown loads archived months
- [ ] Ingredient modal has Details | History tabs
- [ ] Ingredient History tab shows entries for that ingredient
- [ ] Supplier modal has Details | History tabs
- [ ] Supplier History tab shows entries for that supplier
- [ ] Recipe editor has "Edit history" in More menu
- [ ] Recipe history includes nested recipeIngredient/subRecipe entries
- [ ] "Created on" badge appears in history tabs
- [ ] Revert on update entry shows confirmation with diff
- [ ] Revert on delete entry shows confirmation with restore option
- [ ] Staleness warning appears when field changed since entry
- [ ] Record-missing case shows disabled revert
- [ ] Revert creates a restore log entry
- [ ] After revert, save() fires and data persists
- [ ] Dark mode rendering is correct for all new UI
- [ ] Existing ingredient/supplier form editing still works (tab does not break form)

- [ ] **Step 3: Commit (no-op — all code already committed)**

All implementation is complete. Tag the branch as ready for review.
