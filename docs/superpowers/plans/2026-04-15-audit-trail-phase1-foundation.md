# Audit Trail Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Silently record every meaningful edit to ingredients, recipes, and suppliers into an append-only audit log, stamping records with `_modifiedAt`/`_modifiedBy`, without changing any of the existing imperative mutation call sites in `src/app.js`.

**Architecture:** A new standalone `src/audit.js` UMD module holds all audit-related pure functions (snapshot builder, diff engine, migration, log rotation, bulk wrapper). It is loaded via a `<script>` tag in `src/index.html` before `app.js`, exposing `window.Audit`. The same file is `require()`-able from Jest tests thanks to the UMD wrapper. `src/app.js` is modified in exactly three places: `init()` (run migration + build initial snapshot), `save()` (compute diff + stamp records + append entries + refresh snapshot), and in the two places that switch the active location (refresh snapshot after the switch).

**Tech Stack:** Vanilla JS (no bundler), Electron, Jest for tests. No new dependencies.

**Scope:** This plan implements **Phase 1 (Foundation) only** from the spec at `docs/superpowers/specs/2026-04-15-sync-conflict-resolution-and-audit-trail-design.md`. Phases 2 (Activity view), 3 (Merge engine), and 4 (Conflict UI) will each get their own implementation plan after Phase 1 ships. At the end of Phase 1, the audit log will be populated on every save but no UI surfaces it yet — verification is via unit tests and by directly inspecting `state.auditLog` in DevTools.

---

## File Structure

**Created:**
- `src/audit.js` — UMD module exposing `window.Audit` in browser, `module.exports` in Node. Contains: constants, `buildSnapshot`, `computeDiff`, `migrateToV2`, `appendLogEntries`, `rotateLog`, `startBulk`, `endBulk`, `newLogId`.
- `src/__tests__/audit.test.js` — unit tests for snapshot, diff (top-level + nested), append, rotation, bulk.
- `src/__tests__/audit-migration.test.js` — unit tests for `migrateToV2` including idempotence and pre-v2 fixtures.

**Modified:**
- `src/index.html` — add `<script src="audit.js"></script>` before `<script src="app.js"></script>`.
- `src/app.js` — call `Audit.migrateToV2` inside `init()` after existing migrations; call `Audit.buildSnapshot` at end of `init()` and after location switches; call `Audit.computeDiff` + stamp + append inside `save()`; add `auditLog`, `schemaVersion`, `_lastSyncAt` to the save payload whitelist.
- `main.js` — new IPC handlers `list-audit-archives`, `load-audit-archive`, `save-audit-archive`.
- `src/preload.js` — expose `listAuditArchives`, `loadAuditArchive`, `saveAuditArchive` on `electronAPI`.

**Not modified:** `package.json` (no new deps), any mutation helper in `app.js`, `pushUndo`, any sync code (sync changes live in Phase 3).

---

## Task 1: Scaffold `src/audit.js` with UMD wrapper and constants

**Files:**
- Create: `src/audit.js`
- Test: `src/__tests__/audit.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/audit.test.js`:

```javascript
const Audit = require('../audit.js');

describe('audit module exports', () => {
  test('exposes SCHEMA_VERSION constant equal to 2', () => {
    expect(Audit.SCHEMA_VERSION).toBe(2);
  });

  test('exposes TRACKED_COLLECTIONS array', () => {
    expect(Audit.TRACKED_COLLECTIONS).toEqual(['ingredients', 'recipes', 'suppliers']);
  });

  test('INGREDIENT_TRACKED_FIELDS contains key pricing fields', () => {
    expect(Audit.INGREDIENT_TRACKED_FIELDS).toEqual(
      expect.arrayContaining(['name', 'packCost', 'packSize', 'packCount', 'unit', 'yieldPct', 'category', 'supplierId'])
    );
  });

  test('newLogId returns a unique-ish string prefixed with "log_"', () => {
    const a = Audit.newLogId();
    const b = Audit.newLogId();
    expect(a).toMatch(/^log_/);
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/audit.test.js -t "audit module exports"`
Expected: FAIL with `Cannot find module '../audit.js'`

- [ ] **Step 3: Create `src/audit.js` with UMD wrapper and constants**

