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
