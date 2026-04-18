const ConflictResolver = require('../conflict-resolver.js');

function mkConflict(over) {
  return Object.assign({
    id: 'c1',
    kind: 'field-conflict',
    entityType: 'ingredient',
    entityId: 'a',
    field: 'packCost',
    localValue: 2.5,
    remoteValue: 2.75,
    localModifiedAt: '2026-04-18T09:00:00Z',
    localModifiedBy: 'This device',
    remoteModifiedAt: '2026-04-18T10:00:00Z',
    remoteModifiedBy: 'Kitchen-Mac',
    ts: '2026-04-18T10:00:00Z',
  }, over || {});
}

function mkState(over) {
  return Object.assign({
    ingredients: [], recipes: [], suppliers: [],
    currency: '£', activeGP: 70, vatRate: 20, recipeCategories: [],
    auditLog: [],
  }, over || {});
}

describe('pruneMissingRecords', () => {
  test('keeps entries whose top-level ingredient still exists', () => {
    var queue = [mkConflict()];
    var state = mkState({ ingredients: [{ id: 'a', name: 'Cucumber', packCost: 2.5 }] });
    expect(ConflictResolver.pruneMissingRecords(queue, state)).toHaveLength(1);
  });

  test('drops entries whose top-level record is gone', () => {
    var queue = [mkConflict()];
    var state = mkState();
    expect(ConflictResolver.pruneMissingRecords(queue, state)).toHaveLength(0);
  });

  test('drops nested entry when parent recipe is missing', () => {
    var queue = [mkConflict({ entityType: 'recipeIngredient', entityId: 'ing1', parentId: 'r1', field: 'qty' })];
    var state = mkState();
    expect(ConflictResolver.pruneMissingRecords(queue, state)).toHaveLength(0);
  });

  test('drops nested entry when parent exists but nested row is gone', () => {
    var queue = [mkConflict({ entityType: 'recipeIngredient', entityId: 'ing1', parentId: 'r1', field: 'qty' })];
    var state = mkState({ recipes: [{ id: 'r1', name: 'Carbonara', ingredients: [] }] });
    expect(ConflictResolver.pruneMissingRecords(queue, state)).toHaveLength(0);
  });

  test('keeps nested entry when parent and nested row both exist', () => {
    var queue = [mkConflict({ entityType: 'recipeIngredient', entityId: 'ing1', parentId: 'r1', field: 'qty' })];
    var state = mkState({ recipes: [{ id: 'r1', name: 'Carbonara', ingredients: [{ ingId: 'ing1', qty: 200 }] }] });
    expect(ConflictResolver.pruneMissingRecords(queue, state)).toHaveLength(1);
  });

  test('keeps settings entries unconditionally', () => {
    var queue = [mkConflict({ entityType: 'settings', entityId: 'vatRate', field: 'vatRate' })];
    expect(ConflictResolver.pruneMissingRecords(queue, mkState())).toHaveLength(1);
  });

  test('empty or non-array input returns []', () => {
    expect(ConflictResolver.pruneMissingRecords([], mkState())).toEqual([]);
    expect(ConflictResolver.pruneMissingRecords(null, mkState())).toEqual([]);
    expect(ConflictResolver.pruneMissingRecords(undefined, mkState())).toEqual([]);
  });
});

