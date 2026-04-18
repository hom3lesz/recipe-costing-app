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
      if (c.entityType === 'settings') return true;
      return _findRecord(state, c.entityType, c.entityId, c.parentId) !== null;
    });
  }

  return {
    pruneMissingRecords: pruneMissingRecords,
    _findRecord: _findRecord,
  };
}));
