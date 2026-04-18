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

    if (conflict.entityType === 'settings') {
      state[conflict.field] = _deepClone(winningValue);
      return {
        record: state,
        auditEntry: {
          id: _uuid(), ts: nowIso, device: device,
          op: 'resolve-conflict', entity: 'settings',
          entityId: conflict.entityId, entityName: 'Settings',
          field: conflict.field,
          before: _deepClone(losingValue), after: _deepClone(winningValue),
          conflictId: conflict.id,
        },
      };
    }

    var colKey = { ingredient: 'ingredients', recipe: 'recipes', supplier: 'suppliers' }[conflict.entityType];
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
          id: _uuid(), ts: nowIso, device: device,
          op: 'resolve-conflict', entity: conflict.entityType,
          entityId: conflict.entityId, entityName: _entityNameFor(state, conflict),
          field: conflict.field,
          before: _deepClone(losingValue), after: _deepClone(winningValue),
          conflictId: conflict.id,
        },
      };
    }

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
          id: _uuid(), ts: nowIso, device: device,
          op: 'resolve-conflict', entity: conflict.entityType,
          entityId: conflict.entityId, entityName: _entityNameFor(state, conflict),
          parentId: conflict.parentId, field: conflict.field,
          before: _deepClone(losingValue), after: _deepClone(winningValue),
          conflictId: conflict.id,
        },
      };
    }

    return { error: 'missing' };
  }

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

  return {
    pruneMissingRecords: pruneMissingRecords,
    applyResolution: applyResolution,
    entityDisplayName: entityDisplayName,
    formatValueForButton: formatValueForButton,
    _findRecord: _findRecord,
  };
}));
