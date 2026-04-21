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
    const result = ActivityView.applyFilters(entries, {
      dateRange: 1,
      _now: new Date('2026-04-16T12:00:00Z').getTime(),
    });
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
    expect(html).toContain('pack cost');
    expect(html).toContain('0.85');
    expect(html).toContain('0.9');
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
    expect(html).toContain('pack cost');
    expect(html).toContain('2.5');
    expect(html).toContain('2.75');
    expect(html).toMatch(/data-entry-id="log-1"/);
  });
});
