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
    const state = { ingredients: [], recipes: [], suppliers: [] };
    const entry = {
      id: 'log_1', op: 'update', entity: 'ingredient',
      entityId: 'ing1', field: 'packCost', before: 0.85, after: 0.90,
    };
    const result = Audit.checkStaleness(state, entry);
    expect(result.recordMissing).toBe(true);
  });

  test('handles delete entry — recordMissing is true (record is gone)', () => {
    const state = { ingredients: [], recipes: [], suppliers: [] };
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
      recipes: [], suppliers: [],
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
    const state = { ingredients: [], recipes: [], suppliers: [] };
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
      recipes: [{ id: 'rec1', name: 'Salad', ingredients: [], subRecipes: [] }],
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
      ingredients: [], recipes: [],
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
