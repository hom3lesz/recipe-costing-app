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

describe('revertEntry', () => {
  test('update revert sets field back to before value', () => {
    const state = {
      ingredients: [{ id: 'ing1', name: 'Cucumber', packCost: 0.90 }],
      recipes: [], suppliers: [], auditLog: [],
    };
    const entry = {
      id: 'log_1', ts: '2026-04-15T10:00:00Z', op: 'update', entity: 'ingredient',
      entityId: 'ing1', entityName: 'Cucumber',
      field: 'packCost', before: 0.85, after: 0.90,
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.success).toBe(true);
    expect(state.ingredients[0].packCost).toBe(0.85);
  });

  test('update revert creates a restore log entry', () => {
    const state = {
      ingredients: [{ id: 'ing1', name: 'Cucumber', packCost: 0.90 }],
      recipes: [], suppliers: [], auditLog: [],
    };
    const entry = {
      id: 'log_1', ts: '2026-04-15T10:00:00Z', op: 'update', entity: 'ingredient',
      entityId: 'ing1', entityName: 'Cucumber',
      field: 'packCost', before: 0.85, after: 0.90,
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.restoreEntry).toBeDefined();
    expect(result.restoreEntry.op).toBe('restore');
    expect(result.restoreEntry.entity).toBe('ingredient');
    expect(result.restoreEntry.entityId).toBe('ing1');
    expect(result.restoreEntry.field).toBe('packCost');
    expect(result.restoreEntry.before).toBe(0.90);
    expect(result.restoreEntry.after).toBe(0.85);
    expect(state.auditLog.length).toBe(1);
    expect(state.auditLog[0].op).toBe('restore');
  });

  test('delete revert re-creates record in collection', () => {
    const state = { ingredients: [], recipes: [], suppliers: [], auditLog: [] };
    const entry = {
      id: 'log_1', ts: '2026-04-15T10:00:00Z', op: 'delete', entity: 'ingredient',
      entityId: 'ing1', entityName: 'Old Beef',
      before: { name: 'Old Beef', packCost: 12, packSize: 1000, unit: 'g', yieldPct: 92 },
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.success).toBe(true);
    expect(state.ingredients.length).toBe(1);
    expect(state.ingredients[0].id).toBe('ing1');
    expect(state.ingredients[0].name).toBe('Old Beef');
    expect(state.ingredients[0].packCost).toBe(12);
    expect(state.ingredients[0]._modifiedAt).toBeDefined();
    expect(state.ingredients[0]._modifiedBy).toBe('TestPC');
  });

  test('delete revert creates a restore log entry', () => {
    const state = { ingredients: [], recipes: [], suppliers: [], auditLog: [] };
    const entry = {
      id: 'log_1', ts: '2026-04-15T10:00:00Z', op: 'delete', entity: 'ingredient',
      entityId: 'ing1', entityName: 'Old Beef',
      before: { name: 'Old Beef', packCost: 12 },
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.restoreEntry.op).toBe('restore');
    expect(result.restoreEntry.entity).toBe('ingredient');
    expect(result.restoreEntry.after).toEqual(expect.objectContaining({ name: 'Old Beef' }));
    expect(state.auditLog.length).toBe(1);
  });

  test('delete revert for recipe re-creates with nested arrays', () => {
    const state = { ingredients: [], recipes: [], suppliers: [], auditLog: [] };
    const entry = {
      id: 'log_1', ts: '2026-04-15T10:00:00Z', op: 'delete', entity: 'recipe',
      entityId: 'rec1', entityName: 'Salad',
      before: {
        name: 'Salad', category: 'Starters', portions: 4,
        ingredients: [{ ingId: 'ing1', qty: 2 }],
        subRecipes: [],
      },
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.success).toBe(true);
    expect(state.recipes.length).toBe(1);
    expect(state.recipes[0].id).toBe('rec1');
    expect(state.recipes[0].ingredients).toEqual([{ ingId: 'ing1', qty: 2 }]);
  });

  test('nested recipeIngredient update revert', () => {
    const state = {
      ingredients: [],
      recipes: [{
        id: 'rec1', name: 'Salad',
        ingredients: [{ ingId: 'ing1', qty: 5, recipeUnit: 'each' }],
        subRecipes: [],
      }],
      suppliers: [], auditLog: [],
    };
    const entry = {
      id: 'log_1', ts: '2026-04-15T10:00:00Z', op: 'update',
      entity: 'recipeIngredient', entityId: 'ing1', parentId: 'rec1',
      entityName: 'Salad', field: 'qty', before: 2, after: 5,
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.success).toBe(true);
    expect(state.recipes[0].ingredients[0].qty).toBe(2);
  });

  test('nested subRecipe update revert', () => {
    const state = {
      ingredients: [],
      recipes: [{
        id: 'rec1', name: 'Main',
        ingredients: [],
        subRecipes: [{ recipeId: 'rec2', qty: 3, recipeUnit: 'portions' }],
      }],
      suppliers: [], auditLog: [],
    };
    const entry = {
      id: 'log_1', ts: '2026-04-15T10:00:00Z', op: 'update',
      entity: 'subRecipe', entityId: 'rec2', parentId: 'rec1',
      entityName: 'Main', field: 'qty', before: 1, after: 3,
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.success).toBe(true);
    expect(state.recipes[0].subRecipes[0].qty).toBe(1);
  });

  test('returns error when record not found (update)', () => {
    const state = { ingredients: [], recipes: [], suppliers: [], auditLog: [] };
    const entry = {
      id: 'log_1', op: 'update', entity: 'ingredient',
      entityId: 'ing1', entityName: 'Ghost',
      field: 'packCost', before: 0.85, after: 0.90,
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no longer exists/i);
  });

  test('returns error when nested parent not found', () => {
    const state = { ingredients: [], recipes: [], suppliers: [], auditLog: [] };
    const entry = {
      id: 'log_1', op: 'update', entity: 'recipeIngredient',
      entityId: 'ing1', parentId: 'rec1', entityName: 'Salad',
      field: 'qty', before: 2, after: 5,
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no longer exists/i);
  });

  test('returns error when nested row not found in parent', () => {
    const state = {
      ingredients: [],
      recipes: [{ id: 'rec1', name: 'Salad', ingredients: [], subRecipes: [] }],
      suppliers: [], auditLog: [],
    };
    const entry = {
      id: 'log_1', op: 'update', entity: 'recipeIngredient',
      entityId: 'ing1', parentId: 'rec1', entityName: 'Salad',
      field: 'qty', before: 2, after: 5,
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no longer exists/i);
  });

  test('supplier update revert works', () => {
    const state = {
      ingredients: [], recipes: [],
      suppliers: [{ id: 'sup1', name: 'Brakes', email: 'a@b.c' }],
      auditLog: [],
    };
    const entry = {
      id: 'log_1', ts: '2026-04-15T10:00:00Z', op: 'update', entity: 'supplier',
      entityId: 'sup1', entityName: 'Brakes',
      field: 'email', before: 'old@b.c', after: 'a@b.c',
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.success).toBe(true);
    expect(state.suppliers[0].email).toBe('old@b.c');
  });

  test('supplier delete revert re-creates supplier', () => {
    const state = { ingredients: [], recipes: [], suppliers: [], auditLog: [] };
    const entry = {
      id: 'log_1', ts: '2026-04-15T10:00:00Z', op: 'delete', entity: 'supplier',
      entityId: 'sup1', entityName: 'OldSup',
      before: { name: 'OldSup', email: 'x@y.z', phone: '999' },
    };
    const result = Audit.revertEntry(state, entry, 'TestPC');
    expect(result.success).toBe(true);
    expect(state.suppliers.length).toBe(1);
    expect(state.suppliers[0].id).toBe('sup1');
    expect(state.suppliers[0].name).toBe('OldSup');
  });
});

