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

  // ─── Snapshot ─────────────────────────────────────────────────────────────
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

  // ─── Diff ────────────────────────────────────────────────────────────────
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
          // snapRec only has tracked fields (no id), so inject it for _makeEntry
          const recWithId = Object.assign({ id }, snapRec);
          entries.push(_makeEntry('delete', entity, recWithId, {
            before: _deepClone(snapRec),
          }, device));
        }
      }
    }

    return { entries, stampedIds };
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
    buildSnapshot,
    computeDiff,
  };
}));
