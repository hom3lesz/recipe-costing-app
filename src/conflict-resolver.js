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

  return {
    pruneMissingRecords: pruneMissingRecords,
    applyResolution: applyResolution,
    entityDisplayName: entityDisplayName,
    formatValueForButton: formatValueForButton,
    _findRecord: _findRecord,
    formatRow: formatRow,
    renderBadge: renderBadge,
    render: render,
    openResolver: openResolver,
    closeResolver: closeResolver,
    resolveConflict: resolveConflict,
  };
}));