describe('revertEntry on resolve-conflict entries', () => {
  test('reverts a top-level resolve-conflict like an update', () => {
    var state = {
      ingredients: [{ id: 'a', name: 'Cucumber', packCost: 2.75, _modifiedAt: '2026-04-18T10:00:00Z', _modifiedBy: 'This device' }],
      recipes: [],
      suppliers: [],
      auditLog: [],
    };
    var entry = {
      id: 'log-1',
      ts: '2026-04-18T10:00:00Z',
      device: 'This device',
      op: 'resolve-conflict',
      entity: 'ingredient',
      entityId: 'a',
      entityName: 'Cucumber',
      field: 'packCost',
      before: 2.5,
      after: 2.75,
      conflictId: 'conflict-xyz',
    };
    var result = Audit.revertEntry(state, entry, 'This device');
    expect(result.success).toBe(true);
    expect(state.ingredients[0].packCost).toBe(2.5);
    expect(result.restoreEntry.op).toBe('restore');
    expect(result.restoreEntry.before).toBe(2.75);
    expect(result.restoreEntry.after).toBe(2.5);
    expect(result.restoreEntry.revertedEntryId).toBe('log-1');
  });

  test('reverts a nested recipeIngredient resolve-conflict', () => {
    var state = {
      ingredients: [{ id: 'ing1', name: 'Pecorino' }],
      recipes: [{
        id: 'r1', name: 'Carbonara',
        ingredients: [{ ingId: 'ing1', qty: 300 }],
      }],
      suppliers: [],
      auditLog: [],
    };
    var entry = {
      id: 'log-2', ts: '2026-04-18T10:00:00Z', device: 'This device',
      op: 'resolve-conflict', entity: 'recipeIngredient',
      entityId: 'ing1', entityName: 'Pecorino', parentId: 'r1',
      field: 'qty', before: 200, after: 300, conflictId: 'c1',
    };
    var result = Audit.revertEntry(state, entry, 'This device');
    expect(result.success).toBe(true);
    expect(state.recipes[0].ingredients[0].qty).toBe(200);
  });
});