describe('applyResolution', () => {
  test('local winner writes localValue and stamps the record', () => {
    var state = mkState({ ingredients: [{ id: 'a', name: 'Cucumber', packCost: 2.5 }] });
    var conflict = mkConflict();
    var result = ConflictResolver.applyResolution(state, conflict, 'local', 'This device');
    expect(result.error).toBeUndefined();
    expect(state.ingredients[0].packCost).toBe(2.5);
    expect(state.ingredients[0]._modifiedBy).toBe('This device');
    expect(typeof state.ingredients[0]._modifiedAt).toBe('string');
    expect(result.auditEntry.op).toBe('resolve-conflict');
    expect(result.auditEntry.before).toBe(2.75);
    expect(result.auditEntry.after).toBe(2.5);
    expect(result.auditEntry.conflictId).toBe('c1');
    expect(result.auditEntry.entity).toBe('ingredient');
    expect(result.auditEntry.entityId).toBe('a');
    expect(result.auditEntry.field).toBe('packCost');
    expect(result.auditEntry.entityName).toBe('Cucumber');
  });

  test('remote winner writes remoteValue', () => {
    var state = mkState({ ingredients: [{ id: 'a', name: 'Cucumber', packCost: 2.5 }] });
    var result = ConflictResolver.applyResolution(state, mkConflict(), 'remote', 'This device');
    expect(state.ingredients[0].packCost).toBe(2.75);
    expect(result.auditEntry.before).toBe(2.5);
    expect(result.auditEntry.after).toBe(2.75);
  });

  test('nested recipeIngredient: writes to row and bumps parent _modifiedAt', () => {
    var state = mkState({
      recipes: [{
        id: 'r1', name: 'Carbonara', _modifiedAt: '2026-04-01T00:00:00Z',
        ingredients: [{ ingId: 'ing1', qty: 200 }],
      }],
      ingredients: [{ id: 'ing1', name: 'Pecorino' }],
    });
    var conflict = mkConflict({
      entityType: 'recipeIngredient', entityId: 'ing1', parentId: 'r1',
      field: 'qty', localValue: 200, remoteValue: 300,
    });
    var result = ConflictResolver.applyResolution(state, conflict, 'remote', 'This device');
    expect(state.recipes[0].ingredients[0].qty).toBe(300);
    expect(state.recipes[0]._modifiedAt).not.toBe('2026-04-01T00:00:00Z');
    expect(result.auditEntry.entity).toBe('recipeIngredient');
    expect(result.auditEntry.parentId).toBe('r1');
    expect(result.auditEntry.entityName).toBe('Pecorino');
  });

  test('nested subRecipe: writes to row via recipeId lookup', () => {
    var state = mkState({
      recipes: [
        { id: 'r1', name: 'Parent', subRecipes: [{ recipeId: 'r2', portions: 1 }] },
        { id: 'r2', name: 'Sub' },
      ],
    });
    var conflict = mkConflict({
      entityType: 'subRecipe', entityId: 'r2', parentId: 'r1',
      field: 'portions', localValue: 1, remoteValue: 2,
    });
    var result = ConflictResolver.applyResolution(state, conflict, 'remote', 'This device');
    expect(state.recipes[0].subRecipes[0].portions).toBe(2);
    expect(result.auditEntry.entityName).toBe('Sub');
  });

  test('settings conflict: writes to top-level state field', () => {
    var state = mkState({ vatRate: 20 });
    var conflict = mkConflict({
      entityType: 'settings', entityId: 'vatRate', field: 'vatRate',
      localValue: 20, remoteValue: 5,
    });
    var result = ConflictResolver.applyResolution(state, conflict, 'remote', 'This device');
    expect(state.vatRate).toBe(5);
    expect(result.auditEntry.entity).toBe('settings');
  });

  test('missing top-level record returns { error: "missing" } without mutation', () => {
    var state = mkState();
    var before = JSON.stringify(state);
    var result = ConflictResolver.applyResolution(state, mkConflict(), 'local', 'This device');
    expect(result.error).toBe('missing');
    expect(result.auditEntry).toBeUndefined();
    expect(JSON.stringify(state)).toBe(before);
  });

  test('missing parent recipe returns { error: "missing" }', () => {
    var state = mkState();
    var conflict = mkConflict({ entityType: 'recipeIngredient', entityId: 'ing1', parentId: 'r1', field: 'qty' });
    expect(ConflictResolver.applyResolution(state, conflict, 'local', 'D').error).toBe('missing');
  });

  test('missing nested row returns { error: "missing" }', () => {
    var state = mkState({ recipes: [{ id: 'r1', name: 'R', ingredients: [] }] });
    var conflict = mkConflict({ entityType: 'recipeIngredient', entityId: 'ing1', parentId: 'r1', field: 'qty' });
    expect(ConflictResolver.applyResolution(state, conflict, 'local', 'D').error).toBe('missing');
  });
});

