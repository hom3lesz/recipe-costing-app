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
  };
}));
