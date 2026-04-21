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

  // Look up a supplier name from the global state (browser only; falls back to raw id in Jest).
  function _lookupSupplierName(id) {
    try {
      if (!id) return '—';
      if (typeof state === 'undefined' || !state.suppliers) return id;
      var sup = state.suppliers.find(function (s) { return s.id === id; });
      return sup ? sup.name : id;
    } catch (e) { return id; }
  }

  // Prettier labels for common field names shown in the activity log.
  var _FIELD_LABELS = {
    supplierId:   'supplier',
    altSuppliers: 'alt suppliers',
    packCost:     'pack cost',
    packSize:     'pack size',
    yieldPct:     'yield %',
    ingCategories:'ing categories',
    recipeCategories: 'recipe categories',
    priceOverride:'sell price',
    foodCostTarget:'food cost target',
    activeGP:     'target GP',
    vatRate:      'VAT rate',
    actualYield:  'actual yield',
    priceHistory: 'price history',
  };

  function _friendlyFieldLabel(field) {
    return _FIELD_LABELS[field] || field;
  }

  // Field-aware value formatter — resolves supplier IDs, formats arrays nicely.
  // Falls through to _formatValue for all other fields.
  function _formatFieldValue(field, v) {
    if (v === null || v === undefined) return '<em>empty</em>';

    if (field === 'supplierId') {
      if (!v) return '<em>none</em>';
      return _escHtml(_lookupSupplierName(v));
    }

    if (field === 'altSuppliers') {
      if (!Array.isArray(v) || v.length === 0) return '<em>none</em>';
      return v.map(function (alt) {
        var name = _lookupSupplierName(alt.supplierId);
        var parts = [_escHtml(name)];
        if (alt.packCost != null) parts.push('£' + Number(alt.packCost).toFixed(2));
        if (alt.packSize != null) parts.push(alt.packSize + ' units');
        return parts.join(' · ');
      }).join('<br>');
    }

    if (field === 'allergens' || field === 'tags') {
      if (Array.isArray(v)) return v.length ? _escHtml(v.join(', ')) : '<em>none</em>';
    }

    return _formatValue(v);
  }

  function formatEntry(entry) {
    var time = relativeTime(entry.ts);
    var device = _escHtml(entry.device || '');
    var name = '<strong>' + _escHtml(entry.entityName) + '</strong>';
    var entityLabel = _escHtml(entry.entity);
    var canRevert = (entry.op === 'update' || entry.op === 'delete' || entry.op === 'resolve-conflict');
    var revertBtn = canRevert
      ? ' <button class="btn-secondary btn-sm revert-btn" data-entry-id="' + _escHtml(entry.id) + '" title="Revert this change" style="font-size:11px;padding:2px 8px;margin-left:8px">↩ Revert</button>'
      : '';

    var desc = '';
    if (entry.op === 'create') {
      desc = 'Created ' + entityLabel + ' ' + name;
    } else if (entry.op === 'update') {
      desc = 'Updated ' + name + ' <span style="color:var(--text-muted)">' + _escHtml(_friendlyFieldLabel(entry.field)) + '</span>'
        + '<div style="margin-top:4px;font-size:12px">'
        + '<span style="text-decoration:line-through;color:var(--red)">' + _formatFieldValue(entry.field, entry.before) + '</span>'
        + ' &rarr; '
        + '<span style="color:var(--green)">' + _formatFieldValue(entry.field, entry.after) + '</span>'
        + '</div>';
    } else if (entry.op === 'delete') {
      desc = 'Deleted ' + entityLabel + ' ' + name;
    } else if (entry.op === 'restore') {
      desc = 'Restored ' + entityLabel + ' ' + name;
      if (entry.field) {
        desc += ' <span style="color:var(--text-muted)">' + _escHtml(entry.field) + '</span>';
      }
    } else if (entry.op === 'resolve-conflict') {
      desc = '⚖ Resolved conflict on ' + entityLabel + ' <b>' + _escHtml(entry.entityName) + '</b> '
        + '<span style="color:var(--text-muted)">' + _escHtml(_friendlyFieldLabel(entry.field)) + '</span>'
        + '<div style="margin-top:4px;font-size:12px">'
        + '<span style="text-decoration:line-through;color:var(--red)">' + _formatFieldValue(entry.field, entry.before) + '</span>'
        + ' &rarr; '
        + '<span style="color:var(--green)">' + _formatFieldValue(entry.field, entry.after) + '</span>'
        + '</div>';
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

    if (entry.op === 'update' || entry.op === 'resolve-conflict') {
      titleEl.textContent = 'Revert Update';
      html += '<div style="font-size:13px;margin-bottom:12px">Revert <strong>' + entityLabel + '</strong> field <code>' + _escHtml(_friendlyFieldLabel(entry.field)) + '</code>:</div>';
      html += '<div style="padding:10px 14px;background:var(--bg-card2);border:1px solid var(--border);border-radius:6px;margin-bottom:12px">'
        + '<div style="margin-bottom:6px"><span style="text-decoration:line-through;color:var(--red)">' + _formatFieldValue(entry.field, staleness.currentValue) + '</span></div>'
        + '<div>&rarr; <span style="color:var(--green);font-weight:600">' + _formatFieldValue(entry.field, staleness.revertValue) + '</span></div>'
        + '</div>';
    } else if (entry.op === 'delete') {
      titleEl.textContent = 'Restore Deleted Record';
      html += '<div style="font-size:13px;margin-bottom:12px">Re-create <strong>' + entityLabel + '</strong> from the saved snapshot.</div>';
    }

    if (staleness.stale) {
      html += '<div style="padding:10px 14px;background:rgba(255,180,0,0.1);border:1px solid rgba(255,180,0,0.3);border-radius:6px;margin-bottom:12px;font-size:12px">'
        + '<strong style="color:var(--orange)">&#9888; Warning:</strong> This field has been changed since this log entry. '
        + 'Current value is <strong>' + _formatFieldValue(entry.field, staleness.currentValue) + '</strong>. '
        + 'Reverting will overwrite it with <strong>' + _formatFieldValue(entry.field, staleness.revertValue) + '</strong>.'
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
      if (typeof window !== 'undefined' && typeof window.refreshAuditSnapshot === 'function') {
        window.refreshAuditSnapshot();
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