describe('entityDisplayName', () => {
  test('top-level ingredient', () => {
    var state = mkState({ ingredients: [{ id: 'a', name: 'Cucumber' }] });
    expect(ConflictResolver.entityDisplayName(state, mkConflict())).toBe('Cucumber · packCost');
  });
  test('top-level supplier', () => {
    var state = mkState({ suppliers: [{ id: 's1', name: 'Brakes' }] });
    var c = mkConflict({ entityType: 'supplier', entityId: 's1', field: 'contactPhone' });
    expect(ConflictResolver.entityDisplayName(state, c)).toBe('Brakes · contactPhone');
  });
  test('nested recipeIngredient', () => {
    var state = mkState({
      recipes: [{ id: 'r1', name: 'Carbonara', ingredients: [{ ingId: 'ing1', qty: 200 }] }],
      ingredients: [{ id: 'ing1', name: 'Pecorino' }],
    });
    var c = mkConflict({ entityType: 'recipeIngredient', entityId: 'ing1', parentId: 'r1', field: 'qty' });
    expect(ConflictResolver.entityDisplayName(state, c)).toBe('Carbonara › Pecorino qty');
  });
  test('nested subRecipe', () => {
    var state = mkState({
      recipes: [
        { id: 'r1', name: 'Parent', subRecipes: [{ recipeId: 'r2', portions: 1 }] },
        { id: 'r2', name: 'Sub' },
      ],
    });
    var c = mkConflict({ entityType: 'subRecipe', entityId: 'r2', parentId: 'r1', field: 'portions' });
    expect(ConflictResolver.entityDisplayName(state, c)).toBe('Parent › Sub portions');
  });
  test('fallback to id when parent missing', () => {
    var c = mkConflict({ entityType: 'recipeIngredient', entityId: 'ing1', parentId: 'r1', field: 'qty' });
    expect(ConflictResolver.entityDisplayName(mkState(), c)).toBe('r1 › ing1 qty');
  });
  test('fallback to id when linked ingredient missing', () => {
    var state = mkState({
      recipes: [{ id: 'r1', name: 'Carbonara', ingredients: [{ ingId: 'ing1', qty: 200 }] }],
    });
    var c = mkConflict({ entityType: 'recipeIngredient', entityId: 'ing1', parentId: 'r1', field: 'qty' });
    expect(ConflictResolver.entityDisplayName(state, c)).toBe('Carbonara › ing1 qty');
  });
  test('settings', () => {
    var c = mkConflict({ entityType: 'settings', entityId: 'vatRate', field: 'vatRate' });
    expect(ConflictResolver.entityDisplayName(mkState(), c)).toBe('Settings · vatRate');
  });
});

describe('formatValueForButton', () => {
  test('short string is quoted', () => {
    expect(ConflictResolver.formatValueForButton('hello')).toBe('"hello"');
  });
  test('long string is truncated with ellipsis', () => {
    var s = 'x'.repeat(60);
    var out = ConflictResolver.formatValueForButton(s);
    expect(out.length).toBeLessThanOrEqual(43);
    expect(out).toContain('…');
  });
  test('number', () => {
    expect(ConflictResolver.formatValueForButton(2.5)).toBe('2.5');
  });
  test('boolean', () => {
    expect(ConflictResolver.formatValueForButton(true)).toBe('Yes');
    expect(ConflictResolver.formatValueForButton(false)).toBe('No');
  });
  test('array', () => {
    expect(ConflictResolver.formatValueForButton([1, 2, 3])).toBe('[3 items]');
  });
  test('object', () => {
    expect(ConflictResolver.formatValueForButton({ a: 1 })).toBe('{object}');
  });
  test('null, undefined, empty string', () => {
    expect(ConflictResolver.formatValueForButton(null)).toBe('(empty)');
    expect(ConflictResolver.formatValueForButton(undefined)).toBe('(empty)');
    expect(ConflictResolver.formatValueForButton('')).toBe('(empty)');
  });
});