```javascript
/**
 * src/audit.js — Audit trail foundation (Phase 1).
 *
 * Loaded two ways:
 *   1. Browser: <script src="audit.js"></script> before app.js loads.
 *      Exposes window.Audit.
 *   2. Jest: require('../audit.js'). Exposes module.exports.
 *
 * This file is pure — no DOM, no IPC, no dependencies. Everything is a
 * deterministic function of its inputs. That is what makes it testable.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Audit = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // ─── Schema / tracking constants ──────────────────────────────────────────
  const SCHEMA_VERSION = 2;

  const TRACKED_COLLECTIONS = ['ingredients', 'recipes', 'suppliers'];

  const INGREDIENT_TRACKED_FIELDS = [
    'name', 'category', 'packCost', 'packSize', 'packCount', 'unit',
    'yieldPct', 'supplierId', 'allergens', 'nutrition', 'altSuppliers',
    'notes', 'barcode', 'sku',
  ];

  const RECIPE_TRACKED_FIELDS = [
    'name', 'category', 'portions', 'yieldQty', 'yieldUnit', 'notes',
    'method', 'tags', 'locked', 'priceOverride', 'popularity', 'scale',
  ];

  // Recipe arrays that contain rows we diff by `ingId` / `recipeId`.
  const RECIPE_NESTED_FIELDS = ['ingredients', 'subRecipes'];

  const SUPPLIER_TRACKED_FIELDS = [
    'name', 'email', 'phone', 'notes', 'address', 'accountNumber',
  ];

  // Fields / top-level keys we never log even if they change. Runtime caches,
  // UI state, transient sync metadata.
  const IGNORED_STATE_KEYS = [
    '_costCache', '_loadSnapshot', '_lastEditTimestamp', '_saveTimer',
    'activeRecipeId', 'activeLocationId', 'activeSiteId',
    'darkMode', // user preference, not forensic
  ];

  // ─── ID generator ─────────────────────────────────────────────────────────
  let _idCounter = 0;
  function newLogId() {
    _idCounter = (_idCounter + 1) % 1000000;
    return 'log_' + Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8) + '_' +
      _idCounter.toString(36);
  }

  // ─── Public API (filled in by later tasks) ────────────────────────────────
  return {
    SCHEMA_VERSION,
    TRACKED_COLLECTIONS,
    INGREDIENT_TRACKED_FIELDS,
    RECIPE_TRACKED_FIELDS,
    RECIPE_NESTED_FIELDS,
    SUPPLIER_TRACKED_FIELDS,
    IGNORED_STATE_KEYS,
    newLogId,
  };
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/audit.test.js -t "audit module exports"`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/audit.js src/__tests__/audit.test.js
git commit -m "Scaffold audit.js UMD module with schema constants and id generator"
```

---

## Task 2: `buildSnapshot(state)` — flat clone of tracked fields

**Files:**
- Modify: `src/audit.js`
- Modify: `src/__tests__/audit.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/audit.test.js`:

```javascript
describe('buildSnapshot', () => {
  const sampleState = () => ({
    ingredients: [
      { id: 'ing1', name: 'Cucumber', packCost: 0.9, packSize: 1, unit: 'each', yieldPct: 100, _costCache: 999 },
      { id: 'ing2', name: 'Beef',     packCost: 12,  packSize: 1000, unit: 'g',  yieldPct: 92  },
    ],
    recipes: [
      {
        id: 'rec1', name: 'Salad', portions: 4,
        ingredients: [
          { ingId: 'ing1', qty: 2, recipeUnit: 'each', wastePct: 0 },
        ],
        subRecipes: [],
      },
    ],
    suppliers: [
      { id: 'sup1', name: 'Brakes', email: 'a@b.c', phone: '123' },
    ],
  });

  test('snapshot maps each collection id to a flat clone of tracked fields', () => {
    const snap = Audit.buildSnapshot(sampleState());
    expect(snap.ingredients.get('ing1').packCost).toBe(0.9);
    expect(snap.ingredients.get('ing1').name).toBe('Cucumber');
    expect(snap.recipes.get('rec1').name).toBe('Salad');
    expect(snap.suppliers.get('sup1').email).toBe('a@b.c');
  });

  test('snapshot ignores runtime cache fields like _costCache', () => {
    const snap = Audit.buildSnapshot(sampleState());
    expect(snap.ingredients.get('ing1')._costCache).toBeUndefined();
  });

  test('snapshot captures recipe nested ingredient rows by ingId', () => {
    const snap = Audit.buildSnapshot(sampleState());
    const rec = snap.recipes.get('rec1');
    expect(rec.ingredients).toHaveLength(1);
    expect(rec.ingredients[0]).toEqual({ ingId: 'ing1', qty: 2, recipeUnit: 'each', wastePct: 0 });
  });

  test('snapshot is a deep clone — mutating the original does not affect it', () => {
    const state = sampleState();
    const snap = Audit.buildSnapshot(state);
    state.ingredients[0].packCost = 99;
    expect(snap.ingredients.get('ing1').packCost).toBe(0.9);
  });

  test('snapshot handles empty / missing collections gracefully', () => {
    const snap = Audit.buildSnapshot({});
    expect(snap.ingredients.size).toBe(0);
    expect(snap.recipes.size).toBe(0);
    expect(snap.suppliers.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/audit.test.js -t "buildSnapshot"`
Expected: FAIL with `Audit.buildSnapshot is not a function`

- [ ] **Step 3: Implement `buildSnapshot` in `src/audit.js`**

Inside the factory function (before the `return` statement), add:

```javascript
  // ─── Snapshot ─────────────────────────────────────────────────────────────
  // Capture a flat, deep-cloned view of every tracked field so we can diff
  // against the live state at save time.
  function _pickFields(record, fields) {
    const out = {};
    for (const f of fields) {
      if (record[f] !== undefined) {
        out[f] = _deepClone(record[f]);
      }
    }
    return out;
  }

  function _deepClone(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(_deepClone);
    const o = {};
    for (const k of Object.keys(v)) o[k] = _deepClone(v[k]);
    return o;
  }

  function buildSnapshot(state) {
    const snap = {
      ingredients: new Map(),
      recipes: new Map(),
      suppliers: new Map(),
    };

    (state.ingredients || []).forEach((ing) => {
      if (ing && ing.id) {
        snap.ingredients.set(ing.id, _pickFields(ing, INGREDIENT_TRACKED_FIELDS));
      }
    });

    (state.recipes || []).forEach((rec) => {
      if (!rec || !rec.id) return;
      const picked = _pickFields(rec, RECIPE_TRACKED_FIELDS);
      // Nested arrays are captured separately so the diff can walk rows.
      picked.ingredients = _deepClone(rec.ingredients || []);
      picked.subRecipes  = _deepClone(rec.subRecipes || []);
      snap.recipes.set(rec.id, picked);
    });

    (state.suppliers || []).forEach((sup) => {
      if (sup && sup.id) {
        snap.suppliers.set(sup.id, _pickFields(sup, SUPPLIER_TRACKED_FIELDS));
      }
    });

    return snap;
  }
```

And add `buildSnapshot` to the returned object:

```javascript
  return {
    SCHEMA_VERSION,
    TRACKED_COLLECTIONS,
    INGREDIENT_TRACKED_FIELDS,
    RECIPE_TRACKED_FIELDS,
    RECIPE_NESTED_FIELDS,
    SUPPLIER_TRACKED_FIELDS,
    IGNORED_STATE_KEYS,
    newLogId,
    buildSnapshot,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/audit.test.js -t "buildSnapshot"`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/audit.js src/__tests__/audit.test.js
git commit -m "Add Audit.buildSnapshot for capturing tracked fields pre-edit"
```

---

## Task 3: `computeDiff` — top-level record create/update/delete

**Files:**
- Modify: `src/audit.js`
- Modify: `src/__tests__/audit.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/audit.test.js`:

```javascript
describe('computeDiff — top-level records', () => {
  const baseState = () => ({
    ingredients: [
      { id: 'ing1', name: 'Cucumber', packCost: 0.9, packSize: 1, unit: 'each', yieldPct: 100 },
      { id: 'ing2', name: 'Beef',     packCost: 12,  packSize: 1000, unit: 'g',  yieldPct: 92 },
    ],
    recipes: [],
    suppliers: [],
  });

  test('no changes → empty entries', () => {
    const state = baseState();
    const snap = Audit.buildSnapshot(state);
    const { entries } = Audit.computeDiff(snap, state, 'TestDevice');
    expect(entries).toEqual([]);
  });

  test('single field change → one update entry with before/after', () => {
    const state = baseState();
    const snap = Audit.buildSnapshot(state);
    state.ingredients[0].packCost = 0.95;
    const { entries } = Audit.computeDiff(snap, state, 'TestDevice');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      op: 'update',
      entity: 'ingredient',
      entityId: 'ing1',
      entityName: 'Cucumber',
      field: 'packCost',
      before: 0.9,
      after: 0.95,
      device: 'TestDevice',
    });
    expect(entries[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entries[0].id).toMatch(/^log_/);
  });

  test('multiple field changes on same record → one entry per field', () => {
    const state = baseState();
    const snap = Audit.buildSnapshot(state);
    state.ingredients[0].packCost = 0.95;
    state.ingredients[0].yieldPct = 90;
    const { entries } = Audit.computeDiff(snap, state, 'TestDevice');
    expect(entries).toHaveLength(2);
    const fields = entries.map(e => e.field).sort();
    expect(fields).toEqual(['packCost', 'yieldPct']);
  });

  test('new record → one create entry with full record in after', () => {
    const state = baseState();
    const snap = Audit.buildSnapshot(state);
    state.ingredients.push({ id: 'ing3', name: 'Tomato', packCost: 1.5, packSize: 1, unit: 'each', yieldPct: 100 });
    const { entries } = Audit.computeDiff(snap, state, 'TestDevice');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      op: 'create', entity: 'ingredient', entityId: 'ing3', entityName: 'Tomato',
    });
    expect(entries[0].after.packCost).toBe(1.5);
    expect(entries[0].field).toBeUndefined();
  });

  test('deleted record → one delete entry with full record in before', () => {
    const state = baseState();
    const snap = Audit.buildSnapshot(state);
    state.ingredients.splice(1, 1); // remove Beef
    const { entries } = Audit.computeDiff(snap, state, 'TestDevice');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      op: 'delete', entity: 'ingredient', entityId: 'ing2', entityName: 'Beef',
    });
    expect(entries[0].before.packCost).toBe(12);
  });

  test('computeDiff returns stamped set of changed record ids', () => {
    const state = baseState();
    const snap = Audit.buildSnapshot(state);
    state.ingredients[0].packCost = 0.95;
    const { stampedIds } = Audit.computeDiff(snap, state, 'TestDevice');
    expect(stampedIds.ingredients).toEqual(new Set(['ing1']));
  });

  test('skipIds are not logged or stamped even if changed', () => {
    const state = baseState();
    const snap = Audit.buildSnapshot(state);
    state.ingredients[0].packCost = 0.95;
    const { entries, stampedIds } = Audit.computeDiff(
      snap, state, 'TestDevice',
      { skipIds: { ingredients: new Set(['ing1']) } }
    );
    expect(entries).toEqual([]);
    expect(stampedIds.ingredients.has('ing1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/audit.test.js -t "computeDiff — top-level"`
Expected: FAIL with `Audit.computeDiff is not a function`

- [ ] **Step 3: Implement `computeDiff` in `src/audit.js`**

Add inside the factory function, after `buildSnapshot`:

```javascript
  // ─── Diff ────────────────────────────────────────────────────────────────
  // Walk a snapshot and a live state and emit an audit entry per meaningful
  // field change. Also emit create/delete entries for added/removed records.
  //
  // Returns { entries: [...], stampedIds: { ingredients: Set, recipes: Set, suppliers: Set } }
  // stampedIds tells the caller which records should get new _modifiedAt stamps.
  //
  // Opts: { skipIds: { ingredients?: Set, recipes?: Set, suppliers?: Set } }
  //   — ids in skipIds are excluded entirely (used by the bulk-op wrapper so
  //     a bulk price update is logged as ONE aggregate entry, not N diffs).

  function _shallowEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (!_shallowEqual(a[k], b[k])) return false;
    }
    return true;
  }

  function _entityForCollection(collection) {
    if (collection === 'ingredients') return 'ingredient';
    if (collection === 'recipes') return 'recipe';
    if (collection === 'suppliers') return 'supplier';
    return collection;
  }

  function _fieldsForCollection(collection) {
    if (collection === 'ingredients') return INGREDIENT_TRACKED_FIELDS;
    if (collection === 'recipes') return RECIPE_TRACKED_FIELDS;
    if (collection === 'suppliers') return SUPPLIER_TRACKED_FIELDS;
    return [];
  }

  function _makeEntry(op, entity, rec, extras, device) {
    return Object.assign({
      id: newLogId(),
      ts: new Date().toISOString(),
      device: device || 'Unknown',
      op,
      entity,
      entityId: rec.id,
      entityName: rec.name || '(unnamed)',
    }, extras || {});
  }

  function computeDiff(snapshot, state, device, opts) {
    opts = opts || {};
    const skipIds = opts.skipIds || {};
    const entries = [];
    const stampedIds = {
      ingredients: new Set(),
      recipes: new Set(),
      suppliers: new Set(),
    };

    for (const collection of TRACKED_COLLECTIONS) {
      const entity = _entityForCollection(collection);
      const fields = _fieldsForCollection(collection);
      const skip = skipIds[collection] || new Set();

      const snapMap = snapshot[collection] || new Map();
      const liveById = new Map();
      (state[collection] || []).forEach((r) => {
        if (r && r.id) liveById.set(r.id, r);
      });

      // creates + updates
      for (const [id, liveRec] of liveById) {
        if (skip.has(id)) continue;
        const snapRec = snapMap.get(id);
        if (!snapRec) {
          // CREATE
          entries.push(_makeEntry('create', entity, liveRec, {
            after: _pickFields(liveRec, fields),
          }, device));
          stampedIds[collection].add(id);
          continue;
        }
        // UPDATE — walk each tracked field
        let changed = false;
        for (const f of fields) {
          const beforeVal = snapRec[f];
          const afterVal = liveRec[f];
          if (!_shallowEqual(beforeVal, afterVal)) {
            entries.push(_makeEntry('update', entity, liveRec, {
              field: f,
              before: _deepClone(beforeVal),
              after: _deepClone(afterVal),
            }, device));
            changed = true;
          }
        }
        if (changed) stampedIds[collection].add(id);
      }

      // deletes
      for (const [id, snapRec] of snapMap) {
        if (skip.has(id)) continue;
        if (!liveById.has(id)) {
          entries.push(_makeEntry('delete', entity, snapRec, {
            before: _deepClone(snapRec),
          }, device));
          // stampedIds does NOT include deleted ids — no record to stamp.
        }
      }
    }

    return { entries, stampedIds };
  }
```

Add `computeDiff` to the returned object:

```javascript
  return {
    SCHEMA_VERSION,
    TRACKED_COLLECTIONS,
    INGREDIENT_TRACKED_FIELDS,
    RECIPE_TRACKED_FIELDS,
    RECIPE_NESTED_FIELDS,
    SUPPLIER_TRACKED_FIELDS,
    IGNORED_STATE_KEYS,
    newLogId,
    buildSnapshot,
    computeDiff,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/audit.test.js -t "computeDiff — top-level"`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/audit.js src/__tests__/audit.test.js
git commit -m "Add Audit.computeDiff for top-level record create/update/delete"
```

---

## Task 4: `computeDiff` — nested recipe rows (ingredients + sub-recipes)

**Files:**
- Modify: `src/audit.js`
- Modify: `src/__tests__/audit.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/audit.test.js`:

```javascript
describe('computeDiff — nested recipe rows', () => {
  const recipeState = () => ({
    ingredients: [],
    recipes: [
      {
        id: 'rec1', name: 'Bolognese', portions: 4,
        ingredients: [
          { ingId: 'ing1', qty: 500, recipeUnit: 'g', wastePct: 0 },
          { ingId: 'ing2', qty: 200, recipeUnit: 'g', wastePct: 5 },
        ],
        subRecipes: [
          { recipeId: 'rec-sauce', qty: 1 },
        ],
      },
    ],
    suppliers: [],
  });

  test('ingredient row added to recipe → one recipeIngredient create entry', () => {
    const state = recipeState();
    const snap = Audit.buildSnapshot(state);
    state.recipes[0].ingredients.push({ ingId: 'ing3', qty: 1, recipeUnit: 'each', wastePct: 0 });
    const { entries } = Audit.computeDiff(snap, state, 'Dev');
    const relevant = entries.filter(e => e.entity === 'recipeIngredient');
    expect(relevant).toHaveLength(1);
    expect(relevant[0]).toMatchObject({
      op: 'create',
      parentId: 'rec1',
      entityId: 'ing3',
    });
  });

  test('ingredient row removed from recipe → one recipeIngredient delete entry', () => {
    const state = recipeState();
    const snap = Audit.buildSnapshot(state);
    state.recipes[0].ingredients.splice(0, 1); // remove ing1
    const { entries } = Audit.computeDiff(snap, state, 'Dev');
    const relevant = entries.filter(e => e.entity === 'recipeIngredient');
    expect(relevant).toHaveLength(1);
    expect(relevant[0]).toMatchObject({
      op: 'delete',
      parentId: 'rec1',
      entityId: 'ing1',
    });
  });

  test('ingredient row qty change → one recipeIngredient update entry', () => {
    const state = recipeState();
    const snap = Audit.buildSnapshot(state);
    state.recipes[0].ingredients[0].qty = 700;
    const { entries } = Audit.computeDiff(snap, state, 'Dev');
    const relevant = entries.filter(e => e.entity === 'recipeIngredient');
    expect(relevant).toHaveLength(1);
    expect(relevant[0]).toMatchObject({
      op: 'update',
      parentId: 'rec1',
      entityId: 'ing1',
      field: 'qty',
      before: 500,
      after: 700,
    });
  });

  test('ingredient row reorder (no other changes) → one ingredientOrder entry', () => {
    const state = recipeState();
    const snap = Audit.buildSnapshot(state);
    // swap the two rows
    state.recipes[0].ingredients = [state.recipes[0].ingredients[1], state.recipes[0].ingredients[0]];
    const { entries } = Audit.computeDiff(snap, state, 'Dev');
    const relevant = entries.filter(e => e.field === 'ingredientOrder');
    expect(relevant).toHaveLength(1);
    expect(relevant[0]).toMatchObject({
      op: 'update', entity: 'recipe', entityId: 'rec1', field: 'ingredientOrder',
    });
    expect(relevant[0].before).toEqual(['ing1', 'ing2']);
    expect(relevant[0].after).toEqual(['ing2', 'ing1']);
  });

  test('sub-recipe added → one subRecipe create entry', () => {
    const state = recipeState();
    const snap = Audit.buildSnapshot(state);
    state.recipes[0].subRecipes.push({ recipeId: 'rec-extra', qty: 2 });
    const { entries } = Audit.computeDiff(snap, state, 'Dev');
    const relevant = entries.filter(e => e.entity === 'subRecipe');
    expect(relevant).toHaveLength(1);
    expect(relevant[0]).toMatchObject({
      op: 'create', parentId: 'rec1', entityId: 'rec-extra',
    });
  });

  test('changing ingredient row qty also stamps the parent recipe', () => {
    const state = recipeState();
    const snap = Audit.buildSnapshot(state);
    state.recipes[0].ingredients[0].qty = 700;
    const { stampedIds } = Audit.computeDiff(snap, state, 'Dev');
    expect(stampedIds.recipes.has('rec1')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/audit.test.js -t "computeDiff — nested"`
Expected: FAIL (multiple failures — nested logic not yet implemented)

- [ ] **Step 3: Extend `computeDiff` to handle nested recipe rows**

In `src/audit.js`, add this helper function above `computeDiff`:

```javascript
  function _diffNestedRows(parentRec, snapRec, rowsKey, idKey, nestedEntity, device, entries) {
    const before = snapRec[rowsKey] || [];
    const after  = parentRec[rowsKey] || [];
    const beforeById = new Map();
    const afterById  = new Map();
    before.forEach(r => { if (r && r[idKey]) beforeById.set(r[idKey], r); });
    after.forEach(r  => { if (r && r[idKey]) afterById.set(r[idKey], r);  });

    let anyChange = false;

    // creates
    for (const [id, row] of afterById) {
      if (!beforeById.has(id)) {
        entries.push({
          id: newLogId(),
          ts: new Date().toISOString(),
          device: device || 'Unknown',
          op: 'create',
          entity: nestedEntity,
          entityId: id,
          entityName: parentRec.name || '(unnamed)',
          parentId: parentRec.id,
          after: _deepClone(row),
        });
        anyChange = true;
      }
    }

    // deletes
    for (const [id, row] of beforeById) {
      if (!afterById.has(id)) {
        entries.push({
          id: newLogId(),
          ts: new Date().toISOString(),
          device: device || 'Unknown',
          op: 'delete',
          entity: nestedEntity,
          entityId: id,
          entityName: parentRec.name || '(unnamed)',
          parentId: parentRec.id,
          before: _deepClone(row),
        });
        anyChange = true;
      }
    }

    // updates — walk each field on matching rows
    for (const [id, afterRow] of afterById) {
      const beforeRow = beforeById.get(id);
      if (!beforeRow) continue;
      for (const f of Object.keys(afterRow)) {
        if (f === idKey) continue;
        if (!_shallowEqual(beforeRow[f], afterRow[f])) {
          entries.push({
            id: newLogId(),
            ts: new Date().toISOString(),
            device: device || 'Unknown',
            op: 'update',
            entity: nestedEntity,
            entityId: id,
            entityName: parentRec.name || '(unnamed)',
            parentId: parentRec.id,
            field: f,
            before: _deepClone(beforeRow[f]),
            after: _deepClone(afterRow[f]),
          });
          anyChange = true;
        }
      }
    }

    // reorder — same set of ids but different order
    const beforeOrder = before.map(r => r && r[idKey]).filter(Boolean);
    const afterOrder  = after.map(r  => r && r[idKey]).filter(Boolean);
    if (beforeOrder.length === afterOrder.length &&
        beforeOrder.every(id => afterById.has(id)) &&
        !beforeOrder.every((id, i) => id === afterOrder[i])) {
      // Only emit an "ingredientOrder" / "subRecipeOrder" entry if the
      // set of rows is identical — otherwise creates/deletes cover it.
      entries.push({
        id: newLogId(),
        ts: new Date().toISOString(),
        device: device || 'Unknown',
        op: 'update',
        entity: 'recipe',
        entityId: parentRec.id,
        entityName: parentRec.name || '(unnamed)',
        field: rowsKey === 'ingredients' ? 'ingredientOrder' : 'subRecipeOrder',
        before: beforeOrder,
        after: afterOrder,
      });
      anyChange = true;
    }

    return anyChange;
  }
```

Then inside the `computeDiff` `// UPDATE — walk each tracked field` branch for the `recipes` collection, call the helper after the top-level field walk. Replace the recipe-update loop body:

Find this block inside `computeDiff`:

```javascript
        // UPDATE — walk each tracked field
        let changed = false;
        for (const f of fields) {
```

…and wrap it so that for recipes specifically we also walk nested rows. Easiest approach: after the existing field loop but before `if (changed) stampedIds[collection].add(id);`, insert:

```javascript
        if (collection === 'recipes') {
          if (_diffNestedRows(liveRec, snapRec, 'ingredients', 'ingId', 'recipeIngredient', device, entries)) {
            changed = true;
          }
          if (_diffNestedRows(liveRec, snapRec, 'subRecipes', 'recipeId', 'subRecipe', device, entries)) {
            changed = true;
          }
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/audit.test.js -t "computeDiff — nested"`
Expected: PASS (6 tests)

Also run the full audit test file to make sure nothing regressed:

Run: `npx jest src/__tests__/audit.test.js`
Expected: all previous tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/audit.js src/__tests__/audit.test.js
git commit -m "Extend computeDiff to nested recipe rows and reorders"
```

---

## Task 5: `migrateToV2` — stamp existing records, init log

**Files:**
- Modify: `src/audit.js`
- Create: `src/__tests__/audit-migration.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/audit-migration.test.js`:

```javascript
const Audit = require('../audit.js');

describe('migrateToV2', () => {
  test('pre-v2 state gains schemaVersion, auditLog, _lastSyncAt, and stamped records', () => {
    const state = {
      ingredients: [{ id: 'ing1', name: 'A', packCost: 1 }],
      recipes:     [{ id: 'rec1', name: 'B', portions: 2, ingredients: [], subRecipes: [] }],
      suppliers:   [{ id: 'sup1', name: 'C' }],
      exportDate:  '2026-04-10T00:00:00.000Z',
    };
    const result = Audit.migrateToV2(state, 'Test-Device');
    expect(result.migrated).toBe(true);
    expect(state.schemaVersion).toBe(2);
    expect(state.auditLog).toEqual([]);
    expect(state._lastSyncAt).toBeNull();
    expect(state.ingredients[0]._modifiedAt).toBe('2026-04-10T00:00:00.000Z');
    expect(state.ingredients[0]._modifiedBy).toBe('Test-Device');
    expect(state.recipes[0]._modifiedAt).toBe('2026-04-10T00:00:00.000Z');
    expect(state.suppliers[0]._modifiedAt).toBe('2026-04-10T00:00:00.000Z');
  });

  test('is idempotent — running twice is a no-op after the first run', () => {
    const state = {
      ingredients: [{ id: 'ing1', name: 'A', packCost: 1 }],
      recipes: [],
      suppliers: [],
    };
    Audit.migrateToV2(state, 'Test-Device');
    const firstLog = state.auditLog;
    const firstStamp = state.ingredients[0]._modifiedAt;
    const result = Audit.migrateToV2(state, 'Test-Device');
    expect(result.migrated).toBe(false);
    expect(state.auditLog).toBe(firstLog);
    expect(state.ingredients[0]._modifiedAt).toBe(firstStamp);
  });

  test('uses new ISO now() if exportDate is missing', () => {
    const state = { ingredients: [{ id: 'ing1', name: 'A' }], recipes: [], suppliers: [] };
    Audit.migrateToV2(state, 'Dev');
    expect(state.ingredients[0]._modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('does not stamp records that already have _modifiedAt', () => {
    const state = {
      ingredients: [{ id: 'ing1', name: 'A', _modifiedAt: '2025-01-01T00:00:00.000Z', _modifiedBy: 'Old' }],
      recipes: [], suppliers: [],
    };
    Audit.migrateToV2(state, 'Dev');
    expect(state.ingredients[0]._modifiedAt).toBe('2025-01-01T00:00:00.000Z');
    expect(state.ingredients[0]._modifiedBy).toBe('Old');
  });

  test('handles missing collections', () => {
    const state = {};
    const result = Audit.migrateToV2(state, 'Dev');
    expect(result.migrated).toBe(true);
    expect(state.schemaVersion).toBe(2);
    expect(state.auditLog).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/audit-migration.test.js`
Expected: FAIL with `Audit.migrateToV2 is not a function`

- [ ] **Step 3: Implement `migrateToV2`**

Add inside `src/audit.js` after `computeDiff`:

```javascript
  // ─── Migration ───────────────────────────────────────────────────────────
  function migrateToV2(state, deviceName) {
    if (state.schemaVersion === SCHEMA_VERSION) {
      return { migrated: false };
    }
    const stampTs = state.exportDate || new Date().toISOString();
    const stampBy = deviceName || 'Unknown';

    for (const collection of TRACKED_COLLECTIONS) {
      const list = state[collection];
      if (!Array.isArray(list)) continue;
      list.forEach((rec) => {
        if (!rec || !rec.id) return;
        if (!rec._modifiedAt) rec._modifiedAt = stampTs;
        if (!rec._modifiedBy) rec._modifiedBy = stampBy;
      });
    }

    if (!Array.isArray(state.auditLog)) state.auditLog = [];
    state._lastSyncAt = null;
    state.schemaVersion = SCHEMA_VERSION;

    return { migrated: true };
  }
```

Add `migrateToV2` to the returned object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/audit-migration.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/audit.js src/__tests__/audit-migration.test.js
git commit -m "Add Audit.migrateToV2 with idempotent schema upgrade"
```

---

## Task 6: `appendLogEntries` + `rotateLog` with archive overflow

**Files:**
- Modify: `src/audit.js`
- Modify: `src/__tests__/audit.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/audit.test.js`:

```javascript
describe('appendLogEntries', () => {
  test('appends entries to state.auditLog', () => {
    const state = { auditLog: [] };
    Audit.appendLogEntries(state, [{ id: 'a' }, { id: 'b' }]);
    expect(state.auditLog).toHaveLength(2);
  });

  test('creates auditLog array if missing', () => {
    const state = {};
    Audit.appendLogEntries(state, [{ id: 'a' }]);
    expect(state.auditLog).toHaveLength(1);
  });

  test('no-op on empty entries array', () => {
    const state = { auditLog: [{ id: 'existing' }] };
    Audit.appendLogEntries(state, []);
    expect(state.auditLog).toHaveLength(1);
  });
});

describe('rotateLog', () => {
  function makeEntry(daysAgo) {
    const d = new Date(Date.now() - daysAgo * 86400000);
    return { id: 'log_' + Math.random(), ts: d.toISOString() };
  }

  test('no rotation if log under soft cap and all entries under retention', () => {
    const state = { auditLog: [makeEntry(1), makeEntry(2)] };
    const { archived } = Audit.rotateLog(state, { maxEntries: 2000, maxAgeDays: 90 });
    expect(state.auditLog).toHaveLength(2);
    expect(archived).toEqual([]);
  });

  test('entries older than maxAgeDays are moved into archived[]', () => {
    const state = { auditLog: [makeEntry(1), makeEntry(100), makeEntry(200)] };
    const { archived } = Audit.rotateLog(state, { maxEntries: 2000, maxAgeDays: 90 });
    expect(state.auditLog).toHaveLength(1);
    expect(archived).toHaveLength(2);
  });

  test('entries beyond maxEntries soft cap are moved to archived[] oldest-first', () => {
    const entries = [];
    for (let i = 0; i < 5; i++) entries.push(makeEntry(1));
    const state = { auditLog: entries };
    const { archived } = Audit.rotateLog(state, { maxEntries: 3, maxAgeDays: 90 });
    expect(state.auditLog).toHaveLength(3);
    expect(archived).toHaveLength(2);
  });

  test('archived entries are grouped by YYYY-MM for archive file routing', () => {
    const jan = { id: 'a', ts: '2025-01-15T00:00:00.000Z' };
    const feb = { id: 'b', ts: '2025-02-10T00:00:00.000Z' };
    const state = { auditLog: [jan, feb] };
    const { groupedByMonth } = Audit.rotateLog(state, { maxEntries: 2000, maxAgeDays: 1 });
    expect(groupedByMonth['2025-01']).toHaveLength(1);
    expect(groupedByMonth['2025-02']).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/audit.test.js -t "appendLogEntries"`
Expected: FAIL with `Audit.appendLogEntries is not a function`

- [ ] **Step 3: Implement `appendLogEntries` and `rotateLog`**

Add inside `src/audit.js` after `migrateToV2`:

```javascript
  // ─── Log append + rotation ───────────────────────────────────────────────
  function appendLogEntries(state, entries) {
    if (!Array.isArray(state.auditLog)) state.auditLog = [];
    if (!entries || !entries.length) return;
    for (const e of entries) state.auditLog.push(e);
  }

  // Move old / overflow entries out of the live log. Returns them grouped
  // by YYYY-MM so the caller (app.js in save()) can hand each month to the
  // main process for archive-file writing.
  function rotateLog(state, opts) {
    opts = opts || {};
    const maxEntries = opts.maxEntries || 2000;
    const maxAgeDays = opts.maxAgeDays || 90;
    const log = state.auditLog || [];
    if (!log.length) return { archived: [], groupedByMonth: {} };

    const cutoff = Date.now() - maxAgeDays * 86400000;
    const toKeep = [];
    const toArchive = [];

    for (const e of log) {
      const ts = e.ts ? Date.parse(e.ts) : NaN;
      if (isFinite(ts) && ts < cutoff) toArchive.push(e);
      else toKeep.push(e);
    }

    // Soft cap — if still too many, spill the oldest
    if (toKeep.length > maxEntries) {
      // Sort oldest-first so splice removes from the front
      toKeep.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
      const overflow = toKeep.length - maxEntries;
      const spilled = toKeep.splice(0, overflow);
      for (const s of spilled) toArchive.push(s);
    }

    // Group archive entries by YYYY-MM
    const groupedByMonth = {};
    for (const e of toArchive) {
      const ym = (e.ts || '').slice(0, 7) || 'unknown';
      if (!groupedByMonth[ym]) groupedByMonth[ym] = [];
      groupedByMonth[ym].push(e);
    }

    state.auditLog = toKeep;
    return { archived: toArchive, groupedByMonth };
  }
```

Add `appendLogEntries` and `rotateLog` to the returned object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/audit.test.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/audit.js src/__tests__/audit.test.js
git commit -m "Add appendLogEntries and rotateLog with per-month archive grouping"
```

---

## Task 7: `startBulk` / `endBulk` wrapper for bulk operations

**Files:**
- Modify: `src/audit.js`
- Modify: `src/__tests__/audit.test.js`

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/audit.test.js`:

```javascript
describe('bulk wrapper', () => {
  test('startBulk returns a handle; endBulk emits a single bulk-update entry', () => {
    const state = { auditLog: [] };
    const handle = Audit.startBulk(state, {
      collection: 'ingredients',
      op: 'bulk-update',
      field: 'packCost',
      notes: '+3% across all Brakes',
    });
    // caller records per-row changes into handle.changes
    handle.changes.push({ id: 'ing1', name: 'A', before: 1.0, after: 1.03 });
    handle.changes.push({ id: 'ing2', name: 'B', before: 2.0, after: 2.06 });
    Audit.endBulk(state, handle, 'TestDevice');
    expect(state.auditLog).toHaveLength(1);
    expect(state.auditLog[0]).toMatchObject({
      op: 'bulk-update',
      entity: 'ingredients',
      field: 'packCost',
      notes: '+3% across all Brakes',
      count: 2,
      device: 'TestDevice',
    });
    expect(state.auditLog[0].changes).toHaveLength(2);
  });

  test('endBulk is a no-op if handle has zero changes', () => {
    const state = { auditLog: [] };
    const handle = Audit.startBulk(state, { collection: 'ingredients', op: 'bulk-update', field: 'packCost' });
    Audit.endBulk(state, handle, 'Dev');
    expect(state.auditLog).toHaveLength(0);
  });

  test('changes array is truncated at 500 with truncated flag set', () => {
    const state = { auditLog: [] };
    const handle = Audit.startBulk(state, { collection: 'ingredients', op: 'bulk-update', field: 'packCost' });
    for (let i = 0; i < 600; i++) {
      handle.changes.push({ id: 'i' + i, name: 'x', before: 0, after: 1 });
    }
    Audit.endBulk(state, handle, 'Dev');
    expect(state.auditLog[0].changes).toHaveLength(500);
    expect(state.auditLog[0].truncated).toBe(true);
    expect(state.auditLog[0].count).toBe(600);
  });

  test('handle.skipIds is a Set populated as caller records changes', () => {
    const state = { auditLog: [] };
    const handle = Audit.startBulk(state, { collection: 'ingredients', op: 'bulk-update', field: 'packCost' });
    handle.skipIds.add('ing1');
    handle.skipIds.add('ing2');
    expect(handle.skipIds.has('ing1')).toBe(true);
    expect(handle.skipIds.size).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/audit.test.js -t "bulk wrapper"`
Expected: FAIL with `Audit.startBulk is not a function`

- [ ] **Step 3: Implement `startBulk` and `endBulk`**

Add inside `src/audit.js` after `rotateLog`:

```javascript
  // ─── Bulk op wrapper ─────────────────────────────────────────────────────
  // The bulk wrapper lets callers like "AI Categorise", "Bulk Price Update",
  // or "AI Auto-Import" record many record changes as a single aggregate log
  // entry instead of N individual diffs. The caller pushes per-row change
  // descriptors into handle.changes and populates handle.skipIds so the
  // normal diff pass in computeDiff skips those records.

  function startBulk(state, spec) {
    return {
      spec: spec || {},
      changes: [],
      skipIds: new Set(),
    };
  }

  function endBulk(state, handle, deviceName) {
    if (!handle || !handle.changes || handle.changes.length === 0) return;
    const spec = handle.spec || {};
    const count = handle.changes.length;
    const MAX = 500;
    const truncated = count > MAX;
    const changes = truncated ? handle.changes.slice(0, MAX) : handle.changes;

    const entry = {
      id: newLogId(),
      ts: new Date().toISOString(),
      device: deviceName || 'Unknown',
      op: spec.op || 'bulk-update',
      entity: spec.collection || 'ingredients',
      entityId: null,
      entityName: spec.notes || '(bulk)',
      field: spec.field || null,
      count,
      changes,
    };
    if (truncated) entry.truncated = true;
    if (spec.notes) entry.notes = spec.notes;

    appendLogEntries(state, [entry]);
  }
```

Add `startBulk` and `endBulk` to the returned object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/audit.test.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/audit.js src/__tests__/audit.test.js
git commit -m "Add startBulk/endBulk for batching bulk operations into one entry"
```

---

## Task 8: Load `audit.js` in the browser via script tag

**Files:**
- Modify: `src/index.html`

- [ ] **Step 1: Locate the existing `<script src="app.js">` line**

Run: Use Grep to find where app.js is loaded.

```
Grep pattern: 'src="app.js"'
File: src/index.html
```

- [ ] **Step 2: Insert the audit.js script tag before app.js**

Change the line that reads:

```html
    <script src="app.js"></script>
```

…to:

```html
    <script src="audit.js"></script>
    <script src="app.js"></script>
```

The ordering matters — `audit.js` must register `window.Audit` before `app.js` runs.

- [ ] **Step 3: Smoke-check that the page still loads in Electron**

Run: `npm start`

In the DevTools console (Ctrl+Shift+I), type:
```
Audit.SCHEMA_VERSION
```
Expected: `2`

Close the app.

- [ ] **Step 4: Commit**

```bash
git add src/index.html
git commit -m "Load audit.js as a script tag before app.js"
```

---

## Task 9: Run `Audit.migrateToV2` inside `init()`

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Locate the existing migration block in `init()`**

Run: Grep for the existing migration block.

```
Grep pattern: 'state.ingredients.forEach\(\(i\) => \{'
File: src/app.js
```

You are looking for the block that begins at roughly line 1979:

```javascript
    state.ingredients.forEach((i) => {
      if (!i.allergens) i.allergens = [];
      if (!i.nutrition) i.nutrition = {};
      if (!i.supplierId) i.supplierId = null;
      if (!i.priceHistory) i.priceHistory = [];
      if (!i.altSuppliers) i.altSuppliers = [];
    });
```

- [ ] **Step 2: Insert the audit migration call after the existing migration block**

Find this passage:

```javascript
    state.ingredients.forEach((i) => {
      if (!i.allergens) i.allergens = [];
      if (!i.nutrition) i.nutrition = {};
      if (!i.supplierId) i.supplierId = null;
      if (!i.priceHistory) i.priceHistory = [];
      if (!i.altSuppliers) i.altSuppliers = [];
    });
```

…and immediately AFTER it (still inside the `if (saved && !saved._loadError)` block), insert:

```javascript
    // ── Audit trail schema migration (v2) ─────────────────────────────────
    // Stamp _modifiedAt/_modifiedBy on every record, initialise state.auditLog,
    // and set state._lastSyncAt = null. Idempotent — no-op after first run.
    try {
      const deviceName = (state.sync && state.sync.deviceName) || 'This PC';
      const result = window.Audit.migrateToV2(state, deviceName);
      if (result.migrated) {
        showToast("✓ Activity tracking enabled. Changes from now on will be logged.", "success", 3500);
      }
    } catch (e) {
      console.error("[audit-migration]", e);
    }
```

- [ ] **Step 3: Smoke-check in Electron**

Run: `npm start`

Open DevTools console and inspect:
```
state.schemaVersion
state.auditLog
state.ingredients[0]._modifiedAt
```
Expected: `2`, `[]`, and a valid ISO timestamp. The migration toast should have appeared briefly.

Close the app.

- [ ] **Step 4: Commit**

```bash
git add src/app.js
git commit -m "Run Audit.migrateToV2 inside init() after existing migrations"
```

---

## Task 10: Build the initial load snapshot at the end of `init()`

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Locate the end of `init()`**

Run: Grep for where `init()` ends.

```
Grep pattern: 'async function init\('
File: src/app.js
```

Read the function body until you find the closing `}` of `async function init()`.

- [ ] **Step 2: Add a module-level `_loadSnapshot` variable near the top of `app.js`**

Find the section around line ~1960 where other module-level `let` variables live (e.g. `let editingIngredientId = null;`) and add:

```javascript
let _loadSnapshot = null; // populated by Audit.buildSnapshot after load + after location switches
```

- [ ] **Step 3: Build the snapshot at the end of `init()`**

Just before the closing `}` of `async function init()`, insert:

```javascript
  // Take the post-migration snapshot. From here on, every mutation will be
  // compared against this snapshot when save() next runs.
  try {
    _loadSnapshot = window.Audit.buildSnapshot(state);
  } catch (e) {
    console.error("[audit-snapshot]", e);
  }
```

- [ ] **Step 4: Smoke-check in Electron**

Run: `npm start`

In DevTools console:
```
_loadSnapshot.ingredients.size
```
Expected: number of ingredients in your library.

Close the app.

- [ ] **Step 5: Commit**

```bash
git add src/app.js
git commit -m "Build initial Audit load snapshot at end of init()"
```

---

## Task 11: Refresh snapshot after location switches

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Find every place that replaces collections wholesale**

Run: Grep for places that assign whole collections (these are the hotspots where a diff would falsely show "everything deleted + everything re-created").

```
Grep pattern: 'state\.recipes = JSON\.parse'
File: src/app.js
```

Expect 3+ matches around location switching (~line 4647, 5078). Each sibling pair that replaces `state.recipes` and `state.ingredients` together is one call site.

- [ ] **Step 2: After each wholesale replacement, rebuild the snapshot**

For each hit, immediately AFTER the block that does:

```javascript
    state.recipes = JSON.parse(JSON.stringify(loc.recipes || []));
    state.ingredients = JSON.parse(JSON.stringify(loc.ingredients || []));
    state.suppliers = JSON.parse(JSON.stringify(loc.suppliers || []));
```

…add:

```javascript
    // Refresh audit snapshot — the diff must be taken from here on.
    if (window.Audit) _loadSnapshot = window.Audit.buildSnapshot(state);
```

Repeat for each distinct location-switch hot path (switchLocation, cloneLocation, etc. — follow the Grep hits).

- [ ] **Step 3: Smoke-check in Electron**

Run: `npm start`

If you have multiple locations set up, switch between them. Open DevTools and confirm `_loadSnapshot` size changes to match the new location.

Close the app.

- [ ] **Step 4: Commit**

```bash
git add src/app.js
git commit -m "Refresh Audit snapshot after wholesale location switches"
```

---

## Task 12: Run diff + stamp + append inside `save()`

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Locate the `save()` function**

Run: Grep for `async function save()`.

```
Grep pattern: 'async function save\(\)'
File: src/app.js
```

You are looking for the function that starts around line 3498 and its `await browserIPC.saveData({...})` call.

- [ ] **Step 2: Insert the diff pass before the saveData call**

Inside `save()`, find this line:

```javascript
    logAllRecipeCosts();
```

…and immediately AFTER it, BEFORE the `if (!state.locations)` line, insert:

```javascript
    // ── Audit trail: compute diff, stamp changed records, append to log ──
    try {
      if (window.Audit && _loadSnapshot) {
        const deviceName = (state.sync && state.sync.deviceName) || 'This PC';
        const skipIds = _currentBulkHandle
          ? {
              ingredients: _currentBulkHandle.spec.collection === 'ingredients' ? _currentBulkHandle.skipIds : new Set(),
              recipes:     _currentBulkHandle.spec.collection === 'recipes'     ? _currentBulkHandle.skipIds : new Set(),
              suppliers:   _currentBulkHandle.spec.collection === 'suppliers'   ? _currentBulkHandle.skipIds : new Set(),
            }
          : {};
        const { entries, stampedIds } = window.Audit.computeDiff(_loadSnapshot, state, deviceName, { skipIds });

        // Stamp _modifiedAt on every changed top-level record
        const nowIso = new Date().toISOString();
        ['ingredients', 'recipes', 'suppliers'].forEach((collection) => {
          (state[collection] || []).forEach((rec) => {
            if (rec && rec.id && stampedIds[collection].has(rec.id)) {
              rec._modifiedAt = nowIso;
              rec._modifiedBy = deviceName;
            }
          });
        });

        window.Audit.appendLogEntries(state, entries);

        // Rotate old entries out to archive files
        const { groupedByMonth } = window.Audit.rotateLog(state, { maxEntries: 2000, maxAgeDays: 90 });
        for (const ym of Object.keys(groupedByMonth)) {
          if (window.electronAPI && window.electronAPI.saveAuditArchive) {
            window.electronAPI.saveAuditArchive(ym, groupedByMonth[ym]).catch(function (e) {
              console.error("[audit-archive]", e);
            });
          }
        }
      }
    } catch (e) {
      console.error("[audit-diff]", e);
    }
```

Also add a module-level `let _currentBulkHandle = null;` near where `_loadSnapshot` was declared in Task 10.

- [ ] **Step 3: Add the new state fields to the saveData payload**

Find the block that reads:

```javascript
    await browserIPC.saveData({
      ingredients: state.ingredients,
      recipes: state.recipes,
      suppliers: state.suppliers,
      sites: state.sites,
      ...
```

Add these fields at the bottom of the object before the closing `});`:

```javascript
      schemaVersion: state.schemaVersion,
      auditLog: state.auditLog,
      _lastSyncAt: state._lastSyncAt,
```

- [ ] **Step 4: Refresh the snapshot immediately after a successful save**

Still inside `save()`, find the line:

```javascript
    _setSaveIndicator("saved");
```

Immediately BEFORE it, insert:

```javascript
    // Refresh the load snapshot — future saves diff against the just-written state.
    try {
      if (window.Audit) _loadSnapshot = window.Audit.buildSnapshot(state);
    } catch (e) { console.error("[audit-snapshot-refresh]", e); }
```

- [ ] **Step 5: Smoke-check in Electron**

Run: `npm start`

Open an ingredient and change its price. Wait ~1 second for the debounced save. Open DevTools console:

```
state.auditLog
state.auditLog[state.auditLog.length - 1]
```

Expected: last entry has `op: "update"`, `field: "packCost"`, correct before/after values, your device name, and a recent ts. The ingredient you edited now has a fresh `_modifiedAt`.

Close the app.

- [ ] **Step 6: Commit**

```bash
git add src/app.js
git commit -m "Wire Audit diff + stamp + append into save()"
```

---

## Task 13: Main process IPC — archive read/write/list

**Files:**
- Modify: `main.js`

- [ ] **Step 1: Locate the IPC handler section of `main.js`**

Run: Grep for existing `ipcMain.handle` calls.

```
Grep pattern: "ipcMain\.handle\('list-backups'"
File: main.js
```

Find the `list-backups` handler — the new audit-archive handlers will live next to it.

- [ ] **Step 2: Add three new IPC handlers**

Immediately after the `list-backups` handler (or the block of backup-related handlers), insert:

```javascript
// ─── Audit trail archives ─────────────────────────────────────────────────
// Each archive file holds one YYYY-MM worth of rotated audit log entries.
// Live log stays in the main data file; archives are written lazily when
// rotation spills entries out.

function _auditArchivePath(ym) {
  // ym like "2026-04"; validate strictly to avoid path traversal
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  const dir = path.join(app.getPath('userData'), 'audit-archives');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'audit-archive-' + ym + '.json');
}

ipcMain.handle('list-audit-archives', async () => {
  try {
    const dir = path.join(app.getPath('userData'), 'audit-archives');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(function (f) { return /^audit-archive-\d{4}-\d{2}\.json$/.test(f); })
      .map(function (f) { return f.replace(/^audit-archive-|\.json$/g, ''); })
      .sort()
      .reverse();
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('load-audit-archive', async (_, ym) => {
  try {
    const p = _auditArchivePath(ym);
    if (!p || !fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('save-audit-archive', async (_, { ym, entries }) => {
  try {
    const p = _auditArchivePath(ym);
    if (!p) return { error: 'Invalid archive key: ' + ym };
    // Append to any existing archive for the same month, deduped by entry id
    let existing = [];
    if (fs.existsSync(p)) {
      try {
        existing = JSON.parse(fs.readFileSync(p, 'utf8')) || [];
      } catch (e) { existing = []; }
    }
    const seen = new Set(existing.map(function (e) { return e.id; }));
    const toAdd = (entries || []).filter(function (e) { return e && e.id && !seen.has(e.id); });
    const merged = existing.concat(toAdd);
    fs.writeFileSync(p, JSON.stringify(merged));
    return { ok: true, added: toAdd.length };
  } catch (e) {
    return { error: e.message };
  }
});
```

- [ ] **Step 3: Verify `main.js` still starts**

Run: `npm start`
Expected: app starts cleanly. No errors in the Electron terminal window.

Close the app.

- [ ] **Step 4: Commit**

```bash
git add main.js
git commit -m "Add list/load/save audit archive IPC handlers"
```

---

## Task 14: Preload — expose archive IPCs to the renderer

**Files:**
- Modify: `src/preload.js`

- [ ] **Step 1: Find the backup management section of the contextBridge**

Run: Grep for the backup handlers.

```
Grep pattern: 'listBackups'
File: src/preload.js
```

- [ ] **Step 2: Add the three new methods next to them**

Find:

```javascript
  // ── Backup management ──────────────────────────────────────────
  listBackups:    ()         => ipcRenderer.invoke('list-backups'),
  restoreBackup:  (filename) => ipcRenderer.invoke('restore-backup', filename),
```

Immediately after those two lines, insert:

```javascript
  // ── Audit trail archives ──────────────────────────────────────
  listAuditArchives: ()              => ipcRenderer.invoke('list-audit-archives'),
  loadAuditArchive:  (ym)            => ipcRenderer.invoke('load-audit-archive', ym),
  saveAuditArchive:  (ym, entries)   => ipcRenderer.invoke('save-audit-archive', { ym, entries }),
```

- [ ] **Step 3: Smoke-check in Electron**

Run: `npm start`

In DevTools console:
```
window.electronAPI.listAuditArchives()
```
Expected: a Promise that resolves to `[]` (no archives yet).

Close the app.

- [ ] **Step 4: Commit**

```bash
git add src/preload.js
git commit -m "Expose list/load/save audit archive IPCs on electronAPI"
```

---

## Task 15: End-to-end smoke test — verify log entries persist across restart

**Files:**
- None modified

- [ ] **Step 1: Fresh start**

Run: `npm start`

In DevTools console, note `state.auditLog.length`.

- [ ] **Step 2: Make three observable edits**

Using the UI:
1. Open an ingredient and change its price.
2. Open a recipe and change one ingredient row's quantity.
3. Create a new supplier.

Wait ~2 seconds between each edit so the debounced save fires.

In the console:
```
state.auditLog.slice(-5)
```
Expected: 3 recent entries covering `packCost` update, `recipeIngredient` update (field: `qty`), and `supplier` create.

- [ ] **Step 3: Close and reopen the app**

Close the Electron window. Run `npm start` again.

In the console:
```
state.auditLog.length
```
Expected: the same entries are still there (they persisted through save/load).

Check the first entry:
```
state.auditLog[0]
```
Expected: has `id`, `ts`, `device`, `op`, `entity`, `entityId`, `entityName`, and `before`/`after` or `field` depending on `op`.

- [ ] **Step 4: Sanity-check stamp refresh**

Check `state.ingredients[0]._modifiedAt`. Edit that same ingredient's price again. Wait for the debounced save. Check `_modifiedAt` again.

Expected: newer timestamp than before.

Close the app.

- [ ] **Step 5: Commit the verification notes**

No files changed. Skip the commit.

---

## Task 16: Hook bulk operations into the Audit bulk wrapper

**Files:**
- Modify: `src/app.js`

This is optional but recommended — it prevents bulk-update modal operations from spamming the log with hundreds of individual entries.

- [ ] **Step 1: Locate `openBulkPriceModal` and its apply function**

Run: Grep for `openBulkPriceModal`.

```
Grep pattern: 'function openBulkPriceModal|function applyBulkPrice'
File: src/app.js
```

- [ ] **Step 2: Wrap the apply loop with startBulk/endBulk**

In the function that applies the bulk price changes (`applyBulkPrice` or similar — the one that iterates over selected ingredients and sets `packCost`), at the TOP of the function add:

```javascript
  const deviceName = (state.sync && state.sync.deviceName) || 'This PC';
  _currentBulkHandle = window.Audit.startBulk(state, {
    collection: 'ingredients',
    op: 'bulk-update',
    field: 'packCost',
    notes: 'Bulk price update',
  });
```

Inside the loop that updates each ingredient, immediately AFTER `ing.packCost = newCost`, add:

```javascript
    _currentBulkHandle.skipIds.add(ing.id);
    _currentBulkHandle.changes.push({
      id: ing.id,
      name: ing.name,
      before: oldCost,
      after: newCost,
    });
    // Stamp the record directly since the diff will skip it
    ing._modifiedAt = new Date().toISOString();
    ing._modifiedBy = deviceName;
```

(You will need to capture `oldCost` at the top of the loop iteration before assigning `newCost`.)

At the END of the function, BEFORE `save()` is called, add:

```javascript
  window.Audit.endBulk(state, _currentBulkHandle, deviceName);
  _currentBulkHandle = null;
```

- [ ] **Step 3: Smoke-check**

Run: `npm start`

Open the Bulk Price modal and apply a change to 3+ ingredients. Wait for the save.

In DevTools console:
```
state.auditLog[state.auditLog.length - 1]
```
Expected: a single `op: "bulk-update"` entry with `count: 3+` and a `changes` array.

Close the app.

- [ ] **Step 4: Commit**

```bash
git add src/app.js
git commit -m "Hook bulk price update through Audit.startBulk/endBulk wrapper"
```

---

## Task 17: Final regression sweep

**Files:**
- None modified

- [ ] **Step 1: Run the full Jest suite**

Run: `npx jest`
Expected: all tests PASS (both old `costing.test.js` and new audit tests).

- [ ] **Step 2: Run the app and exercise the critical paths**

Run: `npm start`

Manually verify:
- App loads without any red errors in the DevTools console.
- You can open, edit, and save an ingredient.
- You can open, edit, and save a recipe with nested ingredient rows.
- You can create and delete a supplier.
- You can switch between locations (if you have more than one) without the audit log exploding with phantom create/delete entries.
- Closing and reopening the app restores `state.auditLog` intact.

Close the app.

- [ ] **Step 3: Final commit for phase 1**

If everything above passes, the branch is ready. No further code changes.

```bash
git log --oneline | head -20
```

Confirm the phase 1 commits are all present.

---

## What's next (out of scope for this plan)

Phase 1 produces a populated `state.auditLog` on every save, stamps records with `_modifiedAt`/`_modifiedBy`, persists archives to userData, and is fully unit-tested. The log is invisible to users without UI.

**Phase 2 (Activity view)** will expose the log in a Settings card with filters, a summary chip row, and a per-record History tab on every ingredient/recipe/supplier modal. Revert buttons with confirmation dialogs come with Phase 2.

**Phase 3 (Merge engine)** will add per-record LWW merging on sync using the `_modifiedAt` stamps from Phase 1 and the `_lastSyncAt` field, plus audit-log merge-by-id dedup.

**Phase 4 (Conflict UI)** will add the blocking conflict resolution modal.

Each phase will get its own plan document in `docs/superpowers/plans/`.
